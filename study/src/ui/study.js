// 学習画面: 設定 → 出題 → 採点・解説 → 結果。
//
// モード
//   練習     : 1 問ごとに採点と解説を表示
//   実力テスト: 選択・穴埋めのみ。最後にまとめて結果を表示し、得点を記録
//   復習のみ : 復習期限が来た問題だけ

import { aiEnabled, gradeFreeAnswer, generateQuestion } from "../ai.js";
import { gradeChoice, gradeCloze, gradeCode, keywordCoverage, SELF_GRADES, splitClozePrompt } from "../grader.js";
import { TYPE_LABELS, abilityLabel } from "../mastery.js";
import { todayPlan } from "../planner.js";
import { recordAttempt, recordTest } from "../progress.js";
import { aiRequestFor, pickNext } from "../selector.js";
import { isDue } from "../srs.js";
import { runPython } from "../python/runner.js";
import { topicName } from "../content/index.js";
import { generateId, shuffle } from "../util.js";
import { append, codeArea, h, percent, stars, toast } from "./dom.js";

const REASON_LABELS = { review: "復習", new: "新しい問題", weak: "苦手の再挑戦", ai: "AI が作成" };
const MODE_LABELS = { practice: "練習", test: "実力テスト", review: "復習のみ" };

let session = null;
let lastSetup = {};

function subjectOf(app) {
    return app.getSubject(session.subjectId);
}

// ── 設定画面 ──

function renderSetup(app, root, params) {
    const subjects = app.subjects();
    if (subjects.length === 0) {
        append(root, [h("p", { class: "empty" }, "学習する科目がありません。設定で科目を有効にしてください。")]);
        return;
    }
    const subjectId = params.subject && app.getSubject(params.subject) ? params.subject : (lastSetup.subjectId || subjects[0].id);
    const subject = app.getSubject(subjectId);
    const plan = todayPlan(app.save, subject);
    const useAi = aiEnabled(app.settings);
    const dueCount = app.questionsFor(subjectId).filter(q => isDue(app.save.items[q.id])).length;

    const select = (name, options, value) => h("select", { name, id: `setup-${name}` },
        options.map(([v, label, disabled]) => h("option", { value: v, selected: v === value, disabled: Boolean(disabled) }, label)));

    const types = [["auto", "おまかせ（理解度に合わせる）"], ["choice", "選択"], ["cloze", "穴埋め"], ["free", "白紙（記述）"]];
    if (subject.allowCode) types.push(["code", "コード（Python を実行して採点）"]);

    const form = h("form", { class: "card form", onsubmit: event => {
        event.preventDefault();
        const data = new FormData(form);
        startSession(app, {
            subjectId: data.get("subject"),
            mode: data.get("mode"),
            typeFilter: data.get("type") || "auto",
            source: data.get("source"),
            length: Number(data.get("length"))
        });
    } },
        h("div", { class: "field" },
            h("label", { for: "setup-subject" }, "科目"),
            h("select", { name: "subject", id: "setup-subject", onchange: event => app.navigate("study", { subject: event.target.value }) },
                subjects.map(s => h("option", { value: s.id, selected: s.id === subjectId }, `${s.icon} ${s.name}`)))),
        h("div", { class: "field" },
            h("label", { for: "setup-mode" }, "モード"),
            select("mode", [
                ["practice", "練習（1 問ずつ解説）"],
                ["test", "実力テスト（選択・穴埋め、最後に採点）"],
                ["review", `復習のみ（${dueCount} 問）`, dueCount === 0]
            ], params.review === "1" && dueCount > 0 ? "review" : (lastSetup.mode && lastSetup.mode !== "review" ? lastSetup.mode : "practice"))),
        h("div", { class: "field" },
            h("label", { for: "setup-type" }, "問題形式"),
            select("type", types, lastSetup.typeFilter && types.some(t => t[0] === lastSetup.typeFilter) ? lastSetup.typeFilter : "auto")),
        h("div", { class: "field" },
            h("label", { for: "setup-source" }, "出題元"),
            select("source", [
                ["mixed", useAi ? "おまかせ（問題集 → 足りなければ AI）" : "問題集"],
                ["bank", "問題集のみ"],
                ["ai", "AI が新しく作る", !useAi]
            ], useAi ? (lastSetup.source || "mixed") : "mixed"),
            useAi ? null : h("p", { class: "hint" }, "設定で Claude の API キーを登録すると、AI が理解度に合わせて新しい問題を作り、記述式も採点します。")),
        h("div", { class: "field" },
            h("label", { for: "setup-length" }, "問題数"),
            select("length", [["5", "5 問"], ["10", "10 問"], ["20", "20 問"]], String(lastSetup.length || 10))),
        h("button", { class: "btn btn--primary btn--block", type: "submit" }, "はじめる"));

    // 実力テストは自動採点できる選択・穴埋めだけで行うので、形式の指定は使わない
    const modeSelect = form.querySelector("#setup-mode");
    const typeSelect = form.querySelector("#setup-type");
    const syncType = () => { typeSelect.disabled = modeSelect.value === "test"; };
    modeSelect.addEventListener("change", syncType);
    syncType();

    append(root, [
        h("h1", { class: "page-title" }, "学習"),
        h("div", { class: "card plan-note", style: { "--subject-color": subject.color } },
            h("strong", {}, `${subject.icon} 今日の計画: `), plan.headline,
            plan.focusTopics.length ? h("div", { class: "muted" }, "重点: ", plan.focusTopics.map(topicName).join("・")) : null),
        form]);

    if (params.start === "1") {
        startSession(app, {
            subjectId, mode: dueCount > 0 && params.review === "1" ? "review" : "practice",
            typeFilter: "auto", source: "mixed", length: 10
        });
    }
}

