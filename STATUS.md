# 作業状況

最終更新: 2026-10-10

ルールは `CLAUDE.md`、ファイル構成は `README.md` を参照。

## 現状

- **`master` には最初のコミットしかない。** `index.html` / `app.js` / `styles.css` の 3 ファイル構成のまま。
- 下の作業はすべてブランチ上にある。最新は `claude/dreamy-albattani-0f40sg`（ほかのブランチの作業もすべて含む）。
- 最新の状態で `bash tools/check.sh` と `node tools/browser-check.js`（375px・1024px）は「すべて OK」。

## ブランチごとの作業

| ブランチ | 内容 | 状態 |
| --- | --- | --- |
| `claude/organize-file-directory-yq7io2` | ファイルを `css/`・`js/` に分割。`CLAUDE.md`・`README.md`・`tools/check.sh`・CI・`.editorconfig`・PR ひな形を追加 | 完了 |
| `claude/sharp-bardeen-ydptez` | 上のブランチ ＋ スマホ幅でタスク一覧がはみ出す不具合の修正 | 完了 |
| `claude/laughing-ptolemy-qju2td` | 上のブランチ ＋ `STATUS.md` と「`STATUS.md` を読む・更新する」ルール | PR #1 で `master` へのマージ待ち |
| `claude/dreamy-albattani-0f40sg` | 上のブランチ ＋ ToDo の機能追加 ＋ ゲーム「うつろい」 | 完了。PR 未作成 |

各ブランチは前のブランチの上に積み重なっている（`organize` ⊂ `sharp-bardeen` ⊂ `laughing-ptolemy` ⊂ `dreamy-albattani`）。

### `claude/dreamy-albattani-0f40sg` でやったこと

- PR #1 で手作業の確認が残っていた項目（編集・削除・フィルター・カレンダーの月切り替え）をヘッドレスブラウザで確認。問題なし。
- ToDo：その場で編集、期限日、検索、削除と一括削除の Undo、履歴からの復元、配色の切り替え
  （`body.dark` の CSS はあったが切り替える処理がなかった）、ダーク配色の読みにくい文字色の修正、
  JSON でのバックアップ（書き出し・取り込み）、完了率のバー。保存データは今までの形式のまま読める。
- ToDo（追加分）：並び順（自分で決めた順 / 期限日順）、期限切れの件数、Ctrl+Z で Undo、
  つまみのドラッグ（マウス・タッチ）とキーボード（↑↓・Alt+↑↓）での並べ替え、本文の #タグ と タグでの絞り込み。
- ゲーム「うつろい」（`games/utsuroi/`）：オリジナルの 2 人用盤上戦略ゲーム。CPU 対戦（3 段階）・2 人対戦・
  入れ替えルール・駒落ち・待った・ヒント・盤面コード。ルールは CPU 同士の対局で釣り合いを確かめて決めた。
  さらに、盤で試すレッスン（はじめての方へ・5 つ）、詰め問題 50 問（自動生成・全問読み切りで検証）、
  棋譜コードでの共有と再生、形勢グラフ付きの振り返り。CPU の評価の重みを自己対局で調整して強くし、
  「やさしい」と「ふつう」の間に「すこし手ごわい」を足した（CPU は 4 段階）。
- アクセシビリティ：axe-core で両方の画面を検査し、指摘（盤とカレンダーの ARIA の構造）を直した。今は指摘ゼロ。
- GitHub Actions のチェックは、このブランチへの push ですべて成功している。
- `tools/browser-check.js`（ブラウザでの確認）、`tools/test-utsuroi.js`（ゲームのテスト、`check.sh` から実行）、
  `tools/utsuroi-selfplay.js`（ルールの釣り合いの確認）、`tools/utsuroi-make-puzzles.js`（詰め問題の生成）を追加。

## 次にやること

1. PR #1（`claude/laughing-ptolemy-qju2td` → `master`）を確認してマージする。
2. そのあと `claude/dreamy-albattani-0f40sg` → `master` の PR を作ってマージする（PR #1 の内容も含むので、
   PR #1 を先にマージしなくても、こちらだけで全部入る）。
3. ゲームを実際に何局か遊んで、難しさ（特に「やさしい」）や説明のわかりやすさについての感想を集める。

## 更新のしかた

作業を始めるとき・終えるときにこのファイルを更新する。日付と「現状」「ブランチごとの作業」「次にやること」を直す。
