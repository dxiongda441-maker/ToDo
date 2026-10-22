// 日常英会話。目標がまだ決まっていない「探索」の例。
// AI を有効にすると、白紙問題で英作文を添削してもらえる。

import { bank } from "./helpers.js";

const { choice, cloze, free } = bank("english");

const questions = [
    // ── あいさつ・自己紹介 ──
    choice("greetings.001", "greetings", 1, "\"How are you?\" への返事として最も自然なものはどれか。",
        ["I'm good, thanks. And you?", "I'm 30 years old.", "Yes, I am.", "I'm from Japan."], 0,
        "聞き返す \"And you?\" を付けると会話が続きます。"),
    choice("greetings.002", "greetings", 1, "初対面で \"Nice to meet you.\" と言われたときの返事として最も自然なものはどれか。",
        ["Nice to meet you, too.", "Me too meet you.", "Thank you, goodbye.", "Yes, nice."], 0,
        "\"You too.\" だけでも OK です。"),
    cloze("greetings.003", "greetings", 2, "「お名前をうかがってもいいですか？」→ May I {0} your name?", [["have", "ask", "get"]],
        "\"What's your name?\" より丁寧な聞き方です。"),
    free("greetings.004", "greetings", 2, "英語で 30 秒くらいの自己紹介を書いてみよう（名前・仕事や学校・趣味・ひとこと）。",
        "Hi, I'm Taro. I work as an engineer in Tokyo. In my free time, I enjoy learning about wine. Nice to meet you!",
        [["i'm", "i am", "my name"], ["work", "job", "student", "study"], ["like", "enjoy", "hobby", "love", "into"]]),

    // ── 雑談 ──
    choice("smalltalk.001", "smalltalk", 2, "\"What do you do?\" の意味として最も適切なものはどれか。",
        ["お仕事は何ですか？", "今何をしていますか？", "何をしたいですか？", "どうしましたか？"], 0,
        "職業を尋ねる定番の表現です。今していることなら \"What are you doing?\" です。"),
    choice("smalltalk.002", "smalltalk", 2, "\"How was your weekend?\" への返事として最も自然なものはどれか。",
        ["It was great. I went hiking.", "It is Saturday.", "I will go hiking.", "Yes, it was."], 0,
        "過去のことを聞かれているので過去形で答え、何をしたかを一言加えると会話が広がります。"),
    cloze("smalltalk.003", "smalltalk", 2, "「最近どうしてた？」→ What have you been {0} to lately?", [["up"]],
        "be up to ～ で「～をしている、～をたくらんでいる」。友人同士のくだけた表現です。"),
    choice("smalltalk.004", "smalltalk", 3, "\"I'm really into cooking these days.\" の意味として最も適切なものはどれか。",
        ["最近、料理にハマっている", "最近、料理の中に入っている", "最近、料理をやめた", "最近、料理が苦手だ"], 0,
        "be into ～ で「～に夢中だ、ハマっている」です。"),

    // ── 飲食店・買い物 ──
    choice("restaurant.001", "restaurant", 1, "レストランで注文するときの丁寧な言い方として最も自然なものはどれか。",
        ["I'd like the steak, please.", "Give me steak.", "I want steak now.", "Steak is good."], 0,
        "I'd like ～ (= I would like) は丁寧に希望を伝える定番表現です。"),
    choice("restaurant.002", "restaurant", 2, "\"Could I get the check, please?\" の意味として最も適切なものはどれか。",
        ["お会計をお願いします", "メニューを見せてください", "確認してもらえますか", "おすすめは何ですか"], 0,
        "アメリカでは check、イギリスでは bill がよく使われます。"),
    cloze("restaurant.003", "restaurant", 2, "（アメリカのカフェで）「持ち帰りでお願いします」→ To {0}, please.", [["go"]],
        "店内で食べるなら \"For here, please.\" イギリスでは \"Take away\" とも言います。"),
    choice("restaurant.004", "restaurant", 2, "店員に \"For here or to go?\" と聞かれた。意味として最も適切なものはどれか。",
        ["店内でお召し上がりですか、お持ち帰りですか", "ここに来るのは初めてですか", "こちらへどうぞ", "お支払いは現金ですか"], 0,
        "ファストフード店やカフェでよく聞かれます。"),
    choice("restaurant.005", "restaurant", 3, "\"Do you have this in a smaller size?\" の意味として最も適切なものはどれか。",
        ["これの小さいサイズはありますか", "これは小さすぎますか", "小さい袋をもらえますか", "小さいものが好きですか"], 0,
        "色違いなら \"Do you have this in blue?\" のように言えます。"),

    // ── 旅行 ──
    choice("travel.001", "travel", 1, "「トイレはどこですか？」として最も自然なものはどれか。",
        ["Where is the restroom?", "Where is the toilet room you have?", "Is restroom here?", "Restroom, where are?"], 0,
        "アメリカでは restroom、イギリスでは toilet や loo もよく使われます。"),
    choice("travel.002", "travel", 2, "入国審査で \"What's the purpose of your visit?\" と聞かれた。答えとして最も適切なものはどれか。",
        ["Sightseeing.", "Five days.", "At the Hilton Hotel.", "I'm Japanese."], 0,
        "目的を聞かれているので Sightseeing（観光）や Business（仕事）と答えます。滞在日数は \"How long are you staying?\" で聞かれます。"),
    cloze("travel.003", "travel", 2, "「駅への行き方を教えてもらえますか？」→ Could you tell me how to {0} to the station?", [["get"]],
        "how to get to ～ で「～への行き方」です。"),
    choice("travel.004", "travel", 3, "\"I missed my connecting flight.\" の意味として最も適切なものはどれか。",
        ["乗り継ぎ便に乗り遅れた", "フライトが恋しい", "接続便を予約した", "フライトがキャンセルされた"], 0,
        "miss には「乗り遅れる」「逃す」の意味があります。"),

    // ── 仕事 ──
    choice("work.001", "work", 2, "\"Let me get back to you.\" の意味として最も適切なものはどれか。",
        ["後で（確認して）折り返し連絡します", "私のところに戻ってきて", "あなたに返します", "後ろに下がってください"], 0,
        "すぐに答えられないときに便利な表現です。\"I'll get back to you by Friday.\" のように期限を添えると丁寧です。"),
    choice("work.002", "work", 3, "\"Could you walk me through the plan?\" の意味として最も適切なものはどれか。",
        ["計画を順を追って説明してもらえますか", "計画の場所まで歩いてくれますか", "計画を歩きながら考えましょう", "計画を中止してもらえますか"], 0,
        "walk ～ through ... で「～に…を一つずつ説明する」です。"),
    free("work.003", "work", 3, "会議で「すみません、もう一度言っていただけますか？」と丁寧に英語で言ってみよう。",
        "Sorry, could you say that again, please? / I'm sorry, could you repeat that?",
        [["sorry", "excuse", "pardon"], ["could you", "would you", "can you"], ["again", "repeat"]]),

    // ── 会話で使う文法 ──
    choice("grammar.001", "grammar", 2, "「京都には 3 回行ったことがある」→ I ( ) to Kyoto three times. （ ）に入るものはどれか。",
        ["have been", "went", "am going", "have gone"], 0,
        "経験は現在完了 have been to ～ で表します。have gone to は「行ってしまって今ここにいない」の意味です。"),
    choice("grammar.002", "grammar", 2, "「もし私があなたなら、その仕事を引き受けるだろう」→ If I ( ) you, I would take the job.",
        ["am", "were", "will be", "have been"], 1,
        "現在の事実と違う仮定は仮定法過去。be 動詞は主語に関係なく were が基本です。"),
    cloze("grammar.003", "grammar", 3, "「あなたに会うのを楽しみにしています」→ I'm looking forward to {0} you.", [["seeing", "meeting"]],
        "look forward to の to は前置詞なので、後ろは動詞の -ing 形になります。"),
    choice("grammar.004", "grammar", 3, "\"I used to play tennis.\" の意味として最も適切なものはどれか。",
        ["以前はよくテニスをしていた（今はしていない）", "テニスをするのに慣れている", "テニスを使っている", "これからテニスをする"], 0,
        "「慣れている」は be used to ～ing です。混同しやすいので注意。"),

    // ── 句動詞・定番表現 ──
    choice("phrasal.001", "phrasal", 2, "\"I can't figure out how to use this app.\" の figure out の意味として最も適切なものはどれか。",
        ["理解する・解決策を見つける", "数字を数える", "外に出る", "あきらめる"], 0,
        "考えた末にわかる、というニュアンスです。"),
    choice("phrasal.002", "phrasal", 2, "\"We've run out of milk.\" の意味として最も適切なものはどれか。",
        ["牛乳を切らした", "牛乳を買いに走った", "牛乳がこぼれた", "牛乳が多すぎる"], 0,
        "run out of ～ で「～を使い果たす、切らす」です。"),
    cloze("phrasal.003", "phrasal", 3, "「会議を来週に延期しよう」→ Let's put {0} the meeting until next week.", [["off"]],
        "put off = postpone（延期する）です。"),
    choice("phrasal.004", "phrasal", 3, "\"I really look up to my manager.\" の意味として最も適切なものはどれか。",
        ["上司をとても尊敬している", "上司をよく見上げている", "上司を調べている", "上司を見下している"], 0,
        "look up to = 尊敬する、look down on = 見下す。look up だけなら「調べる」です。")
];

