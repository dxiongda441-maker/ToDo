#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { createWorkspace, collectChanges, removeWorkspace } = require("./lib/workspace");
const { AGENTS, preflight } = require("./lib/agents");
const { serveDirectory, createAppDriver } = require("./lib/app");
const { check, commonGraders, judge } = require("./lib/graders");
const { passAtK, passHatK, mean, wilson } = require("./lib/metrics");

const EVALS_DIR = __dirname;
const REPO_ROOT = path.resolve(EVALS_DIR, "..");
const TASKS_DIR = path.join(EVALS_DIR, "tasks");

const DEFAULTS = {
    agent: "claude",
    trials: 3,
    concurrency: 2,
    ref: "",
    bare: true,
    sandbox: true,
    claudeBin: "claude",
    model: "",
    judge: false,
    judgeModel: "",
    maxBudgetUsd: 2,
    timeoutSec: 900,
    keep: false,
    regressionThreshold: 0
};

const SUITES = ["capability", "regression"];
const TASK_FIELDS = {
    suite: "string",
    base_ref: "string",
    prompt: "string",
    source: "string",
    regression: "boolean",
    allowed_files: "array",
    max_changed_lines: "number",
    expect_no_changes: "boolean",
    forbidden_tools: "array",
    max_budget_usd: "number",
    timeout_sec: "number",
    judge: "object"
};

// A misspelt field would silently switch a grader off, so task.json is strict.
function validateTask(id, task) {
    const problems = [];
    for (const [key, value] of Object.entries(task)) {
        const expected = TASK_FIELDS[key];
        const actual = Array.isArray(value) ? "array" : typeof value;
        if (!expected) problems.push(`unknown field "${key}"`);
        else if (actual !== expected) problems.push(`"${key}" must be ${expected}`);
    }
    for (const key of ["suite", "base_ref", "prompt"]) {
        if (!task[key]) problems.push(`missing "${key}"`);
    }
    if (task.suite && !SUITES.includes(task.suite)) problems.push(`"suite" must be one of ${SUITES.join(", ")}`);
    if (task.judge) {
        const unknownJudge = Object.keys(task.judge).filter(key => !["rubric", "required", "context_files"].includes(key));
        if (typeof task.judge.rubric !== "string") problems.push(`"judge.rubric" must be a string`);
        if (unknownJudge.length) problems.push(`unknown judge field(s): ${unknownJudge.join(", ")}`);
    }
    if (problems.length) throw new Error(`tasks/${id}/task.json: ${problems.join("; ")}`);
}

function loadTasks(filter) {
    const ids = fs.readdirSync(TASKS_DIR).filter(id => fs.existsSync(path.join(TASKS_DIR, id, "task.json"))).sort();
    const wanted = filter && filter.length ? ids.filter(id => filter.includes(id)) : ids;
    const unknown = (filter || []).filter(id => !ids.includes(id));
    if (unknown.length) throw new Error(`unknown task(s): ${unknown.join(", ")}`);
    return wanted.map(id => {
        const dir = path.join(TASKS_DIR, id);
        const task = JSON.parse(fs.readFileSync(path.join(dir, "task.json"), "utf8"));
        validateTask(id, task);
        const graderFile = path.join(dir, "grade.js");
        return { ...task, id, dir, grade: fs.existsSync(graderFile) ? require(graderFile) : null };
    });
}

function gitInfo() {
    const run = args => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    try {
        return { commit: run(["rev-parse", "HEAD"]), dirty: run(["status", "--porcelain", "--", "evals"]) !== "" };
    } catch (_error) {
        return { commit: null, dirty: null };
    }
}

async function gradeTrial({ task, options, browser, workspace, agentResult, changes }) {
    let server = null;
    try {
        server = await serveDirectory(workspace);
        const app = createAppDriver(browser, server.url);
        const checks = [];
        if (task.grade) {
            checks.push(...await task.grade({ app, check, changes, agentResult, workspace }));
        }
        checks.push(...await commonGraders({ task, app, changes, agentResult, repoRoot: REPO_ROOT }));
        // Required judges always run for a real agent; advisory ones only with
        // --judge. Selfcheck agents never call a model.
        const runJudge = task.judge && (options.judge || (task.judge.required && options.agent === "claude"));
        if (runJudge) {
            checks.push(await judge({ task, changes, agentResult, options, workspace }));
        }
        return checks;
    } finally {
        if (server) server.close();
    }
}

