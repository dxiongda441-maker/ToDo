// 成長記録: 理解度の推移グラフ、トピック別の理解度、実力テストの履歴。

import { abilityLabel, subjectRetention, subjectUnderstanding } from "../mastery.js";
import { understandingSeries } from "../progress.js";
import { retrievability } from "../srs.js";
import { DAY_MS, toDateKey } from "../util.js";
import { append, formatDateTime, h, lineChart, meter, percent } from "./dom.js";

function weeklyActivity(app) {
    const days = [];
    for (let i = 13; i >= 0; i -= 1) {
        const key = toDateKey(Date.now() - i * DAY_MS);
        const total = Object.values(app.save.daily[key] || {}).reduce((sum, r) => sum + r.answered, 0);
        days.push({ key, total });
    }
    const max = Math.max(5, ...days.map(d => d.total));
    return h("div", { class: "bars", role: "img", "aria-label": "直近 14 日の解答数" }, days.map(d =>
        h("div", { class: "bars__col", title: `${d.key}: ${d.total} 問` },
            h("div", { class: "bars__bar", style: { height: `${(d.total / max) * 100}%` } }),
            h("span", { class: "bars__label" }, d.key.slice(8)))));
}

function topicTable(app, subject) {
    const now = Date.now();
    return h("table", { class: "table" },
        h("thead", {}, h("tr", {}, ["トピック", "理解度", "解いた数", "平均得点", "定着度"].map(t => h("th", { scope: "col" }, t)))),
        h("tbody", {}, subject.topics.map(topic => {
            const state = app.save.topics[topic.id];
            const measured = state && state.attempts > 0;
            const items = Object.values(app.save.items).filter(item => item.topic === topic.id && item.lastAt);
            const retention = items.length ? items.reduce((s, item) => s + retrievability(item, now), 0) / items.length : null;
            return h("tr", {},
                h("th", { scope: "row" }, topic.name),
                h("td", {}, measured ? h("div", { class: "cell-meter" }, meter(state.ability, { label: `理解度 ${Math.round(state.ability)}` }), `${Math.round(state.ability)} ${abilityLabel(state.ability)}`) : "未測定"),
                h("td", {}, measured ? String(state.attempts) : "0"),
                h("td", {}, measured ? percent(state.scoreSum / state.attempts) : "—"),
                h("td", {}, retention === null ? "—" : percent(retention)));
        })));
}

export function renderProgress(app, root) {
    const subjects = app.subjects();
    const series = subjects.map(subject => ({
        label: subject.name,
        color: subject.color,
        points: understandingSeries(app.save, subject.id).map(p => ({ x: p.date, y: p.value }))
    }));
    const hasData = series.some(s => s.points.length > 0);
    const totalAnswered = app.save.attempts.length;

    append(root, [
        h("h1", { class: "page-title" }, "成長記録"),
        h("section", { class: "card" },
            h("h2", { class: "section-title" }, "理解度の推移"),
            hasData
                ? [lineChart(series), h("ul", { class: "legend" }, series.map(s =>
                    h("li", {}, h("span", { class: "legend__swatch", style: { background: s.color } }), s.label)))]
                : h("p", { class: "muted" }, "問題を解くと、ここに理解度の推移が表示されます。")),
        h("section", { class: "card" },
            h("h2", { class: "section-title" }, `直近 14 日の解答数（累計 ${totalAnswered} 問）`),
            weeklyActivity(app)),
        subjects.map(subject => {
            const { understanding, coverage } = subjectUnderstanding(app.save, subject);
            const { retention, seenItems } = subjectRetention(app.save, subject.id);
            const tests = app.save.tests.filter(t => t.subject === subject.id).slice(-10).reverse();
            return h("section", { class: "card", style: { "--subject-color": subject.color } },
                h("h2", { class: "section-title" }, `${subject.icon} ${subject.name}`),
                h("p", {}, `理解度 ${Math.round(understanding)} / 100・範囲の ${percent(coverage)} に着手・定着度 ${retention === null ? "—" : percent(retention)}（${seenItems} 問）`),
                h("div", { class: "table-wrap" }, topicTable(app, subject)),
                tests.length
                    ? h("div", {},
                        h("h3", { class: "sub-title" }, "実力テストの履歴"),
                        h("ul", { class: "test-history" }, tests.map(t =>
                            h("li", {}, h("span", {}, formatDateTime(t.at)), h("strong", {}, `${t.percent.toFixed(0)} 点`), h("span", { class: "muted" }, `${t.total} 問・理解度 ${Math.round(t.understanding)}`)))))
                    : null);
        })]);
}
