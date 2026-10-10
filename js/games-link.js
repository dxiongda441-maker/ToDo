// ToDo 画面の いちばん下：ゲーム「ほしふるクエスト」で 受け取れる『がんばりのたね』の 数を 知らせる
//
// RPG の 冒険の書（hoshifuru.save.v1）が あるときだけ 出す。数え方は games/hoshifuru/game.js の
// completedTodoIds と 同じ（終えたタスク ＋ 集中タイマーで 集中しきった 回数 − もう 受け取った 分）。読むだけで 書きかえない。
window.TodoApp = window.TodoApp || {};

TodoApp.gamesLink = (() => {
    const state = TodoApp.state;
    const noteEl = document.querySelector("#seed-note");

    function read(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "null");
        } catch (_error) {
            return null;
        }
    }

    function waitingSeeds() {
        const save = read("hoshifuru.save.v1");
        if (!save || !save.todo || !Array.isArray(save.todo.redeemed)) {
            return null;
        }
        const done = new Set();
        state.tasks.forEach(task => task.completed && done.add(task.id));
        state.archivedTasks.forEach(item => (item.completed || item.reason === "cleared") && done.add(item.id));
        const focus = read("todo.focus.v1");
        Object.entries(focus && focus.days && typeof focus.days === "object" ? focus.days : {}).forEach(([day, record]) => {
            const sessions = Math.min(50, Number(record && record.sessions) || 0);
            for (let i = 1; i <= sessions; i += 1) {
                done.add(`focus:${day}:${i}`);
            }
        });
        const redeemed = new Set(save.todo.redeemed);
        return Array.from(done).filter(id => !redeemed.has(id)).length;
    }

    function refresh() {
        if (!noteEl) {
            return;
        }
        const waiting = waitingSeeds();
        noteEl.hidden = !waiting;
        if (waiting) {
            noteEl.textContent = `🌱 ${waiting} effort ${waiting === 1 ? "seed is" : "seeds are"} waiting for you in Hoshifuru Quest`;
        }
    }

    return { refresh };
})();
