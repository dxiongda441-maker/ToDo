#!/usr/bin/env node
// Validates the eval itself, without calling a model:
//   oracle (reference solutions) must pass every task -> tasks are solvable, graders accept correct work
//   noop (no changes) must fail every task            -> graders do not pass an untouched workspace
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runEval } = require("./run");

async function main() {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-selfcheck-"));
    const problems = [];
    const common = { trials: 1, concurrency: 4, quiet: true, ref: process.env.EVAL_REF || "" };

    const oracle = await runEval({ ...common, agent: "oracle", outDir: path.join(outRoot, "oracle") });
    const noop = await runEval({ ...common, agent: "noop", outDir: path.join(outRoot, "noop") });

    for (const task of oracle.summary.tasks) {
        const ok = task.passes === task.n;
        console.log(`${ok ? "ok  " : "BAD "} oracle passes ${task.id}`);
        if (!ok) problems.push(`oracle failed ${task.id}: ${Object.keys(task.failedChecks).join(", ")}`);
    }
    for (const task of noop.summary.tasks) {
        const ok = task.passes === 0;
        console.log(`${ok ? "ok  " : "BAD "} noop fails   ${task.id}`);
        if (!ok) problems.push(`noop passed ${task.id}: its graders accept an unchanged workspace`);
    }

    if (problems.length) {
        console.error(`\n${problems.join("\n")}\nresults: ${outRoot}`);
        process.exitCode = 1;
    } else {
        fs.rmSync(outRoot, { recursive: true, force: true });
        console.log("\nselfcheck passed");
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
