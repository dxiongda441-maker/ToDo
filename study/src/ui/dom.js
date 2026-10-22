// 画面部品の共通ヘルパー。
// AI が作った文章も表示するので、innerHTML は使わず textContent で安全に組み立てる。

export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (value === true) el.setAttribute(key, "");
        else el.setAttribute(key, String(value));
    }
    append(el, children);
    return el;
}

/** 子要素を追加する（配列は展開し、null / false は無視する） */
export function append(el, children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        if (Array.isArray(child)) append(el, child);
        else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}

export function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

let toastTimer = null;
export function toast(message, kind = "info") {
    const box = document.querySelector("#toast");
    if (!box) return;
    box.textContent = message;
    box.className = `toast toast--${kind} toast--show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("toast--show"), 3500);
}

export function percent(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(digits)}%`;
}

export function meter(value, { max = 100, label = "", color = null, marker = null } = {}) {
    const ratio = Math.max(0, Math.min(1, (value ?? 0) / max));
    return h("div", { class: "meter", role: "img", "aria-label": label },
        h("div", { class: "meter__fill", style: { width: `${ratio * 100}%`, ...(color ? { background: color } : {}) } }),
        marker !== null ? h("div", { class: "meter__marker", style: { left: `${(marker / max) * 100}%` } }) : null
    );
}

export function stars(difficulty) {
    return "★".repeat(difficulty) + "☆".repeat(5 - difficulty);
}

export function formatDate(key) {
    if (!key) return "—";
    const [y, m, d] = key.split("-");
    return `${y}/${Number(m)}/${Number(d)}`;
}

export function formatDateTime(ms) {
    const date = new Date(ms);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 簡単な折れ線グラフ（SVG）。series: [{ label, color, points: [{ x: 日付キー, y: 0〜100 }] }] */
export function lineChart(series, { height = 240, yMax = 100, guide = null } = {}) {
    const NS = "http://www.w3.org/2000/svg";
    const width = 900;
    const pad = { left: 32, right: 12, top: 12, bottom: 24 };
    const keys = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort();
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "chart");
    svg.setAttribute("role", "img");

    const line = (x1, y1, x2, y2, cls) => {
        const el = document.createElementNS(NS, "line");
        Object.entries({ x1, y1, x2, y2, class: cls }).forEach(([k, v]) => el.setAttribute(k, v));
        svg.append(el);
    };
    const text = (x, y, value, anchor = "end") => {
        const el = document.createElementNS(NS, "text");
        el.setAttribute("x", x);
        el.setAttribute("y", y);
        el.setAttribute("text-anchor", anchor);
        el.setAttribute("class", "chart__label");
        el.textContent = value;
        svg.append(el);
    };

    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const xOf = key => pad.left + (keys.length <= 1 ? innerW / 2 : (keys.indexOf(key) / (keys.length - 1)) * innerW);
    const yOf = value => pad.top + innerH - (Math.min(value, yMax) / yMax) * innerH;

    for (const tick of [0, 25, 50, 75, 100].filter(t => t <= yMax)) {
        line(pad.left, yOf(tick), width - pad.right, yOf(tick), "chart__grid");
        text(pad.left - 6, yOf(tick) + 4, String(tick));
    }
    if (guide !== null) {
        line(pad.left, yOf(guide), width - pad.right, yOf(guide), "chart__guide");
    }
    if (keys.length > 0) {
        text(pad.left, height - 6, keys[0].slice(5).replace("-", "/"), "start");
        if (keys.length > 1) text(width - pad.right, height - 6, keys[keys.length - 1].slice(5).replace("-", "/"));
    }

    for (const s of series) {
        if (s.points.length === 0) continue;
        const path = document.createElementNS(NS, "polyline");
        path.setAttribute("points", s.points.map(p => `${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" "));
        path.setAttribute("class", "chart__line");
        path.setAttribute("stroke", s.color);
        svg.append(path);
        const last = s.points[s.points.length - 1];
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", xOf(last.x));
        dot.setAttribute("cy", yOf(last.y));
        dot.setAttribute("r", 4);
        dot.setAttribute("fill", s.color);
        svg.append(dot);
    }
    return svg;
}

export function downloadText(filename, text, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** タブキーでスペースを入れられるテキストエリア（コード入力用） */
export function codeArea(value, attrs = {}) {
    const area = h("textarea", { class: "code-input", spellcheck: "false", autocapitalize: "off", autocomplete: "off", ...attrs });
    area.value = value;
    area.addEventListener("keydown", event => {
        if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            const { selectionStart: start, selectionEnd: end } = area;
            area.setRangeText("    ", start, end, "end");
        }
    });
    return area;
}
