# ToDo アプリ — Claude 向けの説明

ブラウザだけで動く ToDo アプリ。ビルドなし・ライブラリなし。`index.html` をブラウザで直接開けば動く。
ファイル構成と「どこを直せばいいか」は `README.md` にある（ここには重複して書かない）。

## 守ること

- **ビルドを入れない。** npm・バンドラ・フレームワークは使わない。
- **ES Modules（`import`）を使わない。** `index.html` をダブルクリックで開いたとき（`file://`）に動かなくなるため。
  各ファイルは `window.TodoApp` に自分の機能を登録し、`<script defer>` を順番に並べて読み込む。
- **`index.html` の `<script>` の順番を変えない。** 後のファイルが前のファイルを使う。
  新しいファイルを足すときは、使う側より前に置き、`tools/check.sh` の期待順も直す。
- **保存データの形式を勝手に変えない。** localStorage のキー `todo.tasks.v1`・`todo.archive.v1` に、
  利用者の実データが入っている。変えるときは `js/storage.js` に移行処理を書く。
- インデントは 4 スペース（`.editorconfig`）。
- 画面の文言は英語（既存に合わせる）。説明文やコメントは日本語。

## 変更したら

1. `bash tools/check.sh` が「すべて OK」になることを確かめる（GitHub でも push のたびに自動で動く）。
2. `index.html` をブラウザで開き、タスクの追加・完了・編集・削除、フィルター、検索、
   「Clear completed」と Undo、履歴カレンダーの月の切り替えと Restore、配色の切り替えを確かめる。
   Playwright がある環境なら `node tools/browser-check.js` でまとめて確かめられる（375px と 1024px）。
   axe-core の `axe.min.js` があれば `AXE_PATH=…/axe.min.js` を付けると、アクセシビリティの自動チェックもする。
3. スマホ幅（375px）で崩れていないか見る。

## ゲーム（games/utsuroi）

- 画面の文言は日本語（ToDo アプリと違うので注意）。
- `engine.js` はルールと CPU だけを持ち、DOM を触らない。CPU は `createUtsuroiEngine` 関数を
  文字列にして Web Worker で動かすので、**この関数の外の変数を参照しない**
  （`tools/test-utsuroi.js` で確かめている）。
- ルールを変えたら `tools/test-utsuroi.js` を直し、`node tools/utsuroi-selfplay.js 40 hard 150` で
  先手・後手の勝率や手数が極端になっていないか確かめ、`games/utsuroi/README.md` の表も直す。
- 保存データのキー（`utsuroi.*.v1`）の形式を変えるときは、古い形式も読めるようにする。

## 作業の進め方

- **作業の始めに `STATUS.md` を読み、終わりに更新する。** 別のセッションと作業状況を共有するため。
  日付・ブランチごとの作業・次にやることを直し、作業と同じブランチにコミットする。
- 作業はブランチを切って行い、`master` へは直接 push しない。
- コミットメッセージは英語・命令形（例: `Add due dates to tasks`）。
- 背景画像は Unsplash を直接参照している（`css/base.css` の `--background-image`）。
  ネットにつながらない環境では表示されないが、不具合ではない。
