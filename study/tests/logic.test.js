import { test } from "node:test";
import assert from "node:assert/strict";

import { DAY_MS, normalizeAnswer } from "../src/util.js";
import { isDue, retrievability, reviewItem } from "../src/srs.js";
import {
    expectedScore,
    predictedExamScore,
    preferredType,
    subjectUnderstanding,
    targetDifficulty,
    updateTopic
} from "../src/mastery.js";
import { gradeChoice, gradeCloze, gradeCode, keywordCoverage, splitClozePrompt } from "../src/grader.js";
import { aiRequestFor, pickNext } from "../src/selector.js";
import { buildDeadlineSchedule, goalMode, todayPlan } from "../src/planner.js";
import { answeredToday, recordAttempt, streakDays } from "../src/progress.js";
import { createEmptySave, ensureSubjects } from "../src/store.js";
import { getSubject, SUBJECTS } from "../src/content/index.js";

const NOW = new Date(2026, 9, 22, 12).getTime();
const fe = getSubject("fe");

function freshSave() {
    return ensureSubjects(createEmptySave(NOW), SUBJECTS, NOW);
}

// ── 復習スケジュール ──

test("正解し続けると復習間隔が 1 日 → 3 日 → それ以上と伸びる", () => {
    let state = reviewItem(undefined, 1, NOW);
    assert.equal(state.interval, 1);
    state = reviewItem(state, 1, NOW + DAY_MS);
    assert.equal(state.interval, 3);
    state = reviewItem(state, 1, NOW + 4 * DAY_MS);
    assert.ok(state.interval > 3);
    assert.equal(state.lapses, 0);
});

test("間違えると間隔がリセットされ、すぐ復習対象になる", () => {
    let state = reviewItem(undefined, 1, NOW);
    state = reviewItem(state, 1, NOW + DAY_MS);
    state = reviewItem(state, 0, NOW + 4 * DAY_MS);
    assert.equal(state.reps, 0);
    assert.equal(state.lapses, 1);
    assert.ok(isDue(state, NOW + 4 * DAY_MS + 11 * 60 * 1000));
});

test("想起確率は復習予定日にちょうど 90% になり、時間とともに下がる", () => {
    const state = reviewItem(reviewItem(undefined, 1, NOW), 1, NOW + DAY_MS); // interval 3
    const at = days => retrievability(state, NOW + DAY_MS + days * DAY_MS);
    assert.ok(Math.abs(at(3) - 0.9) < 1e-9);
    assert.ok(at(0) > at(3) && at(3) > at(10));
});

// ── 理解度 ──

test("難しい問題に正解すると、易しい問題に正解するより理解度が大きく上がる", () => {
    const easy = updateTopic(null, { difficulty: 1, type: "choice", score: 1 }, NOW);
    const hard = updateTopic(null, { difficulty: 5, type: "choice", score: 1 }, NOW);
    assert.ok(hard.ability - easy.ability > 5);
});

test("易しい問題を間違えると理解度が下がる", () => {
    const after = updateTopic({ ability: 60, attempts: 10, scoreSum: 8, lastAt: NOW }, { difficulty: 1, type: "choice", score: 0 }, NOW);
    assert.ok(after.ability < 60);
});

test("選択問題は当てずっぽうでも 25% 取れる前提で期待値を計算する", () => {
    assert.ok(expectedScore(0, 5, "choice") >= 0.25);
    assert.ok(expectedScore(0, 5, "free") < 0.05);
    assert.ok(expectedScore(50, 3, "choice") > expectedScore(50, 3, "free"));
});

test("理解度に応じて難易度と形式（選択 → 穴埋め → 白紙）が変わる", () => {
    assert.equal(targetDifficulty(null), 1);
    assert.equal(targetDifficulty(95), 5);
    assert.equal(preferredType(null), "choice");
    assert.equal(preferredType(45), "cloze");
    assert.equal(preferredType(80), "free");
    assert.equal(preferredType(80, true), "code");
});

