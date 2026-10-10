# ToDo App

ブラウザだけで動くシンプルな ToDo アプリです。ビルド不要で、`index.html` をブラウザで開けばそのまま使えます。データはブラウザの `localStorage` に保存されます。

## できること

- タスクの追加・完了・その場で編集（Enter で保存、Esc で取り消し）・削除
- 期限日（任意）。「Overdue（期限切れ）」「Due today」「Due tomorrow」を色と文字で表示
- 検索・フィルター（All / Active / Completed）・完了率のバー
- 削除や「Clear completed」の直後に出るお知らせから「Undo」で元に戻せる
- 履歴カレンダー：日ごとに追加・削除したタスクを表示。削除したタスクは「Restore」で一覧に戻せる
- 配色：Auto（端末の設定に合わせる）/ Light / Dark
- バックアップ：Export で JSON ファイルに保存、Import で取り込み（同じタスクは二重にならない）

## 保存データ

| localStorage のキー | 中身 |
| --- | --- |
| `todo.tasks.v1` | 今のタスク一覧 `{ id, text, completed, createdAt, dueDate? }`（`dueDate` は `"YYYY-MM-DD"`、無ければ項目ごと省く） |
| `todo.archive.v1` | 削除・一括削除したタスク（上の項目 ＋ `deletedAt`・`reason`） |
| `todo.theme.v1` | 配色の設定（`auto` / `light` / `dark`） |

## ディレクトリ構成

```
ToDo/
├── index.html        画面の HTML（CSS / JS の読み込み）
├── CLAUDE.md         Claude に作業してもらうときのルール
├── STATUS.md         今の作業状況（ブランチ・次にやること）
├── tools/
│   └── check.sh      基本チェック（bash tools/check.sh）
├── .github/          自動チェックとプルリクエストのひな形
├── css/
│   ├── base.css      色変数・背景・全体レイアウト・共通クラス
│   ├── tasks.css     入力フォーム・フィルター・タスクリスト・集計
│   └── history.css   履歴カレンダー・日別履歴リスト
└── js/
    ├── utils.js      日付フォーマット・ID 生成などのヘルパー
    ├── state.js      アプリ全体で共有する状態（タスク一覧・選択中の日付など）
    ├── storage.js    localStorage への保存・読み込み（データの検証・移行）
    ├── theme.js      配色（Auto / Light / Dark）の切り替え
    ├── toast.js      画面下のお知らせと「Undo」ボタン
    ├── tasks.js      タスクの追加・編集・削除・期限日・検索・フィルターと描画
    ├── history.js    履歴カレンダーと日別履歴の描画（削除したタスクの復元）
    ├── backup.js     JSON ファイルへの書き出し・取り込み
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
| 配色の切り替えを変える | `js/theme.js`（色そのものは各 CSS の `body.dark` ） |
| 「元に戻す」のお知らせを変える | `js/toast.js` |
| バックアップの書き出し・取り込みを変える | `js/backup.js` |
| 画面の文言・要素を変える | `index.html` |

## JavaScript の仕組み

各 JS ファイルは `window.TodoApp` に自分の機能を登録します（例：`TodoApp.utils`、`TodoApp.tasks`）。
後のファイルが前のファイルを使うため、`index.html` の `<script>` の並び順は変えないでください。
新しいファイルを追加するときは、使う側より前に読み込まれるよう `<script>` を追加します。
