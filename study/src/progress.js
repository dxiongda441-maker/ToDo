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

/**
 * 実力テスト・診断テストの結果を記録する。
 * kind・topics（分野別の内訳）・report（Claude に送る用のテキスト）は v0.2 で追加した
 * 任意フィールド。古い記録にはないので、読むときは無い場合も考える（スキーマ変更ではない）。
 */
export function recordTest(save, subject, result, now = Date.now()) {
    const record = {
        id: generateId("t"),
        at: now,
        subject: subject.id,
        kind: result.kind || "test",
        score: result.score,
        total: result.total,
        percent: result.total ? (result.score / result.total) * 100 : 0,
        understanding: subjectUnderstanding(save, subject).understanding
    };
    if (result.topics) record.topics = result.topics;
    if (result.report) record.report = result.report;
    save.tests.push(record);
    return record;
}

/** その科目の最新の診断テスト（なければ null） */
export function latestDiagnostic(save, subjectId) {
    for (let i = save.tests.length - 1; i >= 0; i -= 1) {
        const test = save.tests[i];
        if (test.subject === subjectId && test.kind === "diagnostic") return test;
    }
    return null;
}

/** 1 問ごとのこれまでの結果（次に同じ問題を解くときに表示する） */
export function questionHistory(save, qid) {
    const attempts = save.attempts.filter(a => a.qid === qid);
    if (attempts.length === 0) return null;
    const last = attempts[attempts.length - 1];
    return {
        count: attempts.length,
        correct: attempts.filter(a => a.score >= 0.99).length,
        lastAt: last.at,
        lastScore: last.score
    };
}

/** そのトピックで最近間違えた問題の ID（新しい順、重複なし） */
export function recentMistakes(save, topicId, limit = 5) {
    const ids = [];
    for (let i = save.attempts.length - 1; i >= 0 && ids.length < limit; i -= 1) {
        const a = save.attempts[i];
        if (a.topic === topicId && a.score < 0.6 && !ids.includes(a.qid)) ids.push(a.qid);
    }
    return ids;
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
