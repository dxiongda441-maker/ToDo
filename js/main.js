// エントリーポイント：保存データを読み込み、イベントを登録して初回描画する
(() => {
    const { storage, theme, toast, tasks, history, backup } = TodoApp;

    theme.init();
    storage.loadTasks();
    storage.loadArchive();
    toast.init();
    tasks.init();
    history.init();
    backup.init();
    tasks.render();
})();
