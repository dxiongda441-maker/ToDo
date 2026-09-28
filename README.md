# ToDo App

ブラウザだけで動くシンプルな ToDo アプリです。ビルド不要で、`index.html` をブラウザで開けばそのまま使えます。データはブラウザの `localStorage` に保存されます。

## ディレクトリ構成

```
ToDo/
├── index.html        画面の HTML（CSS / JS の読み込み）
├── css/
│   ├── base.css      色変数・背景・全体レイアウト・共通クラス
│   ├── tasks.css     入力フォーム・フィルター・タスクリスト・集計
│   └── history.css   履歴カレンダー・日別履歴リスト
└── js/
    ├── utils.js      日付フォーマット・ID 生成などのヘルパー
    ├── state.js      アプリ全体で共有する状態（タスク一覧・選択中の日付など）
    ├── storage.js    localStorage への保存・読み込み
    ├── tasks.js      タスクの追加・編集・削除・フィルターと描画
    ├── history.js    履歴カレンダーと日別履歴の描画
    └── main.js       起動処理（データ読み込み → イベント登録 → 初回描画）
```

## どこを編集すればいいか

| やりたいこと | 編集するファイル |
| --- | --- |
| 色・背景画像を変える | `css/base.css` の `:root` |
| タスク一覧の見た目を変える | `css/tasks.css` |
| カレンダーの見た目を変える | `css/history.css` |
| タスクの追加・編集・削除の動きを変える | `js/tasks.js` |
| 履歴カレンダーの動きを変える | `js/history.js` |
| 保存形式を変える | `js/storage.js` |
| 画面の文言・要素を変える | `index.html` |

## JavaScript の仕組み

各 JS ファイルは `window.TodoApp` に自分の機能を登録します（例：`TodoApp.utils`、`TodoApp.tasks`）。
後のファイルが前のファイルを使うため、`index.html` の `<script>` の並び順は変えないでください。
新しいファイルを追加するときは、使う側より前に読み込まれるよう `<script>` を追加します。
