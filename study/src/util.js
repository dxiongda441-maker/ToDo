// 汎用ヘルパー（DOM に依存しないもの）。Node のテストからも読み込む。

export const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function generateId(prefix = "") {
    let core;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        core = crypto.randomUUID();
    } else {
        core = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return prefix ? `${prefix}-${core}` : core;
}

/** ローカル時刻での YYYY-MM-DD */
export function toDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD をローカル時刻 0:00 の Date に */
export function fromDateKey(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        return null;
    }
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

/** 日付キー同士の日数差（b - a） */
export function daysBetween(aKey, bKey) {
    const a = fromDateKey(aKey);
    const b = fromDateKey(bKey);
    if (!a || !b) {
        return 0;
    }
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** 解答の表記ゆれを吸収する正規化（全角半角・大文字小文字・空白） */
export function normalizeAnswer(text) {
    return String(text ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s　]+/g, "")
        .replace(/[。、．，.,!！?？「」『』"'`]/g, "");
}

export function shuffle(list, random = Math.random) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function round1(value) {
    return Math.round(value * 10) / 10;
}
