// v0.2 で追加した機能: 診断テスト・Python の段階ロック・問題ごとの履歴・AI への学習履歴の受け渡し

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    createDiagnostic, diagnosticLength, diagnosticReport, diagnosticResult,
    isDiagnosticDone, nextDiagnosticQuestion, recordDiagnosticAnswer
} from "../src/diagnostic.js";
import { todayPlan, unlockedStageCount, unlockedTopicIds } from "../src/planner.js";
import { latestDiagnostic, questionHistory, recentMistakes, recordAttempt, recordTest } from "../src/progress.js";
import { aiRequestFor, pickNext } from "../src/selector.js";
import { buildQuestionRequest } from "../src/ai.js";
import { createEmptySave, ensureSubjects } from "../src/store.js";
import { getSubject, SUBJECTS } from "../src/content/index.js";

const NOW = new Date(2026, 9, 23, 9).getTime();
const fe = getSubject("fe");
const python = getSubject("python");

function freshSave() {
    return ensureSubjects(createEmptySave(NOW), SUBJECTS, NOW);
}

/** 診断テストを最後まで解く。answer(q) が得点を返す */
function runDiagnostic(save, subject, answer) {
    const state = createDiagnostic(subject, { perTopic: 3 });
    const exclude = new Set();
    const results = [];
    let q;
    let guard = 0;
    while (!isDiagnosticDone(state) && (q = nextDiagnosticQuestion(state, { save, questions: subject.questions, exclude, random: () => 0 }))) {
        exclude.add(q.id);
        const score = answer(q);
        recordAttempt(save, subject, q, score, { mode: "diagnostic" }, NOW);
        recordDiagnosticAnswer(state, q, score);
        results.push({ question: q, score, details: q.type === "choice" ? { selected: score ? q.answer : (q.answer + 1) % q.choices.length } : { values: [""] } });
        assert.ok(guard++ < 100);
    }
    return { state, results };
}

// ── 診断テスト ──

test("FE の診断テストは全 9 分野から 3 問ずつ、選択・穴埋めだけを出題する", () => {
    const save = freshSave();
    const { state, results } = runDiagnostic(save, fe, () => 1);
    assert.equal(diagnosticLength(state), 27);
    assert.equal(results.length, 27);
    for (const topic of fe.topics) {
        assert.equal(results.filter(r => r.question.topic === topic.id).length, 3, topic.name);
    }
    assert.ok(results.every(r => ["choice", "cloze"].includes(r.question.type)));
    assert.equal(new Set(results.map(r => r.question.id)).size, 27, "同じ問題は出さない");
});

test("同じ分野が続かないよう、分野を順番に回して出題する", () => {
    const { results } = runDiagnostic(freshSave(), fe, () => 1);
    const firstRound = results.slice(0, 9).map(r => r.question.topic);
    assert.equal(new Set(firstRound).size, 9);
});

test("正解すると難易度が上がり、間違えると下がる", () => {
    const up = runDiagnostic(freshSave(), fe, () => 1).results.filter(r => r.question.topic === "fe.algo");
    assert.ok(up[2].question.difficulty > up[0].question.difficulty);
    const down = runDiagnostic(freshSave(), fe, () => 0).results.filter(r => r.question.topic === "fe.algo");
    assert.ok(down[2].question.difficulty <= down[0].question.difficulty);
    assert.equal(down[1].question.difficulty, 1);
});

test("診断結果: 分野別の判定と苦手分野、Claude に送るレポート", () => {
    const save = freshSave();
    // ネットワークとデータベースだけ全問不正解にする
    const { state, results } = runDiagnostic(save, fe, q => (["fe.network", "fe.db"].includes(q.topic) ? 0 : 1));
    const result = diagnosticResult(state, fe);
    assert.equal(result.total, 27);
    assert.deepEqual(new Set(result.weak), new Set(["fe.network", "fe.db"]));
    assert.equal(result.topics.find(t => t.topicId === "fe.algo").verdict.key, "strong");
    const report = diagnosticReport(fe, result, results, "2026/10/23");
    assert.match(report, /診断テスト結果: 基本情報技術者試験/);
    assert.match(report, /\| ネットワーク \| 0 \/ 3 \|/);
    assert.match(report, /\[fe\.network\.\d+\]/);
    assert.match(report, /正解: /);
});

