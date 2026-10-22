// 学習計画。
//   - 期限あり（例: FE 合格）: 開始日〜試験日を「段階ごとの学習 70% → 弱点補強 20% → 模試 10%」に割り当てる
//   - 目標あり・期限なし     : カリキュラムの段階を順にクリアしていく（段階の全トピックが理解度 60 以上で次へ）
//   - 目標なし（探索）       : 全トピックを満遍なく触って基礎を作る。目標はあとから設定できる

import { addDays, clamp, daysBetween, fromDateKey, toDateKey } from "./util.js";

export const STAGE_CLEAR_ABILITY = 60;

export function goalMode(goal) {
    if (!goal || !goal.title) return "explore";
    return goal.targetDate ? "deadline" : "milestone";
}

function topicAbility(save, topicId) {
    const state = save.topics[topicId];
    return state && state.attempts > 0 ? state.ability : null;
}

function stageWeight(subject, stage) {
    return stage.topics.reduce((sum, id) => sum + (subject.topics.find(t => t.id === id)?.weight ?? 1), 0);
}

export function stageProgress(save, stage) {
    const values = stage.topics.map(id => topicAbility(save, id) ?? 0);
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const cleared = values.every(v => v >= STAGE_CLEAR_ABILITY);
    return { average: avg, cleared };
}

/** 期限ありの計画: 段階ごとの期間（日付キー）を返す */
export function buildDeadlineSchedule(subject, goal) {
    const start = fromDateKey(goal.startDate) || new Date();
    const total = Math.max(1, daysBetween(goal.startDate, goal.targetDate));
    const mockDays = clamp(Math.round(total * 0.1), 1, 21);
    const reviewDays = Math.round(total * 0.2);
    const learnDays = Math.max(1, total - mockDays - reviewDays);
    const weights = subject.stages.map(stage => stageWeight(subject, stage));
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

    const phases = [];
    let cursor = 0;
    subject.stages.forEach((stage, index) => {
        const isLast = index === subject.stages.length - 1;
        const length = isLast ? learnDays - cursor : Math.max(1, Math.round((learnDays * weights[index]) / weightSum));
        phases.push({
            kind: "stage",
            stageId: stage.id,
            title: stage.title,
            topics: stage.topics,
            start: toDateKey(addDays(start, cursor)),
            end: toDateKey(addDays(start, cursor + Math.max(1, length) - 1))
        });
        cursor += Math.max(1, length);
    });
    if (reviewDays > 0) {
        phases.push({
            kind: "review",
            title: "弱点補強",
            topics: [],
            start: toDateKey(addDays(start, cursor)),
            end: toDateKey(addDays(start, cursor + reviewDays - 1))
        });
        cursor += reviewDays;
    }
    phases.push({
        kind: "mock",
        title: "模擬試験・総仕上げ",
        topics: [],
        start: toDateKey(addDays(start, cursor)),
        end: goal.targetDate
    });
    return phases;
}

function weakestTopics(save, subject, count) {
    return subject.topics
        .map(topic => ({ id: topic.id, ability: topicAbility(save, topic.id) ?? -1, weight: topic.weight }))
        .sort((a, b) => a.ability - b.ability || b.weight - a.weight)
        .slice(0, count)
        .map(t => t.id);
}

function leastPracticedTopics(save, subject, count) {
    return subject.topics
        .map(topic => ({ id: topic.id, attempts: save.topics[topic.id]?.attempts ?? 0 }))
        .sort((a, b) => a.attempts - b.attempts)
        .slice(0, count)
        .map(t => t.id);
}

/**
 * 今日の学習内容。
 * @returns { mode, headline, focusTopics, phase, daysLeft, behind }
 */
export function todayPlan(save, subject, now = Date.now()) {
    const state = save.subjects[subject.id];
    const goal = state?.goal;
    const mode = goalMode(goal);
    const today = toDateKey(now);

    if (mode === "deadline") {
        const phases = buildDeadlineSchedule(subject, goal);
        const daysLeft = daysBetween(today, goal.targetDate);
        const phase = phases.find(p => p.start <= today && today <= p.end)
            || (today < phases[0].start ? phases[0] : phases[phases.length - 1]);
        let focusTopics;
        if (phase.kind === "stage") {
            focusTopics = [...new Set([...phase.topics, ...weakestTopics(save, subject, 1)])];
        } else if (phase.kind === "review") {
            focusTopics = weakestTopics(save, subject, 3);
        } else {
            focusTopics = subject.topics.map(t => t.id);
        }
        // 予定より遅れているか（終わったはずの段階に理解度 60 未満のトピックが残っている）
        const behind = phases
            .filter(p => p.kind === "stage" && p.end < today)
            .filter(p => !stageProgress(save, p).cleared)
            .map(p => p.title);
        const headline = daysLeft < 0
            ? "試験日を過ぎています。計画タブで次の目標日を設定しましょう"
            : `${phase.title}（試験まであと ${daysLeft} 日）`;
        return { mode, headline, focusTopics, phase, phases, daysLeft, behind };
    }

    if (mode === "milestone") {
        const stage = subject.stages.find(s => !stageProgress(save, s).cleared) || subject.stages[subject.stages.length - 1];
        const focusTopics = [...new Set([...stage.topics, ...weakestTopics(save, subject, 1)])];
        return {
            mode,
            headline: `段階「${stage.title}」に挑戦中（全トピック理解度 ${STAGE_CLEAR_ABILITY} 以上でクリア）`,
            focusTopics,
            phase: { kind: "stage", title: stage.title, stageId: stage.id, topics: stage.topics },
            behind: []
        };
    }

    return {
        mode,
        headline: "まずは幅広く基礎を学ぶ期間です。慣れてきたら計画タブで目標を設定しましょう",
        focusTopics: leastPracticedTopics(save, subject, 3),
        phase: { kind: "explore", title: "基礎固め（探索）", topics: [] },
        behind: []
    };
}
