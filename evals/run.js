#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { chromium } = require("playwright");
const { createWorkspace, collectChanges, removeWorkspace } = require("./lib/workspace");
const { AGENTS } = require("./lib/agents");
const { serveDirectory, createAppDriver } = require("./lib/app");
const { check, commonGraders, judge } = require("./lib/graders");
const { passAtK, passHatK, mean } = require("./lib/metrics");

const EVALS_DIR = __dirname;
const REPO_ROOT = path.resolve(EVALS_DIR, "..");
const TASKS_DIR = path.join(EVALS_DIR, "tasks");

const DEFAULTS = {
    agent: "claude",
    trials: 3,
    concurrency: 2,
    ref: "",
    bare: true,
    claudeBin: "claude",
    model: "",
    judge: false,
    judgeModel: "",
    maxBudgetUsd: 2,
    timeoutSec: 900,
    keep: false,
    regressionThreshold: 0
};

function loadTasks(filter) {
    const ids = fs.readdirSync(TASKS_DIR).filter(id => fs.existsSync(path.join(TASKS_DIR, id, "task.json"))).sort();
    const wanted = filter && filter.length ? ids.filter(id => filter.includes(id)) : ids;
    const unknown = (filter || []).filter(id => !ids.includes(id));
    if (unknown.length) throw new Error(`unknown task(s): ${unknown.join(", ")}`);
    return wanted.map(id => {
        const dir = path.join(TASKS_DIR, id);
        const task = JSON.parse(fs.readFileSync(path.join(dir, "task.json"), "utf8"));
        const graderFile = path.join(dir, "grade.js");
        return { ...task, id, dir, grade: fs.existsSync(graderFile) ? require(graderFile) : null };
    });
}

