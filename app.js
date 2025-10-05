(() => {
    const STORAGE_KEY = "todo.tasks.v1";
    const ARCHIVE_STORAGE_KEY = "todo.archive.v1";
    const form = document.querySelector("#todo-form");
    const input = document.querySelector("#task-input");
    const list = document.querySelector("#task-list");
    const template = document.querySelector("#task-template");
    const taskCountEl = document.querySelector("#task-count");
    const completedCountEl = document.querySelector("#completed-count");
    const emptyStateEl = document.querySelector("#empty-state");
    const clearCompletedButton = document.querySelector("#clear-completed");
    const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
    const calendarGrid = document.querySelector("#calendar-grid");
    const monthLabelEl = document.querySelector("#month-label");
    const prevMonthButton = document.querySelector("#prev-month");
    const nextMonthButton = document.querySelector("#next-month");
    const historyDateLabel = document.querySelector("#history-date-label");
    const historyItems = document.querySelector("#history-items");
    const historyEmpty = document.querySelector("#history-empty");
    const historyEnabled = Boolean(
        calendarGrid &&
        monthLabelEl &&
        prevMonthButton &&
        nextMonthButton &&
        historyDateLabel &&
        historyItems &&
        historyEmpty
    );

    const formatters = (() => {
        let dateTime = null;
        let month = null;
        let fullDate = null;
        let weekday = null;
        try {
            dateTime = new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short"
            });
        } catch (_error) {
            dateTime = null;
        }
        try {
            month = new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric"
            });
        } catch (_error) {
            month = null;
        }
        try {
            fullDate = new Intl.DateTimeFormat(undefined, {
                dateStyle: "full"
            });
        } catch (_error) {
            fullDate = null;
        }
        try {
            weekday = new Intl.DateTimeFormat(undefined, {
                weekday: "short"
            });
        } catch (_error) {
            weekday = null;
        }

        return { dateTime, month, fullDate, weekday };
    })();

    const weekdayNames = (() => {
        const fallback = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        if (!formatters.weekday) {
            return fallback;
        }

        return fallback.map((_, index) => {
            const date = new Date(Date.UTC(2021, 7, 1 + index));
            try {
                return formatters.weekday.format(date);
            } catch (_error) {
                return fallback[index];
            }
        });
    })();

    let tasks = [];
    let archivedTasks = [];
    let activeFilter = "all";
    const todayKey = toDateKey(Date.now());
    let selectedDate = todayKey;
    let currentMonth = startOfMonth(new Date());

    function formatTimestamp(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        if (formatters.dateTime) {
            try {
                return formatters.dateTime.format(date);
            } catch (_error) {
                // fall through
            }
        }

        return date.toLocaleString();
    }

    function formatFullDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        if (formatters.fullDate) {
            try {
                return formatters.fullDate.format(date);
            } catch (_error) {
                // fall through
            }
        }

        return date.toDateString();
    }

    function formatMonthLabel(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        if (formatters.month) {
            try {
                return formatters.month.format(date);
            } catch (_error) {
                // fall through
            }
        }

        const monthNames = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December"
        ];
        return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    function toDateKey(value) {
        if (value === null || value === undefined) {
            return "";
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, "0");
        const day = `${date.getDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function startOfMonth(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return new Date();
        }

        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function createDateFromKey(key) {
        if (typeof key !== "string" || key.length === 0) {
            return null;
        }

        const parts = key.split("-");
        if (parts.length !== 3) {
            return null;
        }

        const year = Number.parseInt(parts[0], 10);
        const month = Number.parseInt(parts[1], 10) - 1;
        const day = Number.parseInt(parts[2], 10);
        if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
            return null;
        }

        const date = new Date(year, month, day);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date;
    }

    function generateId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            try {
                return crypto.randomUUID();
            } catch (_error) {
                // fall through
            }
        }

        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function loadTasks() {
        tasks = [];
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

            tasks = parsed.map(item => {
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
            tasks = [];
        }
    }

    function loadArchive() {
        archivedTasks = [];
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
            archivedTasks = parsed.map(item => {
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
            archivedTasks = [];
        }
    }

    function saveTasks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch (error) {
            console.warn("Failed to save tasks", error);
        }
    }

    function saveArchive() {
        try {
            localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archivedTasks));
        } catch (error) {
            console.warn("Failed to save archive", error);
        }
    }

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

        archivedTasks = [record, ...archivedTasks.filter(item => item.id !== record.id)];
        saveArchive();
    }

    function getFilteredTasks() {
        switch (activeFilter) {
            case "active":
                return tasks.filter(task => !task.completed);
            case "completed":
                return tasks.filter(task => task.completed);
            default:
                return tasks.slice();
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
        refreshHistoryViews();
    }

    function updateSummary() {
        const total = tasks.length;
        const completed = tasks.filter(task => task.completed).length;
        const totalLabel = total === 1 ? "task" : "tasks";
        const completedLabel = completed === 1 ? "completed task" : "completed tasks";

        taskCountEl.textContent = `${total} ${totalLabel}`;
        completedCountEl.textContent = `${completed} ${completedLabel}`;
    }

    function updateClearButtonState() {
        const hasCompleted = tasks.some(task => task.completed);
        clearCompletedButton.disabled = !hasCompleted;
        clearCompletedButton.classList.toggle("disabled", !hasCompleted);
    }

    function toggleTask(id, completed) {
        const task = tasks.find(item => item.id === id);
        if (!task) {
            return;
        }

        task.completed = Boolean(completed);
        saveTasks();
        renderTasks();
    }

    function editTask(id) {
        const task = tasks.find(item => item.id === id);
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
        saveTasks();
        renderTasks();
    }

    function deleteTask(id) {
        const task = tasks.find(item => item.id === id);
        if (!task) {
            return;
        }

        archiveTask(task, "deleted");
        tasks = tasks.filter(item => item.id !== id);
        saveTasks();
        renderTasks();
    }

    function clearCompletedTasks() {
        const completedTasks = tasks.filter(task => task.completed);
        if (completedTasks.length === 0) {
            return;
        }

        completedTasks.forEach(task => archiveTask(task, "cleared"));
        tasks = tasks.filter(task => !task.completed);
        saveTasks();
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

        tasks.unshift(task);
        input.value = "";
        input.focus();
        saveTasks();
        renderTasks();
    }

    function updateFilterButtons() {
        filterButtons.forEach(button => {
            const buttonFilter = button.dataset.filter || "all";
            const isActive = buttonFilter === activeFilter;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function setFilter(filter) {
        const nextFilter = filter || "all";
        activeFilter = nextFilter;
        updateFilterButtons();
        renderTasks();
    }

    function collectDateStats() {
        const stats = new Map();
        if (!historyEnabled) {
            return stats;
        }

        const increment = (dateKey, type) => {
            if (!dateKey) {
                return;
            }
            const record = stats.get(dateKey) || { created: 0, deleted: 0 };
            record[type] += 1;
            stats.set(dateKey, record);
        };

        tasks.forEach(task => {
            increment(toDateKey(task.createdAt), "created");
        });

        archivedTasks.forEach(task => {
            increment(toDateKey(task.createdAt), "created");
            increment(toDateKey(task.deletedAt), "deleted");
        });

        return stats;
    }

    function renderCalendar() {
        if (!historyEnabled) {
            return;
        }

        calendarGrid.innerHTML = "";

        weekdayNames.forEach(name => {
            const cell = document.createElement("div");
            cell.className = "calendar-cell";
            cell.textContent = name;
            calendarGrid.appendChild(cell);
        });

        const stats = collectDateStats();
        const monthStart = startOfMonth(currentMonth);
        const firstDayOfWeek = monthStart.getDay();
        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

        monthLabelEl.textContent = formatMonthLabel(monthStart);

        for (let index = 0; index < totalCells; index += 1) {
            const dayOffset = index - firstDayOfWeek;
            const cellDate = new Date(monthStart);
            cellDate.setDate(monthStart.getDate() + dayOffset);

            const dateKey = toDateKey(cellDate);
            const isCurrentMonth = cellDate.getMonth() === monthStart.getMonth();
            const stat = stats.get(dateKey);
            const totalEvents = stat ? stat.created + stat.deleted : 0;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "calendar-day";
            if (!isCurrentMonth) {
                button.classList.add("outside");
            }
            if (dateKey === selectedDate) {
                button.classList.add("selected");
            }
            if (totalEvents > 0) {
                button.classList.add("has-history");
            }

            const labelParts = [formatFullDate(cellDate)];
            if (stat) {
                if (stat.created > 0) {
                    labelParts.push(`${stat.created} created`);
                }
                if (stat.deleted > 0) {
                    labelParts.push(`${stat.deleted} deleted`);
                }
            }
            button.setAttribute("aria-label", labelParts.join(", "));

            const dayNumber = document.createElement("span");
            dayNumber.className = "day-number";
            dayNumber.textContent = String(cellDate.getDate());
            button.appendChild(dayNumber);

            if (totalEvents > 0) {
                const count = document.createElement("span");
                count.className = "day-events";
                count.textContent = `${totalEvents} item${totalEvents === 1 ? "" : "s"}`;
                button.appendChild(count);
            }

            button.addEventListener("click", () => {
                handleDateSelection(cellDate);
            });

            calendarGrid.appendChild(button);
        }
    }

    function getHistoryForDate(dateKey) {
        const created = [];
        const deleted = [];

        if (!dateKey) {
            return { created, deleted };
        }

        tasks.forEach(task => {
            if (toDateKey(task.createdAt) === dateKey) {
                created.push({
                    id: task.id,
                    text: task.text,
                    createdAt: task.createdAt,
                    status: task.completed ? "Completed" : "Active",
                    isArchived: false
                });
            }
        });

        archivedTasks.forEach(task => {
            if (toDateKey(task.createdAt) === dateKey) {
                const archiveStatus = task.reason === "cleared"
                    ? "Cleared"
                    : (task.completed ? "Completed (archived)" : "Deleted");
                created.push({
                    id: task.id,
                    text: task.text,
                    createdAt: task.createdAt,
                    deletedAt: task.deletedAt,
                    status: archiveStatus,
                    isArchived: true,
                    reason: task.reason
                });
            }

            if (toDateKey(task.deletedAt) === dateKey) {
                const deletionStatus = task.reason === "cleared"
                    ? "Cleared"
                    : (task.completed ? "Completed then deleted" : "Deleted");
                deleted.push({
                    id: task.id,
                    text: task.text,
                    createdAt: task.createdAt,
                    deletedAt: task.deletedAt,
                    status: deletionStatus,
                    isArchived: true,
                    reason: task.reason
                });
            }
        });

        created.sort((a, b) => b.createdAt - a.createdAt);
        deleted.sort((a, b) => b.deletedAt - a.deletedAt);

        return { created, deleted };
    }

    function renderHistory(dateKey) {
        if (!historyEnabled) {
            return;
        }

        const selected = createDateFromKey(dateKey) || new Date();
        historyDateLabel.textContent = formatFullDate(selected);

        historyItems.innerHTML = "";
        const { created, deleted } = getHistoryForDate(dateKey);
        let hasEntries = false;

        const addHeading = text => {
            const heading = document.createElement("li");
            heading.className = "history-heading";
            heading.textContent = text;
            historyItems.appendChild(heading);
        };

        const createMetaLine = (label, timestamp) => {
            const date = new Date(timestamp);
            const formatted = formatTimestamp(date);
            return formatted ? `${label}: ${formatted}` : "";
        };

        const createHistoryItem = (entry, variant) => {
            const li = document.createElement("li");
            li.className = "history-item";

            const title = document.createElement("p");
            title.className = "history-item-title";
            title.textContent = entry.text;
            li.appendChild(title);

            const status = document.createElement("span");
            status.className = "history-status";
            const statusText = entry.status;
            if (statusText === "Deleted") {
                status.classList.add("history-status--deleted");
            } else if (statusText.toLowerCase().includes("completed") || statusText === "Cleared") {
                status.classList.add("history-status--completed");
            }
            status.textContent = statusText;
            li.appendChild(status);

            const details = [];
            if (entry.createdAt) {
                const createdLine = createMetaLine("Created", entry.createdAt);
                if (createdLine) {
                    details.push(createdLine);
                }
            }

            if (variant === "created" && entry.deletedAt) {
                const deletedLine = createMetaLine(
                    entry.reason === "cleared" ? "Cleared" : "Deleted",
                    entry.deletedAt
                );
                if (deletedLine) {
                    details.push(deletedLine);
                }
            }

            if (variant === "deleted" && entry.deletedAt) {
                const deletedLine = createMetaLine(
                    entry.reason === "cleared" ? "Cleared" : "Deleted",
                    entry.deletedAt
                );
                if (deletedLine) {
                    details.push(deletedLine);
                }
            }

            if (details.length > 0) {
                const meta = document.createElement("p");
                meta.className = "history-meta";
                meta.textContent = details.join(" | ");
                li.appendChild(meta);
            }

            historyItems.appendChild(li);
        };

        if (created.length > 0) {
            hasEntries = true;
            addHeading("Created");
            created.forEach(entry => {
                createHistoryItem(entry, "created");
            });
        }

        if (deleted.length > 0) {
            hasEntries = true;
            addHeading("Deleted");
            deleted.forEach(entry => {
                createHistoryItem(entry, "deleted");
            });
        }

        historyEmpty.hidden = hasEntries;
    }

    function handleDateSelection(date) {
        const nextDate = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(nextDate.getTime())) {
            return;
        }

        selectedDate = toDateKey(nextDate);
        currentMonth = startOfMonth(nextDate);
        refreshHistoryViews();
    }

    function changeMonth(offset) {
        if (!historyEnabled) {
            return;
        }

        currentMonth = startOfMonth(
            new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
        );

        const selected = createDateFromKey(selectedDate);
        if (!selected || selected.getMonth() !== currentMonth.getMonth() || selected.getFullYear() !== currentMonth.getFullYear()) {
            selectedDate = toDateKey(currentMonth);
        }

        refreshHistoryViews();
    }

    function refreshHistoryViews() {
        if (!historyEnabled) {
            return;
        }

        renderCalendar();
        renderHistory(selectedDate);
    }

    form.addEventListener("submit", handleFormSubmit);

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            const filter = button.dataset.filter || "all";
            setFilter(filter);
        });
    });

    clearCompletedButton.addEventListener("click", clearCompletedTasks);

    if (historyEnabled) {
        prevMonthButton.addEventListener("click", () => {
            changeMonth(-1);
        });

        nextMonthButton.addEventListener("click", () => {
            changeMonth(1);
        });
    }

    loadTasks();
    loadArchive();
    updateFilterButtons();
    renderTasks();
})();

