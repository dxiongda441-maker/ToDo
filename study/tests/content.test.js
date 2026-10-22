// 問題バンクの検証。問題を追加したら npm test で形式と正解をチェックできる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SUBJECTS } from "../src/content/index.js";
import { splitClozePrompt } from "../src/grader.js";

const HARNESS = fileURLToPath(new URL("../src/python/harness.py", import.meta.url));
const allQuestions = SUBJECTS.flatMap(subject => subject.questions);

function python(args, input) {
    const result = spawnSync("python3", ["-I", ...args], { input, encoding: "utf8", timeout: 20000 });
    if (result.error) throw result.error;
    return result;
}

test("問題 ID は重複しない", () => {
    const ids = allQuestions.map(q => q.id);
    assert.equal(new Set(ids).size, ids.length);
});

for (const subject of SUBJECTS) {
    test(`${subject.name}: 科目定義が正しい`, () => {
        const topicIds = new Set(subject.topics.map(t => t.id));
        assert.ok(subject.topics.every(t => t.weight > 0));
        const staged = subject.stages.flatMap(s => s.topics);
        for (const id of staged) assert.ok(topicIds.has(id), `段階に未定義のトピック ${id}`);
        assert.equal(new Set(staged).size, topicIds.size, "全トピックがどこかの段階に含まれていること");
        for (const topic of subject.topics) {
            const count = subject.questions.filter(q => q.topic === topic.id).length;
            assert.ok(count >= 3, `${topic.name} の問題が少なすぎます (${count})`);
        }
    });

    test(`${subject.name}: 各問題の形式が正しい`, () => {
        const topicIds = new Set(subject.topics.map(t => t.id));
        for (const q of subject.questions) {
            const where = q.id;
            assert.equal(q.subject, subject.id, where);
            assert.ok(topicIds.has(q.topic), `${where}: トピック ${q.topic} が未定義`);
            assert.ok(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5, where);
            assert.ok(q.prompt.trim().length > 0, where);
            if (q.type === "choice") {
                assert.ok(q.choices.length >= 2, where);
                assert.equal(new Set(q.choices).size, q.choices.length, `${where}: 選択肢が重複`);
                assert.ok(q.answer >= 0 && q.answer < q.choices.length, `${where}: 正解番号が範囲外`);
                assert.ok(q.explanation, `${where}: 解説がない`);
            } else if (q.type === "cloze") {
                const blanks = splitClozePrompt(q.prompt).filter(p => "blank" in p).map(p => p.blank);
                assert.deepEqual(blanks, q.blanks.map((_, i) => i), `${where}: 空欄 {n} と blanks が対応していない`);
                assert.ok(q.blanks.every(list => list.length > 0), where);
            } else if (q.type === "free") {
                assert.ok(q.modelAnswer, where);
                assert.ok(Array.isArray(q.keywords) && q.keywords.length > 0, where);
            } else if (q.type === "code") {
                assert.ok(subject.allowCode, `${where}: コード問題は allowCode の科目だけ`);
                assert.ok(q.tests.length > 0 && q.solution, where);
            } else {
                assert.fail(`${where}: 未知の形式 ${q.type}`);
            }
        }
    });
}

test("Python: 選択問題の正解が、実際にコードを実行した結果と一致する", () => {
    // 「出力はどれか」「発生する例外はどれか」の問題だけ（コードを見せて直し方などを問う問題は除く）
    const targets = allQuestions.filter(q =>
        q.subject === "python" && q.type === "choice" && q.code && /出力|例外/.test(q.prompt));
    assert.ok(targets.length > 10);
    for (const q of targets) {
        const script = [
            "import sys, io, contextlib",
            "buf = io.StringIO()",
            "try:",
            "    with contextlib.redirect_stdout(buf):",
            `        exec(compile(${JSON.stringify(q.code)}, "<q>", "exec"), {})`,
            "    print(' '.join(buf.getvalue().split()))",
            "except Exception as e:",
            "    print(type(e).__name__)"
        ].join("\n");
        const out = python(["-c", script]).stdout.trim();
        const expected = q.choices[q.answer];
        // 出力そのもの、または「何も起きない」などの説明的な選択肢
        if (out === "") {
            assert.match(expected, /何も起きない/, q.id);
        } else {
            assert.equal(out, expected, `${q.id}: 実行結果 ${out} ≠ 正解の選択肢 ${expected}`);
        }
    }
});

test("Python: 選択肢がコードの問題は、正解の選択肢が Python として正しい文法である", () => {
    const targets = allQuestions.filter(q => q.codeChoices && q.subject === "python");
    assert.ok(targets.length > 0);
    for (const q of targets) {
        const result = python(["-c", `compile(${JSON.stringify(q.choices[q.answer])}, "<choice>", "exec")`]);
        assert.equal(result.status, 0, `${q.id}: 正解の選択肢がコンパイルできない ${result.stderr}`);
    }
});

test("Python: コード問題の模範解答はすべてのテストに合格し、書き始めのコードは不合格になる", () => {
    for (const q of allQuestions.filter(q => q.type === "code")) {
        const solved = JSON.parse(python([HARNESS], JSON.stringify({ code: q.solution, tests: q.tests })).stdout);
        assert.equal(solved.error, null, `${q.id}: ${solved.error}`);
        assert.ok(solved.tests.every(t => t.ok), `${q.id}: ${JSON.stringify(solved.tests)}`);

        const starter = JSON.parse(python([HARNESS], JSON.stringify({ code: q.starter, tests: q.tests })).stdout);
        assert.ok(starter.tests.some(t => !t.ok), `${q.id}: 書き始めのコードで合格してしまう`);
    }
});

test("採点ハーネス: 構文エラーや例外を利用者向けのメッセージで返す", () => {
    const syntax = JSON.parse(python([HARNESS], JSON.stringify({ code: "def f(:\n", tests: [] })).stdout);
    assert.match(syntax.error, /SyntaxError/);
    const runtime = JSON.parse(python([HARNESS], JSON.stringify({
        code: "def f(x):\n    print('debug', x)\n    return 1 / x",
        tests: [{ name: "ok", code: "assert f(1) == 1" }, { name: "zero", code: "f(0)" }]
    })).stdout);
    assert.equal(runtime.tests[0].ok, true);
    assert.match(runtime.tests[1].message, /ZeroDivisionError/);
    assert.match(runtime.stdout, /debug 1/);
});
