// タスクの追加・編集・削除・フィルター・検索とリスト描画
window.TodoApp = window.TodoApp || {};

TodoApp.tasks = (() => {
    const state = TodoApp.state;
    const storage = TodoApp.storage;
    const toast = TodoApp.toast;
    const { formatTimestamp, formatShortDate, generateId, toDateKey, createDateFromKey } = TodoApp.utils;

    const form = document.querySelector("#todo-form");
    const input = document.querySelector("#task-input");
    const dueInput = document.querySelector("#due-input");
    const searchInput = document.querySelector("#search-input");
    const sortSelect = document.querySelector("#sort-select");
    const overdueCountEl = document.querySelector("#overdue-count");
    const tagBar = document.querySelector("#tag-bar");
    const list = document.querySelector("#task-list");
    const template = document.querySelector("#task-template");
    const taskCountEl = document.querySelector("#task-count");
    const completedCountEl = document.querySelector("#completed-count");
    const progressBar = document.querySelector("#progress-bar");
    const emptyStateEl = document.querySelector("#empty-state");
    const clearCompletedButton = document.querySelector("#clear-completed");
    const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

    const SORT_STORAGE_KEY = "todo.sort.v1";
    const SORT_MODES = ["added", "due"];

    const EMPTY_TEXT = {
        none: "No tasks yet. Add your first one above!",
        active: "Nothing left to do. Nice work!",
        completed: "No completed tasks yet."
    };

    function createTask(text, dueDate) {
        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }

        const task = {
            id: generateId(),
            text: trimmed,
            completed: false,
            createdAt: Date.now()
        };

        const due = storage.normalizeDueDate(dueDate);
        if (due) {
            task.dueDate = due;
        }

        return task;
    }

    function findTask(id) {
        return state.tasks.find(item => item.id === id) || null;
    }

    function archiveTask(task, reason, deletedAt) {
        if (!task || typeof task.text !== "string") {
            return;
        }

        const record = {
            id: task.id,
            text: task.text,
            createdAt: task.createdAt,
            deletedAt: deletedAt || Date.now(),
            completed: Boolean(task.completed),
            reason: reason || "deleted"
        };
        if (task.dueDate) {
            record.dueDate = task.dueDate;
        }

        state.archivedTasks = [record, ...state.archivedTasks.filter(item => item.id !== record.id)];
    }

    // ---------- タグ（本文中の #言葉） ----------
    const TAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;

    function tagsOf(text) {
        const tags = new Set();
        for (const match of text.matchAll(TAG_PATTERN)) {
            tags.add(match[1].toLowerCase());
        }
        return tags;
    }

    // 検索欄が「#タグ」1 語だけなら、そのタグを持つタスクだけ（部分一致ではなく完全一致）
    function tagQuery() {
        const match = /^#([\p{L}\p{N}_-]+)$/u.exec(state.searchQuery.trim());
        return match ? match[1].toLowerCase() : null;
    }

    function setSearch(value) {
        state.searchQuery = value;
        if (searchInput) {
            searchInput.value = value;
        }
        renderTasks();
    }

    // 本文を、ふつうの文字とタグのボタンに分けて表示する（textContent だけを使う）
    function renderTaskText(container, text) {
        container.textContent = "";
        let last = 0;
        for (const match of text.matchAll(TAG_PATTERN)) {
            if (match.index > last) {
                container.appendChild(document.createTextNode(text.slice(last, match.index)));
            }
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "tag-chip";
            chip.textContent = match[0];
            chip.title = `Show tasks tagged ${match[0]}`;
            chip.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                setSearch(`#${match[1]}`);
            });
            container.appendChild(chip);
            last = match.index + match[0].length;
        }
        if (last < text.length) {
            container.appendChild(document.createTextNode(text.slice(last)));
        }
    }

    function renderTagBar() {
        if (!tagBar) {
            return;
        }
        const counts = new Map();
        state.tasks.forEach(task => {
            tagsOf(task.text).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1));
        });
        tagBar.hidden = counts.size === 0;
        tagBar.textContent = "";
        if (counts.size === 0) {
            return;
        }
        const active = tagQuery();
        const label = document.createElement("span");
        label.className = "tag-bar-label";
        label.textContent = "Tags:";
        tagBar.appendChild(label);
        Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .forEach(([tag, count]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "tag-filter";
                button.classList.toggle("active", tag === active);
                button.setAttribute("aria-pressed", tag === active ? "true" : "false");
                button.textContent = `#${tag} ${count}`;
                button.addEventListener("click", () => setSearch(tag === active ? "" : `#${tag}`));
                tagBar.appendChild(button);
            });
    }

    // 期限日順：期限のあるものを日付の早い順に、期限のないものはその後ろに今の順番のまま並べる
    function sortTasks(list) {
        if (state.sortMode !== "due") {
            return list;
        }
        return list
            .map((task, index) => ({ task, index }))
            .sort((a, b) => {
                const dueA = a.task.dueDate || "";
                const dueB = b.task.dueDate || "";
                if (dueA && dueB && dueA !== dueB) {
                    return dueA < dueB ? -1 : 1;
                }
                if (Boolean(dueA) !== Boolean(dueB)) {
                    return dueA ? -1 : 1;
                }
                return a.index - b.index;
            })
            .map(entry => entry.task);
    }

    function getFilteredTasks() {
        const query = state.searchQuery.trim().toLowerCase();
        const tag = tagQuery();

        return sortTasks(state.tasks.filter(task => {
            if (state.activeFilter === "active" && task.completed) {
                return false;
            }
            if (state.activeFilter === "completed" && !task.completed) {
                return false;
            }
            if (tag) {
                return tagsOf(task.text).has(tag);
            }
            return !query || task.text.toLowerCase().includes(query);
        }));
    }

    function getEmptyText() {
        if (state.tasks.length === 0) {
            return EMPTY_TEXT.none;
        }
        if (state.searchQuery.trim()) {
            return `No tasks match "${state.searchQuery.trim()}".`;
        }
        return EMPTY_TEXT[state.activeFilter] || EMPTY_TEXT.none;
    }

    // 期限日の表示（"Due today" / "Overdue · Oct 9" など）と見た目の種類を返す
    function describeDueDate(task) {
        const due = createDateFromKey(task.dueDate);
        if (!due) {
            return null;
        }

        const todayKey = toDateKey(Date.now());
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = toDateKey(tomorrow);
        const label = formatShortDate(due);

        if (task.completed) {
            return { text: `Due ${label}`, variant: "done" };
        }
        if (task.dueDate < todayKey) {
            return { text: `Overdue · ${label}`, variant: "overdue" };
        }
        if (task.dueDate === todayKey) {
            return { text: "Due today", variant: "today" };
        }
        if (task.dueDate === tomorrowKey) {
            return { text: "Due tomorrow", variant: "soon" };
        }
        return { text: `Due ${label}`, variant: "later" };
    }

    // 編集中に再描画されても、入力途中の内容を失わないように控えておく
    function captureEditDraft() {
        const editor = list.querySelector(".task-edit");
        if (!editor) {
            return null;
        }

        return {
            id: editor.dataset.id,
            text: editor.querySelector(".task-edit-text").value,
            dueDate: editor.querySelector(".task-edit-due").value,
            hadFocus: editor.contains(document.activeElement)
        };
    }

    function buildEditor(task, draft) {
        const editor = document.createElement("form");
        editor.className = "task-edit";
        editor.dataset.id = task.id;

        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.className = "task-edit-text";
        textInput.value = draft ? draft.text : task.text;
        textInput.setAttribute("aria-label", "Task text");

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "task-edit-due";
        dateInput.value = draft ? draft.dueDate : (task.dueDate || "");
        dateInput.setAttribute("aria-label", "Due date (optional)");

        const saveButton = document.createElement("button");
        saveButton.type = "submit";
        saveButton.className = "task-edit-save";
        saveButton.textContent = "Save";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "task-edit-cancel";
        cancelButton.textContent = "Cancel";

        editor.append(textInput, dateInput, saveButton, cancelButton);

        editor.addEventListener("submit", event => {
            event.preventDefault();
            saveEdit(task.id, textInput.value, dateInput.value);
        });

        cancelButton.addEventListener("click", cancelEdit);

        editor.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelEdit();
            }
        });

        return editor;
    }

    function renderTasks() {
        const draft = captureEditDraft();
        list.innerHTML = "";
        const filtered = getFilteredTasks();

        emptyStateEl.textContent = getEmptyText();
        emptyStateEl.hidden = filtered.length !== 0;

        const fragment = document.createDocumentFragment();
        let editorToFocus = null;

        filtered.forEach(task => {
            const node = document.importNode(template.content, true);
            const item = node.querySelector(".task-item");
            const main = node.querySelector(".task-main");
            const toggle = node.querySelector(".task-toggle");
            const text = node.querySelector(".task-text");
            const dueEl = node.querySelector(".task-due");
            const meta = node.querySelector(".task-meta");
            const actions = node.querySelector(".task-actions");
            const editButton = node.querySelector(".edit-button");
            const deleteButton = node.querySelector(".delete-button");
            const handle = node.querySelector(".drag-handle");

            item.dataset.id = task.id;
            item.classList.toggle("completed", Boolean(task.completed));

            if (handle) {
                // 期限日順のときは並びが日付で決まるので、手で並べ替えない
                handle.hidden = state.sortMode === "due" || task.id === state.editingId;
                handle.addEventListener("pointerdown", event => startDrag(event, item));
                handle.addEventListener("keydown", event => onHandleKeydown(event, task.id));
            }
            if (task.id === state.movedId) {
                item.classList.add("moved");
            }

            if (task.id === state.editingId) {
                const editor = buildEditor(task, draft && draft.id === task.id ? draft : null);
                item.classList.add("editing");
                main.replaceWith(editor);
                actions.remove();
                if (!draft || draft.id !== task.id || draft.hadFocus) {
                    editorToFocus = editor;
                }
                fragment.appendChild(node);
                return;
            }

            toggle.checked = Boolean(task.completed);
            renderTaskText(text, task.text);

            if (dueEl) {
                const due = describeDueDate(task);
                dueEl.hidden = !due;
                if (due) {
                    dueEl.dateTime = task.dueDate;
                    dueEl.textContent = due.text;
                    dueEl.className = `task-due task-due--${due.variant}`;
                    item.classList.toggle("overdue", due.variant === "overdue");
                }
            }

            if (meta) {
                const createdAtDate = new Date(task.createdAt);
                const stamp = formatTimestamp(createdAtDate);
                meta.dateTime = createdAtDate.toISOString();
                meta.textContent = stamp ? `Added ${stamp}` : "";
                meta.hidden = stamp === "";
            }

            toggle.addEventListener("change", () => {
                toggleTask(task.id, toggle.checked);
            });

            editButton.addEventListener("click", () => {
                startEdit(task.id);
            });

            deleteButton.addEventListener("click", () => {
                deleteTask(task.id);
            });

            fragment.appendChild(node);
        });

        list.appendChild(fragment);

        if (editorToFocus) {
            const field = editorToFocus.querySelector(".task-edit-text");
            field.focus();
            if (!draft) {
                field.select();
            }
        }

        updateSummary();
        updateClearButtonState();
        renderTagBar();
        TodoApp.history.refresh();
    }

    function updateSummary() {
        const total = state.tasks.length;
        const completed = state.tasks.filter(task => task.completed).length;
        const totalLabel = total === 1 ? "task" : "tasks";
        const completedLabel = completed === 1 ? "completed task" : "completed tasks";

        taskCountEl.textContent = `${total} ${totalLabel}`;
        completedCountEl.textContent = `${completed} ${completedLabel}`;

        if (overdueCountEl) {
            const todayKey = toDateKey(Date.now());
            const overdue = state.tasks.filter(task => !task.completed && task.dueDate && task.dueDate < todayKey).length;
            overdueCountEl.hidden = overdue === 0;
            overdueCountEl.textContent = `${overdue} overdue`;
        }

        if (progressBar) {
            const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
            progressBar.style.width = `${percent}%`;
        }
    }

    function updateClearButtonState() {
        const hasCompleted = state.tasks.some(task => task.completed);
        clearCompletedButton.disabled = !hasCompleted;
        clearCompletedButton.classList.toggle("disabled", !hasCompleted);
    }

    function toggleTask(id, completed) {
        const task = findTask(id);
        if (!task) {
            return;
        }

        task.completed = Boolean(completed);
        storage.saveTasks();
        renderTasks();
    }

    function startEdit(id) {
        if (!findTask(id)) {
            return;
        }

        state.editingId = id;
        renderTasks();
    }

    function cancelEdit() {
        const id = state.editingId;
        state.editingId = null;
        renderTasks();
        focusTaskButton(id, ".edit-button");
    }

    function saveEdit(id, nextText, nextDueDate) {
        const task = findTask(id);
        state.editingId = null;
        if (!task) {
            renderTasks();
            return;
        }

        const trimmed = nextText.trim();
        if (!trimmed) {
            // 空にして保存したら削除（元に戻せる）
            deleteTask(id);
            return;
        }

        task.text = trimmed;
        const due = storage.normalizeDueDate(nextDueDate);
        if (due) {
            task.dueDate = due;
        } else {
            delete task.dueDate;
        }

        storage.saveTasks();
        renderTasks();
        focusTaskButton(id, ".edit-button");
    }

    function focusTaskButton(id, selector) {
        if (!id) {
            return;
        }

        const item = Array.from(list.querySelectorAll(".task-item")).find(el => el.dataset.id === id);
        const button = item && item.querySelector(selector);
        if (button) {
            button.focus();
        }
    }

    // ---------- 並べ替え ----------
    // 表示中のタスクの新しい並び（id の配列）を、全体の並びに反映する。
    // 表示中のタスクが占めていた位置に、新しい順で入れ直すので、フィルターや検索中でも
    // 表示されていないタスクの位置は変わらない
    function applyVisibleOrder(orderedIds) {
        const visible = new Set(orderedIds);
        const slots = [];
        state.tasks.forEach((task, index) => {
            if (visible.has(task.id)) {
                slots.push(index);
            }
        });
        const byId = new Map(state.tasks.map(task => [task.id, task]));
        const next = state.tasks.slice();
        orderedIds.forEach((id, k) => {
            next[slots[k]] = byId.get(id);
        });
        const changed = next.some((task, index) => task !== state.tasks[index]);
        if (changed) {
            state.tasks = next;
            storage.saveTasks();
        }
        return changed;
    }

    function visibleIds() {
        return Array.from(list.querySelectorAll(".task-item")).map(item => item.dataset.id);
    }

    function focusHandle(id) {
        const item = Array.from(list.querySelectorAll(".task-item")).find(el => el.dataset.id === id);
        const handle = item && item.querySelector(".drag-handle");
        if (handle) {
            handle.focus();
        }
    }

    function moveTask(id, offset) {
        const ids = visibleIds();
        const from = ids.indexOf(id);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= ids.length) {
            return;
        }
        ids.splice(from, 1);
        ids.splice(to, 0, id);
        if (applyVisibleOrder(ids)) {
            state.movedId = id;
            renderTasks();
            state.movedId = null;
            focusHandle(id);
        }
    }

    function onHandleKeydown(event, id) {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            // つまみにフォーカスがあるときは矢印だけで、ほかの場所では Alt+矢印で動かせる
            event.preventDefault();
            moveTask(id, event.key === "ArrowUp" ? -1 : 1);
        }
    }

    function onListKeydown(event) {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
            return;
        }
        const item = event.target.closest && event.target.closest(".task-item");
        if (!item || item.classList.contains("editing") || state.sortMode === "due") {
            return;
        }
        event.preventDefault();
        moveTask(item.dataset.id, event.key === "ArrowUp" ? -1 : 1);
    }

    // つまみを押したままドラッグ（マウス・タッチ共通）。動かしている間は DOM の並びだけを入れ替え、
    // 離したときにその並びを保存する
    function startDrag(event, item) {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }
        event.preventDefault();
        const pointerId = event.pointerId;
        item.classList.add("dragging");
        let lastY = event.clientY;
        let offset = 0;

        // DOM の中で要素を動かすとポインターのキャプチャが外れるので、window で受け取る
        const onMove = moveEvent => {
            if (moveEvent.pointerId !== pointerId) {
                return;
            }
            offset += moveEvent.clientY - lastY;
            lastY = moveEvent.clientY;
            item.style.transform = `translateY(${offset}px)`;

            const siblings = Array.from(list.querySelectorAll(".task-item")).filter(el => el !== item);
            const before = siblings.find(el => {
                const rect = el.getBoundingClientRect();
                return moveEvent.clientY < rect.top + rect.height / 2;
            });
            const oldTop = item.getBoundingClientRect().top - offset;
            if (before) {
                if (item.nextElementSibling !== before) {
                    list.insertBefore(item, before);
                }
            } else if (list.lastElementChild !== item) {
                list.appendChild(item);
            }
            // DOM の中で位置が変わった分だけ、見た目のずれを付け直す（指の下に留まるように）
            const newTop = item.getBoundingClientRect().top - offset;
            offset -= newTop - oldTop;
            item.style.transform = `translateY(${offset}px)`;
        };

        const onEnd = endEvent => {
            if (endEvent.pointerId !== pointerId) {
                return;
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onEnd);
            window.removeEventListener("pointercancel", onEnd);
            item.classList.remove("dragging");
            item.style.transform = "";
            const id = item.dataset.id;
            if (applyVisibleOrder(visibleIds())) {
                state.movedId = id;
            }
            renderTasks();
            state.movedId = null;
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
    }

    // 指定したタスクをまとめて履歴へ移す。トーストの「Undo」で元の位置に戻せる
    function removeTasks(ids, reason, message) {
        const deletedAt = Date.now();
        const removed = [];

        state.tasks.forEach((task, index) => {
            if (ids.has(task.id)) {
                removed.push({ task, index });
            }
        });

        if (removed.length === 0) {
            return;
        }

        removed.forEach(({ task }) => archiveTask(task, reason, deletedAt));
        state.tasks = state.tasks.filter(task => !ids.has(task.id));
        if (ids.has(state.editingId)) {
            state.editingId = null;
        }

        storage.saveTasks();
        storage.saveArchive();
        renderTasks();

        toast.show(message, {
            actionLabel: "Undo",
            onAction: () => undoRemove(removed, deletedAt)
        });
    }

    function undoRemove(removed, deletedAt) {
        const restoredIds = new Set(removed.map(({ task }) => task.id));

        state.archivedTasks = state.archivedTasks.filter(
            record => !(restoredIds.has(record.id) && record.deletedAt === deletedAt)
        );

        // 元の並び順に戻す（前にあったものから順に差し込む）
        removed
            .slice()
            .sort((a, b) => a.index - b.index)
            .forEach(({ task, index }) => {
                if (findTask(task.id)) {
                    return;
                }
                state.tasks.splice(Math.min(index, state.tasks.length), 0, task);
            });

        storage.saveTasks();
        storage.saveArchive();
        renderTasks();
    }

    function deleteTask(id) {
        const task = findTask(id);
        if (!task) {
            return;
        }

        removeTasks(new Set([id]), "deleted", `Deleted "${task.text}"`);
    }

    function clearCompletedTasks() {
        const ids = new Set(state.tasks.filter(task => task.completed).map(task => task.id));
        if (ids.size === 0) {
            return;
        }

        const label = ids.size === 1 ? "1 completed task" : `${ids.size} completed tasks`;
        removeTasks(ids, "cleared", `Cleared ${label}`);
    }

    // 履歴（削除済み）からタスクを一覧に戻す
    function restoreArchived(id) {
        const record = state.archivedTasks.find(item => item.id === id);
        if (!record) {
            return;
        }

        state.archivedTasks = state.archivedTasks.filter(item => item.id !== id);

        if (!findTask(id)) {
            const task = {
                id: record.id,
                text: record.text,
                completed: record.completed,
                createdAt: record.createdAt
            };
            if (record.dueDate) {
                task.dueDate = record.dueDate;
            }
            state.tasks.unshift(task);
        }

        storage.saveTasks();
        storage.saveArchive();
        renderTasks();
        toast.show(`Restored "${record.text}"`);
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        const task = createTask(input.value, dueInput ? dueInput.value : "");
        if (!task) {
            input.focus();
            return;
        }

        state.tasks.unshift(task);
        input.value = "";
        if (dueInput) {
            dueInput.value = "";
        }
        input.focus();
        storage.saveTasks();
        renderTasks();
    }

    function updateFilterButtons() {
        filterButtons.forEach(button => {
            const buttonFilter = button.dataset.filter || "all";
            const isActive = buttonFilter === state.activeFilter;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function setFilter(filter) {
        state.activeFilter = filter || "all";
        updateFilterButtons();
        renderTasks();
    }

    function init() {
        form.addEventListener("submit", handleFormSubmit);

        filterButtons.forEach(button => {
            button.addEventListener("click", () => {
                const filter = button.dataset.filter || "all";
                setFilter(filter);
            });
        });

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                state.searchQuery = searchInput.value;
                renderTasks();
            });
        }

        if (sortSelect) {
            try {
                const saved = localStorage.getItem(SORT_STORAGE_KEY);
                state.sortMode = SORT_MODES.includes(saved) ? saved : "added";
            } catch (_error) {
                state.sortMode = "added";
            }
            sortSelect.value = state.sortMode;
            sortSelect.addEventListener("change", () => {
                state.sortMode = SORT_MODES.includes(sortSelect.value) ? sortSelect.value : "added";
                try {
                    localStorage.setItem(SORT_STORAGE_KEY, state.sortMode);
                } catch (error) {
                    console.warn("Failed to save sort mode", error);
                }
                renderTasks();
            });
        }

        list.addEventListener("keydown", onListKeydown);
        clearCompletedButton.addEventListener("click", clearCompletedTasks);
        document.addEventListener("keydown", onShortcutKeydown);
        updateFilterButtons();
    }

    // ショートカット：「/」で検索欄へ、「n」で新しいタスクの入力欄へ（文字を入力中は 何もしない）
    function onShortcutKeydown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
            return;
        }
        const target = event.target;
        const typing = target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
        if (typing) {
            return;
        }
        if (event.key === "/" && searchInput) {
            event.preventDefault();
            searchInput.focus();
        } else if (event.key === "n" || event.key === "N") {
            event.preventDefault();
            input.focus();
        }
    }

    return { init, render: renderTasks, restoreArchived };
})();