function startSession(app, options) {
    lastSetup = options;
    const subject = app.getSubject(options.subjectId);
    session = {
        id: generateId("s"),
        ...options,
        typeFilter: options.mode === "test" ? ["choice", "cloze"] : options.typeFilter,
        asked: new Set(),
        results: [],
        current: null,
        stage: "loading",
        draft: null,
        recorded: false,
        abilityBefore: Object.fromEntries(subject.topics.map(t => [t.id, app.save.topics[t.id]?.ability ?? null])),
        recentPrompts: []
    };
    history.replaceState(null, "", `#/study?subject=${options.subjectId}`);
    advance(app);
}

// ── 出題 ──

async function obtainQuestion(app) {
    const subject = subjectOf(app);
    const plan = todayPlan(app.save, subject);
    const focusTopics = session.mode === "test" ? [] : plan.focusTopics;
    let questions = app.questionsFor(subject.id);
    if (session.mode === "review") {
        questions = questions.filter(q => isDue(app.save.items[q.id]));
    }

    if (session.source !== "ai") {
        const pick = pickNext({
            save: app.save, subject, questions, focusTopics,
            typeFilter: session.typeFilter, exclude: session.asked
        });
        if (pick) return { question: pick.question, reason: pick.reason };
    }

    if (session.mode === "review" || session.source === "bank" || !aiEnabled(app.settings)) {
        return null;
    }

    const request = aiRequestFor(app.save, subject, focusTopics, session.typeFilter);
    const topic = subject.topics.find(t => t.id === request.topicId);
    let question = null;
    for (let attempt = 0; attempt < 2 && !question; attempt += 1) {
        const candidate = await generateQuestion(app.settings, {
            subject, topic, type: request.type, difficulty: request.difficulty, recentPrompts: session.recentPrompts
        });
        if (candidate.type === "code") {
            // AI の模範解答が自分のテストに通らない問題は採用しない
            const check = await runPython(candidate.solution, candidate.tests);
            const verdict = check.result ? gradeCode(check.result) : null;
            if (verdict && !verdict.correct) continue;
        }
        question = candidate;
    }
    if (!question) throw new Error("AI が正しい問題を作れませんでした。もう一度お試しください。");
    app.save.aiQuestions[question.id] = question;
    app.commit();
    return { question, reason: "ai" };
}

/** セッションを終えて結果画面へ。URL に印を付け、次に学習タブを開いたときは設定画面に戻す */
function finish(app, stage = "summary") {
    session.stage = stage;
    history.replaceState(null, "", `#/study?subject=${session.subjectId}&view=result`);
    app.rerender();
}

async function advance(app) {
    if (session.results.length >= session.length) {
        finish(app);
        return;
    }
    session.stage = "loading";
    app.rerender();
    try {
        const next = await obtainQuestion(app);
        if (!next) {
            finish(app, session.results.length > 0 ? "summary" : "empty");
            return;
        }
        session.current = next;
        session.asked.add(next.question.id);
        session.recentPrompts.push(next.question.prompt);
        session.draft = null;
        session.reveal = false;
        session.codeRun = null;
        session.choiceOrder = next.question.type === "choice"
            ? shuffle(next.question.choices.map((_, i) => i))
            : null;
        session.stage = "question";
    } catch (error) {
        session.stage = "error";
        session.error = error.message;
    }
    app.rerender();
}

