// 問題バンクを短く書くためのヘルパー。
// 問題 ID は一度公開したら変更しない（セーブデータの復習記録が ID で問題を参照するため）。

export function bank(subjectId) {
    const base = (type, id, topic, difficulty, prompt, extra) => ({
        id: `${subjectId}.${id}`,
        subject: subjectId,
        topic: `${subjectId}.${topic}`,
        type,
        difficulty,
        prompt,
        source: "bank",
        ...extra
    });

    return {
        /** 選択式: answer は choices の 0 始まりの番号 */
        choice: (id, topic, difficulty, prompt, choices, answer, explanation, code) =>
            base("choice", id, topic, difficulty, prompt, { choices, answer, explanation, code }),
        /** 選択式で、選択肢がコードのもの（等幅フォントで表示する） */
        codeChoice: (id, topic, difficulty, prompt, choices, answer, explanation, code) =>
            base("choice", id, topic, difficulty, prompt, { choices, answer, explanation, code, codeChoices: true }),
        /** 穴埋め: prompt 中の {0} {1} … が空欄。blanks[i] は許容する答えの一覧 */
        cloze: (id, topic, difficulty, prompt, blanks, explanation) =>
            base("cloze", id, topic, difficulty, prompt, { blanks, explanation }),
        /** 白紙（記述）: keywords は AI なしで採点するときの目安（各要素は同義語の配列） */
        free: (id, topic, difficulty, prompt, modelAnswer, keywords, explanation) =>
            base("free", id, topic, difficulty, prompt, { modelAnswer, keywords, explanation }),
        /** コード（Python）: tests はそれぞれ assert を含む Python コード。solution は模範解答 */
        code: (id, topic, difficulty, prompt, starter, tests, solution, explanation) =>
            base("code", id, topic, difficulty, prompt, { starter, tests, solution, explanation })
    };
}
