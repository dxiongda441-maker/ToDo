# Evals: Claude Code の作業品質を測る

このディレクトリは、Claude Code（コーディングエージェント）にこの ToDo アプリの課題を解かせ、結果を自動で採点・集計する仕組みです。
モデルの切り替え、プロンプトや CLAUDE.md・設定の変更をしたときに「本当に良くなったのか／壊れていないか」を数字と記録で確かめるために使います。

## 1. 調べたこと（2026年10月時点）

| 情報源 | 要点 |
|---|---|
| Anthropic「[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)」(2026年1月) | 用語は task / trial / grader / transcript / outcome / eval harness。グレーダーは code・model・human の3種類で、決定的に判定できるものは code、必要なところだけ LLM、人はその較正に使う。pass@k と pass^k を使い分ける。capability eval（伸びしろを測る）と regression eval（ほぼ100%を守る）を分ける。最初は**実際の失敗から集めた 20〜50 個のタスク**で十分。 |
| 同記事の「ゼロから作る手順」 | ① 早く始める ② 普段の手動チェックをタスクにする ③ 専門家2人が同じ判定になる曖昧さのないタスクと参照解 ④ 「やるべき時」と「やるべきでない時」の両方を入れる ⑤ 試行ごとにクリーンな環境 ⑥ 経路より成果物を採点し、ズルに強いグレーダーにする ⑦ **トランスクリプトを読む** ⑧ 飽和（100%）したら難しいタスクを足す ⑨ 継続的に保守する |
| 同記事のコーディングエージェント向けの話 | 決定的なテスト（SWE-bench Verified は「失敗していたテストが通り、既存テストを壊さない」こと）を基本にし、その上にコード品質のルーブリック、静的解析、ツール呼び出しの検査を重ねる。正答率と一緒にターン数・トークン・時間も記録する。 |
| [Claude Code headless モード](https://code.claude.com/docs/en/headless) | `claude -p` で非対話実行できる。`--output-format stream-json --verbose` で全ステップのトランスクリプトを取れる（最初の `system/init` に実際のモデルと CLI のバージョン、最後の `result` に費用・ターン数・時間が入る）。`--bare` を付けるとフック・プラグイン・MCP・CLAUDE.md を読まないので再現性が上がる（スクリプト用途の推奨で、将来は `-p` の既定になる予定。API キーが必要）。`--json-schema` で構造化出力を受け取れる（LLM ジャッジに使用）。`--permission-prompts none` で無人実行、`--max-budget-usd` で費用上限を設定できる。 |
| [Claude Code サンドボックス](https://code.claude.com/docs/en/sandboxing) | `--settings` で `sandbox.filesystem.denyRead` を渡すと、Bash から特定のパスを読めなくできる（Linux は bubblewrap と socat が必要）。Read ツールは `permissions.deny` で別に塞ぐ。 |
| [Harbor](https://github.com/harbor-framework/harbor) / [Inspect Harbor](https://meridianlabs-ai.github.io/inspect_harbor/) | Terminal-Bench 2.0 の公式ハーネス。Claude Code などの外部エージェントを、Docker やクラウドのサンドボックス上で大量に並列実行できる。タスクが数百規模になったり、他社エージェントと比べたくなったりしたら移行先の候補になる。 |

このリポジトリは小さく、ビルドもテストもない素の HTML/JS なので、まずは依存が Playwright だけの軽いハーネスを自前で用意しました。考え方は上の記事に沿っています。

## 2. 仕組み

```
evals/
  run.js            ハーネス本体（実行 → 採点 → 集計）
  selfcheck.js      eval 自体の検証（モデルを呼ばない）
  compare.js        2回の実行結果の比較
  view.js           1試行のトランスクリプトを読みやすく表示
  lib/workspace.js  試行ごとの隔離ワークスペース
  lib/agents.js     claude / oracle / noop / mutant のエージェントと事前チェック
  lib/graders.js    共通グレーダー（回帰スモーク・変更範囲・ツール・LLM ジャッジ）
  lib/app.js        アプリを配信して Playwright で操作するヘルパー
  lib/metrics.js    pass@k / pass^k / 信頼区間 / 比較用の z 値
  tasks/<id>/       task.json, grade.js, setup.patch, solution.patch | solution.md, mutants/*.patch
  baselines/        比較の基準にする summary.json（git で管理）
  results/          実行結果（git 管理外）
```

### 1回の試行（trial）の流れ

1. **隔離**: タスクの `base_ref` の時点のアプリを `git archive` で一時ディレクトリに展開します。`evals/` と `.github/` は含めず、git の履歴も持たせません。`setup.patch` があれば当てて（バグの再現など）、それを baseline としてコミットします。
2. **実行**: `claude -p "<prompt>" --output-format stream-json` をワークスペースで実行します。ツールは `Bash,Read,Edit,Write,Glob,Grep` に限り（Web アクセスなし）、`acceptEdits` モード、費用上限と時間上限を付けます。
   - **サンドボックス（既定で有効）**: Bash は実際のリポジトリ（採点コード・参照解・元の修正が入った git 履歴）を読めません。Read などのツールも `permissions.deny` で同じ場所を塞ぎます。サンドボックスなしだと、エージェントは `ls /path/to/repo/evals/tasks` のように答えを見に行けてしまいます（確認済み）。
3. **記録**: `transcript.jsonl`（全ステップ）、`diff.patch`、`final.md`（最終回答）、`result.json` を `results/<日時>-<agent>/<task>/trial-N/` に保存します。
4. **採点**:
   - **outcome（code）**: ワークスペースを HTTP で配信し、Playwright で実際に操作して最終状態（DOM・localStorage）を確かめる（`grade.js`）
   - **regression（code）**: 追加・完了・再読み込み後の保持・絞り込み・削除の基本フロー（`"regression": true`）
   - **scope（code）**: 変更したファイルが許可されたものだけか（`allowed_files`）、変更行数（`max_changed_lines`）、変更なし（`expect_no_changes`）
   - **transcript（code）**: 使ってはいけないツールを使っていないか（`forbidden_tools`）。全タスク共通で、ワークスペースの外（実際のリポジトリ）を参照していないか
   - **judge（model）**: 依頼・ルーブリック・差分・変更後のファイル全文（と `judge.context_files`）・最終回答をもとに、LLM が pass / fail / unknown を判定します。既定では `--judge` を付けたときだけ動く参考値です。`required: true` のタスクでは常に動き、合否に使います（selfcheck では動きません）
5. **合否**: `required` なチェックがすべて pass なら、その試行は pass です。
6. **ハーネスエラー**: ワークスペースが作れない、グレーダーがクラッシュした、認証エラーなどでモデルが一度も動かなかった、といった場合は fail ではなく **error** として別に数え、合格率の計算から外します（エージェントが悪いように見えてしまうのを防ぐため）。error が1件でもあれば終了コードは 1 になります。

### 指標

- **pass@1**: 1回の試行で成功する確率。suite には 95% 信頼区間も付けます
- **pass@k**: k 回試して1回でも成功する確率（能力の上限。Chen et al. 2021 の不偏推定量）
- **pass^k**: k 回すべて成功する確率（安定性。ユーザーにやり直しを求められない場面で重要）
- タスクごとの平均費用・ターン数・所要時間、失敗したチェックの内訳、**失敗した試行の一覧（読むべきトランスクリプトの場所）**
- 実行条件（実際に使われたモデル、Claude Code のバージョン、bare / sandbox、evals のコミット）も `summary.json` に残し、比較のときに条件が揃っているかを確かめられるようにしています

### タスクセット（8件）

| id | suite | 何を測るか |
|---|---|---|
| `fix-import-dedupe` | regression | 実際のバグ（c4ac048 で修正）の再現。バックアップを復元するとタスクが一覧と履歴の両方に入る |
| `fix-edit-draft` | regression | 実際のバグ（c4ac048 で修正）の再現。別のタスクを操作すると編集中の内容が消える |
| `relabel-add-button` | regression | 小さな変更を、範囲を広げずにできるか（1ファイル・2行以内） |
| `feature-search` | regression | 検索欄の新機能（絞り込みとの組み合わせ、空表示、スマホ幅） |
| `feature-today-filter` | regression | 「今日」で絞り込む新機能（期限の判定、active 表示、スマホ幅） |
| `explain-import-no-edit` | capability | 「変更しないで」と言われたら編集せず、指定の長さ（3〜5文）で答えるか |
| `feature-recurring` | capability | 繰り返しタスク。新しいフィールドを読み込み・保存・バックアップの全経路で保つ必要がある（正規化処理を直し忘れると落ちる） |
| `feature-undo-delete` | capability | 削除の取り消し。タスク一覧・履歴・保存データの整合と、タイマーの扱い（偽の時計で5秒を進めて確かめる） |

suite は最初のベースラインの結果をもとに振り分けています（下の「最初の計測で分かったこと」）。

### 最初の計測で分かったこと（2026-10-31、claude-opus-5-5、`--no-bare`、各3回）

- 最初の6件は **18試行すべて合格（pass@1 100%）**で、最初から飽和していました。これでは改善しても数字に出ないため、`feature-search` と `feature-today-filter` を regression に移し、難しいタスクを2件（`feature-recurring`、`feature-undo-delete`）足しました。
- `explain-import-no-edit` は、3回中2回が「3〜5文で」という指定を超えていました（6文、8文）。コードのチェックは通っていたので、文の数を数えるチェックを足し、capability に移しました。
- LLM ジャッジは `feature-today-filter` で3回中2回を不合格にしましたが、理由は「既存の `isOverdue` を使っていない」というものでした。これはルーブリックが特定の関数名を挙げて、**経路を採点していた**ためです（`dueDate <= today` は妥当な実装）。ルーブリックを結果と品質の原則に書き直しました。
- 回答のトランスクリプトから、アプリ側の潜在バグ（同じファイルの同じリスト内に同じ id があると、両方とも取り込まれる）も見つかりました。次のタスクの候補です。
- 追加した `feature-recurring` と `feature-undo-delete` も、2回目の計測で3回とも合格しました。このモデルには、思いついたタスクを足すだけでは難しさが足りません。**実際に失敗した作業から**タスクを作ることが次の課題です（Step 6）。
- ジャッジにソースを渡すようにした（`judge.context_files`）ところ、`explain-import-no-edit` で3回とも「同じリスト内の重複も防げる」という**事実誤り**を見つけました（コードで確認済み）。参照解の文章も同じ点で不正確だったので直しました。このタスクではジャッジの判定を合否に使います（`required: true`）。

## 3. 手順

### Step 0: セットアップ

```bash
cd evals
```

```bash
npm ci
```

```bash
npx playwright install chromium
```

Linux ではサンドボックスのために bubblewrap と socat を入れます（macOS は追加のインストール不要）。

```bash
sudo apt-get install -y bubblewrap socat
```

Claude Code の CLI（`claude`）が必要です。既定の `--bare` モードでは `ANTHROPIC_API_KEY` を使います。サブスクリプションのログインで動かすときは `--no-bare` を付けてください（その場合はホストの `~/.claude` の設定やフックも読み込まれます）。開始前に CLI・API キー・サンドボックスを確認し、足りなければその場でエラーにします。

### Step 1: eval 自体を検証する（モデル不要・約30秒）

```bash
npm run selfcheck
```

- 全 `task.json` の形式（未知のフィールドや型の誤りがあればエラー。綴りの間違いでグレーダーが黙って無効になるのを防ぐ）
- `oracle`（参照解を当てる）が**全タスク pass** → タスクが解けること、グレーダーが正解を受け入れることを確認
- `noop`（何もしない）が**全タスク fail** → 何もしなくても通ってしまうグレーダーがないことを確認
- `mutant`（`tasks/<id>/mutants/*.patch` の「もっともらしいが間違った解」）が**すべて fail** → グレーダーが惜しい間違いを見逃さないことを確認

グレーダーの不安定さ（flaky）を調べるときは、繰り返して実行します（CI はこれを使います）。

```bash
SELFCHECK_TRIALS=3 npm run selfcheck
```

タスクやグレーダーを足したり変えたりしたら、必ずこれを通してください。

### Step 2: まず少なく回す

```bash
node run.js --tasks relabel-add-button,fix-edit-draft --trials 1
```

結果は標準出力（Markdown の表）と `results/<日時>-claude/summary.md` に出ます。

### Step 3: ベースラインを取る

```bash
node run.js --trials 5
```

結果を確認し（Step 4）、基準にするものを `baselines/` にコミットします。CI と同じ条件（`--bare`、サンドボックスあり、CI と同じ Claude Code のバージョン）で取ったものを `baselines/main.json` にするのがおすすめです。CI の手動実行の artifact から取ってくるのが簡単です。

```bash
cp results/<run>/summary.json baselines/main.json
```

主なオプション:

| オプション | 既定値 | 説明 |
|---|---|---|
| `--trials N` | 3 | タスクごとの試行回数（pass@k / pass^k の k） |
| `--tasks a,b` | 全部 | 実行するタスク |
| `--model X` | CLI の既定 | 評価するモデル |
| `--judge` / `--judge-model X` | off | LLM ルーブリック判定を追加（自分の成果物を自分で採点しないよう、評価対象とは別のモデルを推奨） |
| `--concurrency N` | 2 | 並列で走らせる試行の数 |
| `--max-budget-usd N` / `--timeout-sec N` | 2 / 900 | 1試行あたりの費用上限と時間上限 |
| `--ref <git-ref>` | タスクの `base_ref` | すべてのタスクを別のコミットで実行する |
| `--no-bare` | bare | CLAUDE.md・フック・ログインを含むホスト設定で実行する |
| `--no-sandbox` | sandbox | サンドボックスなしで実行する（外部参照は transcript チェックで検出のみ） |
| `--regression-threshold 0.9` | なし | regression suite の pass@1 がこれを下回ったら終了コード 1 |
| `--keep` | off | ワークスペースを消さずに残す |

### Step 4: トランスクリプトを読む（一番大事）

点数だけで判断しないでください。`summary.md` の「Failed trials」に、読むべき試行の場所が並びます。

```bash
node view.js results/<run>/<task>/trial-1
```

エージェントの発言、ツール呼び出しとその結果、チェックの結果、最終回答が時系列で表示されます。差分は同じフォルダの `diff.patch` にあります。

失敗したら、まず次のどれかに分けます。
- **エージェントのミス** → そのまま記録。改善の対象です
- **グレーダーやタスクの問題**（正しい解を落としている、要件が曖昧） → タスクを直して Step 1 を通し直す
- **ハーネスエラー**（error） → 環境の問題。直してから再実行する

何度試してもほぼ 0% のタスクは、たいていタスク側が壊れています。合格した試行もときどき読み、ズルや偶然の合格がないか確かめてください。

### Step 5: 変更の効果を比較する

条件を**1つだけ**変えて、同じタスク・同じ試行回数で実行し、基準と比べます。

```bash
node run.js --trials 5 --model <新しいモデル>
```

```bash
node compare.js baselines/main.json results/<run>/summary.json
```

suite ごとの差（z 検定で「改善」「悪化」「誤差の範囲」を判定）とタスクごとの差が出ます。2つ以上の条件が違えば警告が出ます。試行回数が少ないとほとんどの差は誤差の範囲なので、判断に迷ったら試行回数を増やしてください。

### Step 6: タスクを増やす（目標は 20〜50 件）

ネタは**実際の失敗**から取るのが一番です。Claude Code が間違えたこと、PR のレビューで直したこと、ユーザーからのバグ報告などです。

1. `tasks/<id>/task.json` を作る。使えるフィールドは次のとおりで、これ以外のフィールドがあるとエラーになります

   ```json
   {
     "suite": "capability",
     "base_ref": "<コミット>",
     "prompt": "ユーザーが実際に書くような依頼文。期待する id や文言は明記する",
     "source": "どこから来たタスクか（例: PR #12 のレビュー指摘）",
     "regression": true,
     "allowed_files": ["app.js"],
     "max_changed_lines": 40,
     "expect_no_changes": false,
     "forbidden_tools": ["Edit"],
     "max_budget_usd": 2,
     "timeout_sec": 900,
     "judge": { "rubric": "pass の条件: ...", "required": false, "context_files": ["app.js"] }
   }
   ```

   必須は `suite`・`base_ref`・`prompt` で、ほかは使うものだけ書きます。`judge.context_files` は、ジャッジに見せるファイルです（変更したファイルは自動で渡されるので、質問に答えるだけのタスクなどで使います）。
2. `grade.js` に、成果物を Playwright で確かめるチェックを書く（`check(name, async () => { assert... })` の配列を返す）。固定時間の待機（`waitForTimeout`）は使わず、ダイアログや要素などの「起きたこと」を待つ
3. バグ修正のタスクなら、修正の逆パッチを `setup.patch` にする（過去の修正コミットから作れます）
4. 参照解を `solution.patch`（コード）または `solution.md`（回答）に置く
5. ありがちな間違い（直し忘れ、片方の経路だけの対応など）を `mutants/<名前>.patch` に置く。どれも参照解と同じく、`setup.patch` を当てたあとの状態に対する差分です。実際にエージェントが犯した間違いの差分（`diff.patch`）をそのまま入れるのもおすすめです
6. `SELFCHECK_TRIALS=3 npm run selfcheck` を通す

タスクを書くときの注意:
- 2人の専門家が同じ合否を出せるくらい具体的に書く（要素の id、表示する文言、組み合わせたときの挙動など）
- 経路ではなく結果を採点する（「この関数を直したか」ではなく「画面上でこう動くか」）
- 「やるべきでない時」のタスク（変更しない、範囲を広げない）も一定数入れる

### Step 7: suite を運用する

- **capability**: 最初は低くて構いません。改善の効果を測る場所です
- **regression**: 常に 90〜100% を保つべきものです。CI のしきい値はこちらにかけます
- capability のタスクが安定して通るようになったら regression に**卒業**させ、capability には難しいタスクを足します（全部 100% になると、改善しても数字に出ません）
- LLM ジャッジは、人の判定と何件か突き合わせて一致を確認してから `required: true` にします
- タスクを変えたら evals のコミットが変わり、`compare.js` で警告が出ます。タスクを大きく変えたらベースラインも取り直してください

### Step 8: CI

`.github/workflows/evals.yml`:
- **pull_request**（`evals/` を変更したとき）: `selfcheck` を3回ずつ実行（モデル呼び出しなし・無料）
- **workflow_dispatch**（Actions タブから手動で実行）: `selfcheck` が通ったあとに、バージョンを固定した Claude Code（入力 `claude_version`）を `--bare` とサンドボックス付きで実行します。結果の表と、`baselines/` との比較がジョブのサマリーに出て、トランスクリプトは artifact として保存されます。regression suite の pass@1 が 90% 未満、またはハーネスエラーがあると失敗します。

使うには、リポジトリの Settings → Secrets and variables → Actions に `ANTHROPIC_API_KEY` を登録してください。

## 4. 既知の制約と今後の拡張

- サンドボックスはファイルの読み取りを塞ぐもので、別のマシンに分けるほどの隔離ではありません。大規模に回すなら Harbor（Docker サンドボックス）への移行を検討してください
- 信頼区間と比較の z 検定は、同じタスクの試行を独立とみなした近似です。タスク数が少ないうちは、数字より Step 4 の目視確認を優先してください
- GitHub Pages のデプロイ（`pages.yml`）はリポジトリ全体を公開するため、`evals/`（参照解を含む）も公開サイトに載ります。気になる場合は、アプリのファイルだけをアップロードするように変えてください
- CLAUDE.md やスキルの効果を測る場合: `--no-bare` で読み込ませるか、`claude` の引数に `--append-system-prompt-file` / `--add-dir` を足す（`lib/agents.js`）
- コード品質の自動チェックを足す（ESLint など。`lib/graders.js` に共通グレーダーとして追加）
