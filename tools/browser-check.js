// ヘッドレスブラウザで ToDo アプリとゲームを実際に操作して確かめる。
//
//   node tools/browser-check.js
//
// Playwright が必要（このリポジトリには入れない）。見つからなければ何もせずに終わる。
// 例：NODE_PATH="$(npm root -g)" node tools/browser-check.js
// 外部の背景画像は読み込まない（ネットにつながらない環境でも同じ結果になるように）。
// axe-core があれば、アクセシビリティの自動チェックもする（AXE_PATH に axe.min.js の場所を渡すか、
// require("axe-core") で見つかる場所に入れておく）。
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let chromium;
try {
    ({ chromium } = require("playwright"));
} catch (_error) {
    console.log("Playwright が見つからないため、ブラウザでの確認は飛ばしました。");
    process.exit(0);
}

const root = path.join(__dirname, "..");
const todoUrl = `file://${path.join(root, "index.html")}`;
const gameUrl = `file://${path.join(root, "games", "utsuroi", "index.html")}`;
const hubUrl = `file://${path.join(root, "games", "index.html")}`;
const rpgUrl = `file://${path.join(root, "games", "hoshifuru", "index.html")}`;

let failed = 0;
function check(condition, label) {
    if (condition) {
        console.log(`  ok  ${label}`);
    } else {
        failed += 1;
        console.log(`  NG  ${label}`);
    }
}

async function newPage(browser, viewport) {
    const page = await browser.newPage({ viewport, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://images.unsplash.com/**", route => route.abort());
    return { page, errors };
}

const texts = page => page.$$eval(".task-text", els => els.map(el => el.textContent));

const axePath = (() => {
    if (process.env.AXE_PATH) {
        return process.env.AXE_PATH;
    }
    try {
        return require.resolve("axe-core/axe.min.js");
    } catch (_error) {
        return null;
    }
})();

async function checkAccessibility(page, label) {
    if (!axePath) {
        return;
    }
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, { resultTypes: ["violations"] });
        return result.violations.map(v => `${v.id}（${v.nodes.length} か所: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(", ")}）: ${v.help}`);
    });
    check(violations.length === 0, `アクセシビリティ（axe）: ${label} ${violations.join(" / ")}`);
}

