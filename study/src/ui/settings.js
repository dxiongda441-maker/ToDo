// 設定: AI（Claude API）、科目の有効・無効、バックアップ（JSON の書き出し・読み込み）。

import { MODELS, testConnection } from "../ai.js";
import { SUBJECTS } from "../content/index.js";
import { SCHEMA_VERSION } from "../migrations.js";
import { SAVE_KEY, backupFileName, ensureSubjects, exportSave, parseImport, readRawSave } from "../store.js";
import { append, downloadText, formatDateTime, h, toast } from "./dom.js";

const BEFORE_IMPORT_KEY = "gakushu.save.beforeimport";

function aiSection(app) {
    const s = app.settings;
    const enabled = h("input", { type: "checkbox", id: "ai-enabled", checked: s.useAi });
    const key = h("input", { type: "password", id: "ai-key", value: s.apiKey, placeholder: "sk-ant-...", autocomplete: "off", spellcheck: "false" });
    const model = h("select", { id: "ai-model" }, MODELS.map(m => h("option", { value: m.id, selected: m.id === s.model }, m.label)));
    const status = h("p", { class: "muted", "aria-live": "polite" });

    const save = () => {
        app.saveSettings({ useAi: enabled.checked, apiKey: key.value.trim(), model: model.value });
    };
    const testButton = h("button", { class: "btn", type: "button" }, "接続テスト");
    testButton.addEventListener("click", async () => {
        save();
        testButton.disabled = true;
        status.textContent = "確認しています…";
        try {
            await testConnection(app.settings);
            status.textContent = "接続できました。";
        } catch (error) {
            status.textContent = error.message;
        } finally {
            testButton.disabled = false;
        }
    });

    return h("form", { class: "card form", onsubmit: event => { event.preventDefault(); save(); toast("AI の設定を保存しました"); } },
        h("h2", { class: "section-title" }, "AI（Claude）で問題作成と採点"),
        h("p", {}, "API キーを登録すると、理解度に合わせて AI が新しい問題を作り、記述式（白紙）の解答を採点・添削します。キーがなくても問題集だけで学習できます。"),
        h("label", { class: "checkbox" }, enabled, " AI を使う"),
        h("div", { class: "field" },
            h("label", { for: "ai-key" }, "Claude API キー"), key,
            h("p", { class: "hint" },
                "キーは Anthropic Console (console.anthropic.com) で発行します。利用料はキーの持ち主に請求されます。",
                "キーはこの端末のブラウザにだけ保存され、バックアップには含まれません。共有の端末では使わないでください。")),
        h("div", { class: "field" }, h("label", { for: "ai-model" }, "モデル"), model),
        h("div", { class: "actions" }, h("button", { class: "btn btn--primary", type: "submit" }, "保存"), testButton),
        status);
}

function subjectSection(app) {
    return h("section", { class: "card" },
        h("h2", { class: "section-title" }, "科目"),
        h("p", { class: "muted" }, "使わない科目は非表示にできます（記録は消えません）。"),
        h("ul", { class: "toggle-list" }, SUBJECTS.map(subject => {
            const state = app.save.subjects[subject.id];
            const box = h("input", { type: "checkbox", checked: state.enabled !== false, id: `subject-${subject.id}` });
            box.addEventListener("change", () => {
                state.enabled = box.checked;
                app.commit();
            });
            return h("li", {}, h("label", { class: "checkbox", for: `subject-${subject.id}` }, box, ` ${subject.icon} ${subject.name}`));
        })));
}

function backupSection(app) {
    const save = app.save;
    const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", id: "import-file" });
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        try {
            const { save: imported, steps } = parseImport(await file.text());
            const answered = imported.attempts.length;
            if (!confirm(`バックアップ（解答 ${answered} 件）を読み込み、今のデータと置き換えます。今のデータは端末内に 1 つ前の状態として退避します。よろしいですか？`)) return;
            const current = readRawSave(app.storage);
            if (current) app.storage.setItem(BEFORE_IMPORT_KEY, current);
            app.save = ensureSubjects(imported, SUBJECTS);
            app.readOnly = false;
            app.loadResult = { status: "ok" };
            app.commit();
            toast(steps.length ? `読み込みました（${steps.join("、")} の移行を行いました）` : "読み込みました");
            app.rerender();
        } catch (error) {
            toast(error.message, "error");
        }
    });

    const exportButton = h("button", { class: "btn btn--primary", type: "button" }, "バックアップを書き出す（JSON）");
    exportButton.addEventListener("click", () => {
        const now = Date.now();
        downloadText(backupFileName(now), exportSave(save, now));
        save.meta.lastExportAt = now;
        app.commit();
        toast("バックアップを書き出しました。クラウドドライブなど端末の外に保存してください");
        app.rerender();
    });

    const rawButton = h("button", { class: "btn", type: "button" }, "生データを書き出す");
    rawButton.addEventListener("click", () => {
        downloadText(`gakushu-raw-${Date.now()}.json`, readRawSave(app.storage) || "");
    });

    const bytes = new Blob([readRawSave(app.storage) || ""]).size;
    return h("section", { class: "card" },
        h("h2", { class: "section-title" }, "バックアップ"),
        h("p", {}, "学習記録（セーブデータ）はアプリ本体とは別に、このブラウザの中に保存されています。ブラウザのデータ消去や端末の故障に備えて、定期的に書き出して端末の外（Google ドライブ・iCloud など）に保存してください。"),
        h("dl", { class: "facts" },
            h("dt", {}, "最後のバックアップ"), h("dd", {}, save.meta.lastExportAt ? formatDateTime(save.meta.lastExportAt) : "まだありません"),
            h("dt", {}, "データ形式のバージョン"), h("dd", {}, `v${save.schemaVersion}（アプリ対応: v${SCHEMA_VERSION}）`),
            h("dt", {}, "記録"), h("dd", {}, `解答 ${save.attempts.length} 件・AI 問題 ${Object.keys(save.aiQuestions).length} 問・約 ${(bytes / 1024).toFixed(1)} KB`)),
        h("div", { class: "actions" },
            app.readOnly ? rawButton : exportButton,
            h("label", { class: "btn", for: "import-file" }, "バックアップを読み込む"),
            fileInput),
        h("p", { class: "hint" }, "古いバージョンで書き出したバックアップも、読み込むときに自動で今の形式へ移行されます。"));
}

function dangerSection(app) {
    const button = h("button", { class: "btn btn--danger", type: "button" }, "すべての学習記録を消去");
    button.addEventListener("click", () => {
        if (!confirm("すべての学習記録を消去します。先にバックアップを書き出しましたか？")) return;
        if (!confirm("本当に消去しますか？この操作は取り消せません。")) return;
        const current = readRawSave(app.storage);
        if (current) app.storage.setItem(BEFORE_IMPORT_KEY, current);
        app.storage.removeItem(SAVE_KEY);
        location.reload();
    });
    return h("section", { class: "card card--danger" },
        h("h2", { class: "section-title" }, "データの消去"),
        h("p", { class: "muted" }, "消去の直前の状態は、念のため端末内に 1 つだけ退避されます。"),
        button);
}

export function renderSettings(app, root) {
    append(root, [
        h("h1", { class: "page-title" }, "設定"),
        aiSection(app),
        subjectSection(app),
        backupSection(app),
        dangerSection(app)]);
}
