// localStorage への保存・読み込み（古いデータの移行を含む）
window.TodoApp = window.TodoApp || {};

TodoApp.storage = (() => {
    const STORAGE_KEY = "todo.tasks.v1";
    const ARCHIVE_STORAGE_KEY = "todo.archive.v1";
    const state = TodoApp.state;
    const { generateId } = TodoApp.utils;

    function loadTasks() {
        state.tasks = [];
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return;
            }

            let migrated = false;
            const now = Date.now();

            state.tasks = parsed.map(item => {
                if (!item || typeof item.text !== "string") {
                    migrated = true;
                    return null;
                }

                const text = item.text.trim();
                if (!text) {
                    migrated = true;
                    return null;
                }

                const createdAt = typeof item.createdAt === "number" ? item.createdAt : now;
                if (typeof item.createdAt !== "number") {
                    migrated = true;
                }

                let id = item.id;
                if (typeof id !== "string" || !id.trim()) {
                    id = generateId();
                    migrated = true;
                }

                return {
                    id,
                    text,
                    completed: Boolean(item.completed),
                    createdAt
                };
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
            const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return;
            }

            let migrated = false;
            state.archivedTasks = parsed.map(item => {
                if (!item || typeof item.text !== "string") {
                    migrated = true;
                    return null;
                }

                const text = item.text.trim();
                if (!text) {
                    migrated = true;
                    return null;
                }

                const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
                const deletedAt = typeof item.deletedAt === "number" ? item.deletedAt : createdAt;
                if (typeof item.createdAt !== "number" || typeof item.deletedAt !== "number") {
                    migrated = true;
                }

                let id = item.id;
                if (typeof id !== "string" || !id.trim()) {
                    id = generateId();
                    migrated = true;
                }

                const reason = typeof item.reason === "string" ? item.reason : "deleted";

                return {
                    id,
                    text,
                    createdAt,
                    deletedAt,
                    completed: Boolean(item.completed),
                    reason
                };
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

    return { loadTasks, loadArchive, saveTasks, saveArchive };
})();
