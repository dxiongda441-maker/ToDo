// アプリの起動と画面切り替え。

import { SUBJECTS, getSubject } from "./content/index.js";
import { ensureSubjects, loadSave, loadSettings, persistSave, saveSettings } from "./store.js";
import { clear, h, toast } from "./ui/dom.js";
import { renderHome } from "./ui/home.js";
import { renderStudy } from "./ui/study.js";
import { renderPlan } from "./ui/plan.js";
import { renderProgress } from "./ui/progress.js";
import { renderSettings } from "./ui/settings.js";
import { renderHelp } from "./ui/help.js";

const ROUTES = {
    home: { title: "ホーム", render: renderHome },
    study: { title: "学習", render: renderStudy },
    plan: { title: "計画", render: renderPlan },
    progress: { title: "成長記録", render: renderProgress },
    settings: { title: "設定", render: renderSettings },
    help: { title: "使い方", render: renderHelp }
};

function createApp(storage) {
    const loaded = loadSave(storage);
    const app = {
        storage,
        save: ensureSubjects(loaded.save, SUBJECTS),
        loadResult: loaded,
        readOnly: loaded.readOnly,
        settings: loadSettings(storage),

        /** セーブデータを保存する。読み取り専用（読み込みに失敗した）ときは既存データを守るため保存しない */
        commit() {
            if (app.readOnly) return false;
            try {
                persistSave(storage, app.save);
                return true;
            } catch (error) {
                toast(`保存できませんでした: ${error.message}`, "error");
                return false;
            }
        },
        saveSettings(next) {
            app.settings = { ...app.settings, ...next };
            saveSettings(storage, app.settings);
        },
        subjects() {
            return SUBJECTS.filter(subject => app.save.subjects[subject.id]?.enabled !== false);
        },
        getSubject,
        /** 出題候補 = 問題バンク + この利用者のために AI が作った問題 */
        questionsFor(subjectId) {
            const subject = getSubject(subjectId);
            const ai = Object.values(app.save.aiQuestions).filter(q => q.subject === subjectId);
            return [...subject.questions, ...ai];
        },
        navigate(route, params = {}) {
            const query = new URLSearchParams(params).toString();
            location.hash = `#/${route}${query ? `?${query}` : ""}`;
        },
        rerender() {
            render();
        }
    };
    if (loaded.status !== "error") app.commit();
    return app;
}

let app;

function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    const route = ROUTES[path] ? path : "home";
    return { route, params: Object.fromEntries(new URLSearchParams(query)) };
}

function render() {
    const { route, params } = parseHash();
    const view = document.querySelector("#view");
    clear(view);
    document.querySelectorAll(".nav__link").forEach(link => {
        const active = link.dataset.route === route;
        link.classList.toggle("nav__link--active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    document.title = `${ROUTES[route].title} | まなびログ`;
    try {
        ROUTES[route].render(app, view, params);
    } catch (error) {
        console.error(error);
        view.append(h("div", { class: "banner banner--error" }, `画面の表示中にエラーが発生しました: ${error.message}`));
    }
    view.focus({ preventScroll: true });
}

function start() {
    app = createApp(window.localStorage);
    window.addEventListener("hashchange", render);
    render();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
}

start();
