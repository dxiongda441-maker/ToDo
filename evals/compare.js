#!/usr/bin/env node
// Compares two runs: node compare.js <base summary.json> <new summary.json>
// Warns when the runs differ in more than one condition, since a change in
// score could then come from any of them.
const fs = require("node:fs");
const { zScore } = require("./lib/metrics");

const COMPARED_CONDITIONS = ["requestedModel", "servedModel", "claudeVersion", "bare", "sandbox", "maxBudgetUsd", "ref", "evalsCommit"];

function pct(value) {
    return value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`;
}

function delta(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return "-";
    const points = Math.round((b - a) * 100);
    return points > 0 ? `+${points}pt` : `${points}pt`;
}

function significance(z) {
    if (z === null) return "";
    return Math.abs(z) >= 1.96 ? (z > 0 ? "improved" : "**regressed**") : "within noise";
}

function compare(base, next) {
    const lines = ["# Eval comparison", ""];

    const changed = COMPARED_CONDITIONS.filter(key => JSON.stringify(base.conditions[key]) !== JSON.stringify(next.conditions[key]));
    lines.push("| condition | base | new |", "|---|---|---|",
        ...COMPARED_CONDITIONS.map(key => {
            const mark = changed.includes(key) ? " ⚠" : "";
            return `| ${key}${mark} | ${base.conditions[key] ?? "-"} | ${next.conditions[key] ?? "-"} |`;
        }), "");
    const meaningful = changed.filter(key => key !== "evalsCommit");
    if (meaningful.length > 1) {
        lines.push(`> More than one condition changed (${meaningful.join(", ")}); the score difference cannot be attributed to one of them.`, "");
    }
    if (base.errors || next.errors) {
        lines.push(`> Harness errors: base ${base.errors}, new ${next.errors}. Those trials are excluded from both sides.`, "");
    }

    lines.push("| suite | base pass@1 | new pass@1 | Δ | verdict |", "|---|---|---|---|---|");
    for (const suite of [...new Set([...Object.keys(base.suites), ...Object.keys(next.suites)])]) {
        const a = base.suites[suite];
        const b = next.suites[suite];
        const z = a && b ? zScore(a.trials, a.passes, b.trials, b.passes) : null;
        lines.push(`| ${suite} | ${pct(a && a.passAt1)} | ${pct(b && b.passAt1)} | ${delta(a && a.passAt1, b && b.passAt1)} | ${significance(z)} |`);
    }

    lines.push("", "| task | base | new | Δ pass@1 | Δ cost $ | Δ turns |", "|---|---|---|---|---|---|");
    const baseTasks = new Map(base.tasks.map(t => [t.id, t]));
    const nextTasks = new Map(next.tasks.map(t => [t.id, t]));
    for (const id of [...new Set([...baseTasks.keys(), ...nextTasks.keys()])].sort()) {
        const a = baseTasks.get(id);
        const b = nextTasks.get(id);
        const cost = a && b && a.meanCostUsd !== null && b.meanCostUsd !== null ? (b.meanCostUsd - a.meanCostUsd).toFixed(2) : "-";
        const turns = a && b && a.meanTurns !== null && b.meanTurns !== null ? (b.meanTurns - a.meanTurns).toFixed(1) : "-";
        lines.push(`| ${id} | ${a ? `${a.passes}/${a.n}` : "(none)"} | ${b ? `${b.passes}/${b.n}` : "(none)"} | ${delta(a && a.passAt1, b && b.passAt1)} | ${cost} | ${turns} |`);
    }
    lines.push("", "_Verdicts use a two-proportion z-test on pooled trials (|z| ≥ 1.96). With few trials most differences are within noise: add trials before drawing conclusions._");
    return `${lines.join("\n")}\n`;
}

if (require.main === module) {
    const [basePath, nextPath] = process.argv.slice(2);
    if (!basePath || !nextPath) {
        console.error("usage: node compare.js <base summary.json> <new summary.json>");
        process.exit(2);
    }
    const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
    process.stdout.write(compare(read(basePath), read(nextPath)));
}

module.exports = { compare };