// One trial. Anything that goes wrong in the harness itself (workspace setup,
// a grader crashing, the agent never starting) marks the trial "error", which
// is reported separately and kept out of the pass rates.
async function runTrial({ task, trial, options, browser, runDir }) {
    const trialDir = path.join(runDir, task.id, `trial-${trial}`);
    fs.mkdirSync(trialDir, { recursive: true });
    const result = { task: task.id, suite: task.suite, trial, status: "error", pass: false, checks: [], dir: trialDir };
    let workspace = null;
    try {
        workspace = createWorkspace(REPO_ROOT, options.ref || task.base_ref, task);
        const agentResult = await AGENTS[options.agent]({ task, workspace, trialDir, options });
        result.agent = {
            isError: agentResult.isError,
            timedOut: Boolean(agentResult.timedOut),
            stopReason: agentResult.stopReason || null,
            exitCode: agentResult.exitCode,
            model: agentResult.model || null,
            claudeVersion: agentResult.claudeVersion || null,
            costUsd: agentResult.costUsd,
            turns: agentResult.turns,
            durationMs: agentResult.durationMs,
            toolCalls: agentResult.toolCalls.length,
            toolsUsed: [...new Set(agentResult.toolCalls.map(call => call.name))]
        };
        if (agentResult.infraError) {
            result.error = `agent did not start: ${agentResult.infraError}`;
            return result;
        }

        const changes = collectChanges(workspace);
        fs.writeFileSync(path.join(trialDir, "diff.patch"), changes.patch);
        fs.writeFileSync(path.join(trialDir, "final.md"), agentResult.finalText);
        result.changedFiles = changes.files;
        result.changedLines = changes.changedLines;

        result.checks = await gradeTrial({ task, options, browser, workspace, agentResult, changes });
        result.pass = result.checks.filter(c => c.required).every(c => c.pass === true);
        result.status = "graded";
        return result;
    } catch (error) {
        result.error = error && error.stack ? error.stack : String(error);
        return result;
    } finally {
        fs.writeFileSync(path.join(trialDir, "result.json"), JSON.stringify(result, null, 2));
        if (workspace && options.keep) {
            fs.writeFileSync(path.join(trialDir, "workspace.txt"), workspace);
        } else if (workspace) {
            removeWorkspace(workspace);
        }
    }
}

async function pool(jobs, size) {
    const results = [];
    let next = 0;
    const workers = Array.from({ length: Math.max(1, size) }, async () => {
        while (next < jobs.length) {
            const index = next++;
            results[index] = await jobs[index]();
        }
    });
    await Promise.all(workers);
    return results;
}

function summarize(tasks, results, options, meta) {
    const k = options.trials;
    const perTask = tasks.map(task => {
        const all = results.filter(r => r.task === task.id);
        const graded = all.filter(r => r.status === "graded");
        const n = graded.length;
        const c = graded.filter(r => r.pass).length;
        const failedChecks = {};
        for (const trial of graded) {
            for (const item of trial.checks) {
                if (item.required && item.pass !== true) {
                    failedChecks[item.name] = (failedChecks[item.name] || 0) + 1;
                }
            }
        }
        const agents = graded.map(r => r.agent || {});
        const judged = graded.map(r => r.checks.find(item => item.type === "model")).filter(Boolean);
        return {
            id: task.id,
            suite: task.suite,
            n,
            passes: c,
            errors: all.length - n,
            passAt1: passAtK(n, c, 1),
            passAtK: passAtK(n, c, k),
            passHatK: passHatK(n, c, k),
            meanCostUsd: mean(agents.map(a => a.costUsd)),
            meanTurns: mean(agents.map(a => a.turns)),
            meanDurationSec: mean(agents.map(a => (a.durationMs || 0) / 1000)),
            agentErrors: agents.filter(a => a.isError).length,
            judgeScore: mean(judged.map(item => item.score)),
            judgePasses: judged.length ? `${judged.filter(item => item.pass === true).length}/${judged.length}` : null,
            failedChecks
        };
    });

    const suites = {};
    for (const suite of [...new Set(perTask.map(t => t.suite))]) {
        const items = perTask.filter(t => t.suite === suite);
        const n = items.reduce((sum, t) => sum + t.n, 0);
        const c = items.reduce((sum, t) => sum + t.passes, 0);
        suites[suite] = {
            tasks: items.length,
            trials: n,
            passes: c,
            passAt1: mean(items.map(t => t.passAt1)),
            passAt1Ci95: wilson(n, c),
            passAtK: mean(items.map(t => t.passAtK)),
            passHatK: mean(items.map(t => t.passHatK))
        };
    }

    const agents = results.map(r => r.agent).filter(Boolean);
    const firstOf = key => (agents.find(a => a[key]) || {})[key] || null;
    return {
        createdAt: new Date().toISOString(),
        agent: options.agent,
        // What actually ran, so two summaries can be compared fairly.
        conditions: {
            requestedModel: options.model || null,
            servedModel: firstOf("model"),
            claudeVersion: firstOf("claudeVersion") || meta.claudeVersion || null,
            bare: options.bare,
            sandbox: options.sandbox,
            maxBudgetUsd: options.maxBudgetUsd,
            judge: options.judge ? options.judgeModel || "(default)" : null,
            ref: options.ref || "per-task base_ref",
            evalsCommit: meta.git.commit,
            evalsDirty: meta.git.dirty,
            node: process.version
        },
        trials: k,
        errors: results.filter(r => r.status !== "graded").length,
        totalCostUsd: agents.reduce((sum, a) => sum + (a.costUsd || 0), 0),
        suites,
        tasks: perTask,
        failedTrials: results.filter(r => r.status !== "graded" || !r.pass).map(r => ({
            task: r.task,
            trial: r.trial,
            status: r.status,
            reason: r.error ? r.error.split("\n")[0] : r.checks.filter(c => c.required && c.pass !== true).map(c => c.name).join(", "),
            dir: path.relative(meta.runDir, r.dir)
        }))
    };
}

