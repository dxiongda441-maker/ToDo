// 日付フォーマット・ID生成などの共通ヘルパー
window.TodoApp = window.TodoApp || {};

TodoApp.utils = (() => {
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

    return {
        weekdayNames,
        formatTimestamp,
        formatFullDate,
        formatMonthLabel,
        toDateKey,
        startOfMonth,
        createDateFromKey,
        generateId
    };
})();
