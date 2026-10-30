const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASELINE_AUTHOR = ["-c", "user.name=eval", "-c", "user.email=eval@localhost", "-c", "core.quotepath=off"];

function git(cwd, args, options = {}) {
    return execFileSync("git", [...BASELINE_AUTHOR, ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28, ...options });
}

// Each trial gets a fresh copy of the app at `ref` with no git history, so the
// agent cannot look up the original fix, and without evals/ and .github/, so it
// cannot read graders or reference solutions.
function createWorkspace(repoRoot, ref, task) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eval-${task.id}-`));
    const tar = execFileSync(
        "git",
        ["archive", "--format=tar", ref, "--", ".", ":(exclude)evals", ":(exclude).github"],
        { cwd: repoRoot, maxBuffer: 1 << 28 }
    );
    execFileSync("tar", ["-x", "-C", dir], { input: tar });

    const setupPatch = path.join(task.dir, "setup.patch");
    if (fs.existsSync(setupPatch)) {
        git(dir, ["apply", setupPatch]);
    }

    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "baseline"]);
    return dir;
}

// What the trial changed relative to the baseline, untracked files included.
function collectChanges(dir) {
    git(dir, ["add", "-A"]);
    const files = git(dir, ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
    const patch = git(dir, ["diff", "--cached"]);
    const numstat = git(dir, ["diff", "--cached", "--numstat"]).split("\n").filter(Boolean);
    const changedLines = numstat.reduce((sum, line) => {
        const [added, removed] = line.split("\t");
        return sum + (Number(added) || 0) + (Number(removed) || 0);
    }, 0);
    return { files, patch, changedLines };
}

function removeWorkspace(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { createWorkspace, collectChanges, removeWorkspace, git };
