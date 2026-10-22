// 理解度・定着度の数値化。
//
// 理解度 (ability, 0〜100): トピックごとの実力推定。Elo レーティング / 項目反応理論 (IRT) の
//   考え方で、「難しい問題に正解すると大きく上がり、易しい問題を落とすと大きく下がる」。
// 定着度 (retention, 0〜100%): 解いたことのある問題を今どれくらい覚えているかの推定。
//   復習スケジュール (srs.js) の想起確率の平均。

import { clamp } from "./util.js";
import { retrievability, isDue } from "./srs.js";

export const PRIOR_ABILITY = 30;
const SCALE = 12;

/** 問題形式ごとの上乗せ難易度（白紙で書けるほうが選択より難しい） */
export const TYPE_OFFSET = { choice: 0, cloze: 5, free: 10, code: 10 };

export const TYPE_LABELS = { choice: "選択", cloze: "穴埋め", free: "白紙", code: "コード" };

export function difficultyToB(difficulty, type = "choice") {
    return clamp(difficulty, 1, 5) * 20 - 10 + (TYPE_OFFSET[type] ?? 0);
}

/** 実力 ability の人が、その問題で取れる得点の期待値 (0〜1) */
export function expectedScore(ability, difficulty, type = "choice") {
    const theta = ability ?? PRIOR_ABILITY;
    const p = 1 / (1 + Math.exp(-(theta - difficultyToB(difficulty, type)) / SCALE));
    // 4 択は当てずっぽうでも 25% 当たる
    return type === "choice" ? 0.25 + 0.75 * p : p;
}

export function kFactor(attempts) {
    return Math.max(3, 14 / Math.sqrt(1 + attempts / 5));
}

export function updateTopic(topicState, { difficulty, type, score }, now = Date.now()) {
    const prev = topicState || { ability: null, attempts: 0, scoreSum: 0, lastAt: null };
    const theta = prev.ability ?? PRIOR_ABILITY;
    const expected = expectedScore(theta, difficulty, type);
    const ability = clamp(theta + kFactor(prev.attempts) * 1.5 * (score - expected), 0, 100);
    return {
        ability,
        attempts: prev.attempts + 1,
        scoreSum: prev.scoreSum + score,
        lastAt: now
    };
}

/** 次に出す問題の難易度 (1〜5)。正答率がだいたい 7 割になる難しさを狙う */
export function targetDifficulty(ability) {
    if (ability === null || ability === undefined) {
        return 1;
    }
    return clamp(Math.round(ability / 20), 1, 5);
}

/** 理解度に応じた問題形式（設計図: 選択 → 穴埋め → 白紙） */
export function preferredType(ability, allowCode = false) {
    if (ability === null || ability === undefined || ability < 35) return "choice";
    if (ability < 60) return "cloze";
    return allowCode ? "code" : "free";
}

export function abilityLabel(ability) {
    if (ability === null || ability === undefined) return "未測定";
    if (ability < 20) return "入門";
    if (ability < 40) return "基礎";
    if (ability < 60) return "標準";
    if (ability < 80) return "応用";
    return "熟達";
}

/** 科目の理解度。未着手のトピックは 0 として重み付き平均する（範囲の網羅も評価に含める） */
export function subjectUnderstanding(save, subject) {
    let total = 0;
    let weightSum = 0;
    let measured = 0;
    for (const topic of subject.topics) {
        const state = save.topics[topic.id];
        const ability = state && state.attempts > 0 ? state.ability : 0;
        if (state && state.attempts > 0) measured += 1;
        total += ability * topic.weight;
        weightSum += topic.weight;
    }
    return {
        understanding: weightSum ? total / weightSum : 0,
        coverage: subject.topics.length ? measured / subject.topics.length : 0
    };
}

export function subjectRetention(save, subjectId, now = Date.now()) {
    let sum = 0;
    let count = 0;
    let due = 0;
    for (const state of Object.values(save.items)) {
        if (state.subject !== subjectId || !state.lastAt) continue;
        sum += retrievability(state, now);
        count += 1;
        if (isDue(state, now)) due += 1;
    }
    return { retention: count ? sum / count : null, seenItems: count, dueCount: due };
}

/** 試験のある科目で、今受けたら何割取れそうか（未着手トピックは当てずっぽう 25%） */
export function predictedExamScore(save, subject) {
    if (!subject.exam) return null;
    let total = 0;
    let weightSum = 0;
    for (const topic of subject.topics) {
        const state = save.topics[topic.id];
        const p = state && state.attempts > 0
            ? expectedScore(state.ability, subject.exam.difficulty, "choice")
            : 0.25;
        total += p * topic.weight;
        weightSum += topic.weight;
    }
    return weightSum ? total / weightSum : null;
}
