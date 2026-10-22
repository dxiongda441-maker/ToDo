// 計画画面: 目標の設定と、学習計画（段階・期間）の表示。

import { abilityLabel } from "../mastery.js";
import { STAGE_CLEAR_ABILITY, buildDeadlineSchedule, goalMode, stageProgress, todayPlan, unlockedStageCount } from "../planner.js";
import { latestDiagnostic } from "../progress.js";
import { topicName } from "../content/index.js";
import { toDateKey } from "../util.js";
import { append, copyReport, formatDate, formatDateTime, h, meter, toast } from "./dom.js";

function subjectTabs(app, current) {
    return h("nav", { class: "tabs", "aria-label": "科目" }, app.subjects().map(subject =>
        h("a", {
            class: `tab ${subject.id === current ? "tab--active" : ""}`,
            href: `#/plan?subject=${subject.id}`,
            "aria-current": subject.id === current ? "page" : null
        }, `${subject.icon} ${subject.short}`)));
}

function goalForm(app, subject) {
    const state = app.save.subjects[subject.id];
    const goal = state.goal;
    const presetValue = goal.title ? (subject.goalPresets.find(p => p.id === goal.presetId) ? goal.presetId : "custom") : "none";

    const titleInput = h("input", { type: "text", name: "title", id: "goal-title", value: goal.title || "", placeholder: "例：〇〇試験に合格する" });
    const dateInput = h("input", { type: "date", name: "targetDate", id: "goal-date", value: goal.targetDate || "", min: toDateKey(Date.now()) });
    const quotaInput = h("input", { type: "number", name: "quota", id: "goal-quota", min: 1, max: 200, value: state.dailyQuota });
    const presetSelect = h("select", { name: "preset", id: "goal-preset" },
        h("option", { value: "none", selected: presetValue === "none" }, "目標なし（まずは幅広く基礎から）"),
        subject.goalPresets.map(p => h("option", { value: p.id, selected: presetValue === p.id }, p.title)),
        h("option", { value: "custom", selected: presetValue === "custom" }, "自分で決める"));

    const sync = () => {
        const preset = subject.goalPresets.find(p => p.id === presetSelect.value);
        if (preset) titleInput.value = preset.title;
        if (presetSelect.value === "none") {
            titleInput.value = "";
            dateInput.value = "";
        }
        titleInput.disabled = presetSelect.value !== "custom";
        dateInput.disabled = presetSelect.value === "none";
    };
    presetSelect.addEventListener("change", sync);
    sync();
    if (presetValue === "custom" || presetValue === "none") titleInput.value = goal.title || "";

    const form = h("form", { class: "card form", onsubmit: event => {
        event.preventDefault();
        const presetId = presetSelect.value;
        const title = presetId === "none" ? null : titleInput.value.trim() || null;
        const targetDate = presetId === "none" ? null : dateInput.value || null;
        const changedDeadline = targetDate !== goal.targetDate || title !== goal.title;
        state.goal = {
            title,
            targetDate,
            // 目標や期限を変えたら、計画は今日から組み直す
            startDate: changedDeadline ? toDateKey(Date.now()) : goal.startDate,
            presetId: presetId === "none" || presetId === "custom" ? null : presetId
        };
        state.dailyQuota = Math.max(1, Math.min(200, Number(quotaInput.value) || state.dailyQuota));
        if (app.commit()) toast("目標を保存しました");
        app.rerender();
    } },
        h("h2", { class: "section-title" }, "目標"),
        h("div", { class: "field" }, h("label", { for: "goal-preset" }, "目標の候補"), presetSelect),
        h("div", { class: "field" }, h("label", { for: "goal-title" }, "目標"), titleInput),
        h("div", { class: "field" },
            h("label", { for: "goal-date" }, "期限（任意）"), dateInput,
            h("p", { class: "hint" }, "期限を入れると、試験日から逆算した計画になります。期限がなければ段階を順にクリアしていきます。")),
        h("div", { class: "field" }, h("label", { for: "goal-quota" }, "1 日の目標問題数"), quotaInput),
        h("button", { class: "btn btn--primary", type: "submit" }, "保存"));
    return form;
}

function topicRows(app, topicIds) {
    return h("ul", { class: "topic-rows" }, topicIds.map(id => {
        const state = app.save.topics[id];
        const ability = state && state.attempts > 0 ? state.ability : null;
        return h("li", { class: "topic-row" },
            h("span", { class: "topic-row__name" }, topicName(id)),
            meter(ability ?? 0, { label: `${topicName(id)} 理解度 ${Math.round(ability ?? 0)}`, marker: STAGE_CLEAR_ABILITY }),
            h("span", { class: "topic-row__value" }, ability === null ? "未測定" : `${Math.round(ability)}・${abilityLabel(ability)}`));
    }));
}