function pct(value) {
    return value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`;
}

function num(value, digits = 2) {
    return value === null || value === undefined ? "-" : value.toFixed(digits);
}

function toMarkdown(summary) {
    const k = summary.trials;
    const c = summary.conditions;
    const multi = k > 1;
    const kHeads = multi ? ` pass@${k} | pass^${k} |` : "";
    const kRule = multi ? "---|---|" : "";
    const kCells = item => (multi ? ` ${pct(item.passAtK)} | ${pct(item.passHatK)} |` : "");
    const judged = summary.tasks.some(t => t.judgePasses);
    const jHead = judged ? " judge |" : "";
    const jRule = judged ? "---|" : "";
    const jCell = t => (judged ? ` ${t.judgePasses ? `${t.judgePasses} (${num(t.judgeScore, 1)})` : "-"} |` : "");
    const ci = s => (s.passAt1Ci95 ? `${pct(s.passAt1Ci95[0])}–${pct(s.passAt1Ci95[1])}` : "-");
    const lines = [
        `# Eval results — ${summary.agent}`,
        "",
        `model: ${c.servedModel || c.requestedModel || "-"} · claude ${c.claudeVersion || "-"} · bare: ${c.bare} · sandbox: ${c.sandbox} · trials per task: ${k}`,
        `evals commit: ${c.evalsCommit ? c.evalsCommit.slice(0, 12) : "-"}${c.evalsDirty ? " (uncommitted changes)" : ""} · total cost: $${num(summary.totalCostUsd)} · ${summary.createdAt}`,
        ""
    ];
    if (summary.errors) {
        lines.push(`> **${summary.errors} trial(s) ended in a harness error and are excluded from the pass rates.** See the failed trials below.`, "");
    }
    lines.push(
        `| suite | tasks | trials | pass@1 | 95% CI |${kHeads}`,
        `|---|---|---|---|---|${kRule}`,
        ...Object.entries(summary.suites).map(([name, s]) =>
            `| ${name} | ${s.tasks} | ${s.passes}/${s.trials} | ${pct(s.passAt1)} | ${ci(s)} |${kCells(s)}`),
        "",
        `| task | suite | passes | pass@1 |${kHeads}${jHead} cost $ | turns | sec | failing checks |`,
        `|---|---|---|---|${kRule}${jRule}---|---|---|---|`,
        ...summary.tasks.map(t => {
            const failing = Object.entries(t.failedChecks).map(([name, count]) => `${name} ×${count}`);
            if (t.errors) failing.unshift(`harness error ×${t.errors}`);
            return `| ${t.id} | ${t.suite} | ${t.passes}/${t.n} | ${pct(t.passAt1)} |${kCells(t)}${jCell(t)} ${num(t.meanCostUsd)} | ${num(t.meanTurns, 1)} | ${num(t.meanDurationSec, 0)} | ${failing.join("<br>")} |`;
        })
    );
    if (summary.failedTrials.length) {
        lines.push("", "## Failed trials (read these transcripts)", "", "| trial | reason | files |", "|---|---|---|",
            ...summary.failedTrials.map(f => `| ${f.task} #${f.trial}${f.status === "error" ? " (error)" : ""} | ${f.reason.replace(/\|/g, "\\|")} | \`${f.dir}\` |`));
    }
    return `${lines.join("\n")}\n`;
}

