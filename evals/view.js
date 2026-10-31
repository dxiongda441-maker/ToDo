#!/usr/bin/env node
// Prints one trial as a readable timeline: node view.js <trial dir>
// Shows the agent's text, each tool call with a short result, the checks, and
// the final answer, so a failure can be read without digging through JSON.
const fs = require("node:fs");
const path = require("node:path");

function short(value, limit = 300) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const flat = (text || "").replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function toolResultText(block) {
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) return block.content.map(part => part.text || "").join(" ");
    return "";
}

function main() {
    const dir = process.argv[2];
    if (!dir || !fs.existsSync(path.join(dir, "result.json"))) {
        console.error("usage: node view.js <results/.../task/trial-N>");
        process.exit(2);
    }
    const result = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
    console.log(`# ${result.task} #${result.trial} — ${result.status === "error" ? "ERROR" : result.pass ? "PASS" : "FAIL"}`);
    if (result.agent) {
        const a = result.agent;
        console.log(`model ${a.model || "-"} · turns ${a.turns ?? "-"} · $${a.costUsd ?? "-"} · ${Math.round((a.durationMs || 0) / 1000)}s · stop ${a.stopReason || "-"}`);
    }
    if (result.error) console.log(`\nerror: ${result.error}`);

    const transcript = path.join(dir, "transcript.jsonl");
    if (fs.existsSync(transcript)) {
        console.log("\n## Timeline");
        let step = 0;
        for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
            if (!line.trim()) continue;
            let event;
            try {
                event = JSON.parse(line);
            } catch (_error) {
                continue;
            }
            const content = event.message && Array.isArray(event.message.content) ? event.message.content : [];
            if (event.type === "assistant") {
                for (const block of content) {
                    if (block.type === "text" && block.text.trim()) console.log(`\n💬 ${short(block.text, 600)}`);
                    if (block.type === "tool_use") console.log(`\n[${++step}] ${block.name} ${short(block.input, 200)}`);
                }
            } else if (event.type === "user") {
                for (const block of content) {
                    if (block.type === "tool_result") console.log(`    ${block.is_error ? "✗" : "→"} ${short(toolResultText(block), 200)}`);
                }
            }
        }
    }

    console.log("\n## Checks");
    for (const item of result.checks || []) {
        const mark = item.pass === true ? "✓" : item.pass === null ? "?" : "✗";
        console.log(`${mark} ${item.name}${item.required ? "" : " (advisory)"}${item.detail ? ` — ${short(item.detail, 400)}` : ""}`);
    }
    if (result.changedFiles) console.log(`\nchanged: ${result.changedFiles.join(", ") || "(none)"} (${result.changedLines} lines) — see diff.patch`);
    const final = path.join(dir, "final.md");
    if (fs.existsSync(final)) console.log(`\n## Final answer\n${fs.readFileSync(final, "utf8").trim() || "(none)"}`);
}

main();
