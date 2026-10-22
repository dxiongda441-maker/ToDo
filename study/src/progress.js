// 解答 1 回分をセーブデータに記録する（理解度・復習予定・日別スナップショットを更新）。

import { reviewItem } from "./srs.js";
import { subjectUnderstanding, updateTopic } from "./mastery.js";
import { generateId, toDateKey } from "./util.js";

/**
 * @param save      セーブデータ（直接書き換える）
 * @param subject   content の科目定義
 * @param question  出題した問題
 * @param score     0〜1
 * @param context   { mode: "practice" | "test", sessionId }
 */
export function recordAttempt(save, subject, question, score, context = {}, now = Date.now()) {
    const before = save.topics[question.topic]?.ability ?? null;
    save.topics[question.topic] = updateTopic(
        save.topics[question.topic],
        { difficulty: question.difficulty, type: question.type, score },
        now
    );

    const item = reviewItem(save.items[question.id], score, now);
    item.subject = question.subject;
    item.topic = question.topic;
    save.items[question.id] = item;

    save.attempts.push({
        id: generateId("a"),
        at: now,
        qid: question.id,
        subject: question.subject,
        topic: question.topic,
        type: question.type,
        difficulty: question.difficulty,
        source: question.source || "bank",
        score,
        mode: context.mode || "practice",
        sessionId: context.sessionId || null
    });

    const dateKey = toDateKey(now);
    const day = (save.daily[dateKey] ||= {});
    const record = (day[subject.id] ||= { answered: 0, scoreSum: 0, understanding: 0 });
    record.answered += 1;
    record.scoreSum += score;
    record.understanding = subjectUnderstanding(save, subject).understanding;

    return { abilityBefore: before, abilityAfter: save.topics[question.topic].ability };
}

export function recordTest(save, subject, result, now = Date.now()) {
    save.tests.push({
        id: generateId("t"),
        at: now,
        subject: subject.id,
        score: result.score,
        total: result.total,
        percent: result.total ? (result.score / result.total) * 100 : 0,
        understanding: subjectUnderstanding(save, subject).understanding
    });
}

export function answeredToday(save, subjectId, now = Date.now()) {
    return save.daily[toDateKey(now)]?.[subjectId]?.answered ?? 0;
}

/** 連続学習日数（今日まだ解いていなければ昨日から数える） */
export function streakDays(save, now = Date.now()) {
    const answeredOn = key => Object.values(save.daily[key] || {}).some(r => r.answered > 0);
    let cursor = new Date(now);
    if (!answeredOn(toDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    while (answeredOn(toDateKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

/** 日別の理解度推移（グラフ用）。解いていない日は前日の値を引き継ぐ */
export function understandingSeries(save, subjectId) {
    const keys = Object.keys(save.daily).sort();
    const series = [];
    for (const key of keys) {
        const record = save.daily[key][subjectId];
        if (record) {
            series.push({ date: key, value: record.understanding, answered: record.answered });
        }
    }
    return series;
}
