// セーブデータのスキーマ移行。
//
// ルール（設計図より「更新時は消して作り直すのではなく移行する」）:
//   1. セーブデータの形を変えるときは SCHEMA_VERSION を 1 つ上げる。
//   2. MIGRATIONS[旧バージョン] に「旧 → 旧+1」へ変換する関数を追加する。
//      既存のフィールドは消さずに変換し、新フィールドには既定値を入れる。
//   3. 一度リリースした移行関数は書き換えない（古いバックアップを読み込めなくなるため）。
//   4. tests/migrations.test.js に、旧バージョンのサンプルからの移行テストを追加する。
//
// 例（v1 → v2 で profile.timezone を追加する場合）:
//   1: data => ({ ...data, schemaVersion: 2, profile: { ...data.profile, timezone: "Asia/Tokyo" } }),

export const SCHEMA_VERSION = 1;

export const MIGRATIONS = {
    // まだ移行はない（v1 が最初のバージョン）
};

export class MigrationError extends Error {}

/**
 * data を target バージョンまで 1 段ずつ移行する。
 * 移行関数には複製を渡すので、元の data は変更されない。
 */
export function migrate(data, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
    if (!data || typeof data !== "object") {
        throw new MigrationError("セーブデータの形式が正しくありません");
    }
    const from = data.schemaVersion;
    if (!Number.isInteger(from) || from < 1) {
        throw new MigrationError("schemaVersion がありません");
    }
    if (from > target) {
        throw new MigrationError(
            `このセーブデータ (v${from}) はアプリ (v${target}) より新しいバージョンで作成されています。アプリを更新してください。`
        );
    }

    let current = JSON.parse(JSON.stringify(data));
    const steps = [];
    while (current.schemaVersion < target) {
        const version = current.schemaVersion;
        const step = migrations[version];
        if (typeof step !== "function") {
            throw new MigrationError(`v${version} からの移行処理が見つかりません`);
        }
        const next = step(current);
        if (!next || next.schemaVersion !== version + 1) {
            throw new MigrationError(`v${version} からの移行処理が schemaVersion を ${version + 1} にしていません`);
        }
        steps.push(`v${version}→v${version + 1}`);
        current = next;
    }
    return { data: current, from, steps };
}
