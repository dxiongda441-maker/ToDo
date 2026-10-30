const assert = require("node:assert/strict");

const task = (id, text, extra = {}) => ({ id, text, completed: false, createdAt: 1700000000000, completedAt: null, dueDate: "", important: false, ...extra });
const archived = (id, text) => ({ ...task(id, text), deletedAt: 1700000500000, reason: "deleted" });

async function importBackup(session, payload) {
    await session.page.setInputFiles("#import-input", {
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(payload))
    });
    await session.page.waitForTimeout(300);
}

async function ids(session) {
    const tasks = (await session.readStorage("todo.tasks.v1")) || [];
    const archive = (await session.readStorage("todo.archive.v1")) || [];
    return { tasks: tasks.map(t => t.id).sort(), archive: archive.map(t => t.id).sort() };
}

module.exports = async ({ app, check }) => [
    await check("outcome: archived id is not restored into the list", async () => {
        const session = await app.open({ storage: { "todo.tasks.v1": [task("b", "残っているタスク")], "todo.archive.v1": [archived("a", "削除したタスク")] } });
        try {
            await importBackup(session, { tasks: [task("a", "削除したタスク"), task("b", "残っているタスク"), task("c", "新しいタスク")], archive: [] });
            assert.deepEqual(await ids(session), { tasks: ["b", "c"], archive: ["a"] });
        } finally {
            await session.close();
        }
    }),
    await check("outcome: live id is not added to the archive", async () => {
        const session = await app.open({ storage: { "todo.tasks.v1": [task("b", "残っているタスク")], "todo.archive.v1": [] } });
        try {
            await importBackup(session, { tasks: [], archive: [archived("b", "残っているタスク")] });
            assert.deepEqual(await ids(session), { tasks: ["b"], archive: [] });
        } finally {
            await session.close();
        }
    }),
    await check("outcome: duplicate id inside one file lands only once", async () => {
        const session = await app.open({ storage: { "todo.tasks.v1": [], "todo.archive.v1": [] } });
        try {
            await importBackup(session, { tasks: [task("d", "重複")], archive: [archived("d", "重複")] });
            const result = await ids(session);
            assert.equal(result.tasks.filter(id => id === "d").length + result.archive.filter(id => id === "d").length, 1, JSON.stringify(result));
        } finally {
            await session.close();
        }
    })
];