async function checkTodo(browser, width) {
    console.log(`[ToDo アプリ・幅 ${width}px]`);
    const { page, errors } = await newPage(browser, { width, height: 900 });
    await page.goto(todoUrl);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const today = await page.evaluate(() => TodoApp.utils.toDateKey(Date.now()));
    await page.fill("#task-input", "Buy milk");
    await page.fill("#due-input", today);
    await page.press("#task-input", "Enter");
    await page.fill("#task-input", "Write report");
    await page.press("#task-input", "Enter");
    check((await texts(page)).join() === "Write report,Buy milk", "タスクを追加できる");
    check((await page.textContent(".task-item:has-text('Buy milk') .task-due")) === "Due today", "期限日が表示される");

    await page.click(".task-item:has-text('Buy milk') .edit-button");
    await page.fill(".task-edit-text", "Buy oat milk");
    await page.press(".task-edit-text", "Enter");
    check((await texts(page)).includes("Buy oat milk"), "その場で編集できる");

    await page.check(".task-item:has-text('Write report') .task-toggle");
    await page.click("[data-filter=active]");
    check((await texts(page)).join() === "Buy oat milk", "フィルター（Active）");
    await page.click("[data-filter=all]");

    await page.focus(".task-item:has(.task-text:text-is('Buy oat milk')) .drag-handle");
    await page.keyboard.press("ArrowUp");
    check((await texts(page)).join() === "Buy oat milk,Write report", "つまみと矢印キーで並べ替えられる");
    await page.keyboard.press("ArrowDown");

    await page.selectOption("#sort-select", "due");
    check((await texts(page))[0] === "Buy oat milk", "期限日順に並べ替えられる");
    await page.selectOption("#sort-select", "added");

    await page.fill("#task-input", "Plan trip #travel");
    await page.press("#task-input", "Enter");
    await page.click(".tag-filter");
    check((await texts(page)).join() === "Plan trip #travel", "タグで絞り込める");
    await page.click(".tag-filter.active");
    await page.click(".task-item:has-text('Plan trip') .delete-button");

    await page.fill("#search-input", "oat");
    check((await texts(page)).join() === "Buy oat milk", "検索");
    await page.fill("#search-input", "");

    await page.click(".task-item:has-text('Buy oat milk') .delete-button");
    await page.click("#toast-action");
    check((await texts(page)).includes("Buy oat milk"), "削除を元に戻せる");

    await page.click("#clear-completed");
    check(!(await texts(page)).includes("Write report"), "Clear completed");
    await page.click(".history-item:has-text('Write report') .history-restore");
    check((await texts(page)).includes("Write report"), "履歴から復元できる");

    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-button")]);
    const backupPath = path.join(os.tmpdir(), `todo-backup-check-${process.pid}.json`);
    await download.saveAs(backupPath);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.setInputFiles("#import-file", backupPath);
    await page.waitForFunction(() => document.querySelectorAll(".task-text").length === 2);
    check(true, "書き出したバックアップを取り込める");
    fs.unlinkSync(backupPath);

    // 履歴にある（削除した）タスクは、古いバックアップから復活させない。範囲外の日時でも壊れない
    const trickyPath = path.join(os.tmpdir(), `todo-backup-tricky-${process.pid}.json`);
    const archivedId = await page.evaluate(() => {
        const id = "check-archived";
        TodoApp.state.archivedTasks.unshift({ id, text: "Deleted on this device", createdAt: 1700000000000, deletedAt: 1700000500000, completed: false, reason: "deleted" });
        TodoApp.storage.saveArchive();
        return id;
    });
    fs.writeFileSync(trickyPath, JSON.stringify({
        format: "todo-backup",
        version: 1,
        tasks: [
            { id: archivedId, text: "Deleted on this device", completed: false, createdAt: 1700000000000 },
            { id: "check-bad-date", text: "Bad date", completed: false, createdAt: 1e100 }
        ],
        archive: [],
        focus: { days: { "2026-01-05": { sessions: 3, minutes: 75 } }, perTask: {} }
    }));
    await page.setInputFiles("#import-file", trickyPath);
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".task-text")).some(el => el.textContent === "Bad date"));
    await page.reload();
    const afterTricky = await texts(page);
    check(!afterTricky.includes("Deleted on this device"), "削除したタスクは取り込みで復活しない");
    check(afterTricky.includes("Bad date"), "範囲外の日時を取り込んでも表示が壊れない");
    check(await page.evaluate(() => JSON.parse(localStorage.getItem("todo.focus.v1")).days["2026-01-05"].sessions === 3), "バックアップから 集中タイマーの記録も 取り込める");
    await page.evaluate(() => {
        TodoApp.state.tasks = TodoApp.state.tasks.filter(task => task.id !== "check-bad-date");
        TodoApp.storage.saveTasks();
    });
    await page.reload();
    fs.unlinkSync(trickyPath);

    const monthBefore = await page.textContent("#month-label");
    await page.click("#prev-month");
    check((await page.textContent("#month-label")) !== monthBefore, "カレンダーの月を切り替えられる");

    // 集中タイマー：タスクを選んで動かし、時間が来たら（ここでは 終わる時刻を 過去にして 読み直す）記録される
    await page.selectOption("#focus-task", { label: "Buy oat milk" });
    await page.click("#focus-start");
    await page.waitForTimeout(1200);
    check((await page.textContent("#focus-start")) === "Pause" && (await page.textContent("#focus-clock")) < "25:00", "集中タイマーが動く");
    await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("todo.focus.v1"));
        saved.endsAt = Date.now() - 1000;
        localStorage.setItem("todo.focus.v1", JSON.stringify(saved));
    });
    await page.reload();
    let focusStats = await page.textContent("#focus-stats");
    check(/1 session · 25 min · this task: 1/.test(focusStats) && (await page.textContent("#focus-mode")) === "Short break", `時間が来ると 記録して 休憩になる（${focusStats}）`);
    await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("todo.focus.v1"));
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        saved.days[TodoApp.utils.toDateKey(yesterday.getTime())] = { sessions: 2, minutes: 50 };
        localStorage.setItem("todo.focus.v1", JSON.stringify(saved));
    });
    await page.reload();
    focusStats = await page.textContent("#focus-stats");
    check(focusStats.includes("2-day streak"), `何日 続けて 集中したかが 出る（${focusStats}）`);

    await page.click("h1");
    await page.keyboard.press("/");
    check(await page.evaluate(() => document.activeElement.id === "search-input"), "「/」で 検索欄へ");
    await page.click("h1");
    await page.keyboard.press("n");
    check(await page.evaluate(() => document.activeElement.id === "task-input" && document.activeElement.value === ""), "「n」で 新しいタスクの入力欄へ（n は 入力されない）");

    await page.click("#theme-toggle");
    await page.click("#theme-toggle");
    check(await page.evaluate(() => document.body.classList.contains("dark")), "ダーク配色に切り替えられる");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollWidth <= width, `横にはみ出さない（${scrollWidth}px）`);
    await checkAccessibility(page, "ToDo");
    check(errors.length === 0, `JavaScript のエラーなし ${errors.join(" / ")}`);
    await page.close();
}

