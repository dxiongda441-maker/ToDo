#!/usr/bin/env node
// Validates the eval itself, without calling a model:
//   every task.json is well-formed                    -> no grader silently switched off by a typo
//   oracle (reference solutions) must pass every task -> tasks are solvable, graders accept correct work
//   noop (no changes) must fail every task            -> graders do not pass an untouched workspace
//   every mutant (tasks/<id>/mutants/*.patch) must fail -> graders reject plausible near misses
// SELFCHECK_TRIALS=3 repeats each run to catch flaky graders.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runEval, loadTasks } = require("./run");

async function main() {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-selfcheck-"));
    const problems = [];
    const trials = Number(process.env.SELFCHECK_TRIALS || 1);
    const common = { trials, concurrency: 4, quiet: true, ref: process.env.EVAL_REF || "" };

    const oracle = await runEval({ ...common, agent: "oracle", outDir: path.join(outRoot, "oracle") });
    const noop = await runEval({ ...common, agent: "noop", outDir: path.join(outRoot, "noop") });

    for (const task of oracle.summary.tasks) {
        const ok = task.errors === 0 && task.passes === task.n;
        console.log(`${ok ? "ok  " : "BAD "} oracle passes ${task.id}`);
        if (!ok) problems.push(`oracle failed ${task.id}: ${task.errors ? "harness error" : Object.keys(task.failedChecks).join(", ")}`);
    }
    for (const task of noop.summary.tasks) {
        const ok = task.errors === 0 && task.passes === 0;
        console.log(`${ok ? "ok  " : "BAD "} noop fails   ${task.id}`);
        if (!ok) problems.push(`noop ${task.errors ? "hit a harness error on" : "passed"} ${task.id}`);
    }
    const mutantRuns = [];
    for (const task of loadTasks()) {
        const dir = path.join(task.dir, "mutants");
        const mutants = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith(".patch")).sort() : [];
        for (const mutant of mutants) {
            const run = await runEval({ ...common, agent: "mutant", mutant, tasks: [task.id], outDir: path.join(outRoot, "mutants", task.id, mutant) });
            const summary = run.summary.tasks[0];
            const ok = summary.errors === 0 && summary.passes === 0;
            console.log(`${ok ? "ok  " : "BAD "} mutant fails ${task.id}/${mutant}`);
            if (!ok) problems.push(`mutant ${task.id}/${mutant} ${summary.errors ? "hit a harness error" : "passed: the graders miss this mistake"}`);
            mutantRuns.push(run.summary);
        }
    }

    for (const failed of [...oracle.summary.failedTrials, ...noop.summary.failedTrials, ...mutantRuns.flatMap(s => s.failedTrials)]) {
        if (failed.status === "error") problems.push(`  ${failed.task} #${failed.trial}: ${failed.reason}`);
    }

    if (problems.length) {
        console.error(`\n${problems.join("\n")}\nresults: ${outRoot}`);
        process.exitCode = 1;
    } else {
        fs.rmSync(outRoot, { recursive: true, force: true });
        console.log(`\nselfcheck passed (${trials} trial(s) per task)`);
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});
