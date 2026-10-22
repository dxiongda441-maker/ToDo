import { test } from "node:test";
import assert from "node:assert/strict";

import { MigrationError, SCHEMA_VERSION, migrate } from "../src/migrations.js";
import {
    PREMIGRATION_PREFIX,
    SAVE_KEY,
    createEmptySave,
    ensureSubjects,
    exportSave,
    loadSave,
    loadSettings,
    parseImport,
    persistSave,
    saveSettings
} from "../src/store.js";
import { SUBJECTS } from "../src/content/index.js";
import { MemoryStorage } from "./memory-storage.js";

test("初回はまっさらなセーブデータを作る", () => {
    const { save, status, readOnly } = loadSave(new MemoryStorage());
    assert.equal(status, "new");
    assert.equal(readOnly, false);
    assert.equal(save.schemaVersion, SCHEMA_VERSION);
});

test("保存したデータをそのまま読み込める", () => {
    const storage = new MemoryStorage();
    const save = ensureSubjects(createEmptySave(), SUBJECTS);
    save.profile.name = "テスト";
    persistSave(storage, save);
    const loaded = loadSave(storage);
    assert.equal(loaded.status, "ok");
    assert.equal(loaded.save.profile.name, "テスト");
    assert.ok(loaded.save.subjects.fe);
});

test("ensureSubjects は既存の記録を変えずに足りない科目・トピックだけ追加する", () => {
    const save = ensureSubjects(createEmptySave(), SUBJECTS.slice(0, 1));
    save.subjects.fe.dailyQuota = 99;
    save.topics["fe.algo"].attempts = 5;
    ensureSubjects(save, SUBJECTS);
    assert.equal(save.subjects.fe.dailyQuota, 99);
    assert.equal(save.topics["fe.algo"].attempts, 5);
    assert.ok(save.subjects.wine);
    assert.ok(save.topics["wine.grapes"]);
});

test("FE は期限付きの目標、ワインは目標なし（探索）で始まる", () => {
    const now = new Date(2026, 9, 22).getTime();
    const save = ensureSubjects(createEmptySave(now), SUBJECTS, now);
    assert.equal(save.subjects.fe.goal.targetDate, "2027-02-19");
    assert.equal(save.subjects.wine.goal.title, null);
    assert.equal(save.subjects.python.goal.targetDate, null);
});

test("壊れた JSON は上書きしないよう読み取り専用で返す", () => {
    const storage = new MemoryStorage({ [SAVE_KEY]: "{oops" });
    const result = loadSave(storage);
    assert.equal(result.status, "error");
    assert.equal(result.readOnly, true);
    assert.equal(storage.getItem(SAVE_KEY), "{oops");
});

test("アプリより新しいバージョンのデータは読み取り専用で返す", () => {
    const newer = { ...createEmptySave(), schemaVersion: SCHEMA_VERSION + 1 };
    const storage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(newer) });
    const result = loadSave(storage);
    assert.equal(result.status, "error");
    assert.equal(result.readOnly, true);
    assert.match(result.message, /新しいバージョン/);
});

test("エクスポートしたバックアップを読み込める（API キーは含まれない）", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { apiKey: "sk-ant-secret", useAi: true });
    const save = ensureSubjects(createEmptySave(), SUBJECTS);
    save.attempts.push({ id: "a1", qid: "fe.theory.001", score: 1 });
    const text = exportSave(save);
    assert.ok(!text.includes("sk-ant-secret"));
    const { save: imported } = parseImport(text);
    assert.deepEqual(imported, save);
    assert.equal(loadSettings(storage).apiKey, "sk-ant-secret");
});

test("バックアップでない JSON は読み込みを拒否する", () => {
    assert.throws(() => parseImport("[1,2,3]"), MigrationError);
    assert.throws(() => parseImport("not json"), MigrationError);
    assert.throws(() => parseImport(JSON.stringify({ schemaVersion: 1 })), /subjects/);
});

// ── 移行（マイグレーション）の仕組み ──

const fakeMigrations = {
    1: data => ({ ...data, schemaVersion: 2, profile: { ...data.profile, timezone: "Asia/Tokyo" } }),
    2: data => {
        const { daily, ...rest } = data;
        return { ...rest, schemaVersion: 3, history: { daily } };
    }
};

test("移行は 1 段ずつ順番に適用され、元データは変更しない", () => {
    const original = createEmptySave();
    original.daily["2026-10-22"] = { fe: { answered: 3 } };
    const snapshot = JSON.stringify(original);
    const { data, from, steps } = migrate(original, { migrations: fakeMigrations, target: 3 });
    assert.equal(from, 1);
    assert.deepEqual(steps, ["v1→v2", "v2→v3"]);
    assert.equal(data.schemaVersion, 3);
    assert.equal(data.profile.timezone, "Asia/Tokyo");
    assert.equal(data.history.daily["2026-10-22"].fe.answered, 3);
    assert.equal(JSON.stringify(original), snapshot);
});

test("移行処理が欠けている・バージョンを上げ忘れたときはエラー", () => {
    assert.throws(() => migrate(createEmptySave(), { migrations: {}, target: 2 }), /見つかりません/);
    const broken = { 1: data => ({ ...data }) };
    assert.throws(() => migrate(createEmptySave(), { migrations: broken, target: 2 }), /schemaVersion/);
});

test("現在のバージョンまでの移行関数がすべて揃っている", async () => {
    const { MIGRATIONS } = await import("../src/migrations.js");
    for (let version = 1; version < SCHEMA_VERSION; version += 1) {
        assert.equal(typeof MIGRATIONS[version], "function", `v${version} からの移行がありません`);
    }
});

test("読み込み時に移行したら、移行前のデータを別キーに退避してから書き換える", () => {
    const v1 = JSON.stringify(createEmptySave());
    const storage = new MemoryStorage({ [SAVE_KEY]: v1 });
    const result = loadSave(storage, Date.now(), { migrations: fakeMigrations, target: 3 });
    assert.equal(result.status, "migrated");
    assert.equal(storage.getItem(`${PREMIGRATION_PREFIX}1`), v1);
    const stored = JSON.parse(storage.getItem(SAVE_KEY));
    assert.equal(stored.schemaVersion, 3);
    assert.equal(stored.meta.migratedFrom, 1);
});
