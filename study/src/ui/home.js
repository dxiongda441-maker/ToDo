// ホーム（ダッシュボード）: 科目ごとの理解度・定着度・今日の進み具合。

import { abilityLabel, predictedExamScore, subjectRetention, subjectUnderstanding } from "../mastery.js";
import { todayPlan } from "../planner.js";
import { answeredToday, latestDiagnostic, streakDays } from "../progress.js";
import { topicName } from "../content/index.js";
import { DAY_MS } from "../util.js";
import { append, formatDateTime, h, meter, percent } from "./dom.js";

const BACKUP_REMIND_DAYS = 7;

export function statusBanners(app) {
    const banners = [];
    const { loadResult, save } = app;
    if (loadResult.status === "error") {
        banners.push(h("div", { class: "banner banner--error" },
            h("strong", {}, "セーブデータを読み込めませんでした。"),
            ` ${loadResult.message} 既存のデータを守るため、この状態では記録を保存しません。`,
            h("a", { href: "#/settings" }, "設定でデータを確認する")));
    } else if (loadResult.status === "migrated") {
        banners.push(h("div", { class: "banner banner--info" },
            `アプリの更新に合わせてセーブデータを移行しました（${loadResult.steps.join("、")}）。移行前のデータも端末内に残しています。`));
    }

    const hasRecords = save.attempts.length > 0;
    const last = save.meta.lastExportAt;
    if (hasRecords && (!last || Date.now() - last > BACKUP_REMIND_DAYS * DAY_MS)) {
        banners.push(h("div", { class: "banner banner--warn" },
            last ? `最後のバックアップから ${Math.floor((Date.now() - last) / DAY_MS)} 日たちました。` : "まだバックアップを取っていません。",
            " 学習記録はこの端末のブラウザにだけ保存されています。",
            h("a", { href: "#/settings" }, "バックアップする")));
    }
    return banners;
}

function subjectCard(app, subject) {
    const state = app.save.subjects[subject.id];
    const plan = todayPlan(app.save, subject);
    const { understanding, coverage } = subjectUnderstanding(app.save, subject);
    const { retention, dueCount, seenItems } = subjectRetention(app.save, subject.id);
    const predicted = predictedExamScore(app.save, subject);
    const done = answeredToday(app.save, subject.id);
    const quota = state.dailyQuota;
    const diagnostic = subject.diagnostic ? latestDiagnostic(app.save, subject.id) : null;
    const startDiagnostic = () => app.navigate("study", { subject: subject.id, mode: "diagnostic" });

    const goalLine = plan.mode === "explore"
        ? "目標未設定（まずは幅広く基礎から）"
        : plan.mode === "deadline"
            ? `${state.goal.title}・あと ${Math.max(0, plan.daysLeft)} 日`
            : state.goal.title;

    return h("article", { class: "card subject-card", style: { "--subject-color": subject.color } },
        h("header", { class: "subject-card__head" },
            h("span", { class: "subject-card__icon", "aria-hidden": "true" }, subject.icon),
            h("div", {},
                h("h2", { class: "subject-card__title" }, subject.name),
                h("p", { class: "subject-card__goal" }, goalLine))),

        h("div", { class: "metrics" },
            h("div", { class: "metric" },
                h("span", { class: "metric__label" }, "理解度"),
                h("span", { class: "metric__value" }, Math.round(understanding), h("small", {}, " / 100")),
                h("span", { class: "metric__sub" }, `${abilityLabel(coverage > 0 ? understanding : null)}・範囲 ${percent(coverage)} 着手`)),
            h("div", { class: "metric" },
                h("span", { class: "metric__label" }, "定着度"),
                h("span", { class: "metric__value" }, retention === null ? "—" : percent(retention)),
                h("span", { class: "metric__sub" }, `${seenItems} 問中・復習待ち ${dueCount} 問`)),
            predicted !== null
                ? h("div", { class: "metric" },
                    h("span", { class: "metric__label" }, subject.exam.label),
                    h("span", { class: `metric__value ${predicted >= subject.exam.passRatio ? "is-pass" : ""}` }, percent(predicted)),
                    h("span", { class: "metric__sub" }, `合格ライン ${percent(subject.exam.passRatio)}`))
                : null),

        subject.diagnostic ? diagnosticLine(diagnostic) : null,

        h("div", { class: "today" },
            h("div", { class: "today__row" },
                h("span", {}, "今日の目標"),
                h("span", {}, `${done} / ${quota} 問`)),
            meter(done, { max: quota, label: `今日 ${done} / ${quota} 問` })),

        h("p", { class: "subject-card__plan" }, plan.headline),
        plan.focusTopics.length
            ? h("p", { class: "subject-card__focus" }, "重点: ", plan.focusTopics.map(topicName).join("・"))
            : null,
        plan.behind.length
            ? h("p", { class: "subject-card__behind" }, `予定より遅れ: ${plan.behind.join("・")}`)
            : null,

        h("div", { class: "actions" },
            subject.diagnostic && !diagnostic
                ? h("button", { class: "btn btn--primary", onclick: startDiagnostic }, "診断テストを受ける")
                : null,
            h("button", { class: `btn ${subject.diagnostic && !diagnostic ? "" : "btn--primary"}`, onclick: () => app.navigate("study", { subject: subject.id }) }, "学習する"),
            subject.diagnostic && diagnostic
                ? h("button", { class: "btn", onclick: startDiagnostic }, "もう一度診断")
                : null,
            dueCount > 0
                ? h("button", { class: "btn", onclick: () => app.navigate("study", { subject: subject.id, start: "1", review: "1" }) }, `復習 ${dueCount} 問`)
                : null,
            h("button", { class: "btn btn--ghost", onclick: () => app.navigate("plan", { subject: subject.id }) }, "計画")));
}