async function runEval(overrides = {}) {
    const options = { ...DEFAULTS, ...overrides, repoRoot: REPO_ROOT };
    if (!AGENTS[options.agent]) throw new Error(`unknown agent: ${options.agent}`);
    if (!(options.trials >= 1)) throw new Error("--trials must be at least 1");
    const tasks = loadTasks(options.tasks);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runDir = options.outDir || path.join(EVALS_DIR, "results", `${stamp}-${options.agent}`);
    const meta = { git: gitInfo(), runDir, ...preflight(options) };
    fs.mkdirSync(runDir, { recursive: true });

    const browser = await chromium.launch();
    try {
        const jobs = [];
        for (const task of tasks) {
            for (let trial = 1; trial <= options.trials; trial += 1) {
                jobs.push(async () => {
                    const result = await runTrial({ task, trial, options, browser, runDir });
                    if (!options.quiet) {
                        const label = result.status === "error" ? "ERROR" : result.pass ? "PASS" : "FAIL";
                        console.error(`${label} ${task.id} #${trial}${result.error ? ` — ${result.error.split("\n")[0]}` : ""}`);
                    }
                    return result;
                });
            }
        }
        const results = await pool(jobs, options.concurrency);
        const summary = summarize(tasks, results, options, meta);
        fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
        fs.writeFileSync(path.join(runDir, "summary.md"), toMarkdown(summary));
        return { summary, runDir };
    } finally {
        await browser.close();
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            agent: { type: "string" },
            trials: { type: "string" },
            concurrency: { type: "string" },
            tasks: { type: "string" },
            ref: { type: "string" },
            model: { type: "string" },
            "no-bare": { type: "boolean" },
            "no-sandbox": { type: "boolean" },
            "claude-bin": { type: "string" },
            judge: { type: "boolean" },
            "judge-model": { type: "string" },
            "max-budget-usd": { type: "string" },
            "timeout-sec": { type: "string" },
            "regression-threshold": { type: "string" },
            "out-dir": { type: "string" },
            keep: { type: "boolean" }
        }
    });

    const overrides = {};
    if (values.agent) overrides.agent = values.agent;
    if (values.trials) overrides.trials = Number(values.trials);
    if (values.concurrency) overrides.concurrency = Number(values.concurrency);
    if (values.tasks) overrides.tasks = values.tasks.split(",").map(s => s.trim()).filter(Boolean);
    if (values.ref) overrides.ref = values.ref;
    if (values.model) overrides.model = values.model;
    if (values["no-bare"]) overrides.bare = false;
    if (values["no-sandbox"]) overrides.sandbox = false;
    if (values["claude-bin"]) overrides.claudeBin = values["claude-bin"];
    if (values.judge) overrides.judge = true;
    if (values["judge-model"]) overrides.judgeModel = values["judge-model"];
    if (values["max-budget-usd"]) overrides.maxBudgetUsd = Number(values["max-budget-usd"]);
    if (values["timeout-sec"]) overrides.timeoutSec = Number(values["timeout-sec"]);
    if (values["regression-threshold"]) overrides.regressionThreshold = Number(values["regression-threshold"]);
    if (values["out-dir"]) overrides.outDir = path.resolve(values["out-dir"]);
    if (values.keep) overrides.keep = true;

    const { summary, runDir } = await runEval(overrides);
    process.stdout.write(toMarkdown(summary));
    console.error(`\nresults: ${runDir}`);

    if (summary.errors) {
        console.error(`${summary.errors} trial(s) ended in a harness error; the results are incomplete`);
        process.exitCode = 1;
    }
    const regression = summary.suites.regression;
    const threshold = overrides.regressionThreshold || 0;
    if (regression && threshold > 0 && !(regression.passAt1 >= threshold)) {
        console.error(`regression suite pass@1 ${pct(regression.passAt1)} is below ${pct(threshold)}`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { runEval, toMarkdown, loadTasks };