function submit(app, score, details) {
    const subject = subjectOf(app);
    const question = session.current.question;
    const change = recordAttempt(app.save, subject, question, score, { mode: session.mode, sessionId: session.id });
    session.results.push({ question, score, details, ...change });
    app.commit();
    if (session.mode === "test") {
        advance(app);
    } else {
        session.stage = "feedback";
        app.rerender();
    }
}

// ── 問題の表示 ──

function questionHeader(question, reason) {
    return h("div", { class: "q-meta" },
        h("span", { class: "chip" }, topicName(question.topic)),
        h("span", { class: "chip chip--type" }, TYPE_LABELS[question.type]),
        h("span", { class: "chip chip--stars", title: `難易度 ${question.difficulty}` }, stars(question.difficulty)),
        h("span", { class: `chip chip--${reason}` }, REASON_LABELS[reason]));
}

function promptBlock(question) {
    return [
        h("p", { class: "q-prompt" }, question.type === "cloze" ? "空欄に入る語を答えなさい。" : question.prompt),
        question.code ? h("pre", { class: "q-code" }, question.code) : null
    ];
}

function renderChoice(app, question) {
    return h("div", { class: "choices" }, session.choiceOrder.map((index, position) =>
        h("button", {
            class: "choice",
            type: "button",
            onclick: () => submit(app, gradeChoice(question, index).score, { kind: "choice", selected: index })
        }, h("span", { class: "choice__key" }, "ABCD"[position] ?? String(position + 1)), question.choices[index])));
}

function renderCloze(app, question) {
    const inputs = [];
    const sentence = h("p", { class: "q-prompt cloze" }, splitClozePrompt(question.prompt).map(part => {
        if ("text" in part) return part.text;
        const input = h("input", {
            class: "cloze__input", type: "text", autocomplete: "off", autocapitalize: "off",
            "aria-label": `空欄 ${part.blank + 1}`, placeholder: `(${part.blank + 1})`
        });
        inputs[part.blank] = input;
        return input;
    }));
    const send = event => {
        event.preventDefault();
        const values = inputs.map(input => input.value);
        const result = gradeCloze(question, values);
        submit(app, result.score, { kind: "cloze", values, blanks: result.blanks });
    };
    queueMicrotask(() => inputs[0]?.focus());
    return h("form", { class: "cloze-form", onsubmit: send }, sentence,
        h("button", { class: "btn btn--primary", type: "submit" }, "回答する"));
}

function renderFree(app, question) {
    const area = h("textarea", { class: "free-input", rows: 6, placeholder: "何も見ずに、自分の言葉で書いてみよう" });
    area.value = session.draft ?? "";
    area.addEventListener("input", () => { session.draft = area.value; });
    const useAi = aiEnabled(app.settings);

    if (session.reveal) {
        const coverage = keywordCoverage(question, session.draft || "");
        return h("div", {},
            h("div", { class: "answer-box" }, h("strong", {}, "あなたの解答"), h("p", { class: "pre" }, session.draft || "（未記入）")),
            h("div", { class: "answer-box answer-box--model" }, h("strong", {}, "模範解答"), h("p", { class: "pre" }, question.modelAnswer)),
            coverage ? h("p", { class: "muted" }, `重要語の一致: ${percent(coverage.ratio)}（目安）`) : null,
            h("p", {}, "模範解答と比べて、自己採点してください。"),
            h("div", { class: "self-grade" }, SELF_GRADES.map(grade =>
                h("button", { class: "btn", type: "button", onclick: () => submit(app, grade.score, { kind: "free", text: session.draft, selfGrade: grade.label }) }, grade.label))));
    }

    const status = h("p", { class: "muted", "aria-live": "polite" });
    const button = h("button", { class: "btn btn--primary", type: "button" }, useAi ? "AI に採点してもらう" : "模範解答と比べる");
    button.addEventListener("click", async () => {
        if (!area.value.trim()) {
            toast("解答を書いてから採点しましょう");
            return;
        }
        session.draft = area.value;
        if (!useAi) {
            session.reveal = true;
            app.rerender();
            return;
        }
        button.disabled = true;
        status.textContent = "AI が採点しています…";
        try {
            const grade = await gradeFreeAnswer(app.settings, { subject: subjectOf(app), question, answer: area.value });
            submit(app, grade.score, { kind: "free", text: area.value, aiGrade: grade });
        } catch (error) {
            toast(error.message, "error");
            session.reveal = true;
            app.rerender();
        }
    });
    queueMicrotask(() => area.focus());
    return h("div", {}, area, h("div", { class: "actions" }, button), status);
}

