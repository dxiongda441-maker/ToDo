const assert = require("node:assert/strict");

const task = (id, text, createdAt) => ({ id, text, completed: false, createdAt, completedAt: null, dueDate: "", important: false });
const seed = { "todo.tasks.v1": [task("a", "買い物", 1700000000000), task("b", "掃除", 1700000001000)], "todo.archive.v1": [] };

module.exports = async ({ app, check }) => [
    await check("outcome: draft survives starring and checking another task", async () => {
        const session = await app.open({ storage: seed });
        const { page } = session;
        try {
            await page.click('li[data-id="a"] .edit-button');
            await page.fill(".edit-text", "買い物（牛乳）");
            await page.fill(".edit-due", "2030-01-15");
            await page.click('li[data-id="b"] .important-button');
            assert.equal(await page.inputValue(".edit-text"), "買い物（牛乳）", "text reset after starring another task");
            assert.equal(await page.inputValue(".edit-due"), "2030-01-15", "due date reset after starring another task");
            await page.check('li[data-id="b"] .task-toggle');
            assert.equal(await page.inputValue(".edit-text"), "買い物（牛乳）", "text reset after checking another task");

            await page.click(".save-button");
            const saved = (await session.readStorage("todo.tasks.v1")).find(t => t.id === "a");
            assert.equal(saved.text, "買い物（牛乳）", "save did not persist the draft text");
            assert.equal(saved.dueDate, "2030-01-15", "save did not persist the draft due date");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: cancel discards the draft", async () => {
        const session = await app.open({ storage: seed });
        const { page } = session;
        try {
            await page.click('li[data-id="a"] .edit-button');
            await page.fill(".edit-text", "捨てる下書き");
            await page.click(".cancel-button");
            await page.click('li[data-id="a"] .edit-button');
            assert.equal(await page.inputValue(".edit-text"), "買い物", "cancelled draft shown when editing again");
            await page.keyboard.press("Escape");
            assert.equal(await page.locator(".edit-text").count(), 0, "Escape no longer closes the editor");
        } finally {
            await session.close();
        }
    })
];