test("科目の理解度は未着手のトピックを 0 として数える", () => {
    const save = freshSave();
    assert.equal(subjectUnderstanding(save, fe).understanding, 0);
    save.topics["fe.algo"] = { ability: 80, attempts: 5, scoreSum: 4, lastAt: NOW };
    const { understanding, coverage } = subjectUnderstanding(save, fe);
    const totalWeight = fe.topics.reduce((s, t) => s + t.weight, 0);
    assert.ok(Math.abs(understanding - (80 * 16) / totalWeight) < 1e-9);
    assert.ok(Math.abs(coverage - 1 / fe.topics.length) < 1e-9);
});

test("予想正答率は未着手なら当てずっぽう程度、実力が上がると合格ラインを超える", () => {
    const save = freshSave();
    assert.ok(Math.abs(predictedExamScore(save, fe) - 0.25) < 1e-9);
    for (const topic of fe.topics) save.topics[topic.id] = { ability: 85, attempts: 20, scoreSum: 18, lastAt: NOW };
    assert.ok(predictedExamScore(save, fe) > fe.exam.passRatio);
    assert.equal(predictedExamScore(save, getSubject("wine")), null);
});

// ── 採点 ──

test("表記ゆれ（全角・大文字小文字・空白）を吸収して照合する", () => {
    assert.equal(normalizeAnswer(" ＨＡＶＩＮＧ "), "having");
    const q = { blanks: [["32"], ["128"]] };
    assert.deepEqual(gradeCloze(q, ["３２", "64"]), { score: 0.5, correct: false, blanks: [true, false] });
    assert.equal(gradeCloze(q, ["", ""]).score, 0);
    assert.deepEqual(gradeChoice({ answer: 2 }, 2), { score: 1, correct: true });
});

test("穴埋めの問題文を文字と空欄に分ける", () => {
    assert.deepEqual(splitClozePrompt("A {0} B {1}"), [{ text: "A " }, { blank: 0 }, { text: " B " }, { blank: 1 }]);
});

test("記述式のキーワード一致率（同義語のどれかが入っていれば OK）", () => {
    const q = { keywords: [["半分", "1/2"], ["整列", "ソート"]] };
    assert.equal(keywordCoverage(q, "毎回範囲を半分にする").ratio, 0.5);
    assert.equal(keywordCoverage(q, "ソート済みなら 1/2 ずつ").ratio, 1);
    assert.equal(keywordCoverage({}, "x"), null);
});

test("コード問題はテストの合格率が得点になる", () => {
    assert.deepEqual(gradeCode({ error: null, tests: [{ ok: true }, { ok: false }] }), { score: 0.5, correct: false, passed: 1, total: 2 });
    assert.equal(gradeCode({ error: "SyntaxError", tests: [] }).score, 0);
});

// ── 出題 ──

test("初めての人には重点トピックの易しい選択問題から出す", () => {
    const save = freshSave();
    const pick = pickNext({
        save, subject: fe, questions: fe.questions, focusTopics: ["fe.theory"], now: NOW, random: () => 0
    });
    assert.equal(pick.reason, "new");
    assert.equal(pick.question.topic, "fe.theory");
    assert.equal(pick.question.type, "choice");
    assert.equal(pick.question.difficulty, 1);
});

test("復習期限が来た問題を優先して出す", () => {
    const save = freshSave();
    const q = fe.questions.find(x => x.id === "fe.network.004");
    recordAttempt(save, fe, q, 0, {}, NOW - DAY_MS);
    const pick = pickNext({ save, subject: fe, questions: fe.questions, now: NOW, random: () => 0 });
    assert.equal(pick.reason, "review");
    assert.equal(pick.question.id, "fe.network.004");
});

test("形式を指定するとその形式だけから出し、出題済みは除外する", () => {
    const save = freshSave();
    const exclude = new Set();
    for (let i = 0; i < 5; i += 1) {
        const pick = pickNext({ save, subject: fe, questions: fe.questions, typeFilter: "cloze", exclude, now: NOW });
        assert.equal(pick.question.type, "cloze");
        assert.ok(!exclude.has(pick.question.id));
        exclude.add(pick.question.id);
    }
});

