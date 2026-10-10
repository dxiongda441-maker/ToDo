// 履歴カレンダーと日別の履歴リスト
window.TodoApp = window.TodoApp || {};

TodoApp.history = (() => {
    const state = TodoApp.state;
    const {
        weekdayNames,
        formatTimestamp,
        formatFullDate,
        formatMonthLabel,
        toDateKey,
        startOfMonth,
        createDateFromKey
    } = TodoApp.utils;

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

        state.tasks.forEach(task => {
            increment(toDateKey(task.createdAt), "created");
        });

        state.archivedTasks.forEach(task => {
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
        const monthStart = startOfMonth(state.currentMonth);
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
            if (dateKey === state.selectedDate) {
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

        state.tasks.forEach(task => {
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

        state.archivedTasks.forEach(task => {
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

        const createHistoryItem = entry => {
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

            if (entry.deletedAt) {
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

            // 削除・一括削除したタスクは一覧に戻せる
            if (entry.isArchived) {
                const restoreButton = document.createElement("button");
                restoreButton.type = "button";
                restoreButton.className = "history-restore";
                restoreButton.textContent = "Restore";
                restoreButton.setAttribute("aria-label", `Restore "${entry.text}" to the task list`);
                restoreButton.addEventListener("click", () => {
                    TodoApp.tasks.restoreArchived(entry.id);
                });
                li.appendChild(restoreButton);
            }

            historyItems.appendChild(li);
        };

        if (created.length > 0) {
            hasEntries = true;
            addHeading("Created");
            created.forEach(createHistoryItem);
        }

        if (deleted.length > 0) {
            hasEntries = true;
            addHeading("Deleted");
            deleted.forEach(createHistoryItem);
        }

        historyEmpty.hidden = hasEntries;
    }

    function handleDateSelection(date) {
        const nextDate = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(nextDate.getTime())) {
            return;
        }

        state.selectedDate = toDateKey(nextDate);
        state.currentMonth = startOfMonth(nextDate);
        refresh();
    }

    function changeMonth(offset) {
        if (!historyEnabled) {
            return;
        }

        const current = state.currentMonth;
        state.currentMonth = startOfMonth(
            new Date(current.getFullYear(), current.getMonth() + offset, 1)
        );

        const selected = createDateFromKey(state.selectedDate);
        if (!selected || selected.getMonth() !== state.currentMonth.getMonth() || selected.getFullYear() !== state.currentMonth.getFullYear()) {
            state.selectedDate = toDateKey(state.currentMonth);
        }

        refresh();
    }

    function refresh() {
        if (!historyEnabled) {
            return;
        }

        renderCalendar();
        renderHistory(state.selectedDate);
    }

    function init() {
        if (!historyEnabled) {
            return;
        }

        prevMonthButton.addEventListener("click", () => {
            changeMonth(-1);
        });

        nextMonthButton.addEventListener("click", () => {
            changeMonth(1);
        });
    }

    return { init, refresh };
})();