function scheduleView(app, subject) {
    const state = app.save.subjects[subject.id];
    const mode = goalMode(state.goal);
    const plan = todayPlan(app.save, subject);
    const today = toDateKey(Date.now());

    if (mode === "deadline") {
        const phases = buildDeadlineSchedule(subject, state.goal);
        return h("section", { class: "card" },
            h("h2", { class: "section-title" }, `学習計画（${formatDate(state.goal.startDate)} 〜 ${formatDate(state.goal.targetDate)}）`),
            plan.behind.length ? h("div", { class: "banner banner--warn" }, `予定の期間を過ぎても理解度 ${STAGE_CLEAR_ABILITY} に届いていない段階があります: ${plan.behind.join("・")}。重点的に復習しましょう。`) : null,
            h("ol", { class: "timeline" }, phases.map(phase => {
                const current = phase.start <= today && today <= phase.end;
                const progress = phase.kind === "stage" ? stageProgress(app.save, phase) : null;
                return h("li", { class: `timeline__item ${current ? "is-current" : ""} ${progress?.cleared ? "is-cleared" : ""}` },
                    h("div", { class: "timeline__head" },
                        h("strong", {}, phase.title),
                        h("span", { class: "muted" }, `${formatDate(phase.start)} 〜 ${formatDate(phase.end)}`),
                        current ? h("span", { class: "chip chip--now" }, "いまここ") : null,
                        progress?.cleared ? h("span", { class: "chip chip--ok" }, "クリア") : null),
                    phase.kind === "stage" ? topicRows(app, phase.topics) : null,
                    phase.kind === "review" ? h("p", { class: "muted" }, "理解度の低いトピックを重点的に出題します。") : null,
                    phase.kind === "mock" ? h("p", { class: "muted" }, "学習画面の「実力テスト」で全範囲から出題し、本番に近い形で仕上げます。") : null);
            })));
    }

    if (mode === "milestone") {
        const unlocked = unlockedStageCount(app.save, subject);
        const unlock = index => {
            if (!confirm(`「${subject.stages[index].title}」に進みます。前の段階の問題も引き続き出題されます。よろしいですか？`)) return;
            state.unlockedStages = index + 1;
            if (app.commit()) toast("次の段階に進みました");
            app.rerender();
        };
        return h("section", { class: "card" },
            h("h2", { class: "section-title" }, `段階（すべてのトピックが理解度 ${STAGE_CLEAR_ABILITY} 以上でクリア）`),
            subject.lockStages
                ? h("p", { class: "muted" }, "前の段階をクリアすると、次の段階の問題が出るようになります（🔒 はまだ出題されません）。自信があれば先に進むこともできます。")
                : null,
            h("ol", { class: "timeline" }, subject.stages.map((stage, index) => {
                const progress = stageProgress(app.save, stage);
                const current = plan.phase.stageId === stage.id;
                const locked = index >= unlocked;
                return h("li", { class: `timeline__item ${current ? "is-current" : ""} ${progress.cleared ? "is-cleared" : ""} ${locked ? "is-locked" : ""}` },
                    h("div", { class: "timeline__head" },
                        h("strong", {}, `${locked ? "🔒 " : ""}${index + 1}. ${stage.title}`),
                        current ? h("span", { class: "chip chip--now" }, "挑戦中") : null,
                        progress.cleared ? h("span", { class: "chip chip--ok" }, "クリア") : null),
                    topicRows(app, stage.topics),
                    locked && index === unlocked
                        ? h("button", { class: "btn btn--small", type: "button", onclick: () => unlock(index) }, "この段階に進む")
                        : null);
            })));
    }

    return h("section", { class: "card" },
        h("h2", { class: "section-title" }, "基礎固め（探索モード）"),
        h("p", {}, "目標がまだ決まっていない科目は、すべてのトピックをまんべんなく出題して幅広い基礎を作ります。まだ触っていないトピックから優先して出題します。"),
        h("p", { class: "muted" }, "全体像がつかめてきたら、上の「目標」から候補を選ぶか、自分で目標を決めてください。"),
        topicRows(app, subject.topics.map(t => t.id)));
}

function diagnosticCard(app, subject) {
    const test = latestDiagnostic(app.save, subject.id);
    const start = h("a", { class: "btn btn--primary", href: `#/study?subject=${subject.id}&mode=diagnostic` },
        test ? "もう一度診断テストを受ける" : "診断テストを受ける");
    if (!test) {
        return h("section", { class: "card" },
            h("h2", { class: "section-title" }, "診断テスト"),
            h("p", {}, "全分野から同じ数ずつ出題して、今の実力を分野別に測ります。結果に合わせて、これからの出題（難易度・重点分野）が変わります。"),
            h("div", { class: "actions" }, start));
    }
    return h("section", { class: "card" },
        h("h2", { class: "section-title" }, `前回の診断テスト（${formatDateTime(test.at)}）: ${Math.round(test.percent)}%`),
        h("ul", { class: "diag-list" }, (test.topics || []).map(t =>
            h("li", {},
                h("span", {}, topicName(t.topicId)),
                h("span", {}, `${t.correct} / ${t.total}`),
                h("span", { class: `verdict-chip verdict-chip--${t.verdict}` },
                    { strong: "得意", ok: "おおむね理解", review: "要復習", weak: "苦手" }[t.verdict] ?? t.verdict)))),
        h("div", { class: "actions" },
            start,
            test.report ? h("button", { class: "btn", type: "button", onclick: () => copyReport(test.report) }, "結果をコピー（Claude に送る用）") : null));
}

export function renderPlan(app, root, params) {
    const subjects = app.subjects();
    const subject = app.getSubject(params.subject) && subjects.some(s => s.id === params.subject)
        ? app.getSubject(params.subject)
        : subjects[0];
    if (!subject) {
        append(root, [h("p", { class: "empty" }, "学習する科目がありません。設定で科目を有効にしてください。")]);
        return;
    }

    append(root, [
        h("h1", { class: "page-title" }, "計画"),
        subjectTabs(app, subject.id),
        h("p", { class: "lead" }, `${subject.icon} ${subject.name} — ${subject.description}`),
        goalForm(app, subject),
        subject.diagnostic ? diagnosticCard(app, subject) : null,
        scheduleView(app, subject),
        subject.resources?.length
            ? h("section", { class: "card" },
                h("h2", { class: "section-title" }, "あわせて使いたい教材・ツール"),
                h("ul", { class: "resources" }, subject.resources.map(r =>
                    h("li", {}, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.title), h("span", { class: "muted" }, ` — ${r.note}`)))))
            : null]);
}
