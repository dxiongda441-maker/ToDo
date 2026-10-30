const assert = require("node:assert/strict");

module.exports = async ({ app, check }) => [
    await check("outcome: today filter shows open tasks due today or overdue", async () => {
        // Date keys come from the browser so they match the app's local-time logic.
        const probe = await app.open();
        const keys = await probe.page.evaluate(() => {
            const key = offset => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            };
            return { yesterday: key(-1), today: key(0), tomorrow: key(1) };
        });
        await probe.close();

        const task = (id, text, dueDate, completed = false) => ({ id, text, completed, createdAt: 1700000000000 + Number(id), completedAt: completed ? 1700000009000 : null, dueDate, important: false });
        const session = await app.open({
            storage: {
                "todo.tasks.v1": [
                    task("1", "期限切れ", keys.yesterday),
                    task("2", "今日まで", keys.today),
                    task("3", "明日まで", keys.tomorrow),
                    task("4", "期限なし", ""),
                    task("5", "完了済み", keys.today, true)
                ],
                "todo.archive.v1": []
            }
        });
        const { page } = session;
        try {
            const button = page.locator('.filter-button[data-filter="today"]');
            assert.equal(await button.count(), 1, "no .filter-button[data-filter=today]");
            assert.equal((await button.textContent()).trim(), "今日");
            await button.click();
            assert.deepEqual([...await session.visibleTaskTexts()].sort(), ["今日まで", "期限切れ"].sort());
            assert.ok(await button.evaluate(el => el.classList.contains("active")), "today button not active");
            const allActive = await page.locator('.filter-button[data-filter="all"]').evaluate(el => el.classList.contains("active"));
            assert.ok(!allActive, "すべて still active");
            await page.click('.filter-button[data-filter="all"]');
            assert.equal((await session.visibleTaskTexts()).length, 5, "すべて no longer shows every task");
            assert.deepEqual(session.errors, [], session.errors.join(" | "));
        } finally {
            await session.close();
        }
    }),
    await check("outcome: filter buttons fit a phone-width viewport", async () => {
        const session = await app.open();
        const { page } = session;
        try {
            await page.setViewportSize({ width: 360, height: 740 });
            const boxes = await page.locator(".filter-button").evaluateAll(els => els.map(el => el.getBoundingClientRect().right));
            assert.ok(boxes.length >= 4, "expected 4 filter buttons");
            assert.ok(Math.max(...boxes) <= 360, `filter button overflows: right=${Math.max(...boxes)}`);
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(scrollWidth <= 360, `page scrolls horizontally: ${scrollWidth}px`);
        } finally {
            await session.close();
        }
    })
];
