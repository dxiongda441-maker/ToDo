const assert = require("node:assert/strict");

const KEY = "todo.tasks.v1";
const base = { completed: false, createdAt: 1700000000000, completedAt: null, dueDate: "", important: false, repeat: "" };

// Local-date keys computed in the browser, matching the app's own date logic.
function dateKeys(page) {
    return page.evaluate(() => {
        const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const offset = n => {
            const d = new Date();
            d.setDate(d.getDate() + n);
            return key(d);
        };
        return { today: offset(0), plus1: offset(1), plus2: offset(2), plus9: offset(9) };
    });
}

const openTasks = (tasks, text) => tasks.filter(t => t.text === text && !t.completed);

module.exports = async ({ app, check }) => [
    await check("outcome: repeat is chosen in the form and survives a reload", async () => {
        const session = await app.open({ storage: {} });
        const { page } = session;
        try {
            const keys = await dateKeys(page);
            await page.fill("#task-input", "日報");
            await page.fill("#due-input", keys.today);
            await page.selectOption("#repeat-input", "daily");
            await page.click("#todo-form button[type=submit]");
            let task = (await session.readStorage(KEY)).find(t => t.text === "日報");
            assert.equal(task && task.repeat, "daily", "repeat not saved from the form");
            assert.equal(await page.inputValue("#repeat-input"), "", "repeat select not reset after adding");

            await page.reload();
            assert.match((await page.textContent(`li[data-id="${task.id}"] .task-repeat`)) || "", /毎日/, ".task-repeat does not show 毎日 after reload");
            // Any save after a reload rewrites storage from memory, so a field the
            // loader drops is lost here.
            await page.click(`li[data-id="${task.id}"] .important-button`);
            task = (await session.readStorage(KEY)).find(t => t.id === task.id);
            assert.equal(task.repeat, "daily", "repeat lost after reload and save");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: completing a daily task adds the next one once", async () => {
        const probe = await app.open();
        const keys = await dateKeys(probe.page);
        await probe.close();
        const session = await app.open({ storage: { [KEY]: [{ ...base, id: "d", text: "日報", dueDate: keys.today, repeat: "daily" }] } });
        const { page } = session;
        try {
            await page.check('li[data-id="d"] .task-toggle');
            let tasks = await session.readStorage(KEY);
            assert.ok(tasks.find(t => t.id === "d").completed, "original not completed");
            const next = openTasks(tasks, "日報");
            assert.equal(next.length, 1, `expected 1 next task, got ${next.length}`);
            assert.equal(next[0].dueDate, keys.plus1, "next due date");
            assert.equal(next[0].repeat, "daily", "next task lost repeat");

            await page.uncheck('li[data-id="d"] .task-toggle');
            await page.check('li[data-id="d"] .task-toggle');
            tasks = await session.readStorage(KEY);
            assert.equal(openTasks(tasks, "日報").length, 1, "re-completing added another next task");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: weekly keeps importance; no due date counts from today", async () => {
        const probe = await app.open();
        const keys = await dateKeys(probe.page);
        await probe.close();
        const session = await app.open({
            storage: {
                [KEY]: [
                    { ...base, id: "w", text: "週報", dueDate: keys.plus2, repeat: "weekly", important: true },
                    { ...base, id: "n", text: "水やり", repeat: "daily", createdAt: 1700000001000 }
                ]
            }
        });
        const { page } = session;
        try {
            await page.check('li[data-id="w"] .task-toggle');
            await page.check('li[data-id="n"] .task-toggle');
            const tasks = await session.readStorage(KEY);
            const weekly = openTasks(tasks, "週報");
            assert.equal(weekly.length, 1, "weekly next task missing");
            assert.equal(weekly[0].dueDate, keys.plus9, "weekly next due date");
            assert.equal(weekly[0].important, true, "weekly next task lost importance");
            const noDue = openTasks(tasks, "水やり");
            assert.equal(noDue.length, 1, "next task for a task without due date missing");
            assert.equal(noDue[0].dueDate, keys.plus1, "a task without due date should count from today");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: repeat survives backup export and restore", async () => {
        const session = await app.open({ storage: { [KEY]: [{ ...base, id: "e", text: "掃除", repeat: "weekly" }] } });
        const { page } = session;
        try {
            const download = page.waitForEvent("download");
            await page.click("#export-button");
            const file = await (await download).path();
            const exported = JSON.parse(require("node:fs").readFileSync(file, "utf8"));
            assert.equal(exported.tasks.find(t => t.id === "e").repeat, "weekly", "export dropped repeat");

            await page.evaluate(() => localStorage.clear());
            await page.reload();
            const dialog = page.waitForEvent("dialog");
            await page.setInputFiles("#import-input", {
                name: "backup.json",
                mimeType: "application/json",
                buffer: Buffer.from(JSON.stringify({ tasks: [{ ...base, id: "r", text: "洗濯", repeat: "daily" }], archive: [] }))
            });
            await dialog;
            const restored = (await session.readStorage(KEY)).find(t => t.id === "r");
            assert.equal(restored && restored.repeat, "daily", "restore dropped repeat");
        } finally {
            await session.close();
        }
    })
];
