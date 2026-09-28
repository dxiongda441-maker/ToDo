// タスクの追加・編集・削除・フィルターとリスト描画
window.TodoApp = window.TodoApp || {};

TodoApp.tasks = (() => {
    const state = TodoApp.state;
    const storage = TodoApp.storage;
    const { formatTimestamp, generateId } = TodoApp.utils;

    const form = document.querySelector("#todo-form");
    const input = document.querySelector("#task-input");
    const list = document.querySelector("#task-list");
    const template = document.querySelector("#task-template");
    const taskCountEl = document.querySelector("#task-count");
    const completedCountEl = document.querySelector("#completed-count");
    const emptyStateEl = document.querySelector("#empty-state");
    const clearCompletedButton = document.querySelector("#clear-completed");
    const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

    function createTask(text) {
        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }

        return {
            id: generateId(),
            text: trimmed,
            completed: false,
            createdAt: Date.now()
        };
    }

    function archiveTask(task, reason) {
        if (!task || typeof task.text !== "string") {
            return;
        }

        const record = {
            id: task.id,
            text: task.text,
            createdAt: task.createdAt,
            deletedAt: Date.now(),
            completed: Boolean(task.completed),
            reason: reason || "deleted"
        };

        state.archivedTasks = [record, ...state.archivedTasks.filter(item => item.id !== record.id)];
        storage.saveArchive();
    }

    function getFilteredTasks() {
        switch (state.activeFilter) {
            case "active":
                return state.tasks.filter(task => !task.completed);
            case "completed":
                return state.tasks.filter(task => task.completed);
            default:
                return state.tasks.slice();
        }
    }

    function renderTasks() {
        list.innerHTML = "";
        const filtered = getFilteredTasks();

        emptyStateEl.hidden = filtered.length !== 0;

        const fragment = document.createDocumentFragment();

        filtered.forEach(task => {
            const node = document.importNode(template.content, true);
            const item = node.querySelector(".task-item");
            const toggle = node.querySelector(".task-toggle");
            const text = node.querySelector(".task-text");
            const meta = node.querySelector(".task-meta");
            const editButton = node.querySelector(".edit-button");
            const deleteButton = node.querySelector(".delete-button");

            item.dataset.id = task.id;
            item.classList.toggle("completed", Boolean(task.completed));
            toggle.checked = Boolean(task.completed);
            text.textContent = task.text;

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
                editTask(task.id);
            });

            deleteButton.addEventListener("click", () => {
                deleteTask(task.id);
            });

            fragment.appendChild(node);
        });

        list.appendChild(fragment);
        updateSummary();
        updateClearButtonState();
        TodoApp.history.refresh();
    }

    function updateSummary() {
        const total = state.tasks.length;
        const completed = state.tasks.filter(task => task.completed).length;
        const totalLabel = total === 1 ? "task" : "tasks";
        const completedLabel = completed === 1 ? "completed task" : "completed tasks";

        taskCountEl.textContent = `${total} ${totalLabel}`;
        completedCountEl.textContent = `${completed} ${completedLabel}`;
    }

    function updateClearButtonState() {
        const hasCompleted = state.tasks.some(task => task.completed);
        clearCompletedButton.disabled = !hasCompleted;
        clearCompletedButton.classList.toggle("disabled", !hasCompleted);
    }

    function toggleTask(id, completed) {
        const task = state.tasks.find(item => item.id === id);
        if (!task) {
            return;
        }

        task.completed = Boolean(completed);
        storage.saveTasks();
        renderTasks();
    }

    function editTask(id) {
        const task = state.tasks.find(item => item.id === id);
        if (!task) {
            return;
        }

        const nextText = window.prompt("Edit task", task.text);
        if (nextText === null) {
            return;
        }

        const trimmed = nextText.trim();
        if (!trimmed) {
            deleteTask(id);
            return;
        }

        task.text = trimmed;
        storage.saveTasks();
        renderTasks();
    }

    function deleteTask(id) {
        const task = state.tasks.find(item => item.id === id);
        if (!task) {
            return;
        }

        archiveTask(task, "deleted");
        state.tasks = state.tasks.filter(item => item.id !== id);
        storage.saveTasks();
        renderTasks();
    }

    function clearCompletedTasks() {
        const completedTasks = state.tasks.filter(task => task.completed);
        if (completedTasks.length === 0) {
            return;
        }

        completedTasks.forEach(task => archiveTask(task, "cleared"));
        state.tasks = state.tasks.filter(task => !task.completed);
        storage.saveTasks();
        renderTasks();
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        const value = input.value;
        const task = createTask(value);
        if (!task) {
            input.focus();
            return;
        }

        state.tasks.unshift(task);
        input.value = "";
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

        clearCompletedButton.addEventListener("click", clearCompletedTasks);
        updateFilterButtons();
    }

    return { init, render: renderTasks };
})();
