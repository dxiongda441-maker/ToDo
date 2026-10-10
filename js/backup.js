// タスクと履歴を JSON ファイルに書き出す・取り込む（取り込みは既存データに追加する）
window.TodoApp = window.TodoApp || {};

TodoApp.backup = (() => {
    const BACKUP_FORMAT = "todo-backup";
    const BACKUP_VERSION = 1;
    const LAST_EXPORT_KEY = "todo.lastExport.v1"; // 最後に 書き出した 日時（ミリ秒）
    const REMIND_AFTER_DAYS = 14;
    const DAY = 24 * 60 * 60 * 1000;

    const state = TodoApp.state;
    const storage = TodoApp.storage;
    const toast = TodoApp.toast;
    const { toDateKey } = TodoApp.utils;

    const exportButton = document.querySelector("#export-button");
    const importButton = document.querySelector("#import-button");
    const importFile = document.querySelector("#import-file");
    const ageEl = document.querySelector("#backup-age");
    const enabled = Boolean(exportButton && importButton && importFile);

    function buildBackup() {
        return {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            tasks: state.tasks,
            archive: state.archivedTasks,
            // 集中タイマーの記録（無くても 取り込める）
            focus: TodoApp.focus ? TodoApp.focus.exportData() : undefined
        };
    }

    function exportData() {
        const json = JSON.stringify(buildBackup(), null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `todo-backup-${toDateKey(Date.now())}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        try {
            localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
        } catch (_error) {
            // 覚えられなくても 書き出しは できている
        }
        renderAge();
        toast.show(`Exported ${state.tasks.length} tasks and ${state.archivedTasks.length} history items`);
    }

    // 最後に バックアップした のは いつか。しばらく していなければ 目立たせる
    function renderAge() {
        if (!ageEl) {
            return;
        }
        let last = NaN;
        try {
            last = Number(localStorage.getItem(LAST_EXPORT_KEY));
        } catch (_error) {
            last = NaN;
        }
        const hasData = state.tasks.length + state.archivedTasks.length > 0;
        if (!Number.isFinite(last) || last <= 0) {
            ageEl.textContent = hasData ? "You have not exported a backup yet." : "";
            ageEl.classList.toggle("stale", hasData);
            return;
        }
        const days = Math.floor((Date.now() - last) / DAY);
        ageEl.textContent = days <= 0 ? "Last backup: today." : `Last backup: ${days} ${days === 1 ? "day" : "days"} ago.`;
        ageEl.classList.toggle("stale", hasData && days >= REMIND_AFTER_DAYS);
    }

    // 取り込み：同じ ID のものは今のデータを優先し、無いものだけ追加する
    function mergeBackup(data) {
        // 古い形式（タスクの配列だけ）も受け付ける
        const incomingTasks = Array.isArray(data) ? data : (data && Array.isArray(data.tasks) ? data.tasks : null);
        const incomingArchive = data && Array.isArray(data.archive) ? data.archive : [];
        if (!incomingTasks) {
            throw new Error("This file is not a ToDo backup.");
        }

        const now = Date.now();
        const taskIds = new Set(state.tasks.map(task => task.id));
        const archiveIds = new Set(state.archivedTasks.map(record => record.id));
        let addedTasks = 0;
        let addedHistory = 0;

        incomingTasks.forEach(item => {
            const { task } = storage.normalizeTask(item, now);
            // 削除して履歴にあるタスクも「今のデータ」なので、古いバックアップで復活させない
            if (task && !taskIds.has(task.id) && !archiveIds.has(task.id)) {
                state.tasks.push(task);
                taskIds.add(task.id);
                addedTasks += 1;
            }
        });

        incomingArchive.forEach(item => {
            const { record } = storage.normalizeArchiveRecord(item, now);
            if (record && !archiveIds.has(record.id) && !taskIds.has(record.id)) {
                state.archivedTasks.push(record);
                archiveIds.add(record.id);
                addedHistory += 1;
            }
        });

        state.archivedTasks.sort((a, b) => b.deletedAt - a.deletedAt);
        const addedFocusDays = data && data.focus && TodoApp.focus ? TodoApp.focus.mergeData(data.focus) : 0;
        return { addedTasks, addedHistory, addedFocusDays };
    }

    function importFromText(text) {
        const data = JSON.parse(text);
        const result = mergeBackup(data);
        storage.saveTasks();
        storage.saveArchive();
        TodoApp.tasks.render();
        return result;
    }

    function handleFileChosen() {
        const file = importFile.files && importFile.files[0];
        importFile.value = "";
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            try {
                const { addedTasks, addedHistory, addedFocusDays } = importFromText(String(reader.result));
                if (addedTasks === 0 && addedHistory === 0 && addedFocusDays === 0) {
                    toast.show("Nothing new to import. Everything in the file is already here.");
                } else {
                    const focusNote = addedFocusDays > 0 ? ` and focus records for ${addedFocusDays} ${addedFocusDays === 1 ? "day" : "days"}` : "";
                    toast.show(`Imported ${addedTasks} tasks and ${addedHistory} history items${focusNote}`);
                }
            } catch (error) {
                console.warn("Failed to import backup", error);
                toast.show("Could not import that file. Please choose a ToDo backup (.json).");
            }
        });
        reader.addEventListener("error", () => {
            toast.show("Could not read that file.");
        });
        reader.readAsText(file);
    }

    function init() {
        if (!enabled) {
            return;
        }

        exportButton.addEventListener("click", exportData);
        importButton.addEventListener("click", () => importFile.click());
        importFile.addEventListener("change", handleFileChosen);
        renderAge();
    }

    return { init, importFromText, refresh: renderAge };
})();