function codeResultView(run) {
    if (!run) return null;
    if (run.timeout) return h("div", { class: "banner banner--error" }, "時間切れになりました（無限ループになっていないか確認してください）。");
    if (run.loadError) return h("div", { class: "banner banner--error" }, `Python を起動できませんでした: ${run.loadError}`);
    const { result } = run;
    return h("div", { class: "code-result" },
        result.error ? h("pre", { class: "code-result__error" }, result.error) : null,
        h("ul", { class: "test-list" }, result.tests.map(t =>
            h("li", { class: t.ok ? "is-ok" : "is-ng" }, t.ok ? "✔ " : "✘ ", t.name, t.ok || !t.message ? null : h("span", { class: "muted" }, ` — ${t.message}`)))),
        result.stdout ? h("details", {}, h("summary", {}, "print の出力"), h("pre", {}, result.stdout)) : null);
}

function renderCode(app, question) {
    const area = codeArea(session.draft ?? question.starter ?? "", { rows: 12, "aria-label": "コード" });
    area.addEventListener("input", () => { session.draft = area.value; });
    const resultBox = h("div", { "aria-live": "polite" }, codeResultView(session.codeRun));
    const runButton = h("button", { class: "btn", type: "button" }, "テスト実行（採点しない）");
    const submitButton = h("button", { class: "btn btn--primary", type: "button" }, "提出して採点");

    const execute = async () => {
        session.draft = area.value;
        runButton.disabled = submitButton.disabled = true;
        resultBox.replaceChildren(h("p", { class: "muted" }, "Python を実行しています…（初回は準備に数十秒かかります）"));
        const run = await runPython(area.value, question.tests);
        session.codeRun = run;
        runButton.disabled = submitButton.disabled = false;
        resultBox.replaceChildren(codeResultView(run) || "");
        return run;
    };

    runButton.addEventListener("click", execute);
    submitButton.addEventListener("click", async () => {
        const run = await execute();
        if (run.result) {
            submit(app, gradeCode(run.result).score, { kind: "code", code: area.value, run });
        } else {
            toast("この環境では Python を実行できないため、模範解答と比べて自己採点してください", "error");
            session.reveal = true;
            app.rerender();
        }
    });

    if (session.reveal) {
        return h("div", {},
            h("div", { class: "answer-box" }, h("strong", {}, "あなたのコード"), h("pre", {}, session.draft || question.starter)),
            h("div", { class: "answer-box answer-box--model" }, h("strong", {}, "模範解答"), h("pre", {}, question.solution)),
            h("div", { class: "self-grade" }, SELF_GRADES.map(grade =>
                h("button", { class: "btn", type: "button", onclick: () => submit(app, grade.score, { kind: "code", code: session.draft, selfGrade: grade.label }) }, grade.label))));
    }

    return h("div", {},
        h("p", { class: "muted" }, "テスト: ", question.tests.map(t => t.name).join(" / ")),
        area,
        h("div", { class: "actions" }, runButton, submitButton,
            h("button", { class: "btn btn--ghost", type: "button", onclick: () => submit(app, 0, { kind: "code", code: area.value, gaveUp: true }) }, "わからない（模範解答を見る）")),
        resultBox);
}

function progressBar() {
    const done = session.results.length;
    const number = session.stage === "feedback" ? done : Math.min(done + 1, session.length);
    return h("div", { class: "session-bar" },
        h("span", {}, `${MODE_LABELS[session.mode]}　${number} / ${session.length} 問`),
        h("div", { class: "session-bar__track" }, h("div", { class: "session-bar__fill", style: { width: `${(done / session.length) * 100}%` } })));
}

function renderQuestion(app, root) {
    const { question, reason } = session.current;
    const body = {
        choice: renderChoice,
        cloze: renderCloze,
        free: renderFree,
        code: renderCode
    }[question.type](app, question);

    append(root, [progressBar(),
        h("article", { class: "card question" }, questionHeader(question, reason), promptBlock(question), body),
        h("div", { class: "actions actions--end" },
            h("button", { class: "btn btn--ghost", type: "button", onclick: () => finish(app) }, "ここで終了"))]);
}

