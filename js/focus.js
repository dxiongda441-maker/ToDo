// 集中タイマー（ポモドーロ）：決めた時間だけ 1 つのタスクに集中し、終わったら休憩する
//
// 保存先は localStorage の "todo.focus.v1"（タスクの保存データとは別。タスクの形式は変えない）。
// 動いている間は「終わる時刻」を保存するので、ページを閉じたり再読み込みしたりしても 続きから数える。
window.TodoApp = window.TodoApp || {};

TodoApp.focus = (() => {
    const STORAGE_KEY = "todo.focus.v1";
    const MINUTE = 60 * 1000;
    const LONG_BREAK_EVERY = 4; // 4 回集中したら 長めの休憩
    const BREAK_MINUTES = { short: 5, long: 15 };
    const LENGTH_OPTIONS = [15, 25, 50];
    const state = TodoApp.state;
    const { toDateKey } = TodoApp.utils;

    const els = {};
    let focus = null;
    let ticker = null;
    const baseTitle = document.title;

    function defaults() {
        return {
            mode: "focus", // focus / short / long
            focusMinutes: 25,
            running: false,
            endsAt: null,
            remainingMs: 25 * MINUTE,
            taskId: "",
            streak: 0, // 長めの休憩までに 何回集中したか
            days: {}, // "YYYY-MM-DD" → { sessions, minutes }
            perTask: {} // タスク ID → 集中した回数
        };
    }

    function load() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        } catch (_error) {
            saved = null;
        }
        const value = Object.assign(defaults(), saved && typeof saved === "object" ? saved : {});
        if (!LENGTH_OPTIONS.includes(value.focusMinutes)) {
            value.focusMinutes = 25;
        }
        if (!["focus", "short", "long"].includes(value.mode)) {
            value.mode = "focus";
        }
        if (typeof value.remainingMs !== "number" || !Number.isFinite(value.remainingMs) || value.remainingMs < 0) {
            value.remainingMs = lengthOf(value.mode, value.focusMinutes);
        }
        if (value.running && (typeof value.endsAt !== "number" || !Number.isFinite(value.endsAt))) {
            value.running = false;
        }
        value.days = value.days && typeof value.days === "object" ? value.days : {};
        value.perTask = value.perTask && typeof value.perTask === "object" ? value.perTask : {};
        return value;
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(focus));
        } catch (_error) {
            // 保存できなくても タイマーは動かす
        }
    }

    function lengthOf(mode, focusMinutes) {
        return (mode === "focus" ? focusMinutes : BREAK_MINUTES[mode]) * MINUTE;
    }

    function remaining() {
        return focus.running ? Math.max(0, focus.endsAt - Date.now()) : focus.remainingMs;
    }

    function formatClock(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    // 終わったことを 短い音で知らせる（音が出せない環境では 何もしない）
    function chime() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                return;
            }
            const ctx = new AudioContextClass();
            [0, 0.18, 0.36].forEach((delay, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = [660, 880, 1320][index];
                gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.55);
            });
            setTimeout(() => ctx.close(), 1500);
        } catch (_error) {
            // 音は おまけ
        }
    }

    function switchMode(mode) {
        focus.mode = mode;
        focus.running = false;
        focus.endsAt = null;
        focus.remainingMs = lengthOf(mode, focus.focusMinutes);
    }

    // 時間が来た（または「Skip」を押した）。counts が true なら 集中した記録を残す
    function finish(counts) {
        if (focus.mode === "focus") {
            if (counts) {
                const key = toDateKey(Date.now());
                const day = focus.days[key] || { sessions: 0, minutes: 0 };
                day.sessions += 1;
                day.minutes += focus.focusMinutes;
                focus.days[key] = day;
                if (focus.taskId) {
                    focus.perTask[focus.taskId] = (focus.perTask[focus.taskId] || 0) + 1;
                }
                focus.streak += 1;
            }
            const long = focus.streak >= LONG_BREAK_EVERY;
            if (long) {
                focus.streak = 0;
            }
            switchMode(long ? "long" : "short");
            if (counts) {
                chime();
                TodoApp.toast.show(long ? "Great work! Take a longer break." : "Focus session done. Take a short break.", { duration: 8000 });
            }
        } else {
            switchMode("focus");
            if (counts) {
                chime();
                TodoApp.toast.show("Break is over. Ready to focus again?", { duration: 8000 });
            }
        }
        pruneDays();
        save();
        render();
        if (TodoApp.gamesLink) {
            TodoApp.gamesLink.refresh(); // 集中した 回数も がんばりのたねに なる
        }
    }

    // 古い日の記録は 60 日ぶんだけ残す
    function pruneDays() {
        const keys = Object.keys(focus.days).sort();
        keys.slice(0, Math.max(0, keys.length - 60)).forEach(key => delete focus.days[key]);
    }

    function tick() {
        if (focus.running && remaining() <= 0) {
            finish(true);
            return;
        }
        renderClock();
    }

    function start() {
        if (focus.running) {
            return;
        }
        focus.running = true;
        focus.endsAt = Date.now() + focus.remainingMs;
        save();
        render();
    }

    function pause() {
        if (!focus.running) {
            return;
        }
        focus.remainingMs = remaining();
        focus.running = false;
        focus.endsAt = null;
        save();
        render();
    }

    function reset() {
        switchMode(focus.mode);
        save();
        render();
    }

    // 何日 つづけて 集中できているか（今日が まだ 0 回なら、昨日までの 連続を 数える）
    function streakDays() {
        const day = new Date();
        day.setHours(12, 0, 0, 0);
        const has = date => (focus.days[toDateKey(date.getTime())] || {}).sessions > 0;
        if (!has(day)) {
            day.setDate(day.getDate() - 1);
        }
        let count = 0;
        while (has(day)) {
            count += 1;
            day.setDate(day.getDate() - 1);
        }
        return count;
    }

    function activeTasks() {
        return state.tasks.filter(task => !task.completed);
    }

    function renderTaskOptions() {
        const tasks = activeTasks();
        if (focus.taskId && !state.tasks.some(task => task.id === focus.taskId)) {
            focus.taskId = "";
            save();
        }
        const options = [new Option("No specific task", "")];
        tasks.forEach(task => {
            const label = task.text.length > 60 ? `${task.text.slice(0, 57)}…` : task.text;
            options.push(new Option(label, task.id));
        });
        // 完了済みのタスクを選んでいた場合も、名前は出しておく
        const chosen = state.tasks.find(task => task.id === focus.taskId);
        if (chosen && chosen.completed) {
            options.push(new Option(`✓ ${chosen.text}`, chosen.id));
        }
        els.task.replaceChildren(...options);
        els.task.value = focus.taskId;
    }

    function renderClock() {
        const ms = remaining();
        els.clock.textContent = formatClock(ms);
        const total = lengthOf(focus.mode, focus.focusMinutes);
        els.ring.style.setProperty("--done", String(1 - ms / total));
        const label = focus.mode === "focus" ? "Focus" : "Break";
        document.title = focus.running ? `(${formatClock(ms)} ${label}) ${baseTitle}` : baseTitle;
    }

    function render() {
        renderClock();
        els.section.dataset.mode = focus.mode;
        els.mode.textContent = focus.mode === "focus" ? "Focus" : focus.mode === "long" ? "Long break" : "Short break";
        els.start.textContent = focus.running ? "Pause" : remaining() < lengthOf(focus.mode, focus.focusMinutes) ? "Resume" : "Start";
        els.start.setAttribute("aria-pressed", String(focus.running));
        els.length.value = String(focus.focusMinutes);
        els.length.disabled = focus.running && focus.mode === "focus";

        const today = focus.days[toDateKey(Date.now())] || { sessions: 0, minutes: 0 };
        const parts = [`Today: ${today.sessions} ${today.sessions === 1 ? "session" : "sessions"} · ${today.minutes} min`];
        const perTask = focus.taskId ? focus.perTask[focus.taskId] || 0 : 0;
        if (perTask > 0) {
            parts.push(`this task: ${perTask}`);
        }
        const streak = streakDays();
        if (streak >= 2) {
            parts.push(`${streak}-day streak`);
        }
        els.stats.textContent = parts.join(" · ");

        clearInterval(ticker);
        ticker = focus.running ? setInterval(tick, 500) : null;
    }

    function init() {
        els.section = document.querySelector("#focus-section");
        if (!els.section) {
            return;
        }
        els.clock = document.querySelector("#focus-clock");
        els.ring = document.querySelector("#focus-ring");
        els.mode = document.querySelector("#focus-mode");
        els.start = document.querySelector("#focus-start");
        els.reset = document.querySelector("#focus-reset");
        els.skip = document.querySelector("#focus-skip");
        els.length = document.querySelector("#focus-length");
        els.task = document.querySelector("#focus-task");
        els.stats = document.querySelector("#focus-stats");

        focus = load();
        // 閉じている間に 時間が来ていたら、その分を 記録してから 次へ進む
        if (focus.running && remaining() <= 0) {
            finish(true);
        }

        els.start.addEventListener("click", () => (focus.running ? pause() : start()));
        els.reset.addEventListener("click", reset);
        els.skip.addEventListener("click", () => finish(false));
        els.length.addEventListener("change", () => {
            focus.focusMinutes = Number(els.length.value);
            if (focus.mode === "focus" && !focus.running) {
                focus.remainingMs = lengthOf("focus", focus.focusMinutes);
            }
            save();
            render();
        });
        els.task.addEventListener("change", () => {
            focus.taskId = els.task.value;
            save();
            render();
        });

        // タスクが増えたり 終わったりしたら、選べるタスクを 作り直す
        const list = document.querySelector("#task-list");
        if (list && "MutationObserver" in window) {
            new MutationObserver(renderTaskOptions).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        }
        // 別のタブで タイマーを動かしたときも そろえる
        window.addEventListener("storage", event => {
            if (event.key === STORAGE_KEY) {
                focus = load();
                renderTaskOptions();
                render();
            }
        });

        renderTaskOptions();
        render();
    }

    // バックアップ用：記録（日ごと・タスクごと）だけを書き出す。動いているタイマーの状態は含めない
    function exportData() {
        const current = focus || load();
        return { days: current.days, perTask: current.perTask };
    }

    // バックアップの取り込み：日ごと・タスクごとの回数は 多い方を残す。足した日の数を返す
    function mergeData(incoming) {
        if (!incoming || typeof incoming !== "object") {
            return 0;
        }
        if (!focus) {
            focus = load();
        }
        let addedDays = 0;
        Object.entries(incoming.days && typeof incoming.days === "object" ? incoming.days : {}).forEach(([key, day]) => {
            const sessions = Number(day && day.sessions) || 0;
            const minutes = Number(day && day.minutes) || 0;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || sessions <= 0) {
                return;
            }
            const mine = focus.days[key];
            if (!mine) {
                addedDays += 1;
            }
            focus.days[key] = {
                sessions: Math.max(sessions, mine ? mine.sessions : 0),
                minutes: Math.max(minutes, mine ? mine.minutes : 0)
            };
        });
        Object.entries(incoming.perTask && typeof incoming.perTask === "object" ? incoming.perTask : {}).forEach(([id, count]) => {
            const n = Number(count) || 0;
            if (n > 0) {
                focus.perTask[id] = Math.max(n, focus.perTask[id] || 0);
            }
        });
        pruneDays();
        save();
        if (els.section) {
            render();
        }
        return addedDays;
    }

    return { init, formatClock, exportData, mergeData };
})();
