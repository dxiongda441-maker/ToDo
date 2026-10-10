// ほしふるクエスト：ドット絵（人物・魔物）と地形のタイル。画像ファイルは使わず、ここで描く。
// 正面向きの絵は「左半分」だけを書き、左右反転して全体を作る（左右対称になる）。
(function (root) {
    "use strict";

    // ---------- 人物（16×16。正面は左半分 8 列） ----------
    // 文字：h 髪 / s 肌 / e 目 / 1 服 / 2 服の影 / 3 飾り / l ズボン / k くつ / w 白 / m 口
    const HALF_PEOPLE = {
        hero: [
            "........",
            ".....hhh",
            "...hhhhh",
            "..hhhhhh",
            "..hhhsss",
            "..hssess",
            "...sssss",
            "....ssss",
            "...33113",
            "..112111",
            ".s112113",
            ".s.12111",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        mage: [
            "......11",
            ".....111",
            "....1131",
            "...11111",
            ".1111111",
            "..hhssss",
            "..hseess",
            "..hsssss",
            "...hssss",
            "...11311",
            "..111111",
            ".s111111",
            "..111111",
            "..122222",
            "...11111",
            "...kk..k"
        ],
        priest: [
            "........",
            "....wwww",
            "...ww333",
            "...wwwww",
            "..hhssss",
            "..hseess",
            "..hsssss",
            "...hssss",
            "...wwwww",
            "..ww3w3w",
            ".swwwww3",
            ".swwwwww",
            "..wwwwww",
            "..w22222",
            "...wwwww",
            "...kk..k"
        ],
        man: [
            "........",
            ".....hhh",
            "....hhhh",
            "...hhhhh",
            "...hssss",
            "...sesss",
            "...sssss",
            "....ssss",
            "...11111",
            "..111111",
            ".s111111",
            ".s.11111",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        woman: [
            "........",
            "....hhhh",
            "...hhhhh",
            "..hhhhhh",
            "..hhssss",
            "..hsesss",
            "..hsssss",
            "..hhssss",
            "..hh1111",
            "...11311",
            "..s11111",
            "..s11111",
            "...11111",
            "..111111",
            "..122222",
            "....kk.k"
        ],
        elder: [
            "........",
            ".....www",
            "....wwww",
            "...wwsss",
            "...wssss",
            "...sesss",
            "...sssss",
            "...wwwww",
            "..1wwwww",
            "..11wwww",
            ".s111111",
            "3s111111",
            "3.111111",
            "3.122222",
            "3..11111",
            "3..kk..k"
        ],
        merchant: [
            "........",
            "....3333",
            "...33333",
            "..333333",
            "...hssss",
            "...sesss",
            "...sssss",
            "...hhhhh",
            "...11111",
            "..1111w1",
            ".s1111w1",
            ".s.11111",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        merchant2: [
            "........",
            ".....hhh",
            "....hhhh",
            "...hhhhh",
            "...hssss",
            "...sesss",
            "...sssss",
            "....ssss",
            "...wwwww",
            "..11wwww",
            ".s11wwww",
            ".s.1wwww",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        soldier: [
            "........",
            "....3333",
            "...33333",
            "..333333",
            "..3hssss",
            "..3sesss",
            "...sssss",
            "....ssss",
            "...33333",
            "..113111",
            ".s113111",
            ".s.13111",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        nun: [
            "........",
            "....1111",
            "...11111",
            "..111111",
            "..11ssss",
            "..1sesss",
            "..1sssss",
            "..11ssss",
            "..11wwww",
            "..111131",
            "..s11111",
            "..s11111",
            "...11111",
            "..111111",
            "..122222",
            "....kk.k"
        ],
        sailor: [
            "........",
            "....wwww",
            "...wwwww",
            "...33333",
            "...hssss",
            "...sesss",
            "...sssss",
            "....ssss",
            "...w1w1w",
            "..w1w1w1",
            ".sw1w1w1",
            ".s.1w1w1",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ],
        kid: [
            "........",
            "........",
            "........",
            ".....hhh",
            "....hhhh",
            "...hhsss",
            "...hsess",
            "...sssss",
            "....ssss",
            "...11111",
            "..s11111",
            "..s11111",
            "...22222",
            "....ll.l",
            "....ll.l",
            "...kkk.k"
        ]
    };

    // ゆうしゃの 後ろ向き・横向き（横は全体 16 列、右向きは反転）
    const HERO_UP = [
        "........",
        ".....hhh",
        "...hhhhh",
        "..hhhhhh",
        "..hhhhhh",
        "..hhhhhh",
        "...hhhhh",
        "....hhhh",
        "...33333",
        "..111111",
        ".s111111",
        ".s.11111",
        "...22222",
        "....ll.l",
        "....ll.l",
        "...kkk.k"
    ];
    const HERO_SIDE = [
        "................",
        "......hhhh......",
        "....hhhhhhh.....",
        "...hhhhhhhhh....",
        "...hhhhhssss....",
        "...hhhhssses....",
        "....hhhsssss....",
        ".....hhssss.....",
        ".....3311.......",
        "....1111111.....",
        "....11111s1.....",
        "....11111s......",
        ".....22222......",
        "......ll.l......",
        "......ll..l.....",
        ".....kkk..kk...."
    ];

    const PEOPLE_COLORS = {
        hero: { h: "#7a3e1d", s: "#f2c79a", e: "#1b1b2f", 1: "#2f6fd6", 2: "#1c3f86", 3: "#f1c232", l: "#6b4a2b", k: "#3a2615", w: "#ffffff" },
        mage: { h: "#d9a441", s: "#f5cfa6", e: "#20203a", 1: "#7a3fb8", 2: "#4a2577", 3: "#f1c232", l: "#3f2a55", k: "#2e1f3b", w: "#ffffff" },
        priest: { h: "#a35b2c", s: "#f5cfa6", e: "#20203a", 1: "#e8e8f0", 2: "#a9a9c0", 3: "#2a9d8f", l: "#888", k: "#4a3a2a", w: "#f4f4fb" },
        man: { h: "#4a3423", s: "#e9b98d", e: "#1b1b2f", 1: "#4f8a3c", 2: "#2f5a23", 3: "#ddd", l: "#5b4636", k: "#2e2117", w: "#fff" },
        woman: { h: "#b5562e", s: "#f2c79a", e: "#1b1b2f", 1: "#d0577d", 2: "#923554", 3: "#ffe08a", l: "#5b4636", k: "#3a2a20", w: "#fff" },
        elder: { h: "#ccc", s: "#e3b48a", e: "#1b1b2f", 1: "#6d4c8f", 2: "#47305e", 3: "#8a6a3a", l: "#555", k: "#333", w: "#efefef" },
        merchant: { h: "#3b2a1a", s: "#e9b98d", e: "#1b1b2f", 1: "#b5652e", 2: "#7a4019", 3: "#2f8f6f", l: "#5b4636", k: "#2e2117", w: "#f6f0e0" },
        merchant2: { h: "#2d2d2d", s: "#e9b98d", e: "#1b1b2f", 1: "#7d7d8c", 2: "#4d4d5a", 3: "#ddd", l: "#4a4a55", k: "#2a2a30", w: "#c9a05a" },
        soldier: { h: "#3b2a1a", s: "#e9b98d", e: "#1b1b2f", 1: "#8a2f2f", 2: "#5a1d1d", 3: "#b8c0c8", l: "#5b4636", k: "#2e2117", w: "#fff" },
        nun: { h: "#000", s: "#f2c79a", e: "#1b1b2f", 1: "#2b2f4a", 2: "#181a2c", 3: "#f1c232", l: "#333", k: "#222", w: "#f4f4fb" },
        sailor: { h: "#3b2a1a", s: "#e3b48a", e: "#1b1b2f", 1: "#2f5fae", 2: "#1d3d73", 3: "#2f5fae", l: "#304a7a", k: "#222", w: "#f4f4fb" },
        kid: { h: "#d08a2e", s: "#f5cfa6", e: "#1b1b2f", 1: "#e0a128", 2: "#a87214", 3: "#fff", l: "#6b4a2b", k: "#3a2615", w: "#fff" }
    };

    // ---------- 魔物（24×24。左半分 12 列） ----------
    // 文字：1 体 / 2 影 / 3 光 / e 白目 / p ひとみ / m 口 / a b 飾り
    const MONSTERS = {
        blob: [
            "............",
            "............",
            "............",
            "........bb..",
            ".......bbbb.",
            "........bbba",
            "...........a",
            "...........a",
            ".........111",
            ".......11111",
            "......113311",
            ".....1133111",
            "....11131111",
            "...111111111",
            "...11eee1111",
            "..111epe1111",
            "..111eee1111",
            "..1111111111",
            ".11111111mmm",
            ".1111111111m",
            ".2111111111m",
            ".22111111111",
            "..2222222222",
            "............"
        ],
        bat: [
            "............",
            "............",
            "............",
            "............",
            "............",
            "1...........",
            "11.......1..",
            "111......11.",
            "1111.....111",
            "11211...1111",
            "112211.11111",
            "1122211113e1",
            ".11222111eep",
            ".112222111ee",
            "..11222211mm",
            "..111222111a",
            "...1.1221111",
            "........1111",
            ".........111",
            "..........11",
            "............",
            "............",
            "............",
            "............"
        ],
        mushroom: [
            "............",
            "............",
            ".......11111",
            ".....1111111",
            "....11331111",
            "...113311b11",
            "..1131111bb1",
            "..11111b1111",
            ".11bb1111111",
            ".1bbb1111111",
            ".11b11111111",
            ".22111111111",
            "..2222222222",
            ".......aaaaa",
            "......aeeaaa",
            "......aepaaa",
            "......aaaaaa",
            "......aaammm",
            "......aaaaaa",
            ".....aaaaaaa",
            "....22aaaaaa",
            "....222.2222",
            "............",
            "............"
        ],
        rat: [
            "............",
            "............",
            "............",
            "...11.......",
            "..1331......",
            "..1331......",
            "..11111..111",
            "..1111111111",
            "...111111111",
            "..1111111111",
            "..111eep1111",
            "..111ee11111",
            "..1111111111",
            "...111111mmm",
            "....1111111a",
            "...111111111",
            "..1111111111",
            "..1111112111",
            ".11111122111",
            ".1111112.111",
            ".1111122.111",
            "..22222..222",
            "............",
            "............"
        ],
        skeleton: [
            "............",
            "........1111",
            "......111111",
            ".....1111111",
            ".....11ppp11",
            ".....11ppp11",
            ".....1111111",
            "......11m1m1",
            ".......11111",
            "........1.1.",
            "....11111111",
            "...1.1.1.1.1",
            "...1.1111111",
            "...1.1.1.1.1",
            "..11..111111",
            "..1a...1.1.1",
            "..aa....1111",
            ".aa.....1..1",
            "aa......1..1",
            "........1..1",
            ".......11..1",
            "......111.11",
            "............",
            "............"
        ],
        spider: [
            "............",
            "............",
            "............",
            "............",
            "1...........",
            "1.1.........",
            ".1.1.....111",
            "..1.1..11111",
            "...1.1111111",
            "1...1113e111",
            ".1...11eep11",
            "..1111111111",
            "....11111111",
            "..11.1111mmm",
            ".1..111111a1",
            "1..1..111111",
            "..1..1.11111",
            ".1..1...1111",
            "1..1....2222",
            "..1.........",
            ".1..........",
            "............",
            "............",
            "............"
        ],
        bird: [
            "............",
            "............",
            ".........aaa",
            "..........aa",
            ".........111",
            "........1111",
            "1.......1e11",
            "11......1ep1",
            "111.....11bb",
            "1111.....bbb",
            "11211...1111",
            ".112211.1111",
            ".1122211111.",
            "..11222111.1",
            "...112221111",
            "....11221111",
            ".....1121111",
            "......11a111",
            "........a1.1",
            ".......a.a..",
            "......a.a...",
            "............",
            "............",
            "............"
        ],
        golem: [
            "............",
            "......111111",
            ".....1111111",
            ".....1131111",
            ".....11ee111",
            ".....11ep111",
            ".....1111111",
            "...111mmmmmm",
            "..1111111111",
            ".11311111111",
            ".11311112111",
            "111111122111",
            "1111.1111111",
            "111..1111111",
            "111..1111211",
            "111..1112211",
            ".11..1111111",
            ".....1111111",
            ".....111..11",
            "....1111..11",
            "....1111..11",
            "...22222.222",
            "............",
            "............"
        ],
        snake: [
            "............",
            "............",
            "........1111",
            ".......11111",
            "......113111",
            "......1e1111",
            "......1p1111",
            "......111mmm",
            "......11111a",
            ".......111.a",
            "........1111",
            ".........111",
            "........1111",
            ".......11111",
            "......111112",
            ".....1111122",
            "....11111222",
            "...111111221",
            "..1111111111",
            "..1122222222",
            "...111111111",
            "....22222222",
            "............",
            "............"
        ],
        knight: [
            "............",
            ".........aa.",
            "........aaaa",
            ".......aa...",
            "......111111",
            ".....1111111",
            ".....11mmmmm",
            ".....11mmepm",
            ".....1111111",
            "...111111111",
            "..1111131111",
            "b.1111131111",
            "b.1111111111",
            "b..111111111",
            "b..112111111",
            "b..11.111111",
            "b..11.111111",
            "....2.111111",
            "......111.11",
            "......111.11",
            ".....1111.11",
            ".....2222.22",
            "............",
            "............"
        ],
        ghost: [
            "............",
            "............",
            "........1111",
            "......111111",
            ".....1131111",
            "....11311111",
            "....11111111",
            "....11ee1111",
            "....11ep1111",
            "....11111111",
            "...1111111mm",
            "..11111111mm",
            ".1.111111111",
            "...111111111",
            "...111111111",
            "...111111111",
            "....11111111",
            "....1.111111",
            "....1..1.111",
            "........1..1",
            "............",
            "............",
            "............",
            "............"
        ],
        king: [
            "........a..a",
            "........aaaa",
            ".......aaaaa",
            "......111111",
            ".....1111111",
            ".....11eep11",
            ".....1111111",
            "......1mmmmm",
            "...b..111111",
            "..bbb1111111",
            ".bb111111111",
            ".b1111131111",
            "bb1111111111",
            "b11.11111111",
            "b11.11111111",
            "b1..11111111",
            "b...11111111",
            "b...11111111",
            "...111111111",
            "...111111111",
            "..1111111111",
            "..2222222222",
            "............",
            "............"
        ]
    };

    // 魔物の色の組み合わせ（同じ形でも色ちがいで別の魔物になる）
    const MONSTER_PALETTES = {
        blue: { 1: "#3d8de0", 2: "#245a96", 3: "#a8d4ff", e: "#fff", p: "#1b1b2f", m: "#1b1b2f", a: "#3d9a3d", b: "#5cc65c" },
        green: { 1: "#4caf50", 2: "#2e7031", 3: "#b2f0a8", e: "#fff", p: "#1b1b2f", m: "#1b1b2f", a: "#8a5a2b", b: "#d0a040" },
        teal: { 1: "#2bb3a8", 2: "#167068", 3: "#a8f0e8", e: "#fff", p: "#1b1b2f", m: "#1b1b2f", a: "#e0e0e0", b: "#ffffff" },
        gold: { 1: "#f5c518", 2: "#b8860b", 3: "#fff7c2", e: "#fff", p: "#1b1b2f", m: "#7a5200", a: "#ffffff", b: "#fff2a0" },
        shadow: { 1: "#3a3150", 2: "#1d1729", 3: "#7d6aa8", e: "#ff4d4d", p: "#ffdd00", m: "#0b0812", a: "#9b59d0", b: "#c39bff" },
        purple: { 1: "#8e5bd0", 2: "#5b3592", 3: "#d6b8ff", e: "#fff", p: "#c0392b", m: "#2b1340", a: "#f1c232", b: "#e6d6ff" },
        red: { 1: "#d9534f", 2: "#8f2b28", 3: "#ffb3a7", e: "#fff", p: "#1b1b2f", m: "#3b1010", a: "#f2e6d0", b: "#fff4e0" },
        brown: { 1: "#9a6b43", 2: "#5e3d22", 3: "#e8c8a0", e: "#fff", p: "#1b1b2f", m: "#3b2010", a: "#f2c79a", b: "#fff" },
        bone: { 1: "#ece6d4", 2: "#a69f8a", 3: "#fff", e: "#fff", p: "#1b1b2f", m: "#4a4030", a: "#b0b8c0", b: "#fff" },
        yellow: { 1: "#e8b923", 2: "#9b7a10", 3: "#fff0a8", e: "#fff", p: "#1b1b2f", m: "#5a4000", a: "#f08a24", b: "#f08a24" },
        storm: { 1: "#3f7f6f", 2: "#24493f", 3: "#a8e0cf", e: "#fff", p: "#c0392b", m: "#14251f", a: "#f1c232", b: "#e0e0e0" },
        stone: { 1: "#8d8d8d", 2: "#555", 3: "#c8c8c8", e: "#f1c232", p: "#c0392b", m: "#333", a: "#777", b: "#999" },
        sea: { 1: "#2f6fbf", 2: "#1a3f73", 3: "#9cc8ff", e: "#fff", p: "#c0392b", m: "#0d1f3a", a: "#f2f2f2", b: "#9cc8ff" },
        steel: { 1: "#9aa5b1", 2: "#5e6873", 3: "#e3e8ee", e: "#ff4d4d", p: "#ffdd00", m: "#1b1b2f", a: "#c0392b", b: "#d0b060" },
        dark: { 1: "#41394f", 2: "#221d2a", 3: "#8a7aa8", e: "#ff4d4d", p: "#ffdd00", m: "#0b0812", a: "#8e44ad", b: "#c0c0d0" },
        pale: { 1: "#d8e4f0", 2: "#9fb3c8", 3: "#ffffff", e: "#203040", p: "#4fa3ff", m: "#203040", a: "#f1c232", b: "#fff" },
        star: { 1: "#2a3a8a", 2: "#141d4d", 3: "#ffe066", e: "#fff", p: "#1b1b2f", m: "#0b1030", a: "#ffd34d", b: "#fff7c2" },
        cosmic: { 1: "#6a3fb5", 2: "#33206b", 3: "#7df9ff", e: "#fff", p: "#ff4dd2", m: "#140b2e", a: "#7df9ff", b: "#e0b3ff" },
        "true": { 1: "#5d1f3a", 2: "#2e0d1d", 3: "#c0607e", e: "#ffdd00", p: "#ff2d2d", m: "#12040a", a: "#f1c232", b: "#c0c0d0" }
    };

    // ---------- 絵を canvas にする（作ったものはとっておく） ----------
    const cache = new Map();

    function makeCanvas(w, h) {
        if (typeof document === "undefined") {
            return null;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }

    function mirrorRows(half) {
        return half.map(row => row + row.split("").reverse().join(""));
    }

    function drawGrid(rows, colors, flip) {
        const h = rows.length;
        const w = rows[0].length;
        const canvas = makeCanvas(w, h);
        const ctx = canvas.getContext("2d");
        rows.forEach((row, y) => {
            for (let x = 0; x < w; x += 1) {
                const ch = row[x];
                const color = colors[ch];
                if (ch !== "." && color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
                }
            }
        });
        return canvas;
    }

    // 歩きの 2 コマ目：足を入れかえる
    function stepFrame(rows) {
        const out = rows.slice();
        const n = out.length;
        out[n - 3] = rows[n - 2].split("").reverse().join("");
        out[n - 2] = rows[n - 3].split("").reverse().join("");
        out[n - 1] = rows[n - 1].split("").reverse().join("");
        return out;
    }

    // name: 人物 / dir: down・up・left・right / frame: 0・1
    function person(name, dir, frame) {
        const key = `p:${name}:${dir}:${frame}`;
        if (cache.has(key)) {
            return cache.get(key);
        }
        const colors = PEOPLE_COLORS[name] || PEOPLE_COLORS.man;
        let rows;
        let flip = false;
        if (name === "hero" && dir === "up") {
            rows = mirrorRows(HERO_UP);
        } else if (name === "hero" && (dir === "left" || dir === "right")) {
            rows = HERO_SIDE;
            flip = dir === "right";
        } else {
            rows = mirrorRows(HALF_PEOPLE[name] || HALF_PEOPLE.man);
        }
        if (frame === 1) {
            rows = stepFrame(rows);
        }
        const canvas = drawGrid(rows, colors, flip);
        cache.set(key, canvas);
        return canvas;
    }

    function monster(shape, palette) {
        const key = `m:${shape}:${palette}`;
        if (cache.has(key)) {
            return cache.get(key);
        }
        const canvas = drawGrid(mirrorRows(MONSTERS[shape]), MONSTER_PALETTES[palette] || MONSTER_PALETTES.blue, false);
        cache.set(key, canvas);
        return canvas;
    }

    // ---------- 地形のタイル（16×16 を手続きで描く） ----------
    function seeded(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    function speckle(ctx, base, dots, seed, count) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 16, 16);
        const rnd = seeded(seed);
        for (let i = 0; i < count; i += 1) {
            ctx.fillStyle = dots[Math.floor(rnd() * dots.length)];
            ctx.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
        }
    }

    function bricks(ctx, base, line, light) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = line;
        for (let y = 0; y < 16; y += 4) {
            ctx.fillRect(0, y + 3, 16, 1);
            const off = (y / 4) % 2 === 0 ? 0 : 4;
            for (let x = off; x < 16; x += 8) {
                ctx.fillRect(x, y, 1, 3);
            }
        }
        ctx.fillStyle = light;
        for (let y = 0; y < 16; y += 4) {
            ctx.fillRect(0, y, 16, 1);
        }
    }

    function tree(ctx, ground, dark, mid, light, trunk) {
        speckle(ctx, ground, [ground], 1, 0);
        ctx.fillStyle = trunk;
        ctx.fillRect(7, 11, 2, 4);
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(8, 7, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.arc(7, 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light;
        ctx.fillRect(5, 3, 2, 2);
        ctx.fillRect(9, 5, 1, 1);
    }

    function water(ctx, frame, deep, light) {
        ctx.fillStyle = deep;
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = light;
        const off = frame ? 4 : 0;
        for (let y = 2; y < 16; y += 6) {
            ctx.fillRect((off + y) % 16, y, 4, 1);
            ctx.fillRect((off + y + 8) % 16, y + 3, 3, 1);
        }
    }

    function icon(ctx, kind) {
        // 地図の上の 町・ほらあな・塔・神殿・城 の印
        const grass = "#5fae4e";
        speckle(ctx, grass, ["#6fbf5c", "#4f9a40"], 3, 18);
        if (kind === "town") {
            ctx.fillStyle = "#c0392b";
            ctx.fillRect(2, 4, 6, 3);
            ctx.fillRect(9, 6, 6, 3);
            ctx.fillStyle = "#f2e6d0";
            ctx.fillRect(3, 7, 4, 5);
            ctx.fillRect(10, 9, 4, 5);
            ctx.fillStyle = "#6b4a2b";
            ctx.fillRect(4, 9, 2, 3);
            ctx.fillRect(11, 11, 2, 3);
        } else if (kind === "cave") {
            ctx.fillStyle = "#8d8d8d";
            ctx.beginPath();
            ctx.moveTo(0, 15);
            ctx.lineTo(8, 1);
            ctx.lineTo(16, 15);
            ctx.fill();
            ctx.fillStyle = "#1b1b1b";
            ctx.fillRect(6, 9, 4, 6);
            ctx.fillRect(7, 8, 2, 1);
        } else if (kind === "tower") {
            ctx.fillStyle = "#cfc6b0";
            ctx.fillRect(5, 2, 6, 13);
            ctx.fillStyle = "#8a8170";
            ctx.fillRect(5, 2, 6, 1);
            ctx.fillRect(4, 1, 1, 2);
            ctx.fillRect(7, 1, 2, 1);
            ctx.fillRect(11, 1, 1, 2);
            ctx.fillStyle = "#3a3a3a";
            ctx.fillRect(7, 5, 2, 2);
            ctx.fillRect(7, 11, 2, 4);
        } else if (kind === "shrine") {
            ctx.fillStyle = "#e8eef5";
            ctx.fillRect(2, 5, 12, 2);
            ctx.fillRect(3, 7, 2, 7);
            ctx.fillRect(7, 7, 2, 7);
            ctx.fillRect(11, 7, 2, 7);
            ctx.fillStyle = "#4fa3ff";
            ctx.fillRect(4, 3, 8, 2);
        } else if (kind === "castle") {
            ctx.fillStyle = "#3a3150";
            ctx.fillRect(1, 5, 14, 10);
            ctx.fillRect(1, 2, 3, 3);
            ctx.fillRect(12, 2, 3, 3);
            ctx.fillRect(6, 1, 4, 4);
            ctx.fillStyle = "#c39bff";
            ctx.fillRect(7, 2, 2, 1);
            ctx.fillStyle = "#0b0812";
            ctx.fillRect(6, 10, 4, 5);
        }
    }

    // tileset ごとの文字 → 描き方
    const TILE_PAINTERS = {
        world: {
            ".": ctx => speckle(ctx, "#5fae4e", ["#6fbf5c", "#4f9a40"], 3, 18),
            "T": ctx => tree(ctx, "#5fae4e", "#1f5f2a", "#2e7d3a", "#4fa35a", "#5b3a1a"),
            "^": ctx => {
                speckle(ctx, "#5fae4e", ["#6fbf5c"], 5, 10);
                ctx.fillStyle = "#7a6a58";
                ctx.beginPath();
                ctx.moveTo(0, 15);
                ctx.lineTo(8, 1);
                ctx.lineTo(16, 15);
                ctx.fill();
                ctx.fillStyle = "#a89884";
                ctx.beginPath();
                ctx.moveTo(8, 1);
                ctx.lineTo(4, 9);
                ctx.lineTo(8, 7);
                ctx.fill();
                ctx.fillStyle = "#f4f4f4";
                ctx.fillRect(7, 2, 2, 2);
            },
            "~": (ctx, f) => water(ctx, f, "#2a6fc9", "#6fb0ff"),
            ":": ctx => speckle(ctx, "#e3cf8c", ["#d4bd72", "#f0e0a8"], 7, 20),
            ",": ctx => {
                speckle(ctx, "#5c7a4a", ["#4a6038", "#6f8f5a"], 9, 22);
                ctx.fillStyle = "#4a5f6a";
                ctx.fillRect(3, 4, 4, 2);
                ctx.fillRect(9, 10, 5, 2);
            },
            "=": ctx => {
                water(ctx, 0, "#2a6fc9", "#6fb0ff");
                ctx.fillStyle = "#9b6b3a";
                ctx.fillRect(0, 2, 16, 12);
                ctx.fillStyle = "#6b4a2b";
                for (let x = 0; x < 16; x += 4) {
                    ctx.fillRect(x, 2, 1, 12);
                }
            },
            "a": (ctx, f, open) => TILE_PAINTERS.world.barrier(ctx, f, open, true),
            "b": (ctx, f, open) => TILE_PAINTERS.world.barrier(ctx, f, open, false),
            "L": (ctx, f, open) => {
                water(ctx, f, "#2a6fc9", "#6fb0ff");
                if (open) {
                    ctx.fillStyle = "#fff7c2";
                    ctx.fillRect(2, 0, 12, 16);
                    ctx.fillStyle = "#f5c518";
                    ctx.fillRect(2, 0, 1, 16);
                    ctx.fillRect(13, 0, 1, 16);
                    ctx.fillStyle = f ? "#ffffff" : "#ffe680";
                    ctx.fillRect(7, (f ? 3 : 9), 2, 2);
                }
            },
            barrier(ctx, f, open, onBridge) {
                if (onBridge) {
                    TILE_PAINTERS.world["="](ctx);
                } else {
                    TILE_PAINTERS.world["."](ctx);
                }
                if (!open) {
                    ctx.fillStyle = f ? "rgba(190, 120, 255, 0.75)" : "rgba(150, 90, 230, 0.75)";
                    ctx.fillRect(1, 0, 14, 16);
                    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                    ctx.fillRect(f ? 4 : 10, 2, 1, 12);
                }
            },
            "1": ctx => icon(ctx, "town"),
            "2": ctx => icon(ctx, "town"),
            "3": ctx => icon(ctx, "town"),
            "c": ctx => icon(ctx, "cave"),
            "w": ctx => icon(ctx, "tower"),
            "s": ctx => icon(ctx, "shrine"),
            "k": ctx => icon(ctx, "castle")
        },
        town: {
            ",": ctx => speckle(ctx, "#6fbf5c", ["#7fcf6c", "#5fae4e"], 11, 16),
            ".": ctx => speckle(ctx, "#d9c08a", ["#c9ae74", "#e6d29e"], 13, 18),
            "T": ctx => tree(ctx, "#6fbf5c", "#1f5f2a", "#2e7d3a", "#4fa35a", "#5b3a1a"),
            "#": ctx => bricks(ctx, "#a0846a", "#6b5545", "#c0a488"),
            "_": ctx => {
                ctx.fillStyle = "#c89a62";
                ctx.fillRect(0, 0, 16, 16);
                ctx.fillStyle = "#a87c48";
                for (let y = 0; y < 16; y += 4) {
                    ctx.fillRect(0, y, 16, 1);
                }
            },
            "D": ctx => {
                TILE_PAINTERS.town["_"](ctx);
                ctx.fillStyle = "#6b4022";
                ctx.fillRect(2, 0, 12, 16);
                ctx.fillStyle = "#8a5a32";
                ctx.fillRect(3, 1, 10, 14);
                ctx.fillStyle = "#f1c232";
                ctx.fillRect(11, 8, 1, 2);
            },
            "c": ctx => {
                ctx.fillStyle = "#7a4a22";
                ctx.fillRect(0, 0, 16, 16);
                ctx.fillStyle = "#a0683a";
                ctx.fillRect(0, 0, 16, 5);
                ctx.fillStyle = "#5a3416";
                ctx.fillRect(0, 15, 16, 1);
            },
            "~": (ctx, f) => water(ctx, f, "#2a6fc9", "#6fb0ff"),
            "f": ctx => {
                TILE_PAINTERS.town[","](ctx);
                const colors = ["#ff6b8a", "#ffd34d", "#ffffff", "#b388ff"];
                [[3, 3], [10, 5], [5, 11], [12, 12]].forEach(([x, y], i) => {
                    ctx.fillStyle = colors[i];
                    ctx.fillRect(x, y, 2, 2);
                    ctx.fillStyle = "#3f8f2f";
                    ctx.fillRect(x, y + 2, 1, 2);
                });
            },
            "A": ctx => {
                TILE_PAINTERS.town["_"](ctx);
                ctx.fillStyle = "#e8e8f0";
                ctx.fillRect(2, 4, 12, 10);
                ctx.fillStyle = "#f1c232";
                ctx.fillRect(7, 1, 2, 8);
                ctx.fillRect(5, 3, 6, 2);
            },
            "b": ctx => {
                TILE_PAINTERS.town["_"](ctx);
                ctx.fillStyle = "#e8e8f0";
                ctx.fillRect(2, 1, 12, 14);
                ctx.fillStyle = "#c0392b";
                ctx.fillRect(2, 6, 12, 9);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(4, 2, 8, 3);
            }
        },
        cave: {
            ".": ctx => speckle(ctx, "#5a4a3a", ["#4a3c2e", "#6a5846"], 21, 22),
            "#": ctx => {
                speckle(ctx, "#2e241b", ["#3a2e22", "#241c14"], 23, 30);
                ctx.fillStyle = "#4a3c2e";
                ctx.fillRect(0, 0, 16, 2);
            },
            ...dungeonFeatures("#5a4a3a")
        },
        tower: {
            ".": ctx => {
                ctx.fillStyle = "#b9b09a";
                ctx.fillRect(0, 0, 16, 16);
                ctx.fillStyle = "#a39a84";
                ctx.fillRect(0, 7, 16, 1);
                ctx.fillRect(7, 0, 1, 16);
            },
            "#": ctx => bricks(ctx, "#7d7464", "#5a5246", "#968c7a"),
            ...dungeonFeatures("#b9b09a")
        },
        shrine: {
            ".": ctx => {
                ctx.fillStyle = "#cfe0ee";
                ctx.fillRect(0, 0, 16, 16);
                ctx.fillStyle = "#b5c9da";
                ctx.fillRect(0, 0, 16, 1);
                ctx.fillRect(0, 0, 1, 16);
            },
            "#": ctx => bricks(ctx, "#5f7f9a", "#3f5a70", "#7f9fba"),
            "~": (ctx, f) => water(ctx, f, "#2a6fc9", "#9cc8ff"),
            ...dungeonFeatures("#cfe0ee")
        },
        castle: {
            ".": ctx => speckle(ctx, "#3d3550", ["#463d5c", "#332c44"], 31, 14),
            "+": ctx => {
                ctx.fillStyle = "#7a1f35";
                ctx.fillRect(0, 0, 16, 16);
                ctx.fillStyle = "#9a2f48";
                ctx.fillRect(1, 1, 14, 14);
                ctx.fillStyle = "#f1c232";
                ctx.fillRect(0, 0, 16, 1);
                ctx.fillRect(0, 15, 16, 1);
            },
            "#": ctx => bricks(ctx, "#2a2338", "#17121f", "#3d3350"),
            "K": ctx => {
                TILE_PAINTERS.castle["+"](ctx);
                ctx.fillStyle = "#4a3a6a";
                ctx.fillRect(3, 1, 10, 14);
                ctx.fillStyle = "#f1c232";
                ctx.fillRect(3, 1, 10, 2);
                ctx.fillRect(6, 0, 1, 2);
                ctx.fillRect(9, 0, 1, 2);
                ctx.fillStyle = "#7a1f35";
                ctx.fillRect(5, 5, 6, 8);
            },
            "M": ctx => TILE_PAINTERS.castle["+"](ctx),
            ...dungeonFeatures("#3d3550")
        }
    };

    function dungeonFeatures(floor) {
        const paintFloor = ctx => {
            ctx.fillStyle = floor;
            ctx.fillRect(0, 0, 16, 16);
        };
        return {
            "E": ctx => {
                paintFloor(ctx);
                ctx.fillStyle = "#ffffff";
                ctx.globalAlpha = 0.35;
                ctx.fillRect(2, 2, 12, 12);
                ctx.globalAlpha = 1;
                ctx.fillStyle = "#fff7c2";
                ctx.fillRect(6, 3, 4, 10);
            },
            ">": ctx => {
                paintFloor(ctx);
                ctx.fillStyle = "#1b1b1b";
                ctx.fillRect(1, 1, 14, 14);
                ctx.fillStyle = "#8a8170";
                for (let i = 0; i < 4; i += 1) {
                    ctx.fillRect(2 + i * 3, 2 + i * 3, 13 - i * 3, 2);
                }
            },
            "<": ctx => {
                paintFloor(ctx);
                ctx.fillStyle = "#cfc6b0";
                for (let i = 0; i < 4; i += 1) {
                    ctx.fillRect(1, 2 + i * 3, 14 - i * 3, 2);
                }
                ctx.fillStyle = "#8a8170";
                for (let i = 0; i < 4; i += 1) {
                    ctx.fillRect(1, 4 + i * 3, 14 - i * 3, 1);
                }
            },
            "X": (ctx, f, open) => {
                paintFloor(ctx);
                ctx.fillStyle = "#5a3416";
                ctx.fillRect(2, 5, 12, 9);
                ctx.fillStyle = open ? "#3a2210" : "#a0683a";
                ctx.fillRect(3, 6, 10, open ? 2 : 7);
                ctx.fillStyle = "#f1c232";
                ctx.fillRect(2, 8, 12, 1);
                if (!open) {
                    ctx.fillRect(7, 8, 2, 3);
                }
            },
            "*": (ctx, f, open) => {
                paintFloor(ctx);
                ctx.fillStyle = "#e8e8f0";
                ctx.fillRect(4, 8, 8, 7);
                ctx.fillRect(3, 7, 10, 2);
                if (!open) {
                    ctx.fillStyle = f ? "#9cc8ff" : "#ffffff";
                    ctx.fillRect(6, 2, 4, 4);
                    ctx.fillRect(7, 1, 2, 6);
                }
            },
            "B": paintFloor
        };
    }

    // tileset の文字を 16×16 の canvas に。frame は 水などの動き、open は 宝箱・結界などの状態
    function tile(tileset, ch, frame, open) {
        const key = `t:${tileset}:${ch}:${frame}:${open ? 1 : 0}`;
        if (cache.has(key)) {
            return cache.get(key);
        }
        const canvas = makeCanvas(16, 16);
        const ctx = canvas.getContext("2d");
        const painters = TILE_PAINTERS[tileset] || {};
        const painter = painters[ch] || painters["."];
        if (painter) {
            painter(ctx, frame, open);
        }
        cache.set(key, canvas);
        return canvas;
    }

    const HF = root.HF = root.HF || {};
    HF.sprites = {
        person,
        monster,
        tile,
        PEOPLE: Object.keys(HALF_PEOPLE),
        MONSTER_SHAPES: Object.keys(MONSTERS),
        MONSTER_PALETTES: Object.keys(MONSTER_PALETTES),
        _raw: { HALF_PEOPLE, MONSTERS, HERO_UP, HERO_SIDE }
    };
    if (typeof module === "object" && module.exports) {
        module.exports = HF.sprites;
    }
})(typeof window !== "undefined" ? window : globalThis);