export default {
    id: "english",
    name: "日常英会話",
    short: "EN",
    icon: "💬",
    color: "#d97706",
    description: "あいさつ・雑談・旅行・仕事でよく使う表現。目標は基礎ができてから決める。",
    defaultDailyQuota: 10,
    defaultGoal: {},
    goalPresets: [
        { id: "en-travel", title: "海外旅行で困らずに会話できる", hasDeadline: false },
        { id: "en-smalltalk", title: "英語で 5 分間雑談できる", hasDeadline: false },
        { id: "en-eiken2", title: "英検2級に合格する", hasDeadline: true },
        { id: "en-toeic", title: "TOEIC L&R で 700 点を取る", hasDeadline: true }
    ],
    topics: [
        { id: "english.greetings", name: "あいさつ・自己紹介", weight: 2 },
        { id: "english.smalltalk", name: "雑談", weight: 3 },
        { id: "english.restaurant", name: "飲食店・買い物", weight: 2 },
        { id: "english.travel", name: "旅行", weight: 2 },
        { id: "english.work", name: "仕事", weight: 2 },
        { id: "english.grammar", name: "会話で使う文法", weight: 3 },
        { id: "english.phrasal", name: "句動詞・定番表現", weight: 2 }
    ],
    stages: [
        { id: "english.s1", title: "あいさつと基本文法", topics: ["english.greetings", "english.grammar"] },
        { id: "english.s2", title: "雑談と飲食店", topics: ["english.smalltalk", "english.restaurant"] },
        { id: "english.s3", title: "旅行と定番表現", topics: ["english.travel", "english.phrasal"] },
        { id: "english.s4", title: "仕事で使う", topics: ["english.work"] }
    ],
    resources: [
        { title: "NHK ゴガク", url: "https://www.nhk.or.jp/gogaku/", note: "毎日の英会話番組" },
        { title: "Anki", url: "https://apps.ankiweb.net/", note: "間隔反復で単語・フレーズを覚える定番ツール" }
    ],
    questions
};
