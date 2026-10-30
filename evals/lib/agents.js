const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { git } = require("./workspace");

const AGENT_TOOLS = "Bash,Read,Edit,Write,Glob,Grep";

function runProcess(command, args, { cwd, timeoutMs, stdoutFile }) {
    return new Promise(resolve => {
        const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        const out = stdoutFile ? fs.createWriteStream(stdoutFile) : null;
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGINT");
            setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
        }, timeoutMs);

        child.stdout.on("data", chunk => {
            stdout += chunk;
            if (out) out.write(chunk);
        });
        child.stderr.on("data", chunk => {
            stderr += chunk;
        });
        child.on("error", error => {
            stderr += String(error);
        });
        child.on("close", code => {
            clearTimeout(timer);
            if (out) out.end();
            resolve({ code, stdout, stderr, timedOut });
        });
    });
}

function parseStreamJson(stdout) {
    const events = [];
    for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
            events.push(JSON.parse(line));
        } catch (_error) {
            // Non-JSON noise is ignored; the raw transcript is kept on disk.
        }
    }

    const toolCalls = [];
    for (const event of events) {
        if (event.type !== "assistant" || !event.message || !Array.isArray(event.message.content)) continue;
        for (const block of event.message.content) {
            if (block.type === "tool_use") {
                toolCalls.push({ name: block.name, input: block.input });
            }
        }
    }

    const result = [...events].reverse().find(event => event.type === "result") || null;
    return { toolCalls, result };
}

// Claude Code in headless mode. --bare keeps the host's hooks, plugins, MCP
// servers and CLAUDE.md out of the run so every trial sees the same setup.
async function runClaude({ task, workspace, trialDir, options }) {
    const args = [];
    if (options.bare) args.push("--bare");
    args.push(
        "-p", task.prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--tools", AGENT_TOOLS,
        "--allowedTools", AGENT_TOOLS,
        "--permission-mode", "acceptEdits",
        "--permission-prompts", "none",
        "--no-session-persistence",
        "--max-budget-usd", String(task.max_budget_usd || options.maxBudgetUsd)
    );
    if (options.model) args.push("--model", options.model);

    const started = Date.now();
    const run = await runProcess(options.claudeBin, args, {
        cwd: workspace,
        timeoutMs: (task.timeout_sec || options.timeoutSec) * 1000,
        stdoutFile: path.join(trialDir, "transcript.jsonl")
    });
    if (run.stderr) fs.writeFileSync(path.join(trialDir, "stderr.txt"), run.stderr);

    const { toolCalls, result } = parseStreamJson(run.stdout);
    return {
        finalText: result && typeof result.result === "string" ? result.result : "",
        toolCalls,
        exitCode: run.code,
        timedOut: run.timedOut,
        isError: run.timedOut || run.code !== 0 || Boolean(result && result.is_error),
        costUsd: result ? result.total_cost_usd ?? null : null,
        turns: result ? result.num_turns ?? null : null,
        durationMs: result && result.duration_ms ? result.duration_ms : Date.now() - started
    };
}

// Applies the task's reference solution. A full pass under this agent shows
// every task is solvable and every grader accepts a correct answer.
async function runOracle({ task, workspace }) {
    const patch = path.join(task.dir, "solution.patch");
    if (fs.existsSync(patch)) {
        git(workspace, ["apply", patch]);
    }
    const answer = path.join(task.dir, "solution.md");
    return {
        finalText: fs.existsSync(answer) ? fs.readFileSync(answer, "utf8") : "",
        toolCalls: [],
        exitCode: 0,
        isError: false,
        costUsd: 0,
        turns: 0,
        durationMs: 0
    };
}

// Changes nothing. A full fail under this agent shows no grader passes an
// untouched workspace.
async function runNoop() {
    return { finalText: "", toolCalls: [], exitCode: 0, isError: false, costUsd: 0, turns: 0, durationMs: 0 };
}

const AGENTS = { claude: runClaude, oracle: runOracle, noop: runNoop };

module.exports = { AGENTS, runProcess, parseStreamJson };