async function checkGame(browser, width) {
    console.log(`[うつろい・幅 ${width}px]`);
    const { page, errors } = await newPage(browser, { width, height: 900 });
    await page.goto(gameUrl);
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("utsuroi.seenRules.v1", "true");
        localStorage.setItem("utsuroi.settings.v1", JSON.stringify({ mode: "cpu", level: "easy", side: "black", swap: false, handicap: "none" }));
    });
    await page.reload();
    check((await page.$$(".board .cell")).length === 49, "盤が 7×7 で表示される");

    let moved = false;
    for (const view of [42, 43, 44, 45, 46, 47, 48]) {
        await page.click(`.board .cell[data-view="${view}"]`);
        const targets = await page.$$eval(".board .cell.target", els => els.map(el => el.dataset.view));
        if (targets.length > 0) {
            await page.click(`.board .cell[data-view="${targets[0]}"]`);
            moved = true;
            break;
        }
    }
    check(moved, "駒を選んで動かせる");
    await page.waitForFunction(() => document.querySelectorAll("#move-log li").length >= 2, null, { timeout: 15000 });
    check(true, "CPU が指し返す");

    await page.click("#undo-button");
    await page.waitForTimeout(200);
    check((await page.$$("#move-log li")).length === 0, "待ったで戻せる");
    await checkAccessibility(page, "うつろい");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollWidth <= width, `横にはみ出さない（${scrollWidth}px）`);
    check(errors.length === 0, `JavaScript のエラーなし ${errors.join(" / ")}`);
    await page.close();
}

async function checkHubAndRpg(browser, width) {
    console.log(`[ゲーム一覧・ほしふるクエスト・幅 ${width}px]`);
    const { page, errors } = await newPage(browser, { width, height: 900 });
    await page.route("https://fonts.googleapis.com/**", route => route.abort());
    await page.route("https://fonts.gstatic.com/**", route => route.abort());
    await page.goto(hubUrl);
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("todo.tasks.v1", JSON.stringify([{ id: "hub-1", text: "Done", completed: true, createdAt: 1700000000000 }]));
        localStorage.setItem("utsuroi.record.v1", JSON.stringify({ easy: { win: 2, loss: 1, draw: 0 } }));
        localStorage.setItem("todo.focus.v1", JSON.stringify({ days: { "2026-01-02": { sessions: 2, minutes: 50 } } }));
    });
    await page.reload();
    check((await page.$$(".card .play")).length === 2, "ゲーム一覧に 2 つのゲームがある");
    check((await page.textContent("#utsuroi-progress")).includes("2 勝 1 敗"), "うつろいの戦績が出る");
    check((await page.textContent("#seeds")).includes("3 件"), "がんばりのたねに なる 数（終えたタスク ＋ 集中した回数）が出る");
    let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollWidth <= width, `ゲーム一覧が 横にはみ出さない（${scrollWidth}px）`);
    await checkAccessibility(page, "ゲーム一覧");

    await page.click(".card:has(#hoshifuru-title) .play");
    await page.waitForFunction(() => window.HF && window.HF.debug && document.querySelector(".menu-item"));
    check((await page.textContent(".menu-win")).includes("はじめから"), "ほしふるクエストの タイトル画面が出る");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".name-input");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => HF.debug.scene === "field" && localStorage.getItem("hoshifuru.save.v1"));
    check(true, "名前を決めて 冒険を始められる");
    await page.evaluate(() => {
        localStorage.setItem("hoshifuru.settings.v1", JSON.stringify({ sound: true }));
    });
    await page.reload();
    await page.waitForFunction(() => window.HF && window.HF.debug && document.querySelector(".menu-item"));
    await page.keyboard.press("Enter"); // つづきから（キーを押すと 音が 出せるようになる）
    await page.waitForFunction(() => HF.audio.nowPlaying() === "town", null, { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => HF.audio.nowPlaying() === "town"), "音をオンにすると 村の曲が 鳴る");
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollWidth <= width, `ほしふるクエストが 横にはみ出さない（${scrollWidth}px）`);
    check(errors.length === 0, `JavaScript のエラーなし ${errors.join(" / ")}`);
    await page.close();
}

(async () => {
    if (!axePath) {
        console.log("（axe-core が見つからないため、アクセシビリティの自動チェックは飛ばします）");
    }
    const browser = await chromium.launch();
    try {
        for (const width of [375, 1024]) {
            await checkTodo(browser, width);
            await checkGame(browser, width);
            await checkHubAndRpg(browser, width);
        }
    } finally {
        await browser.close();
    }
    console.log();
    if (failed === 0) {
        console.log("すべて OK");
    } else {
        console.log(`${failed} 件の NG があります`);
        process.exit(1);
    }
})();
