// エントリーポイント：保存データを読み込み、イベントを登録して初回描画する
(() => {
    const { storage, tasks, history } = TodoApp;

    storage.loadTasks();
    storage.loadArchive();
    tasks.init();
    history.init();
    tasks.render();
})();
