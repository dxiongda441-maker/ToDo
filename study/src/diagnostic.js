// 診断テスト: 全トピックから同じ数ずつ出題して、今の実力を分野別に測る。
//
// - 自動採点できる選択・穴埋めだけを使う
// - トピックごとに難易度 2 から始め、正解なら 1 つ上げ、不正解なら 1 つ下げる（簡易的な適応型テスト）
// - トピックを順番に回して出題するので、同じ分野が続かない
// - なるべく解いたことのない問題を使う（覚えている答えで測らないため）

import { clamp } from "./util.js";

export const DIAGNOSTIC_TYPES = ["choice", "cloze"];
const START_DIFFICULTY = 2;

export function createDiagnostic(subject, { perTopic = 3, topicIds = null } = {}) {
    const ids = topicIds ? subject.topics.map(t => t.id).filter(id => topicIds.has(id)) : subject.topics.map(t => t.id);
    return {
        perTopic,
        topicIds: ids,
        byTopic: Object.fromEntries(ids.map(id => [id, { target: START_DIFFICULTY, answers: [], exhausted: false }]))
    };
}

export function diagnosticLength(state) {
    return state.topicIds.length * state.perTopic;
}

/**
 * 次の問題を選ぶ。出せる問題がなければ null。
 * @param ctx { save, questions, exclude: Set, random }
 */
export function nextDiagnosticQuestion(state, ctx) {
    const { save, questions, exclude = new Set() } = ctx;
    const random = ctx.random ?? Math.random;

    // 解答数がいちばん少ないトピックから（同数ならトピックの並び順）
    const pending = state.topicIds
        .filter(id => !state.byTopic[id].exhausted && state.byTopic[id].answers.length < state.perTopic)
        .sort((a, b) => state.byTopic[a].answers.length - state.byTopic[b].answers.length);

    for (const topicId of pending) {
        const slot = state.byTopic[topicId];
        const candidates = questions.filter(q =>
            q.topic === topicId && DIAGNOSTIC_TYPES.includes(q.type) && !exclude.has(q.id));
        if (candidates.length === 0) {
            slot.exhausted = true;
            continue;
        }
        let best = null;
        let bestScore = Infinity;
        for (const q of candidates) {
            let score = Math.abs(q.difficulty - slot.target);
            if (save.items[q.id]?.lastAt) score += 1.5;
            score += random() * 0.5;
            if (score < bestScore) {
                bestScore = score;
                best = q;
            }
        }
        return best;
    }
    return null;
}

export function recordDiagnosticAnswer(state, question, score) {
    const slot = state.byTopic[question.topic];
    if (!slot) return;
    slot.answers.push({ qid: question.id, difficulty: question.difficulty, score });
    slot.target = clamp(question.difficulty + (score >= 0.99 ? 1 : -1), 1, 5);
}

export function isDiagnosticDone(state) {
    return state.topicIds.every(id => {
        const slot = state.byTopic[id];
        return slot.exhausted || slot.answers.length >= state.perTopic;
    });
}

/** 判定: 正答率と、正解できた最高難易度から */
function verdictFor(rate, maxCorrect) {
    if (rate >= 0.99 && maxCorrect >= 3) return { key: "strong", label: "得意" };
    if (rate >= 0.6) return { key: "ok", label: "おおむね理解" };
    if (rate > 0) return { key: "review", label: "要復習" };
    return { key: "weak", label: "苦手" };
}

export function diagnosticResult(state, subject) {
    const topics = state.topicIds
        .map(id => {
            const answers = state.byTopic[id].answers;
            const correct = answers.filter(a => a.score >= 0.99).length;
            const scoreSum = answers.reduce((s, a) => s + a.score, 0);
            const maxCorrect = Math.max(0, ...answers.filter(a => a.score >= 0.99).map(a => a.difficulty));
            const rate = answers.length ? scoreSum / answers.length : 0;
            return {
                topicId: id,
                name: subject.topics.find(t => t.id === id)?.name ?? id,
                total: answers.length,
                correct,
                scoreSum,
                rate,
                maxCorrect,
                verdict: verdictFor(rate, maxCorrect)
            };
        })
        .filter(t => t.total > 0);
    const total = topics.reduce((s, t) => s + t.total, 0);
    const scoreSum = topics.reduce((s, t) => s + t.scoreSum, 0);
    const weak = topics.filter(t => t.verdict.key === "weak" || t.verdict.key === "review")
        .sort((a, b) => a.rate - b.rate)
        .map(t => t.topicId);
    return { topics, total, scoreSum, rate: total ? scoreSum / total : 0, weak };
}

function answerText(question, details) {
    if (!details) return "";
    if (question.type === "choice") return question.choices[details.selected] ?? "";
    if (question.type === "cloze") return (details.values || []).map(v => v || "（空欄）").join(" / ");
    return "";
}

function correctText(question) {
    if (question.type === "choice") return question.choices[question.answer];
    if (question.type === "cloze") return question.blanks.map(list => list[0]).join(" / ");
    return "";
}

const oneLine = text => String(text).replace(/\s+/g, " ").trim();

/**
 * 結果をテキスト（Markdown）にする。Claude に貼り付けて、苦手分野の問題を作ってもらうため。
 * @param results セッションの解答 [{ question, score, details }]
 */
export function diagnosticReport(subject, result, results, dateLabel) {
    const lines = [
        `# 診断テスト結果: ${subject.name}（${dateLabel}）`,
        "",
        `正答率: ${result.scoreSum.toFixed(1)} / ${result.total}（${Math.round(result.rate * 100)}%）`,
        "",
        "| 分野 | 正解 | 正解できた最高難易度 | 判定 |",
        "|---|---|---|---|",
        ...result.topics.map(t => `| ${t.name} | ${t.correct} / ${t.total} | ${t.maxCorrect || "-"} | ${t.verdict.label} |`),
        "",
        "## 間違えた問題"
    ];
    const wrong = results.filter(r => r.score < 0.99);
    if (wrong.length === 0) lines.push("なし");
    for (const r of wrong) {
        const q = r.question;
        lines.push(`- [${q.id}] 難易度${q.difficulty} ${oneLine(q.prompt).slice(0, 80)}`);
        lines.push(`  - あなたの答え: ${oneLine(answerText(q, r.details)) || "（未回答）"} / 正解: ${oneLine(correctText(q))}`);
    }
    lines.push("", "この結果をもとに、苦手な分野の問題を追加してください。");
    return lines.join("\n");
}
