// 次に出題する問題を選ぶ。
// 優先順位: 復習期限が来た問題 → 重点トピックの未出題問題（理解度に合った難易度・形式）→ 苦手だった問題

import { isDue } from "./srs.js";
import { preferredType, targetDifficulty } from "./mastery.js";

function topicAbility(save, topicId) {
    const state = save.topics[topicId];
    return state && state.attempts > 0 ? state.ability : null;
}

/** typeFilter: "auto"（すべて）| 形式名 | 形式名の配列 */
export function matchesType(question, typeFilter) {
    if (Array.isArray(typeFilter)) return typeFilter.includes(question.type);
    return !typeFilter || typeFilter === "auto" || question.type === typeFilter;
}

/**
 * @param ctx.save
 * @param ctx.subject      科目定義
 * @param ctx.questions    出題候補（問題バンク + AI が作った問題）
 * @param ctx.focusTopics  今日の重点トピック
 * @param ctx.typeFilter   "auto" | "choice" | "cloze" | "free" | "code" | 形式名の配列
 * @param ctx.exclude      このセッションで出題済みの ID（Set）
 * @param ctx.allowedTopics 新しく出題してよいトピック（Set。省略時はすべて）。復習は対象外
 * @returns { question, reason } | null
 */
export function pickNext(ctx) {
    const { save, subject, questions, focusTopics = [], typeFilter = "auto", exclude = new Set() } = ctx;
    const now = ctx.now ?? Date.now();
    const random = ctx.random ?? Math.random;
    const focus = new Set(focusTopics);
    const allowCode = Boolean(subject.allowCode);

    const pool = questions.filter(q =>
        q.subject === subject.id && !exclude.has(q.id) && matchesType(q, typeFilter)
    );
    if (pool.length === 0) {
        return null;
    }

    const due = pool
        .filter(q => isDue(save.items[q.id], now))
        .sort((a, b) => save.items[a.id].due - save.items[b.id].due);
    const allowed = ctx.allowedTopics;
    const fresh = pool.filter(q => !save.items[q.id]?.lastAt && (!allowed || allowed.has(q.topic)));

    if (due.length > 0 && (fresh.length === 0 || random() < 0.5)) {
        return { question: due[0], reason: "review" };
    }

    if (fresh.length > 0) {
        let best = null;
        let bestScore = Infinity;
        for (const q of fresh) {
            const ability = topicAbility(save, q.topic);
            let score = Math.abs(q.difficulty - targetDifficulty(ability));
            if (focus.size > 0 && !focus.has(q.topic)) score += 2;
            if ((typeFilter === "auto" || Array.isArray(typeFilter)) && q.type !== preferredType(ability, allowCode)) score += 1.5;
            score += random() * 0.75;
            if (score < bestScore) {
                bestScore = score;
                best = q;
            }
        }
        return { question: best, reason: "new" };
    }

    const seen = pool
        .filter(q => save.items[q.id]?.lastAt && !isDue(save.items[q.id], now))
        .filter(q => !allowed || allowed.has(q.topic))
        .sort((a, b) => {
            const sa = save.items[a.id];
            const sb = save.items[b.id];
            return (sa.lastScore ?? 0) - (sb.lastScore ?? 0) || sa.lastAt - sb.lastAt;
        });
    return seen.length > 0 ? { question: seen[0], reason: "weak" } : null;
}

/** AI に新しい問題を作らせるときの条件（トピック・難易度・形式） */
export function aiRequestFor(save, subject, focusTopics, typeFilter, random = Math.random) {
    const topics = focusTopics.length ? focusTopics : subject.topics.map(t => t.id);
    const topicId = topics[Math.floor(random() * topics.length)];
    const ability = topicAbility(save, topicId);
    const topic = subject.topics.find(t => t.id === topicId);
    // トピックごとに出せる形式が決まっている場合（例: Python の「コードを書く」はコード問題だけ）
    const topicTypes = topic?.types || ["choice", "cloze", "free", ...(subject.allowCode ? ["code"] : [])];
    const requested = Array.isArray(typeFilter)
        ? typeFilter
        : typeFilter && typeFilter !== "auto" ? [typeFilter] : topicTypes;
    const options = requested.filter(t => topicTypes.includes(t));
    const candidates = options.length ? options : topicTypes;
    const preferred = preferredType(ability, Boolean(subject.allowCode));
    let type = candidates.includes(preferred) ? preferred : candidates[Math.floor(random() * candidates.length)];
    if (type === "code" && !subject.allowCode) type = "free";
    return { topicId, difficulty: targetDifficulty(ability), type };
}
