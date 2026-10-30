const assert = require("node:assert/strict");

const task = (id, text, completed, createdAt) => ({ id, text, completed, createdAt, completedAt: completed ? createdAt + 1 : null, dueDate: "", important: false });
const seed = {
    "todo.tasks.v1": [task("1", "Buy milk", false, 1700000003000), task("2", "buy bread", true, 1700000002000), task("3", "掃除", false, 1700000001000)],
    "todo.archive.v1": []
};
const sorted = list => [...list].sort();

module.exports = async ({ app, check }) => [
    await check("outcome: search filters case-insensitively and combines with filters", async () => {
        const session = await app.open({ storage: seed });
        const { page } = session;
        try {
            assert.equal(await page.getAttribute("#search-input", "type"), "search", "#search-input must be type=search");
            await page.fill("#search-input", "BUY");
            assert.deepEqual(sorted(await session.visibleTaskTexts()), ["Buy milk", "buy bread"], "search BUY");
            await page.click('.filter-button[data-filter="active"]');
            assert.deepEqual(await session.visibleTaskTexts(), ["Buy milk"], "search BUY + 未完了");
            await page.click('.filter-button[data-filter="completed"]');
            assert.deepEqual(await session.visibleTaskTexts(), ["buy bread"], "search BUY + 完了");
            await page.click('.filter-button[data-filter="all"]');
            await page.fill("#search-input", "掃");
            assert.deepEqual(await session.visibleTaskTexts(), ["掃除"], "search 掃");
            await page.fill("#search-input", "");
            assert.equal((await session.visibleTaskTexts()).length, 3, "clearing search shows all tasks");
            assert.deepEqual(session.errors, [], session.errors.join(" | "));
        } finally {
            await session.close();
        }
    }),
    await check("outcome: no-match message is separate from the empty-list message", async () => {
        const session = await app.open({ storage: seed });
        const { page } = session;
        try {
            await page.fill("#search-input", "zzz");
            assert.deepEqual(await session.visibleTaskTexts(), [], "no tasks should match zzz");
            assert.ok(await page.isVisible("#search-empty"), "#search-empty not visible");
            assert.match(await page.textContent("#search-empty"), /該当するタスクはありません/);
            assert.ok(!(await page.isVisible("#empty-state")), "#empty-state shown although tasks exist");
            await page.fill("#search-input", "");
            assert.ok(!(await page.isVisible("#search-empty")), "#search-empty still visible after clearing");
        } finally {
            await session.close();
        }
    }),
    await check("outcome: fits a phone-width viewport", async () => {
        const session = await app.open({ storage: seed });
        const { page } = session;
        try {
            await page.setViewportSize({ width: 360, height: 740 });
            const box = await page.locator("#search-input").boundingBox();
            assert.ok(box && box.width > 0, "#search-input not rendered");
            assert.ok(box.x >= 0 && box.x + box.width <= 360, `search box overflows: x=${box.x} w=${box.width}`);
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(scrollWidth <= 360, `page scrolls horizontally: ${scrollWidth}px`);
        } finally {
            await session.close();
        }
    })
];
