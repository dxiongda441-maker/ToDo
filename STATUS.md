# 作業状況

最終更新: 2026-10-03

ルールは `CLAUDE.md`、ファイル構成は `README.md` を参照。

## 現状

- **`master` には最初のコミットしかない。** `index.html` / `app.js` / `styles.css` の 3 ファイル構成のまま。
  `CLAUDE.md`・`tools/check.sh`・CI もまだ `master` に入っていない。
- 下記の作業はすべてブランチ上にあり、**プルリクエストはまだ 1 件も作られていない。**
- 最新の状態（下記の作業をすべて含む）で `bash tools/check.sh` は「すべて OK」。

## ブランチごとの作業

| ブランチ | 内容 | 状態 |
| --- | --- | --- |
| `claude/organize-file-directory-yq7io2` | ファイルを `css/`・`js/` に分割。`CLAUDE.md`・`README.md`・`tools/check.sh`・CI・`.editorconfig`・PR ひな形を追加 | 完了。PR 未作成 |
| `claude/sharp-bardeen-ydptez` | 上のブランチ ＋ スマホ幅でタスク一覧がはみ出す不具合の修正（`css/tasks.css`・`css/history.css`） | 完了。PR 未作成 |
| `claude/laughing-ptolemy-qju2td` | 上のブランチ ＋ この `STATUS.md` と `CLAUDE.md` への「`STATUS.md` を読む・更新する」ルール追加 | `master` への PR を作成済み。マージ待ち |

各ブランチは前のブランチの上に積み重なっている（`organize` ⊂ `sharp-bardeen` ⊂ `laughing-ptolemy`）。

## 次にやること

1. `claude/laughing-ptolemy-qju2td` → `master` の PR を確認してマージする。
   上の 2 つのブランチの作業もすべて含むので、これ 1 件で全部 `master` に入る。
2. マージ後は、どのセッションも `master` から `CLAUDE.md` と `STATUS.md` を読める。
3. 2026-10-03 にヘッドレスブラウザで確認済み：375px・1024px でタスクの追加・完了ができ、横はみ出しなし、
   JavaScript のエラーなし。編集・削除・フィルター・カレンダーの月切り替えは、マージ前に手で触って確かめる。

## 更新のしかた

作業を始めるとき・終えるときにこのファイルを更新する。日付と「現状」「ブランチごとの作業」「次にやること」を直す。
