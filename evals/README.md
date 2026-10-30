# Evals: Claude Code の作業品質を測る

このディレクトリは、Claude Code（コーディングエージェント）にこの ToDo アプリの課題を解かせ、結果を自動で採点・集計する仕組みです。
モデルの切り替え、プロンプトや CLAUDE.md・設定の変更をしたときに「本当に良くなったのか／壊れていないか」を数字と記録で確かめるために使います。

## 1. 調べたこと（2026年10月時点）

| 情報源 | 要点 |
|---|---|
| Anthropic「[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)」(2026年1月) | 用語は task / trial / grader / transcript / outcome / eval harness。グレーダーは code・model・human の3種類で、決定的に判定できるものは code、必要なところだけ LLM、人はその較正に使う。pass@k と pass^k を使い分ける。capability eval（伸びしろを測る）と regression eval（ほぼ100%を守る）を分ける。最初は**実際の失敗から集めた 20〜50 個のタスク**で十分。 |
| 同記事の「ゼロから作る手順」 | ① 早く始める ② 普段の手動チェックをタスクにする ③ 専門家2人が同じ判定になる曖昧さのないタスクと参照解 ④ 「やるべき時」と「やるべきでない時」の両方を入れる ⑤ 試行ごとにクリーンな環境 ⑥ 経路より成果物を採点する ⑦ **トランスクリプトを読む** ⑧ 飽和（100%）したら難しいタスクを足す ⑨ 継続的に保守する |
| 同記事のコーディングエージェント向けの話 | 決定的なテスト（SWE-bench Verified は「失敗していたテストが通り、既存テストを壊さない」こと）を基本にし、その上にコード品質のルーブリック、静的解析、ツール呼び出しの検査を重ねる。正答率と一緒にターン数・トークン・時間も記録する。 |
| [Claude Code headless モード](https://code.claude.com/docs/en/headless) | `claude -p` で非対話実行できる。`--output-format stream-json --verbose` で全ステップのトランスクリプトを、最後の `result` イベントで費用・ターン数・時間を取れる。`--bare` を付けるとフック・プラグイン・MCP・CLAUDE.md を読まないので再現性が上がる（スクリプト用途の推奨で、将来は `-p` の既定になる予定。API キーが必要）。`--json-schema` で構造化出力を受け取れる（LLM ジャッジに使用）。`--permission-prompts none`、`--max-budget-usd` で無人実行と費用上限を設定できる。 |
| [Harbor](https://github.com/harbor-framework/harbor) / [Inspect Harbor](https://meridianlabs-ai.github.io/inspect_harbor/) | Terminal-Bench 2.0 の公式ハーネス。Claude Code などの外部エージェントを、Docker やクラウドのサンドボックス上で大量に並列実行できる。タスクが数百規模になったり、他社エージェントと比べたくなったりしたら移行先の候補になる。 |

このリポジトリは小さく、ビルドもテストもない素の HTML/JS なので、まずは依存が Playwright だけの軽いハーネスを自前で用意しました。考え方は上の記事に沿っています。

## 2. 仕組み

```
evals/
  run.js            ハーネス本体（実行 → 採点 → 集計）
  selfcheck.js      eval 自体の検証（モデルを呼ばない）
  lib/workspace.js  試行ごとの隔離ワークスペース
  lib/agents.js     claude / oracle / noop の3種類のエージェント
  lib/graders.js    共通グレーダー（回帰スモーク・変更範囲・ツール・LLM ジャッジ）
  lib/app.js        アプリを配信して Playwright で操作するヘルパー
  lib/metrics.js    pass@k / pass^k
  tasks/<id>/       task.json, grade.js, setup.patch, solution.patch | solution.md
  results/          実行結果（git 管理外）
```

### 1回の試行（trial）の流れ

1. **隔離**: タスクの `base_ref` の時点のアプリを `git archive` で一時ディレクトリに展開します。`evals/` と `.github/` は含めず、git の履歴も持たせません（エージェントが採点コードや元の修正コミットを覗けないようにするためです）。`setup.patch` があれば当てて（バグの再現など）、それを baseline としてコミットします。
2. **実行**: `claude -p "<prompt>" --output-format stream-json` をワークスペースで実行します。ツールは `Bash,Read,Edit,Write,Glob,Grep` に限り（Web アクセスなし）、`acceptEdits` モード、費用上限と時間上限を付けます。
3. **記録**: `transcript.jsonl`（全ステップ）、`diff.patch`、`final.md`（最終回答）、`result.json` を `results/<日時>-<agent>/<task>/trial-N/` に保存します。
4. **採点**:
   - **outcome（code）**: ワークスペースを HTTP で配信し、Playwright で実際に操作して最終状態（DOM・localStorage）を確かめる（`grade.js`）
   - **regression（code）**: 追加・完了・再読み込み後の保持・絞り込み・削除の基本フロー（`"regression": true`）
   - **scope（code）**: 変更したファイルが許可されたものだけか（`allowed_files`）、変更行数（`max_changed_lines`）、変更なし（`expect_no_changes`）
   - **transcript（code）**: 使ってはいけないツールを使っていないか（`forbidden_tools`）
   - **judge（model・任意）**: ルーブリックに沿って LLM が pass / fail / unknown を判定（`--judge`）。既定では合否に影響しない参考値です
5. **合否**: `required` なチェックがすべて pass なら、その試行は pass です。

### 指標

- **pass@1**: 1回の試行で成功する確率
- **pass@k**: k 回試して1回でも成功する確率（能力の上限。Chen et al. 2021 の不偏推定量）
- **pass^k**: k 回すべて成功する確率（安定性。ユーザーにやり直しを求められない場面で重要）
- タスクごとの平均費用・ターン数・所要時間と、失敗したチェックの内訳

### 最初のタスクセット（6件）

| id | suite | 何を測るか |
|---|---|---|
| `fix-import-dedupe` | regression | 実際のバグ（c4ac048 で修正）の再現。バックアップを復元するとタスクが一覧と履歴の両方に入る |
| `fix-edit-draft` | regression | 実際のバグ（c4ac048 で修正）の再現。別のタスクを操作すると編集中の内容が消える |
| `relabel-add-button` | regression | 小さな変更を、範囲を広げずにできるか（1ファイル・2行以内） |
| `explain-import-no-edit` | regression | 「変更しないで」と言われたら編集しないか（やるべきでない時のケース） |
| `feature-search` | capability | 検索欄の新機能（絞り込みとの組み合わせ、空表示、スマホ幅） |
| `feature-today-filter` | capability | 「今日」で絞り込む新機能（期限の判定、active 表示、スマホ幅） |

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

Claude Code の CLI（`claude`）が必要です。既定の `--bare` モードでは `ANTHROPIC_API_KEY` を使います。サブスクリプションのログインで動かすときは `--no-bare` を付けてください（その場合はホストの `~/.claude` の設定やフックも読み込まれます）。

### Step 1: eval 自体を検証する（モデル不要・約1分）

```bash
npm run selfcheck
```

- `oracle`（参照解を当てる）が**全タスク pass** → タスクが解けること、グレーダーが正解を受け入れることを確認
- `noop`（何もしない）が**全タスク fail** → 何もしなくても通ってしまうグレーダーがないことを確認

タスクやグレーダーを足したり変えたりしたら、必ずこれを通してください。PR では CI が自動で実行します。

### Step 2: まず少なく回す

```bash
node run.js --tasks relabel-add-button,fix-edit-draft --trials 1
```

結果は標準出力（Markdown の表）と `results/<日時>-claude/summary.md` に出ます。

### Step 3: 本番の計測

```bash
node run.js --trials 5
```

主なオプション:

| オプション | 既定値 | 説明 |
|---|---|---|
| `--trials N` | 3 | タスクごとの試行回数（pass@k / pass^k の k） |
| `--tasks a,b` | 全部 | 実行するタスク |
| `--model X` | CLI の既定 | 評価するモデル |
| `--judge` / `--judge-model X` | off | LLM ルーブリック判定を追加 |
| `--concurrency N` | 2 | 並列で走らせる試行の数 |
| `--max-budget-usd N` / `--timeout-sec N` | 2 / 900 | 1試行あたりの費用上限と時間上限 |
| `--ref <git-ref>` | タスクの `base_ref` | すべてのタスクを別のコミットで実行する |
| `--no-bare` | bare | CLAUDE.md・フック・ログインを含むホスト設定で実行する |
| `--regression-threshold 0.9` | なし | regression suite の pass@1 がこれを下回ったら終了コード 1 |
| `--keep` | off | ワークスペースを消さずに残す |

比較するときは、条件を1つだけ変えて同じタスク・同じ試行回数で2回実行し、`summary.md` を並べて見ます（例: `--model` を変える、`--no-bare` で CLAUDE.md の有無を比べる）。

### Step 4: トランスクリプトを読む（一番大事）

点数だけで判断しないでください。特に失敗した試行は、`results/.../trial-N/` で次のものを確認します。

- `diff.patch`: 何を変えたか
- `final.md`: 何と報告したか（報告と実際の差分が食い違っていないか）
- `transcript.jsonl`: どう進めたか

```bash
jq -r 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | "\(.name) \(.input|tostring|.[0:120])"' results/<run>/<task>/trial-1/transcript.jsonl
```

失敗したら、まず「エージェントのミス」か「グレーダーやタスクの問題（正しい解を落としている、要件が曖昧）」かを分けます。後者ならタスクを直して、もう一度 Step 1 を通します。何度試してもほぼ 0% のタスクは、たいていタスク側が壊れています。

### Step 5: タスクを増やす（目標は 20〜50 件）

ネタは**実際の失敗**から取るのが一番です。Claude Code が間違えたこと、PR のレビューで直したこと、ユーザーからのバグ報告などです。

1. `tasks/<id>/task.json` を作る

   ```json
   {
     "suite": "capability",
     "base_ref": "<コミット>",
     "prompt": "ユーザーが実際に書くような依頼文。期待する id や文言は明記する",
     "regression": true,
     "allowed_files": ["app.js"],
     "max_changed_lines": 40,
     "expect_no_changes": false,
     "forbidden_tools": ["Edit"],
     "max_budget_usd": 2,
     "timeout_sec": 900,
     "judge": { "rubric": "pass の条件: ...", "required": false }
   }
   ```

   使うフィールドだけ書けば十分です。
2. `grade.js` に、成果物を Playwright で確かめるチェックを書く（`check(name, async () => { assert... })` の配列を返す）
3. バグ修正のタスクなら、修正の逆パッチを `setup.patch` にする（過去の修正コミットから作れます）
4. 参照解を `solution.patch`（コード）または `solution.md`（回答）に置く
5. `npm run selfcheck` を通す

タスクを書くときの注意:
- 2人の専門家が同じ合否を出せるくらい具体的に書く（要素の id、表示する文言、組み合わせたときの挙動など）
- 経路ではなく結果を採点する（「この関数を直したか」ではなく「画面上でこう動くか」）
- 「やるべきでない時」のタスク（変更しない、範囲を広げない、聞き返すべき曖昧な依頼）も一定数入れる

### Step 6: suite を運用する

- **capability**: 最初は低くて構いません。改善の効果を測る場所です
- **regression**: 常に 90〜100% を保つべきものです。CI のしきい値はこちらにかけます
- capability のタスクが安定して通るようになったら regression に**卒業**させ、capability には難しいタスクを足します（全部 100% になると、改善しても数字に出ません）
- LLM ジャッジは、人の判定と何件か突き合わせて一致を確認してから `required: true` にします

### Step 7: CI

`.github/workflows/evals.yml`:
- **pull_request**（`evals/` を変更したとき）: `selfcheck` を実行（モデル呼び出しなし・無料）
- **workflow_dispatch**（Actions タブから手動で実行）: `selfcheck` が通ったあとに Claude Code で本番の eval を実行。結果はジョブのサマリーに表で出て、トランスクリプトは artifact として保存されます。regression suite の pass@1 が 90% 未満なら失敗します。

使うには、リポジトリの Settings → Secrets and variables → Actions に `ANTHROPIC_API_KEY` を登録してください。

## 4. 今後の拡張

- タスクを 20〜50 件まで増やす（Step 5）
- CLAUDE.md やスキルの効果を測る場合: `--no-bare` で読み込ませるか、`claude` の引数に `--append-system-prompt-file` / `--add-dir` を足す（`lib/agents.js`）
- コード品質の自動チェックを足す（ESLint など。`lib/graders.js` に共通グレーダーとして追加）
- タスクが数百件になったり、他のエージェントと比較したくなったりしたら、Harbor（Docker サンドボックスで並列実行）への移行を検討する
