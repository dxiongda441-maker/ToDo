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
        "look up to = 尊敬する、look down on = 見下す。look up だけなら「調べる」です。"),
    // ════ ここから v0.2 で追加（基礎を網羅するための入門問題）════

    // ── 数字・時間・日付 ──
    choice("numbers.001", "numbers", 1, "\"It's a quarter past three.\" は何時か。", ["3時15分", "2時45分", "3時45分", "3時25分"], 0,
        "quarter は 4 分の 1（15 分）。past は「〜を過ぎて」。2時45分 は a quarter to three です。"),
    choice("numbers.002", "numbers", 1, "\"fifty\" の意味はどれか。", ["50", "15", "5", "500"], 0,
        "fifteen（15）と fifty（50）は聞き間違えやすいので、アクセントの位置（fif-TEEN / FIF-ty）で聞き分けます。"),
    choice("numbers.003", "numbers", 2, "日付「3月2日」の言い方として最も自然なものはどれか。",
        ["March second", "Second March of", "March two day", "Three second"], 0,
        "日付は序数（first, second, third…）で言います。書くときは March 2 や March 2nd です。"),
    cloze("numbers.004", "numbers", 2, "「今何時ですか？」→ What {0} is it?", [["time"]],
        "\"Do you have the time?\" も同じ意味です（\"Do you have time?\" は「時間ある？」）。"),
    choice("numbers.005", "numbers", 2, "\"I'll be there in ten minutes.\" の意味として最も適切なものはどれか。",
        ["10 分後に着きます", "10 分間そこにいます", "10 分前に着きました", "10 分ごとに行きます"], 0,
        "in + 時間 で「〜後に」。「〜以内に」をはっきり言うときは within ten minutes です。"),

    // ── 入門: あいさつ・雑談 ──
    choice("greetings.005", "greetings", 1, "別れ際の \"See you later.\" の意味として最も適切なものはどれか。",
        ["またね", "後で見せて", "遅れてごめん", "はじめまして"], 0,
        "\"See you!\" \"See you tomorrow.\" なども使えます。"),
    choice("greetings.006", "greetings", 1, "\"Thank you so much!\" への返事として最も自然なものはどれか。",
        ["You're welcome.", "Yes, thank you.", "I'm fine.", "Nice to meet you."], 0,
        "くだけた場面では \"No problem.\" \"Sure.\" もよく使います。"),
    choice("smalltalk.005", "smalltalk", 1, "\"What do you like to do in your free time?\" への答えとして最も自然なものはどれか。",
        ["I like reading and hiking.", "Yes, I have free time.", "My free time is 3 hours.", "I'm free."], 0,
        "趣味は I like ～ing. / I enjoy ～ing. で言うと自然です。"),
    cloze("smalltalk.006", "smalltalk", 2, "「いい天気ですね」→ Nice {0}, isn't it?", [["day", "weather"]],
        "文末の isn't it? は「〜ですよね」と同意を求める言い方で、雑談の始めによく使います。"),

    // ── 入門: 飲食店・買い物・旅行 ──
    choice("restaurant.006", "restaurant", 1, "店員の \"Are you ready to order?\" の意味として最も適切なものはどれか。",
        ["ご注文はお決まりですか", "準備はできましたか（出発します）", "お会計の準備はできていますか", "予約していますか"], 0,
        "まだなら \"I need a few more minutes.\"（もう少し時間をください）と答えられます。"),
    choice("restaurant.007", "restaurant", 2, "お店で店員に声をかけられ「見ているだけです」と伝えるとき、最も自然なものはどれか。",
        ["I'm just looking, thanks.", "I'm only seeing.", "I watch only.", "Just look me."], 0,
        "見る = look（ながめる）。see は「目に入る」、watch は「動くものをじっと見る」です。"),
    choice("travel.005", "travel", 1, "ホテルのフロントで「チェックインしたいのですが」と言うとき、最も自然なものはどれか。",
        ["I'd like to check in, please.", "I want check in.", "Check in me.", "Can I checking in?"], 0,
        "I'd like to + 動詞の原形 で、丁寧に希望を伝えられます。"),
    choice("travel.006", "travel", 2, "\"Is this seat taken?\" の意味として最も適切なものはどれか。",
        ["この席は空いていますか（誰か座っていますか）", "この席を取ってもいいですか", "この席は予約が必要ですか", "この席は高いですか"], 0,
        "空いていれば \"No, go ahead.\"（いいえ、どうぞ）と返ってきます。"),

    // ── 入門: 仕事・文法・定番表現 ──
    choice("work.004", "work", 1, "\"Do you have a minute?\" の意味として最も適切なものはどれか。",
        ["少しお時間よろしいですか", "1 分ありますか（時計を持っていますか）", "何分かかりますか", "時間がありません"], 0,
        "話しかける前の定番の一言です。"),
    choice("work.005", "work", 2, "メールの結び \"I look forward to hearing from you.\" の意味として最も適切なものはどれか。",
        ["ご連絡をお待ちしております", "あなたの声を聞きたいです", "前向きに聞いています", "早く返事をしてください"], 0,
        "look forward to のあとは名詞か動詞の -ing 形になります。"),
    choice("grammar.005", "grammar", 1, "「彼女は毎日電車で仕事に行く」→ She ( ) to work by train every day.",
        ["go", "goes", "going", "gone"], 1,
        "主語が he / she / it などの 3 人称単数で現在のときは、動詞に -s / -es を付けます。"),
    choice("grammar.006", "grammar", 2, "「あなたが電話をくれたとき、私はテレビを見ていた」→ I ( ) TV when you called.",
        ["was watching", "watch", "am watching", "have watched"], 0,
        "過去のある時点で進行していた動作は過去進行形 was / were + -ing で表します。"),
    choice("phrasal.005", "phrasal", 2, "\"Can you pick me up at the station?\" の pick up の意味として最も適切なものはどれか。",
        ["（車などで）迎えに来る", "持ち上げる", "選ぶ", "電話に出る"], 0,
        "pick up には「拾う」「迎えに行く」「電話に出る」など多くの意味があり、文脈で判断します。")
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
        { id: "english.numbers", name: "数字・時間・日付", weight: 2 },
        { id: "english.greetings", name: "あいさつ・自己紹介", weight: 2 },
        { id: "english.smalltalk", name: "雑談", weight: 3 },
        { id: "english.restaurant", name: "飲食店・買い物", weight: 2 },
        { id: "english.travel", name: "旅行", weight: 2 },
        { id: "english.work", name: "仕事", weight: 2 },
        { id: "english.grammar", name: "会話で使う文法", weight: 3 },
        { id: "english.phrasal", name: "句動詞・定番表現", weight: 2 }
    ],
    stages: [
        { id: "english.s1", title: "数字・あいさつ・基本文法", topics: ["english.numbers", "english.greetings", "english.grammar"] },
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
