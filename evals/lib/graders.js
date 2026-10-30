const assert = require("node:assert/strict");
const { runProcess } = require("./agents");

// Runs one named check. Graders throw (usually via node:assert) to fail; the
// message becomes the detail shown in the report.
async function check(name, fn, { type = "code", required = true } = {}) {
    try {
        const detail = await fn();
        return { name, type, required, pass: true, detail: detail || "" };
    } catch (error) {
        return { name, type, required, pass: false, detail: error && error.message ? error.message : String(error) };
    }
}

// Core behaviour every task must leave intact: add, complete, persist, filter, delete.
async function coreSmoke(app) {
    return check("regression: core todo flow", async () => {
        const session = await app.open({ storage: {} });
        const { page } = session;
        try {
            await page.fill("#task-input", "回帰テスト用タスク");
            await page.click("#todo-form button[type=submit]");
            assert.deepEqual(await session.visibleTaskTexts(), ["回帰テスト用タスク"], "add: task not shown");
            assert.match(await page.textContent("#task-count"), /1/, "add: task count not updated");

            await page.check("#task-list .task-item .task-toggle");
            assert.ok(await page.locator("#task-list .task-item.completed").count() === 1, "toggle: not marked completed");

            await page.reload();
            assert.deepEqual(await session.visibleTaskTexts(), ["回帰テスト用タスク"], "persist: task lost on reload");
            assert.ok(await page.isChecked("#task-list .task-item .task-toggle"), "persist: completion lost on reload");

            await page.click('.filter-button[data-filter="active"]');
            assert.deepEqual(await session.visibleTaskTexts(), [], "filter: completed task shown under 未完了");
            await page.click('.filter-button[data-filter="completed"]');
            assert.deepEqual(await session.visibleTaskTexts(), ["回帰テスト用タスク"], "filter: task missing under 完了");
            await page.click('.filter-button[data-filter="all"]');

            await page.click("#task-list .task-item .delete-button");
            assert.deepEqual(await session.visibleTaskTexts(), [], "delete: task still shown");
            assert.ok(await page.isVisible("#empty-state"), "delete: empty state not shown");

            assert.deepEqual(session.errors, [], `page errors: ${session.errors.join(" | ")}`);
        } finally {
            await session.close();
        }
    });
}

// Graders driven by task.json fields rather than per-task code.
async function commonGraders({ task, app, changes, agentResult }) {
    const results = [];

    if (task.regression) {
        results.push(await coreSmoke(app));
    }

    if (task.expect_no_changes) {
        results.push(await check("scope: no files changed", () => {
            assert.deepEqual(changes.files, [], `changed: ${changes.files.join(", ")}`);
        }));
    }

    if (Array.isArray(task.allowed_files)) {
        results.push(await check("scope: only allowed files changed", () => {
            const outside = changes.files.filter(file => !task.allowed_files.includes(file));
            assert.deepEqual(outside, [], `changed outside ${task.allowed_files.join(", ")}: ${outside.join(", ")}`);
        }));
    }

    if (typeof task.max_changed_lines === "number") {
        results.push(await check(`scope: at most ${task.max_changed_lines} changed lines`, () => {
            assert.ok(changes.changedLines <= task.max_changed_lines, `${changes.changedLines} lines changed`);
        }));
    }

    if (Array.isArray(task.forbidden_tools)) {
        results.push(await check("transcript: no forbidden tools", () => {
            const used = agentResult.toolCalls.filter(call => task.forbidden_tools.includes(call.name)).map(call => call.name);
            assert.deepEqual(used, [], `used: ${[...new Set(used)].join(", ")}`);
        }, { type: "transcript" }));
    }

    return results;
}

const JUDGE_SCHEMA = {
    type: "object",
    properties: {
        verdict: { type: "string", enum: ["pass", "fail", "unknown"] },
        score: { type: "integer", minimum: 1, maximum: 5 },
        reason: { type: "string" }
    },
    required: ["verdict", "score", "reason"]
};

// Model-based grader. It sees the request, the rubric, the diff and the final
// answer, may answer "unknown", and is advisory unless the task marks it required.
async function judge({ task, changes, agentResult, options }) {
    const prompt = [
        "あなたはコーディングエージェントの成果物を採点する厳格なレビュアーです。",
        "ルーブリックだけに基づいて判定し、判断できない場合は verdict を unknown にしてください。",
        "",
        "## 依頼内容", task.prompt,
        "", "## ルーブリック", task.judge.rubric,
        "", "## 変更差分", "```diff", changes.patch.slice(0, 60_000) || "(変更なし)", "```",
        "", "## エージェントの最終回答", agentResult.finalText.slice(0, 20_000) || "(なし)"
    ].join("\n");

    const args = [];
    if (options.bare) args.push("--bare");
    args.push("-p", prompt, "--output-format", "json", "--tools", "", "--no-session-persistence",
        "--json-schema", JSON.stringify(JUDGE_SCHEMA));
    if (options.judgeModel) args.push("--model", options.judgeModel);

    const required = Boolean(task.judge.required);
    const run = await runProcess(options.claudeBin, args, { cwd: process.cwd(), timeoutMs: 300_000 });
    let output = null;
    try {
        output = JSON.parse(run.stdout).structured_output;
    } catch (_error) {
        output = null;
    }
    if (!output) {
        return { name: "judge: rubric", type: "model", required, pass: null, detail: `judge failed: ${run.stderr.slice(0, 500)}` };
    }
    return {
        name: "judge: rubric",
        type: "model",
        required,
        pass: output.verdict === "unknown" ? null : output.verdict === "pass",
        score: output.score,
        detail: output.reason
    };
}

module.exports = { check, coreSmoke, commonGraders, judge };
