// アプリ全体で共有する状態
window.TodoApp = window.TodoApp || {};

TodoApp.state = (() => {
    const { toDateKey, startOfMonth } = TodoApp.utils;

    return {
        tasks: [],
        archivedTasks: [],
        activeFilter: "all",
        selectedDate: toDateKey(Date.now()),
        currentMonth: startOfMonth(new Date())
    };
})();
