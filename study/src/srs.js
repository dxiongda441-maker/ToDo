// 復習スケジュール（間隔反復）。Anki などで使われている SM-2 を単純化したもの。
// 正解するほど次の復習までの間隔が伸び、間違えると翌日（短い間隔）に戻る。

import { DAY_MS, clamp } from "./util.js";

const MIN_EASE = 1.3;
const RELEARN_DELAY_MS = 10 * 60 * 1000;

export function newItemState() {
    return { reps: 0, lapses: 0, ease: 2.5, interval: 0, due: 0, lastScore: null, lastAt: null, seen: 0 };
}

/** 0〜1 の得点を SM-2 の評価 (0〜5) に変換 */
export function scoreToQuality(score) {
    if (score >= 0.95) return 5;
    if (score >= 0.75) return 4;
    if (score >= 0.6) return 3;
    if (score >= 0.4) return 2;
    if (score > 0) return 1;
    return 0;
}

export function reviewItem(state, score, now = Date.now()) {
    const prev = state || newItemState();
    const quality = scoreToQuality(score);
    const next = { ...prev, seen: prev.seen + 1, lastScore: score, lastAt: now };

    next.ease = clamp(prev.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02), MIN_EASE, 3.0);

    if (quality < 3) {
        next.reps = 0;
        next.lapses = prev.lapses + (prev.reps > 0 ? 1 : 0);
        next.interval = 0;
        next.due = now + RELEARN_DELAY_MS;
        return next;
    }

    next.reps = prev.reps + 1;
    if (next.reps === 1) {
        next.interval = 1;
    } else if (next.reps === 2) {
        next.interval = 3;
    } else {
        next.interval = Math.round(Math.max(prev.interval, 1) * next.ease);
    }
    next.due = now + next.interval * DAY_MS;
    return next;
}

/**
 * 想起確率（覚えている確率）の推定。復習予定日ちょうどで 90% になるよう、
 * 経過時間に対して指数的に減衰させる（FSRS などと同じ考え方）。
 */
export function retrievability(state, now = Date.now()) {
    if (!state || !state.lastAt) {
        return 0;
    }
    if (state.interval <= 0) {
        // 間違えた直後。最後の得点をそのまま使う
        return clamp(state.lastScore ?? 0, 0, 1);
    }
    const elapsedDays = Math.max(0, (now - state.lastAt) / DAY_MS);
    return Math.exp((Math.log(0.9) * elapsedDays) / state.interval);
}

export function isDue(state, now = Date.now()) {
    return Boolean(state && state.lastAt && state.due <= now);
}
