const assert = require("node:assert/strict");

const TASKS = "todo.tasks.v1";
const ARCHIVE = "todo.archive.v1";
const task = (id, text, extra = {}) => ({ id, text, completed: false, createdAt: 1700000000000, completedAt: null, dueDate: "", important: false, ...extra });
const seed = () => ({
    [TASKS]: [
        task("a", "牛乳を買う", { important: true, dueDate: "2031-05-20", createdAt: 1700000001000 }),
        task("b", "部屋の掃除", { completed: true, completedAt: 1700000009000, createdAt: 1700000002000 })
    ],
    [ARCHIVE]: []
});
const ids = list => (list || []).map(item => item.id).sort();
const FIELDS = ["id", "text", "completed", "dueDate", "important", "createdAt"];
const pick = item => Object.fromEntries(FIELDS.map(key => [key, item[key]]));

module.exports = async ({ app, check }) => [
    await check("outcome: undo restores the task and removes the archive record", async () => {
        const session = await app.open({ storage: seed(), clock: true });
        const { page } = session;
        try {
            await page.click('li[data-id="a"] .delete-button');
            assert.ok(await page.isVisible("#undo-toast"), "#undo-toast not visible after deleting");
            assert.match(await page.textContent("#undo-toast"), /「牛乳を買う」を削除しました/, "toast message");
            assert.equal((await page.textContent("#undo-button")).trim(), "元に戻す");
            await page.click("#undo-button");

            const restored = (await session.readStorage(TASKS)).find(item => item.id === "a");
            assert.ok(restored, "task not restored in storage");
            assert.deepEqual(pick(restored), pick(seed()[TASKS][0]), "restored task differs from the deleted one");
            assert.deepEqual(ids(await session.readStorage(ARCHIVE)), [], "deletion record still in the archive");
            assert.ok((await session.visibleTaskTexts()).includes("牛乳を買う"), "restored task not shown");
            assert.ok(!(await page.isVisible("#undo-toast")), "toast still visible after undo");
            assert.deepEqual(session.errors, [], session.errors.join(" | "));
        } finally {
            await session.close();
        }
    }),
    await check("outcome: after 5 seconds the toast closes and the delete stays", async () => {
        const session = await app.open({ storage: seed(), clock: true });
        const { page } = session;
        try {
            await page.click('li[data-id="b"] .delete-button');
            assert.ok(await page.isVisible("#undo-toast"), "#undo-toast not visible after deleting");
            await page.clock.runFor(4000);
            assert.ok(await page.isVisible("#undo-toast"), "toast closed before 5 seconds");
            await page.clock.runFor(1500);
            assert.ok(!(await page.isVisible("#undo-toast")), "toast still visible after 5 seconds");
            assert.deepEqual(ids(await session.readStorage(TASKS)), ["a"], "deleted task came back");
            assert.deepEqual(ids(await session.readStorage(ARCHIVE)), ["b"], "deletion not recorded in the archive");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: a second delete restarts the timer and undo restores the last one", async () => {
        const session = await app.open({ storage: seed(), clock: true });
        const { page } = session;
        try {
            await page.click('li[data-id="a"] .delete-button');
            await page.clock.runFor(3000);
            await page.click('li[data-id="b"] .delete-button');
            await page.clock.runFor(3000);
            assert.ok(await page.isVisible("#undo-toast"), "the first delete's timer closed the second delete's toast");
            assert.match(await page.textContent("#undo-toast"), /部屋の掃除/, "toast does not name the last deleted task");
            await page.click("#undo-button");
            assert.deepEqual(ids(await session.readStorage(TASKS)), ["b"], "undo should restore only the last deleted task");
            assert.deepEqual(ids(await session.readStorage(ARCHIVE)), ["a"], "archive should keep only the first deletion");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: toast fits a phone-width viewport", async () => {
        const session = await app.open({ storage: seed(), clock: true });
        const { page } = session;
        try {
            await page.setViewportSize({ width: 360, height: 740 });
            await page.click('li[data-id="a"] .delete-button');
            const box = await page.locator("#undo-toast").boundingBox();
            assert.ok(box && box.x >= 0 && box.x + box.width <= 360, `toast overflows: ${JSON.stringify(box)}`);
        } finally {
            await session.close();
        }
    })
];
