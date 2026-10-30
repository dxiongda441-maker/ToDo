const assert = require("node:assert/strict");

module.exports = async ({ app, check }) => [
    await check("outcome: submit button reads 登録", async () => {
        const session = await app.open();
        try {
            assert.equal((await session.page.textContent("#todo-form button[type=submit]")).trim(), "登録");
        } finally {
            await session.close();
        }
    })
];