// ── 採点結果・解説 ──

function correctAnswerView(question, details) {
    if (question.type === "choice") {
        return h("ul", { class: "choices choices--result" }, question.choices.map((choice, index) =>
            h("li", { class: index === question.answer ? "is-ok" : index === details?.selected ? "is-ng" : "" },
                index === question.answer ? "✔ " : index === details?.selected ? "✘ " : "　", choice)));
    }
    if (question.type === "cloze") {
        return h("ul", { class: "blank-list" }, question.blanks.map((accepted, i) =>
            h("li", { class: details?.blanks?.[i] ? "is-ok" : "is-ng" },
                `(${i + 1}) 正解: ${accepted.join(" / ")}`,
                details ? h("span", { class: "muted" }, `　あなた: ${details.values[i] || "（空欄）"}`) : null)));
    }
    if (question.type === "free") {
        return h("div", {},
            details?.text ? h("div", { class: "answer-box" }, h("strong", {}, "あなたの解答"), h("p", { class: "pre" }, details.text)) : null,
            h("div", { class: "answer-box answer-box--model" }, h("strong", {}, "模範解答"), h("p", { class: "pre" }, question.modelAnswer)));
    }
    return h("div", {},
        details?.run ? codeResultView(details.run) : null,
        h("div", { class: "answer-box answer-box--model" }, h("strong", {}, "模範解答"), h("pre", {}, question.solution)));
}

function aiGradeView(grade) {
    if (!grade) return null;
    const list = (title, items) => items.length ? h("div", {}, h("strong", {}, title), h("ul", {}, items.map(item => h("li", {}, item)))) : null;
    return h("div", { class: "ai-grade" },
        h("p", {}, grade.feedback),
        list("できていた点", grade.goodPoints),
        list("足りない点", grade.missingPoints),
        grade.betterAnswer ? h("div", { class: "answer-box" }, h("strong", {}, "より良い解答例"), h("p", { class: "pre" }, grade.betterAnswer)) : null);
}

function abilityChange(result) {
    const before = result.abilityBefore;
    const after = result.abilityAfter;
    const diff = after - (before ?? after);
    return h("p", { class: "ability-change" },
        `${topicName(result.question.topic)} の理解度: `,
        before === null ? "初測定 → " : `${Math.round(before)} → `,
        h("strong", {}, String(Math.round(after))),
        before === null ? "" : h("span", { class: diff >= 0 ? "up" : "down" }, ` (${diff >= 0 ? "+" : ""}${diff.toFixed(1)})`));
}

function renderFeedback(app, root) {
    const result = session.results[session.results.length - 1];
    const { question, score, details } = result;
    const verdict = score >= 0.99 ? "正解！" : score > 0 ? `部分正解（${percent(score)}）` : "不正解";
    const removeAi = () => {
        delete app.save.aiQuestions[question.id];
        delete app.save.items[question.id];
        app.commit();
        toast("この AI 問題を削除しました（記録された理解度はそのままです）");
    };

    append(root, [progressBar(),
        h("article", { class: "card question" },
            questionHeader(question, session.current.reason),
            promptBlock(question),
            question.type === "cloze" ? h("p", { class: "q-prompt" }, question.prompt.replace(/\{(\d+)\}/g, (_, n) => `（${Number(n) + 1}）`)) : null,
            h("div", { class: `verdict ${score >= 0.99 ? "verdict--ok" : score > 0 ? "verdict--partial" : "verdict--ng"}` }, verdict),
            aiGradeView(details?.aiGrade),
            correctAnswerView(question, details),
            question.explanation ? h("div", { class: "explanation" }, h("strong", {}, "解説"), h("p", {}, question.explanation)) : null,
            abilityChange(result),
            question.source === "ai"
                ? h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: removeAi }, "この AI 問題に誤りがあるので削除する")
                : null),
        h("div", { class: "actions actions--end" },
            h("button", { class: "btn btn--ghost", type: "button", onclick: () => finish(app) }, "ここで終了"),
            h("button", { class: "btn btn--primary", type: "button", autofocus: true, onclick: () => advance(app) },
                session.results.length >= session.length ? "結果を見る" : "次の問題へ"))]);
}

// ── 結果 ──