test("診断結果を保存し、最新の診断を取り出せる（以後の計画で苦手分野が重点になる）", () => {
    const save = freshSave();
    const { state } = runDiagnostic(save, fe, q => (q.topic === "fe.network" ? 0 : 1));
    const result = diagnosticResult(state, fe);
    recordTest(save, fe, { kind: "diagnostic", score: result.scoreSum, total: result.total, topics: result.topics, report: "r" }, NOW);
    const latest = latestDiagnostic(save, "fe");
    assert.equal(latest.kind, "diagnostic");
    assert.equal(latest.report, "r");
    assert.equal(latestDiagnostic(save, "wine"), null);
    assert.ok(todayPlan(save, fe, NOW).focusTopics.includes("fe.network"));
});

// ── Python の段階ロック ──

test("Python は最初「基礎知識」の段階だけが出題対象", () => {
    const save = freshSave();
    assert.equal(unlockedStageCount(save, python), 1);
    assert.deepEqual([...unlockedTopicIds(save, python)].sort(),
        ["python.basics", "python.control", "python.datastruct", "python.functions"]);
    // ロックのない科目は全段階
    assert.equal(unlockedStageCount(save, fe), fe.stages.length);
});

test("ロック中は、何問解いても「読む・選ぶ・書く・eval」の新しい問題は出ない", () => {
    const save = freshSave();
    const allowedTopics = unlockedTopicIds(save, python);
    const exclude = new Set();
    for (let i = 0; i < 40; i += 1) {
        const pick = pickNext({ save, subject: python, questions: python.questions, allowedTopics, exclude, now: NOW });
        if (!pick) break;
        assert.ok(allowedTopics.has(pick.question.topic), pick.question.id);
        assert.notEqual(pick.question.type, "code");
        exclude.add(pick.question.id);
    }
});

test("基礎知識をクリアすると「コードを読む」に進み、手動で先に進むこともできる", () => {
    const save = freshSave();
    for (const id of python.stages[0].topics) save.topics[id] = { ability: 65, attempts: 10, scoreSum: 8, lastAt: NOW };
    assert.equal(unlockedStageCount(save, python), 2);
    assert.equal(todayPlan(save, python, NOW).phase.stageId, "python.s2");
    assert.ok(unlockedTopicIds(save, python).has("python.read"));
    assert.ok(!unlockedTopicIds(save, python).has("python.write"));

    save.subjects.python.unlockedStages = 4;
    assert.ok(unlockedTopicIds(save, python).has("python.write"));
    assert.equal(todayPlan(save, python, NOW).phase.stageId, "python.s4");
});

test("今日の重点にまだロック中の分野は入らない", () => {
    const plan = todayPlan(freshSave(), python, NOW);
    assert.ok(plan.focusTopics.every(id => python.stages[0].topics.includes(id)), plan.focusTopics.join());
});

test("AI に頼む問題の形式は分野に合わせる（「コードを書く」はコード問題、「コードを選ぶ」は選択）", () => {
    const save = freshSave();
    assert.equal(aiRequestFor(save, python, ["python.write"], "auto", () => 0).type, "code");
    assert.equal(aiRequestFor(save, python, ["python.choose"], "auto", () => 0).type, "choice");
    assert.equal(aiRequestFor(save, python, ["python.choose"], "free", () => 0).type, "choice");
});

// ── 問題ごとの履歴と、AI への受け渡し ──

test("同じ問題のこれまでの結果（回数・正解数・前回）を返す", () => {
    const save = freshSave();
    const q = fe.questions[0];
    assert.equal(questionHistory(save, q.id), null);
    recordAttempt(save, fe, q, 0, {}, NOW - 86400000);
    recordAttempt(save, fe, q, 1, {}, NOW);
    assert.deepEqual(questionHistory(save, q.id), { count: 2, correct: 1, lastAt: NOW, lastScore: 1 });
});

test("最近間違えた問題を取り出し、AI の問題作成リクエストに含める", () => {
    const save = freshSave();
    const wrong = fe.questions.filter(q => q.topic === "fe.network").slice(0, 3);
    for (const q of wrong) recordAttempt(save, fe, q, 0, {}, NOW);
    recordAttempt(save, fe, wrong[0], 0, {}, NOW);
    const ids = recentMistakes(save, "fe.network");
    assert.deepEqual(ids, [wrong[0].id, wrong[2].id, wrong[1].id]);

    const topic = fe.topics.find(t => t.id === "fe.network");
    const req = buildQuestionRequest({
        subject: fe, topic, type: "choice", difficulty: 2,
        learner: { ability: save.topics["fe.network"].ability, mistakes: ids.map(id => fe.questions.find(q => q.id === id).prompt) }
    });
    const text = req.messages[0].content;
    assert.match(text, /理解度: \d+ \/ 100/);
    assert.match(text, /最近このトピックで間違えた問題/);
    assert.ok(text.includes(wrong[0].prompt.slice(0, 20)));
});