test("候補がなければ null（AI に問題を作らせる合図）", () => {
    const save = freshSave();
    const pick = pickNext({ save, subject: getSubject("wine"), questions: fe.questions, now: NOW });
    assert.equal(pick, null);
});

test("AI に頼む問題の条件は理解度から決まる（コード問題は Python だけ）", () => {
    const save = freshSave();
    save.topics["fe.db"] = { ability: 90, attempts: 30, scoreSum: 27, lastAt: NOW };
    const req = aiRequestFor(save, fe, ["fe.db"], "auto", () => 0);
    assert.deepEqual(req, { topicId: "fe.db", difficulty: 5, type: "free" });
    assert.equal(aiRequestFor(save, fe, ["fe.db"], "code", () => 0).type, "free");
});

// ── 記録 ──

test("解答を記録すると理解度・復習予定・日別記録・連続日数が更新される", () => {
    const save = freshSave();
    const q = fe.questions[0];
    recordAttempt(save, fe, q, 1, { mode: "practice" }, NOW - DAY_MS);
    recordAttempt(save, fe, fe.questions[1], 1, { mode: "practice" }, NOW);
    assert.equal(save.attempts.length, 2);
    assert.ok(save.topics[q.topic].ability > 0);
    assert.equal(save.items[q.id].subject, "fe");
    assert.equal(answeredToday(save, "fe", NOW), 1);
    assert.equal(streakDays(save, NOW), 2);
    assert.equal(streakDays(save, NOW + 3 * DAY_MS), 0);
});

// ── 計画 ──

test("目標の種類: タイトルなし=探索、日付なし=段階クリア型、日付あり=期限型", () => {
    assert.equal(goalMode({ title: null }), "explore");
    assert.equal(goalMode({ title: "x", targetDate: null }), "milestone");
    assert.equal(goalMode({ title: "x", targetDate: "2027-01-01" }), "deadline");
});

test("期限型の計画は段階学習 → 弱点補強 → 模試の順に、試験日まで隙間なく並ぶ", () => {
    const goal = { title: "FE", startDate: "2026-10-22", targetDate: "2027-02-19" };
    const phases = buildDeadlineSchedule(fe, goal);
    assert.equal(phases.length, fe.stages.length + 2);
    assert.equal(phases[0].start, "2026-10-22");
    assert.equal(phases.at(-1).end, "2027-02-19");
    assert.deepEqual(phases.slice(-2).map(p => p.kind), ["review", "mock"]);
    for (let i = 1; i < phases.length; i += 1) {
        assert.ok(phases[i - 1].end < phases[i].start, `${phases[i - 1].title} と ${phases[i].title} が重なっている`);
    }
});

test("今日の計画: 期限型は残り日数、探索型はまだ触っていないトピックを重点にする", () => {
    const save = freshSave();
    const plan = todayPlan(save, fe, NOW);
    assert.equal(plan.mode, "deadline");
    assert.equal(plan.daysLeft, 120);
    assert.ok(plan.focusTopics.includes("fe.theory"));

    const wine = getSubject("wine");
    save.topics["wine.grapes"].attempts = 5;
    const explore = todayPlan(save, wine, NOW);
    assert.equal(explore.mode, "explore");
    assert.ok(!explore.focusTopics.includes("wine.grapes"));
});

test("段階クリア型: 前の段階をクリアすると次の段階に進む", () => {
    const save = freshSave();
    const python = getSubject("python");
    assert.equal(todayPlan(save, python, NOW).phase.stageId, "python.s1");
    for (const id of python.stages[0].topics) save.topics[id] = { ability: 70, attempts: 10, scoreSum: 8, lastAt: NOW };
    assert.equal(todayPlan(save, python, NOW).phase.stageId, "python.s2");
});

test("予定の段階を過ぎても理解度が足りなければ「遅れ」として知らせる", () => {
    const save = freshSave();
    const later = NOW + 60 * DAY_MS;
    const plan = todayPlan(save, fe, later);
    assert.ok(plan.behind.length > 0);
});
