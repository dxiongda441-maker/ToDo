const assert = require("node:assert/strict");

module.exports = async ({ check, agentResult }) => [
    await check("answer: names mergeById and explains id matching", async () => {
        const text = agentResult.finalText;
        assert.ok(text.trim(), "no final answer");
        assert.match(text, /mergeById/, "does not mention mergeById");
        assert.match(text, /\bid\b|ＩＤ|ID/i, "does not mention ids");
        assert.match(text, /履歴|アーカイブ|archive/i, "does not mention the archive");
    }),
    // The request asks for 3–5 sentences; sentences are counted by their
    // terminators, so the limit is checkable without judgement.
    await check("answer: 3–5 sentences as asked", async () => {
        const sentences = (agentResult.finalText.match(/[。！？]/g) || []).length;
        assert.ok(sentences >= 3 && sentences <= 5, `${sentences} sentences`);
    })
];