function diagnosticLine(test) {
    if (!test) {
        return h("p", { class: "diagnostic-line" },
            "まずは「診断テスト」で今の実力を分野別に測りましょう。結果に合わせて出題が変わります。");
    }
    const weak = (test.topics || []).filter(t => t.verdict === "weak" || t.verdict === "review")
        .sort((a, b) => a.rate - b.rate)
        .map(t => topicName(t.topicId));
    return h("p", { class: "diagnostic-line" },
        h("strong", {}, `前回の診断（${formatDateTime(test.at).split(" ")[0]}）: ${Math.round(test.percent)}%`),
        weak.length ? `・苦手: ${weak.join("・")}` : "・苦手な分野なし");
}

function welcomeCard(app) {
    return h("section", { class: "card welcome" },
        h("h2", { class: "section-title" }, "はじめての方へ"),
        h("ol", { class: "steps" },
            h("li", {}, h("strong", {}, "科目のカードで「学習する」"), "（FE は「診断テストを受ける」）を押す"),
            h("li", {}, h("strong", {}, "問題に答える"), "と、正解・解説と理解度の変化が表示される"),
            h("li", {}, h("strong", {}, "結果は自動で保存"), "され、次回は苦手な問題や復習の時期が来た問題から出題される")),
        h("div", { class: "actions" },
            h("a", { class: "btn", href: "#/help" }, "くわしい使い方を見る")));
}

export function renderHome(app, root) {
    const streak = streakDays(app.save);
    const totalToday = app.subjects().reduce((sum, s) => sum + answeredToday(app.save, s.id), 0);

    append(root, [
        ...statusBanners(app),
        h("section", { class: "hero" },
            h("div", {},
                h("h1", { class: "hero__title" }, "今日もコツコツ。"),
                h("p", { class: "hero__text" },
                    "理解度に合わせて出題し、できるようになったことを数字で確認できます。",
                    h("a", { href: "#/help", class: "hero__help" }, "使い方"))),
            h("div", { class: "hero__stats" },
                h("div", { class: "hero__stat" }, h("strong", {}, String(streak)), h("span", {}, "日連続")),
                h("div", { class: "hero__stat" }, h("strong", {}, String(totalToday)), h("span", {}, "今日解いた問題")))),
        app.save.attempts.length === 0 ? welcomeCard(app) : null,
        h("section", { class: "grid" }, app.subjects().map(subject => subjectCard(app, subject)))
    ]);
}
