// 採点（AI を使わずに機械的に採点できるもの）。

import { normalizeAnswer } from "./util.js";

export function gradeChoice(question, selectedIndex) {
    const correct = selectedIndex === question.answer;
    return { score: correct ? 1 : 0, correct };
}

/** 穴埋め: prompt 中の {0} {1} … に対応する blanks[i]（許容する答えの一覧）と照合 */
export function gradeCloze(question, values) {
    const results = question.blanks.map((accepted, index) => {
        const given = normalizeAnswer(values[index]);
        return given !== "" && accepted.some(answer => normalizeAnswer(answer) === given);
    });
    const correctCount = results.filter(Boolean).length;
    return {
        score: results.length ? correctCount / results.length : 0,
        correct: correctCount === results.length,
        blanks: results
    };
}

/** 穴埋め問題の prompt を文字列と空欄に分解する */
export function splitClozePrompt(prompt) {
    const parts = [];
    const pattern = /\{(\d+)\}/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(prompt)) !== null) {
        if (match.index > last) parts.push({ text: prompt.slice(last, match.index) });
        parts.push({ blank: Number(match[1]) });
        last = pattern.lastIndex;
    }
    if (last < prompt.length) parts.push({ text: prompt.slice(last) });
    return parts;
}

/** 白紙（記述）: AI を使わないときの目安。キーワードがいくつ含まれているか */
export function keywordCoverage(question, text) {
    const keywords = question.keywords || [];
    if (keywords.length === 0) return null;
    const normalized = normalizeAnswer(text);
    const hits = keywords.filter(group => {
        const variants = Array.isArray(group) ? group : [group];
        return variants.some(word => normalized.includes(normalizeAnswer(word)));
    });
    return { ratio: hits.length / keywords.length, hits };
}

/** 自己採点ボタンの値 */
export const SELF_GRADES = [
    { label: "できた", score: 1 },
    { label: "だいたい", score: 0.7 },
    { label: "一部だけ", score: 0.4 },
    { label: "できなかった", score: 0 }
];

export function gradeCode(results) {
    if (!results || results.error) {
        return { score: 0, correct: false };
    }
    const total = results.tests.length;
    const passed = results.tests.filter(t => t.ok).length;
    return { score: total ? passed / total : 0, correct: total > 0 && passed === total, passed, total };
}