async function runTrial({ task, trial, options, browser, runDir }) {
    const trialDir = path.join(runDir, task.id, `trial-${trial}`);
    fs.mkdirSync(trialDir, { recursive: true });
    const workspace = createWorkspace(REPO_ROOT, options.ref || task.base_ref || "HEAD", task);
    let server = null;
    try {
        const agentResult = await AGENTS[options.agent]({ task, workspace, trialDir, options });
        const changes = collectChanges(workspace);
        fs.writeFileSync(path.join(trialDir, "diff.patch"), changes.patch);
        fs.writeFileSync(path.join(trialDir, "final.md"), agentResult.finalText);

        server = await serveDirectory(workspace);
        const app = createAppDriver(browser, server.url);
        const checks = [];
        if (task.grade) {
            checks.push(...await task.grade({ app, check, changes, agentResult, workspace }));
        }
        checks.push(...await commonGraders({ task, app, changes, agentResult }));
        if (options.judge && task.judge) {
            checks.push(await judge({ task, changes, agentResult, options }));
        }

        const pass = checks.filter(c => c.required).every(c => c.pass === true);
        const result = {
            task: task.id,
            suite: task.suite,
            trial,
            pass,
            checks,
            changedFiles: changes.files,
            changedLines: changes.changedLines,
            agent: {
                isError: agentResult.isError,
                timedOut: Boolean(agentResult.timedOut),
                exitCode: agentResult.exitCode,
                costUsd: agentResult.costUsd,
                turns: agentResult.turns,
                durationMs: agentResult.durationMs,
                toolCalls: agentResult.toolCalls.length,
                toolsUsed: [...new Set(agentResult.toolCalls.map(call => call.name))]
            }
        };
        fs.writeFileSync(path.join(trialDir, "result.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        if (server) server.close();
        if (options.keep) {
            fs.writeFileSync(path.join(trialDir, "workspace.txt"), workspace);
        } else {
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

function summarize(tasks, results, options) {
    const k = options.trials;
    const perTask = tasks.map(task => {
        const trials = results.filter(r => r.task === task.id);
        const n = trials.length;
        const c = trials.filter(r => r.pass).length;
        const failedChecks = {};
        for (const trial of trials) {
            for (const item of trial.checks) {
                if (item.required && item.pass !== true) {
                    failedChecks[item.name] = (failedChecks[item.name] || 0) + 1;
                }
            }
        }
        return {
            id: task.id,
            suite: task.suite,
            n,
            passes: c,
            passAt1: passAtK(n, c, 1),
            passAtK: passAtK(n, c, k),
            passHatK: passHatK(n, c, k),
            meanCostUsd: mean(trials.map(r => r.agent.costUsd)),
            meanTurns: mean(trials.map(r => r.agent.turns)),
            meanDurationSec: mean(trials.map(r => r.agent.durationMs / 1000)),
            agentErrors: trials.filter(r => r.agent.isError).length,
            failedChecks
        };
    });

    const suites = {};
    for (const suite of [...new Set(perTask.map(t => t.suite))]) {
        const items = perTask.filter(t => t.suite === suite);
        suites[suite] = {
            tasks: items.length,
            passAt1: mean(items.map(t => t.passAt1)),
            passAtK: mean(items.map(t => t.passAtK)),
            passHatK: mean(items.map(t => t.passHatK))
        };
    }

    return {
        createdAt: new Date().toISOString(),
        agent: options.agent,
        model: options.model || "(default)",
        ref: options.ref || "per-task base_ref",
        trials: k,
        totalCostUsd: results.reduce((sum, r) => sum + (r.agent.costUsd || 0), 0),
        suites,
        tasks: perTask
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
    const lines = [
        `# Eval results — ${summary.agent} (${summary.model})`,
        "",
        `ref: \`${summary.ref}\` · trials per task: ${k} · total cost: $${num(summary.totalCostUsd)} · ${summary.createdAt}`,
        "",
        `| suite | tasks | pass@1 | pass@${k} | pass^${k} |`,
        "|---|---|---|---|---|",
        ...Object.entries(summary.suites).map(([name, s]) =>
            `| ${name} | ${s.tasks} | ${pct(s.passAt1)} | ${pct(s.passAtK)} | ${pct(s.passHatK)} |`),
        "",
        `| task | suite | passes | pass@1 | pass@${k} | pass^${k} | cost $ | turns | sec | failing checks |`,
        "|---|---|---|---|---|---|---|---|---|---|",
        ...summary.tasks.map(t => {
            const failing = Object.entries(t.failedChecks).map(([name, count]) => `${name} ×${count}`).join("<br>") || "";
            return `| ${t.id} | ${t.suite} | ${t.passes}/${t.n} | ${pct(t.passAt1)} | ${pct(t.passAtK)} | ${pct(t.passHatK)} | ${num(t.meanCostUsd)} | ${num(t.meanTurns, 1)} | ${num(t.meanDurationSec, 0)} | ${failing} |`;
        })
    ];
    return `${lines.join("\n")}\n`;
}

async function runEval(overrides = {}) {
    const options = { ...DEFAULTS, ...overrides };
    if (!AGENTS[options.agent]) throw new Error(`unknown agent: ${options.agent}`);
    const tasks = loadTasks(options.tasks);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runDir = options.outDir || path.join(EVALS_DIR, "results", `${stamp}-${options.agent}`);
    fs.mkdirSync(runDir, { recursive: true });

    const browser = await chromium.launch();
    try {
        const jobs = [];
        for (const task of tasks) {
            for (let trial = 1; trial <= options.trials; trial += 1) {
                jobs.push(async () => {
                    const result = await runTrial({ task, trial, options, browser, runDir });
                    if (!options.quiet) {
                        console.error(`${result.pass ? "PASS" : "FAIL"} ${task.id} #${trial}`);
                    }
                    return result;
                });
            }
        }
        const results = await pool(jobs, options.concurrency);
        const summary = summarize(tasks, results, options);
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

    const regression = summary.suites.regression;
    const threshold = overrides.regressionThreshold || 0;
    if (regression && threshold > 0 && regression.passAt1 < threshold) {
        console.error(`regression suite pass@1 ${pct(regression.passAt1)} is below ${pct(threshold)}`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { runEval, toMarkdown };
