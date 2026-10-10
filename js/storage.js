// localStorage への保存・読み込み（古いデータの移行を含む）
window.TodoApp = window.TodoApp || {};

TodoApp.storage = (() => {
    const STORAGE_KEY = "todo.tasks.v1";
    const ARCHIVE_STORAGE_KEY = "todo.archive.v1";
    const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    const REPEAT_MODES = ["daily", "weekdays", "weekly", "monthly"];
    const state = TodoApp.state;
    const { generateId } = TodoApp.utils;

    // 日時（ミリ秒）として使える数か。範囲外（例 1e100）だと Date が壊れて表示で例外になる
    function isValidTimestamp(value) {
        return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
    }

    // 期限日は "YYYY-MM-DD" の文字列。無い・不正なら null（項目自体を保存しない）
    function normalizeDueDate(value) {
        return typeof value === "string" && DUE_DATE_PATTERN.test(value) ? value : null;
    }

    // 1 件のタスクを検証して正しい形にする。直したところがあれば changed を true にする。
    // 使えないデータなら task は null。読み込みとバックアップの取り込みの両方で使う。
    function normalizeTask(item, now) {
        if (!item || typeof item.text !== "string") {
            return { task: null, changed: true };
        }

        const text = item.text.trim();
        if (!text) {
            return { task: null, changed: true };
        }

        let changed = false;
        const createdAt = isValidTimestamp(item.createdAt) ? item.createdAt : now;
        if (!isValidTimestamp(item.createdAt)) {
            changed = true;
        }

        let id = item.id;
        if (typeof id !== "string" || !id.trim()) {
            id = generateId();
            changed = true;
        }

        const task = {
            id,
            text,
            completed: Boolean(item.completed),
            createdAt
        };

        const dueDate = normalizeDueDate(item.dueDate);
        if (dueDate) {
            task.dueDate = dueDate;
        } else if (item.dueDate !== undefined) {
            changed = true;
        }

        // くり返し（省略可能な項目）。nextId は 完了したときに 作った 次のタスクの ID
        if (REPEAT_MODES.includes(item.repeat)) {
            task.repeat = item.repeat;
        } else if (item.repeat !== undefined) {
            changed = true;
        }
        if (typeof item.nextId === "string" && item.nextId) {
            task.nextId = item.nextId;
        }
        // 終えた日時（省略可能。これより前に 終えた タスクには 無い）
        if (task.completed && isValidTimestamp(item.completedAt)) {
            task.completedAt = item.completedAt;
        }

        return { task, changed };
    }

    function normalizeArchiveRecord(item, now) {
        const { task, changed: taskChanged } = normalizeTask(item, now);
        if (!task) {
            return { record: null, changed: true };
        }

        let changed = taskChanged;
        const deletedAt = isValidTimestamp(item.deletedAt) ? item.deletedAt : task.createdAt;
        if (!isValidTimestamp(item.deletedAt)) {
            changed = true;
        }

        const reason = typeof item.reason === "string" ? item.reason : "deleted";
        const record = {
            id: task.id,
            text: task.text,
            createdAt: task.createdAt,
            deletedAt,
            completed: task.completed,
            reason
        };
        if (task.dueDate) {
            record.dueDate = task.dueDate;
        }
        if (task.completedAt) {
            record.completedAt = task.completedAt;
        }

        return { record, changed };
    }

    function readList(key) {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    }

    function loadTasks() {
        state.tasks = [];
        try {
            const parsed = readList(STORAGE_KEY);
            if (!parsed) {
                return;
            }

            let migrated = false;
            const now = Date.now();

            state.tasks = parsed.map(item => {
                const { task, changed } = normalizeTask(item, now);
                migrated = migrated || changed;
                return task;
            }).filter(Boolean);

            if (migrated) {
                saveTasks();
            }
        } catch (error) {
            console.warn("Failed to load tasks from storage", error);
            state.tasks = [];
        }
    }

    function loadArchive() {
        state.archivedTasks = [];
        try {
            const parsed = readList(ARCHIVE_STORAGE_KEY);
            if (!parsed) {
                return;
            }

            let migrated = false;
            const now = Date.now();

            state.archivedTasks = parsed.map(item => {
                const { record, changed } = normalizeArchiveRecord(item, now);
                migrated = migrated || changed;
                return record;
            }).filter(Boolean);

            if (migrated) {
                saveArchive();
            }
        } catch (error) {
            console.warn("Failed to load archive from storage", error);
            state.archivedTasks = [];
        }
    }

    function saveTasks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
        } catch (error) {
            console.warn("Failed to save tasks", error);
        }
    }

    function saveArchive() {
        try {
            localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(state.archivedTasks));
        } catch (error) {
            console.warn("Failed to save archive", error);
        }
    }

    return {
        loadTasks,
        loadArchive,
        saveTasks,
        saveArchive,
        normalizeTask,
        normalizeArchiveRecord,
        normalizeDueDate,
        REPEAT_MODES
    };
})();