function renderSummary(app, root) {
    const subject = subjectOf(app);
    const results = session.results;
    const total = results.length;
    const scoreSum = results.reduce((sum, r) => sum + r.score, 0);

    if (session.mode === "test" && !session.recorded && total > 0) {
        recordTest(app.save, subject, { score: scoreSum, total });
        app.commit();
        session.recorded = true;
    }

    const touched = [...new Set(results.map(r => r.question.topic))];
    append(root, [
        h("h1", { class: "page-title" }, `${subject.icon} ${MODE_LABELS[session.mode]}の結果`),
        h("section", { class: "card summary" },
            h("div", { class: "summary__score" },
                h("strong", {}, total ? percent(scoreSum / total) : "—"),
                h("span", {}, `${total} 問・正解換算 ${scoreSum.toFixed(1)} 問`)),
            h("h2", { class: "section-title" }, "理解度の変化"),
            h("ul", { class: "topic-changes" }, touched.map(topicId => {
                const before = session.abilityBefore[topicId];
                const after = app.save.topics[topicId].ability;
                const diff = after - (before ?? 0);
                return h("li", {},
                    h("span", {}, topicName(topicId)),
                    h("span", {}, before === null ? "初測定 → " : `${Math.round(before)} → `, h("strong", {}, String(Math.round(after))),
                        ` ${abilityLabel(after)}`,
                        before === null ? null : h("span", { class: diff >= 0 ? "up" : "down" }, ` (${diff >= 0 ? "+" : ""}${diff.toFixed(1)})`)));
            }))),
        session.mode === "test"
            ? h("section", { class: "card" },
                h("h2", { class: "section-title" }, "答え合わせ"),
                results.map((r, i) => h("details", { class: "review-item" },
                    h("summary", {}, `${r.score >= 0.99 ? "✔" : "✘"} 問${i + 1}　${r.question.prompt.replace(/\{(\d+)\}/g, "（　）").slice(0, 60)}`),
                    promptBlock(r.question),
                    correctAnswerView(r.question, r.details),
                    r.question.explanation ? h("p", { class: "explanation" }, r.question.explanation) : null)))
            : null,
        h("div", { class: "actions" },
            h("button", { class: "btn btn--primary", type: "button", onclick: () => startSession(app, lastSetup) }, "同じ設定でもう一度"),
            h("button", { class: "btn", type: "button", onclick: () => { session = null; app.navigate("study", { subject: subject.id }); app.rerender(); } }, "設定を変える"),
            h("button", { class: "btn btn--ghost", type: "button", onclick: () => { session = null; app.navigate("home"); } }, "ホームへ"))]);
}

export function renderStudy(app, root, params) {
    if (session && params.subject && params.subject !== session.subjectId) {
        session = null;
    }
    if (session && (session.stage === "summary" || session.stage === "empty") && params.view !== "result") {
        session = null;
    }
    if (!session || params.start === "1") {
        session = null;
        renderSetup(app, root, params);
        return;
    }
    switch (session.stage) {
        case "loading":
            append(root, [progressBar(), h("div", { class: "card loading" }, h("div", { class: "spinner", "aria-hidden": "true" }),
                session.source === "ai" || session.results.length > 0 ? "問題を準備しています…" : "問題を選んでいます…")]);
            break;
        case "question":
            renderQuestion(app, root);
            break;
        case "feedback":
            renderFeedback(app, root);
            break;
        case "summary":
            renderSummary(app, root);
            break;
        case "empty":
            append(root, [h("div", { class: "card" },
                h("p", {}, "条件に合う問題がありません。"),
                h("p", { class: "muted" }, aiEnabled(app.settings) ? "出題元を「おまかせ」か「AI が新しく作る」にしてみてください。" : "問題形式を「おまかせ」にするか、設定で AI を有効にすると新しい問題を作れます。"),
                h("button", { class: "btn", onclick: () => { session = null; app.rerender(); } }, "設定に戻る"))]);
            break;
        case "error":
            append(root, [h("div", { class: "card" },
                h("div", { class: "banner banner--error" }, session.error),
                h("div", { class: "actions" },
                    h("button", { class: "btn btn--primary", onclick: () => advance(app) }, "もう一度試す"),
                    h("button", { class: "btn", onclick: () => finish(app, session.results.length ? "summary" : "empty") }, "終了する")))]);
            break;
        default:
            renderSetup(app, root, params);
    }
}
