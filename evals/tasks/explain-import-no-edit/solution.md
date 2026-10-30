復元処理は `importData` で行い、読み込んだタスクと履歴をそれぞれ `normalizeTask` / `normalizeArchiveRecord` で整えてから `mergeById` に渡します。
`importData` は現在のタスク一覧と履歴（アーカイブ）の両方の id を1つの `knownIds` セットにまとめます。
`mergeById` はこのセットにない id のデータだけを追加し、追加した id もセットに加えるので、同じファイル内の重複も含めて1つの id が一覧と履歴の両方に入ることはありません。
追加件数が0件なら何もせず通知し、そうでなければ確認ダイアログのあとで保存します。
