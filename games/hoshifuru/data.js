// ほしふるクエスト：ゲームのデータ（職業・じゅもん・どうぐ・そうび・モンスター・出現表）
// 画面にもルールの計算にも依存しない。ブラウザでは window.HF.data、Node では module.exports。
(function (root) {
    "use strict";

    // ---------- 職業 ----------
    // 能力は Lv1 の値と Lv30 の目安の間を、成長曲線（curve）でなめらかに伸ばす（rules.js の growthAt）
    const classes = {
        hero: {
            name: "ゆうしゃ",
            start: { hp: 22, mp: 5, str: 8, def: 6, agi: 6, wis: 5 },
            end: { hp: 330, mp: 120, str: 140, def: 95, agi: 90, wis: 80 },
            curve: 1.15,
            spells: { 3: "iyashi", 4: "hinoko", 8: "nigemichi", 10: "furusato", 14: "daiiyashi", 18: "ikazuchi", 24: "hoshinohikari" }
        },
        mage: {
            name: "まほうつかい",
            start: { hp: 15, mp: 12, str: 4, def: 4, agi: 7, wis: 10 },
            end: { hp: 220, mp: 260, str: 60, def: 70, agi: 110, wis: 160 },
            curve: 1.15,
            spells: { 1: "hinoko", 3: "nemuri", 6: "koori", 9: "chikara", 13: "honoo", 19: "bakuhatsu" }
        },
        priest: {
            name: "そうりょ",
            start: { hp: 18, mp: 10, str: 6, def: 5, agi: 6, wis: 9 },
            end: { hp: 270, mp: 220, str: 90, def: 85, agi: 85, wis: 140 },
            curve: 1.15,
            spells: { 1: "iyashi", 2: "dokukeshi", 3: "mamori", 5: "hikarinoya", 7: "iyashinohikari", 9: "daiiyashi", 11: "yomigaeri" }
        }
    };

    // ---------- じゅもん ----------
    // target: enemy（敵 1 体）/ enemies（敵ぜんぶ）/ ally（味方 1 人）/ allies（味方ぜんぶ）/ field（移動中だけ）
    const spells = {
        iyashi: { name: "いやし", mp: 3, target: "ally", effect: "heal", power: [28, 36], field: true, text: "味方 1 人の HP を 30 ほど回復" },
        daiiyashi: { name: "だいいやし", mp: 7, target: "ally", effect: "heal", power: [90, 120], field: true, text: "味方 1 人の HP を 100 ほど回復" },
        iyashinohikari: { name: "いやしのひかり", mp: 9, target: "allies", effect: "heal", power: [34, 44], field: true, text: "味方ぜんいんの HP を 40 ほど回復" },
        dokukeshi: { name: "どくけし", mp: 2, target: "ally", effect: "cure", field: true, text: "味方 1 人の どく をなおす" },
        yomigaeri: { name: "よみがえり", mp: 15, target: "ally", effect: "revive", field: true, text: "たおれた味方を いきかえらせる" },
        mamori: { name: "まもりのいのり", mp: 4, target: "allies", effect: "defUp", text: "味方ぜんいんの みのまもり を上げる" },
        chikara: { name: "ちからのまほう", mp: 4, target: "ally", effect: "atkUp", text: "味方 1 人の こうげき力 を上げる" },
        hinoko: { name: "ひのこ", mp: 2, target: "enemy", effect: "damage", power: [10, 15], element: "fire", text: "敵 1 体に 火のダメージ" },
        koori: { name: "こおりのつぶて", mp: 5, target: "enemies", effect: "damage", power: [16, 24], element: "ice", text: "敵ぜんぶに 氷のダメージ" },
        honoo: { name: "ほのおのうず", mp: 9, target: "enemies", effect: "damage", power: [38, 52], element: "fire", text: "敵ぜんぶに 大きな火のダメージ" },
        bakuhatsu: { name: "ばくはつ", mp: 16, target: "enemies", effect: "damage", power: [72, 92], element: "blast", text: "敵ぜんぶに とても大きなダメージ" },
        ikazuchi: { name: "いかずち", mp: 10, target: "enemies", effect: "damage", power: [55, 72], element: "thunder", text: "敵ぜんぶに 雷のダメージ" },
        hikarinoya: { name: "ひかりのや", mp: 4, target: "enemy", effect: "damage", power: [26, 36], element: "light", text: "敵 1 体に 光のダメージ（かげ・ほねに よくきく）" },
        hoshinohikari: { name: "ほしのひかり", mp: 20, target: "enemy", effect: "damage", power: [160, 200], element: "light", text: "敵 1 体に 星の光で とても大きなダメージ" },
        nemuri: { name: "ねむりのうた", mp: 3, target: "enemies", effect: "sleep", chance: 0.55, text: "敵ぜんぶを ねむらせる（きかない敵もいる）" },
        nigemichi: { name: "にげみち", mp: 6, target: "field", effect: "escape", field: true, battle: false, text: "ダンジョンの 入口まで もどる" },
        furusato: { name: "ふるさと", mp: 8, target: "field", effect: "return", field: true, battle: false, text: "いちど行った 町や村へ とんでいく" }
    };

    // ---------- どうぐ ----------
    const items = {
        yakusou: { name: "やくそう", price: 8, use: { effect: "heal", power: [30, 40] }, text: "HP を 35 ほど回復" },
        jouyakusou: { name: "じょうやくそう", price: 40, use: { effect: "heal", power: [80, 100] }, text: "HP を 90 ほど回復" },
        mahounomizu: { name: "まほうのみず", price: 80, use: { effect: "mp", power: [20, 26] }, text: "MP を 20 ほど回復" },
        dokukeshisou: { name: "どくけしそう", price: 10, use: { effect: "cure" }, text: "どく をなおす" },
        hanenokakera: { name: "はねのかけら", price: 25, use: { effect: "return", field: true, battle: false }, text: "いちど行った 町や村へ とんでいく" },
        seisui: { name: "せいすい", price: 20, use: { effect: "holywater", steps: 120, field: true, battle: false }, text: "しばらく 弱い魔物が よってこない" },
        fukkatsunohane: { name: "ふっかつのはね", price: 300, use: { effect: "revive" }, text: "たおれた味方を いきかえらせる" },
        ganbarinotane: { name: "がんばりのたね", price: 0, sell: 0, use: { effect: "seed", field: true, battle: false }, text: "ToDo のがんばりから育った たね。能力が 1 つ上がる" },
        // だいじなもの（売れない・使えない）
        shizuku1: { name: "ほしのしずく・あお", key: true, text: "ほらあなの おくで 光っていた しずく" },
        shizuku2: { name: "ほしのしずく・みどり", key: true, text: "風の塔の てっぺんで 光っていた しずく" },
        shizuku3: { name: "ほしのしずく・あか", key: true, text: "みずうみの神殿で 光っていた しずく" }
    };

    // ---------- そうび ----------
    // classes を書いたものは、その職業だけが そうびできる
    const equipment = {
        hinokinobou: { name: "ひのきのぼう", slot: "weapon", atk: 4, price: 10 },
        konbou: { name: "こんぼう", slot: "weapon", atk: 8, price: 50, classes: ["hero", "priest"] },
        dounotsurugi: { name: "どうのつるぎ", slot: "weapon", atk: 13, price: 150, classes: ["hero"] },
        tetsunoyari: { name: "てつのやり", slot: "weapon", atk: 20, price: 420, classes: ["hero"] },
        haganenotsurugi: { name: "はがねのつるぎ", slot: "weapon", atk: 30, price: 1100, classes: ["hero"] },
        hikarinotsurugi: { name: "ひかりのつるぎ", slot: "weapon", atk: 44, price: 3200, classes: ["hero"] },
        hoshinotsurugi: { name: "ほしのつるぎ", slot: "weapon", atk: 60, price: 0, classes: ["hero"] },
        kashinotsue: { name: "かしのつえ", slot: "weapon", atk: 7, price: 70, classes: ["mage", "priest"] },
        madoushinotsue: { name: "まどうしのつえ", slot: "weapon", atk: 13, price: 480, classes: ["mage"] },
        tetsunomeisu: { name: "てつのメイス", slot: "weapon", atk: 18, price: 600, classes: ["priest"] },
        seinarutsue: { name: "せいなるつえ", slot: "weapon", atk: 24, price: 1800, classes: ["mage", "priest"] },

        nunonofuku: { name: "ぬののふく", slot: "armor", def: 4, price: 10 },
        tabibitonofuku: { name: "たびびとのふく", slot: "armor", def: 7, price: 70 },
        kawanoyoroi: { name: "かわのよろい", slot: "armor", def: 10, price: 160, classes: ["hero", "priest"] },
        kusarikatabira: { name: "くさりかたびら", slot: "armor", def: 16, price: 420, classes: ["hero", "priest"] },
        mahounorobu: { name: "まほうのローブ", slot: "armor", def: 15, price: 500, classes: ["mage", "priest"] },
        tetsunoyoroi: { name: "てつのよろい", slot: "armor", def: 25, price: 1100, classes: ["hero"] },
        seinarurobu: { name: "せいなるローブ", slot: "armor", def: 26, price: 1600, classes: ["mage", "priest"] },
        haganenoyoroi: { name: "はがねのよろい", slot: "armor", def: 34, price: 2800, classes: ["hero"] },
        hikarinoyoroi: { name: "ひかりのよろい", slot: "armor", def: 46, price: 0, classes: ["hero"] },

        kawanotate: { name: "かわのたて", slot: "shield", def: 4, price: 90, classes: ["hero", "priest"] },
        tetsunotate: { name: "てつのたて", slot: "shield", def: 10, price: 650, classes: ["hero", "priest"] },
        hoshinotate: { name: "ほしのたて", slot: "shield", def: 20, price: 2400, classes: ["hero"] }
    };

    // ---------- モンスター ----------
    // sprite は sprites.js の絵、palette は色の組み合わせ。actions は行動の重み
    // resist は じゅもんの属性ごとの倍率（0 で無効）。undead は ひかり がよくきく
    const enemies = {
        pururin: { name: "ぷるりん", sprite: "blob", palette: "blue", hp: 8, atk: 10, def: 4, agi: 3, exp: 2, gold: 2, actions: [["attack", 1]] },
        koumorin: { name: "こうもりん", sprite: "bat", palette: "purple", hp: 9, atk: 12, def: 5, agi: 10, exp: 3, gold: 3, actions: [["attack", 1]] },
        obakekinoko: { name: "おばけきのこ", sprite: "mushroom", palette: "red", hp: 13, atk: 13, def: 7, agi: 4, exp: 4, gold: 4, actions: [["attack", 4], ["poisonPowder", 1]] },
        itazuranezumi: { name: "いたずらねずみ", sprite: "rat", palette: "brown", hp: 12, atk: 14, def: 6, agi: 8, exp: 5, gold: 6, actions: [["attack", 1]] },

        purubesu: { name: "ぷるべす", sprite: "blob", palette: "green", hp: 20, atk: 20, def: 11, agi: 6, exp: 8, gold: 7, actions: [["attack", 4], ["healAlly", 1]] },
        honezou: { name: "ほねぞう", sprite: "skeleton", palette: "bone", hp: 26, atk: 22, def: 14, agi: 7, exp: 11, gold: 10, undead: true, resist: { light: 2 }, actions: [["attack", 1]] },
        dokugumo: { name: "どくぐも", sprite: "spider", palette: "green", hp: 22, atk: 20, def: 12, agi: 11, exp: 10, gold: 9, actions: [["attack", 3], ["poisonBite", 2]] },
        hinokobat: { name: "ひのこバット", sprite: "bat", palette: "red", hp: 20, atk: 21, def: 10, agi: 15, exp: 10, gold: 8, resist: { fire: 0.5 }, actions: [["attack", 3], ["spell:hinoko", 2]] },
        pikarin: { name: "ぴかりん", sprite: "blob", palette: "gold", hp: 5, atk: 14, def: 250, agi: 60, exp: 320, gold: 15, rare: true, resist: { fire: 0, ice: 0, thunder: 0, light: 0, blast: 0 }, sleepImmune: true, actions: [["attack", 2], ["flee", 3]] },

        iwaotoko: { name: "いわおとこ", sprite: "golem", palette: "stone", hp: 190, atk: 34, def: 18, agi: 5, exp: 140, gold: 160, boss: true, sleepImmune: true, actions: [["attack", 3], ["charge", 2], ["quake", 1]] },

        umipururin: { name: "うみぷるりん", sprite: "blob", palette: "teal", hp: 34, atk: 32, def: 18, agi: 11, exp: 17, gold: 13, resist: { ice: 0.5 }, actions: [["attack", 3], ["healAlly", 1]] },
        tsumujidori: { name: "つむじどり", sprite: "bird", palette: "yellow", hp: 36, atk: 34, def: 16, agi: 24, exp: 19, gold: 15, actions: [["attack", 3], ["windBlade", 1]] },
        gaikotsukenshi: { name: "がいこつけんし", sprite: "skeleton", palette: "blue", hp: 46, atk: 40, def: 24, agi: 13, exp: 25, gold: 22, undead: true, resist: { light: 2 }, actions: [["attack", 3], ["charge", 1]] },
        madoukinoko: { name: "まどうきのこ", sprite: "mushroom", palette: "purple", hp: 38, atk: 32, def: 20, agi: 11, exp: 21, gold: 18, actions: [["attack", 2], ["sleepPowder", 1], ["spell:hinoko", 1]] },

        arashinooodori: { name: "あらしのおおとり", sprite: "bird", palette: "storm", hp: 440, atk: 50, def: 30, agi: 32, exp: 450, gold: 420, boss: true, sleepImmune: true, actionsPerTurn: 2, actions: [["attack", 3], ["tornado", 2]] },

        morinokemono: { name: "もりのけもの", sprite: "rat", palette: "green", hp: 62, atk: 52, def: 28, agi: 19, exp: 36, gold: 28, actions: [["attack", 3], ["charge", 1]] },
        mizuhebi: { name: "みずへび", sprite: "snake", palette: "blue", hp: 56, atk: 50, def: 30, agi: 17, exp: 34, gold: 26, resist: { fire: 0.5 }, actions: [["attack", 3], ["poisonBite", 1]] },
        samayouyoroi: { name: "さまようよろい", sprite: "knight", palette: "steel", hp: 80, atk: 60, def: 42, agi: 13, exp: 48, gold: 44, resist: { thunder: 0.7 }, actions: [["attack", 3], ["charge", 1]] },
        yureilamp: { name: "ゆうれいランプ", sprite: "ghost", palette: "pale", hp: 50, atk: 46, def: 32, agi: 21, exp: 42, gold: 32, undead: true, resist: { light: 2, ice: 0.5 }, actions: [["attack", 2], ["spell:koori", 1], ["sleepPowder", 1]] },

        mizunooohebi: { name: "みずのおおへび", sprite: "snake", palette: "sea", hp: 820, atk: 66, def: 38, agi: 25, exp: 950, gold: 820, boss: true, sleepImmune: true, actionsPerTurn: 2, resist: { ice: 0.5 }, actions: [["attack", 3], ["waterBreath", 2], ["selfHeal", 1]] },

        kagepururin: { name: "かげぷるりん", sprite: "blob", palette: "shadow", hp: 90, atk: 72, def: 44, agi: 27, exp: 64, gold: 42, undead: true, resist: { light: 1.5 }, actions: [["attack", 3], ["spell:honoo", 1]] },
        yaminokishi: { name: "やみのきし", sprite: "knight", palette: "dark", hp: 125, atk: 84, def: 58, agi: 23, exp: 86, gold: 64, resist: { light: 1.5 }, actions: [["attack", 3], ["charge", 2]] },
        shinigamikoumori: { name: "しにがみこうもり", sprite: "bat", palette: "dark", hp: 84, atk: 76, def: 40, agi: 42, exp: 74, gold: 48, undead: true, resist: { light: 1.5 }, actions: [["attack", 3], ["poisonBite", 1]] },
        kagenomadoushi: { name: "かげのまどうし", sprite: "ghost", palette: "shadow", hp: 100, atk: 62, def: 46, agi: 31, exp: 90, gold: 66, undead: true, resist: { light: 1.5 }, actions: [["attack", 1], ["spell:bakuhatsu", 1], ["sleepPowder", 1]] },

        yaminomonban: { name: "やみのもんばん", sprite: "golem", palette: "dark", hp: 1700, atk: 94, def: 54, agi: 20, exp: 1200, gold: 900, boss: true, sleepImmune: true, actionsPerTurn: 2, actions: [["attack", 3], ["charge", 2], ["quake", 2]] },
        kagenoou: { name: "かげの王", sprite: "king", palette: "shadow", hp: 1700, atk: 92, def: 60, agi: 42, exp: 0, gold: 0, boss: true, sleepImmune: true, actionsPerTurn: 2, resist: { light: 1.5 }, actions: [["attack", 3], ["darkFlame", 2], ["dispel", 1]] },
        kagenoou2: { name: "かげの王（しんのすがた）", sprite: "king", palette: "true", hp: 2100, atk: 100, def: 64, agi: 48, exp: 0, gold: 0, boss: true, sleepImmune: true, actionsPerTurn: 2, resist: { light: 1.5 }, actions: [["attack", 3], ["darkFlame", 2], ["dispel", 1], ["selfHeal", 1]] }
    };

    // 魔物の とくぎ（じゅもん以外の行動）
    const skills = {
        charge: { text: "{name}は いきおいよく とびかかってきた！", kind: "attack", mult: 1.5 },
        poisonBite: { text: "{name}は どくのキバで かみついた！", kind: "attack", mult: 1, poison: 0.5 },
        poisonPowder: { text: "{name}は あやしい こなを まきちらした！", kind: "status", status: "poison", chance: 0.6 },
        sleepPowder: { text: "{name}は ねむりのこなを まきちらした！", kind: "status", status: "sleep", chance: 0.45 },
        windBlade: { text: "{name}は かぜのやいばを はなった！", kind: "group", power: [9, 15] },
        quake: { text: "{name}は じめんを ゆらした！", kind: "group", power: [14, 22] },
        tornado: { text: "{name}は たつまきを おこした！", kind: "group", power: [24, 34] },
        waterBreath: { text: "{name}は つめたい みずを はきだした！", kind: "group", power: [34, 46] },
        darkFlame: { text: "{name}は やみのほのおを はいた！", kind: "group", power: [40, 54] },
        dispel: { text: "{name}は いてつく はどうを はなった！", kind: "dispel" },
        healAlly: { text: "{name}は いやしの じゅもんを となえた！", kind: "healAlly", power: [20, 30] },
        selfHeal: { text: "{name}の きずが ふさがっていく！", kind: "selfHeal", power: [120, 160] },
        flee: { text: "{name}は にげだした！", kind: "flee" }
    };

    // ---------- 出現表 ----------
    // max はいちどに出る数の上限。rare を含む表では、ときどき ぴかりん が混ざる
    const zones = {
        field1: { enemies: ["pururin", "koumorin", "obakekinoko", "itazuranezumi"], max: 2 },
        field2: { enemies: ["koumorin", "obakekinoko", "itazuranezumi", "purubesu", "dokugumo"], max: 2, rare: "pikarin" },
        cave: { enemies: ["purubesu", "honezou", "dokugumo", "hinokobat"], max: 3, rare: "pikarin" },
        field3: { enemies: ["purubesu", "hinokobat", "umipururin", "tsumujidori", "dokugumo"], max: 3, rare: "pikarin" },
        tower: { enemies: ["umipururin", "tsumujidori", "gaikotsukenshi", "madoukinoko"], max: 3, rare: "pikarin" },
        field4: { enemies: ["tsumujidori", "gaikotsukenshi", "morinokemono", "mizuhebi", "madoukinoko"], max: 3, rare: "pikarin" },
        shrine: { enemies: ["morinokemono", "mizuhebi", "samayouyoroi", "yureilamp"], max: 3, rare: "pikarin" },
        field5: { enemies: ["samayouyoroi", "yureilamp", "kagepururin", "shinigamikoumori"], max: 3, rare: "pikarin" },
        castle: { enemies: ["kagepururin", "yaminokishi", "shinigamikoumori", "kagenomadoushi"], max: 4, rare: "pikarin" }
    };

    const data = { classes, spells, items, equipment, enemies, skills, zones };

    const HF = root.HF = root.HF || {};
    HF.data = data;
    if (typeof module === "object" && module.exports) {
        module.exports = data;
    }
})(typeof window !== "undefined" ? window : globalThis);
