// セーブデータの読み書き・エクスポート・インポート。
//
// アプリ本体（コードと問題バンク）とセーブデータ（利用者の学習記録）は分けて保存する:
//   - アプリ本体   : リポジトリ内のファイル（更新で置き換わる）
//   - セーブデータ : localStorage の SAVE_KEY（バージョン番号付き、更新時は移行）
//   - 端末設定     : localStorage の SETTINGS_KEY（API キーなど。エクスポートに含めない）

import { MigrationError, SCHEMA_VERSION, migrate } from "./migrations.js";
import { toDateKey } from "./util.js";

export const SAVE_KEY = "gakushu.save";
export const SETTINGS_KEY = "gakushu.settings";
export const PREMIGRATION_PREFIX = "gakushu.save.premigration.v";
export const EXPORT_FORMAT = "gakushu-backup";
const MAX_ATTEMPTS = 20000;

export function createEmptySave(now = Date.now()) {
    return {
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
        profile: { name: "" },
        subjects: {},
        topics: {},
        items: {},
        attempts: [],
        tests: [],
        daily: {},
        aiQuestions: {},
        meta: { lastExportAt: null, migratedFrom: null }
    };
}

/**
 * 問題バンク側で科目やトピックが増えたときに、セーブデータに足りない枠を追加する。
 * 既存の記録は変更しない（スキーマ変更ではないので移行は不要）。
 */
export function ensureSubjects(save, subjects, now = Date.now()) {
    for (const subject of subjects) {
        if (!save.subjects[subject.id]) {
            const goal = subject.defaultGoal || {};
            save.subjects[subject.id] = {
                enabled: true,
                dailyQuota: subject.defaultDailyQuota ?? 10,
                goal: {
                    title: goal.title ?? null,
                    targetDate: goal.targetDateOffsetDays
                        ? toDateKey(now + goal.targetDateOffsetDays * 86400000)
                        : null,
                    startDate: toDateKey(now),
                    presetId: goal.presetId ?? null
                }
            };
        }
        for (const topic of subject.topics) {
            if (!save.topics[topic.id]) {
                save.topics[topic.id] = { ability: null, attempts: 0, scoreSum: 0, lastAt: null };
            }
        }
    }
    return save;
}

/**
 * localStorage からセーブデータを読む。
 * 戻り値の status: "new" | "ok" | "migrated" | "error"
 * error のときは既存データを上書きしないよう readOnly: true を返す。
 */
export function loadSave(storage, now = Date.now(), migrationOptions = undefined) {
    let raw = null;
    try {
        raw = storage.getItem(SAVE_KEY);
    } catch (error) {
        return { save: createEmptySave(now), status: "error", readOnly: true, message: String(error) };
    }
    if (!raw) {
        return { save: createEmptySave(now), status: "new", readOnly: false };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (_error) {
        return {
            save: createEmptySave(now),
            status: "error",
            readOnly: true,
            message: "セーブデータが壊れています。設定画面から「生データを書き出す」で退避してください。"
        };
    }

    try {
        const { data, from, steps } = migrate(parsed, migrationOptions);
        if (steps.length > 0) {
            // 移行前の状態を必ず残してから書き換える
            storage.setItem(`${PREMIGRATION_PREFIX}${from}`, raw);
            data.meta = { ...(data.meta || {}), migratedFrom: from };
            storage.setItem(SAVE_KEY, JSON.stringify(data));
            return { save: data, status: "migrated", readOnly: false, steps };
        }
        return { save: data, status: "ok", readOnly: false };
    } catch (error) {
        const message = error instanceof MigrationError ? error.message : String(error);
        return { save: createEmptySave(now), status: "error", readOnly: true, message };
    }
}

export function persistSave(storage, save, now = Date.now()) {
    save.updatedAt = now;
    if (save.attempts.length > MAX_ATTEMPTS) {
        // 古い解答ログだけを間引く（集計値は topics / items / daily に残っている）
        save.attempts = save.attempts.slice(-MAX_ATTEMPTS);
    }
    storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function readRawSave(storage) {
    return storage.getItem(SAVE_KEY);
}

/** バックアップ用 JSON。API キーなどの端末設定は含めない。 */
export function exportSave(save, now = Date.now()) {
    return JSON.stringify(
        {
            format: EXPORT_FORMAT,
            exportedAt: new Date(now).toISOString(),
            schemaVersion: save.schemaVersion,
            data: save
        },
        null,
        2
    );
}

/** バックアップ JSON を読み込み、現在のスキーマまで移行したセーブデータを返す。 */
export function parseImport(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (_error) {
        throw new MigrationError("JSON として読み込めませんでした");
    }
    const data = parsed && parsed.format === EXPORT_FORMAT ? parsed.data : parsed;
    const { data: migrated, steps } = migrate(data);
    for (const key of ["subjects", "topics", "items", "attempts", "daily"]) {
        if (!(key in migrated)) {
            throw new MigrationError(`バックアップに ${key} がありません`);
        }
    }
    return { save: migrated, steps };
}

export function backupFileName(now = Date.now()) {
    return `gakushu-backup-${toDateKey(now).replaceAll("-", "")}.json`;
}

const DEFAULT_SETTINGS = {
    apiKey: "",
    model: "claude-opus-5-5",
    useAi: false
};

export function loadSettings(storage) {
    try {
        const raw = storage.getItem(SETTINGS_KEY);
        return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch (_error) {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(storage, settings) {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
