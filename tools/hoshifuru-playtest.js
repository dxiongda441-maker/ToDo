// ほしふるクエストを ヘッドレスブラウザで 最初から最後まで 遊んで確かめる（ストーリーの通しテスト）。
//
//   NODE_PATH="$(npm root -g)" node tools/hoshifuru-playtest.js
//
// 本物の画面をキー操作で動かす（道は BFS で探す）。戦闘はテスト用の「自動の命令」で進め、
// レベルはテスト用に上げる。Playwright が無ければ何もせずに終わる。
"use strict";

const path = require("node:path");

let chromium;
try {
    ({ chromium } = require("playwright"));
} catch (_error) {
    console.log("Playwright が見つからないため、通しテストは飛ばしました。");
    process.exit(0);
}

const url = `file://${path.join(__dirname, "..", "games", "hoshifuru", "index.html")}`;
let failed = 0;
function check(condition, label) {
    console.log(`  ${condition ? "ok" : "NG"}  ${label}`);
    if (!condition) {
        failed += 1;
    }
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://fonts.googleapis.com/**", route => route.abort());
    await page.route("https://fonts.gstatic.com/**", route => route.abort());
    await page.goto(url);
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("hoshifuru.settings.v1", JSON.stringify({ textSpeed: "fast", sound: false }));
    });
    await page.reload();
    await page.waitForTimeout(300);

    const wait = ms => page.waitForTimeout(ms);
    const press = async (key, ms = 70) => {
        await page.keyboard.press(key);
        await wait(ms);
    };
    const state = () => page.evaluate(() => {
        const d = HF.debug;
        const g = d.game;
        return { scene: d.scene, busy: d.busy, layers: d.layers(), map: g && g.map, x: g && g.x, y: g && g.y, moving: d.moving() };
    });
    const game = expr => page.evaluate(new Function(`return (${expr})(HF.debug.game)`));

    // 話・戦闘が終わって 歩ける状態になるまで 進める（話は 決定、メニューは キャンセルで閉じる）
    async function settle(limit = 400) {
        for (let i = 0; i < limit; i += 1) {
            const s = await state();
            if (s.scene === "field" && !s.busy && s.layers === 0 && !s.moving) {
                return true;
            }
            if (s.layers > 0) {
                const menu = await page.evaluate(() => Boolean(document.querySelector(".menu-win")));
                await press(menu ? "Escape" : "Enter", 40);
            } else {
                await wait(60);
            }
        }
        return false;
    }

    // メニューが出るまで 話を進め、label で始まる項目を えらぶ
    async function select(label) {
        for (let i = 0; i < 100; i += 1) {
            const picked = await page.evaluate(text => {
                const menus = document.querySelectorAll(".menu-win");
                const menu = menus[menus.length - 1];
                const item = menu && Array.from(menu.querySelectorAll(".menu-item")).find(row => row.textContent.startsWith(text));
                if (item) {
                    item.click();
                    return true;
                }
                return false;
            }, label);
            if (picked) {
                await wait(150);
                return true;
            }
            const s = await state();
            if (s.layers > 0) {
                await press("Enter", 60);
            } else {
                await wait(60);
            }
        }
        console.log(`  （メニュー「${label}」が 出なかった）`);
        return false;
    }

    const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

    async function step(dir) {
        await page.keyboard.down(KEY[dir]);
        await wait(40);
        await page.keyboard.up(KEY[dir]);
        await wait(200);
        await settle();
    }

    function canTalk(x, y, tx, ty, counter) {
        const distance = Math.abs(x - tx) + Math.abs(y - ty);
        return distance === 1 || (distance === 2 && (x === tx || y === ty) && counter);
    }

    // (tx, ty) まで歩く。adjacent なら となり（カウンターごしでもよい）まで行って そちらを向く
    async function walkTo(tx, ty, adjacent = false) {
        for (let attempt = 0; attempt < 60; attempt += 1) {
            const s = await state();
            s.counter = await page.evaluate(([x, y, tx, ty]) => (x + tx) % 2 === 0 && (y + ty) % 2 === 0 && HF.debug.tileAt((x + tx) / 2, (y + ty) / 2) === "c", [s.x, s.y, tx, ty]);
            const done = adjacent ? canTalk(s.x, s.y, tx, ty, s.counter) : s.x === tx && s.y === ty;
            if (done) {
                if (adjacent) {
                    const dir = tx > s.x ? "right" : tx < s.x ? "left" : ty > s.y ? "down" : "up";
                    await step(dir);
                }
                return true;
            }
            const route = await page.evaluate(([tx, ty, adjacent]) => {
                const g = HF.debug.game;
                const key = (x, y) => `${x},${y}`;
                const prev = new Map([[key(g.x, g.y), null]]);
                const queue = [[g.x, g.y]];
                const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
                let goal = null;
                while (queue.length > 0 && prev.size < 20000) {
                    const [x, y] = queue.shift();
                    const distance = Math.abs(x - tx) + Math.abs(y - ty);
                    // となり、または カウンターごし（まっすぐ 2 マス先で 間が カウンター）
                    const acrossCounter = distance === 2 && (x === tx || y === ty) && HF.debug.tileAt((x + tx) / 2, (y + ty) / 2) === "c";
                    const isGoal = adjacent ? distance === 1 || acrossCounter : x === tx && y === ty;
                    if (isGoal) {
                        goal = [x, y];
                        break;
                    }
                    for (const [name, [dx, dy]] of Object.entries(dirs)) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (prev.has(key(nx, ny))) {
                            continue;
                        }
                        const target = !adjacent && nx === tx && ny === ty;
                        if (HF.debug.tileAt(nx, ny) === null || (!HF.debug.passable(nx, ny) && !target)) {
                            continue;
                        }
                        // 行き先でない 町の入口・階段・出口は ふまない（ちがう場所へ 飛ばされる）
                        const map = HF.maps[g.map];
                        const ch = HF.debug.tileAt(nx, ny);
                        const jumps = (map.places && map.places[ch]) || (map.warps && map.warps[key(nx, ny)]) || (ch === "E" && map.kind === "dungeon");
                        if (jumps && !(nx === tx && ny === ty)) {
                            continue;
                        }
                        prev.set(key(nx, ny), [x, y, name]);
                        queue.push([nx, ny]);
                    }
                }
                if (!goal) {
                    return null;
                }
                const out = [];
                let cur = goal;
                while (prev.get(key(cur[0], cur[1]))) {
                    const [px, py, name] = prev.get(key(cur[0], cur[1]));
                    out.unshift(name);
                    cur = [px, py];
                }
                return out;
            }, [tx, ty, adjacent]);
            if (!route) {
                console.log(`  （${s.map} の (${s.x},${s.y}) から (${tx},${ty}) への道が見つからない）`);
                return false;
            }
            const startMap = s.map;
            for (const dir of route.slice(0, 8)) {
                await step(dir);
                const now = await state();
                if (now.map !== startMap) {
                    return true;
                }
            }
        }
        return false;
    }

    async function talk() {
        await press("Enter", 150);
    }

    const placeOf = ch => page.evaluate(c => {
        const rows = HF.maps.world.rows;
        for (let y = 0; y < rows.length; y += 1) {
            const x = rows[y].indexOf(c);
            if (x >= 0) {
                return { x, y };
            }
        }
        return null;
    }, ch);

    // 町のはしまで歩き、そのまま外へ出る
    async function leaveTown(x, y, dir) {
        await walkTo(x, y);
        await step(dir);
        await wait(600);
        await settle();
    }

    async function enterPlace(ch) {
        // 長い道のりの とちゅうで 全滅しないように、出発前に 回復しておく（テストしたいのは 道と できごと）
        await page.evaluate(() => HF.debug.game.party.forEach(m => {
            m.hp = HF.rules.maxHp(m);
            m.mp = HF.rules.maxMp(m);
            m.poison = false;
        }));
        const p = await placeOf(ch);
        await walkTo(p.x, p.y);
        await settle();
    }

    console.log("[はじまり]");
    await press("Enter", 300); // はじめから
    await press("Enter", 600); // なまえ
    await settle();
    let g = await game("g => ({ gold: g.gold, herbs: g.bag.length, opening: g.flags.opening })");
    check(g.opening && g.gold === 60, "オープニングのあと 60G と やくそうを もらう");

    console.log("[村：店・宿屋・教会]");
    await walkTo(17, 3, true); // どうぐや
    await talk();
    await select("かう");
    await select("やくそう");
    await settle();
    g = await game("g => ({ gold: g.gold, herbs: (g.bag.find(e => e.id === 'yakusou') || {}).count })");
    check(g.gold === 52 && g.herbs === 3, `やくそうを 買える（所持金 ${g.gold}、やくそう ${g.herbs}）`);

    await page.evaluate(() => {
        HF.debug.game.party[0].hp = 3;
    });
    await walkTo(16, 12, true); // 宿屋（カウンターごし）
    await talk();
    await select("はい");
    await settle();
    g = await game("g => ({ hp: g.party[0].hp, gold: g.gold })");
    check(g.hp > 3 && g.gold === 48, `宿屋で 回復する（HP ${g.hp}、所持金 ${g.gold}）`);

    console.log("[北のほらあな]");
    await page.evaluate(() => {
        HF.debug.setAutoBattle(true);
        HF.debug.setLevel(9);
        HF.debug.game.party[0].equip = { weapon: "dounotsurugi", armor: "kawanoyoroi", shield: "kawanotate" };
    });
    await leaveTown(11, 17, "down");
    check((await state()).map === "world", "村の外へ出られる");
    await enterPlace("c");
    check((await state()).map === "cave1", "ほらあなに入れる");
    await walkTo(15, 3);
    await settle();
    check((await state()).map === "cave2", "階段で 地下へ");
    await walkTo(7, 3);
    await settle();
    g = await game("g => ({ boss1: Boolean(g.flags.boss1) })");
    check(g.boss1, "いわおとこを たおす");
    await walkTo(7, 1, true);
    await talk();
    await settle();
    g = await game("g => ({ shizuku1: Boolean(g.flags.shizuku1) })");
    check(g.shizuku1, "ほしのしずく・あお を 手に入れる");

    console.log("[川をわたって 港町へ]");
    await walkTo(7, 9);
    await settle();
    const cave1Exit = await page.evaluate(() => {
        const rows = HF.maps.cave1.rows;
        for (let y = 0; y < rows.length; y += 1) {
            const x = rows[y].indexOf("E");
            if (x >= 0) {
                return { x, y };
            }
        }
        return null;
    });
    await walkTo(cave1Exit.x, cave1Exit.y);
    await settle();
    check((await state()).map === "world", "ほらあなから 出られる");
    await enterPlace("2");
    check((await state()).map === "marine", "けっかいが とけて 港町マリンへ 行ける");
    await walkTo(24, 13, true); // ルナ
    await talk();
    await settle();
    g = await game("g => ({ size: g.party.length, name: g.party[1] && g.party[1].name })");
    check(g.size === 2 && g.name === "ルナ", "ルナが 仲間になる");

    console.log("[風の塔 → 森の村 → 湖の神殿]");
    // その段階で 買える そうびを つけておく（テストしたいのは 道と できごと。ボスは 確実に たおしたい）
    const gear = list => page.evaluate(items => HF.debug.game.party.forEach((m, i) => {
        m.equip = Object.assign({}, items[i]);
    }), list);
    await page.evaluate(() => HF.debug.setLevel(16));
    await gear([{ weapon: "tetsunoyari", armor: "kusarikatabira", shield: "tetsunotate" }, { weapon: "madoushinotsue", armor: "mahounorobu" }]);

    console.log("[とうぎじょう・まものはかせ]");
    await page.evaluate(() => {
        HF.debug.game.gold += 100;
    });
    await walkTo(24, 8, true); // とうぎじょうの 受付
    await talk();
    await select("ブロンズ");
    await select("はい");
    await settle(4000);
    check(await game("g => Boolean(g.flags.arena1) && g.bag.some(e => e.id === 'tetsunotate')"), "とうぎじょうの ブロンズランクで 3 連勝して ほうびを もらう");
    await walkTo(4, 8, true); // まものはかせ
    await talk();
    await settle();
    check(await game("g => Boolean(g.flags.book1) === (Object.keys(g.seen).length >= 8)"), "まものはかせが ずかんの 数に おうじて ほうびを くれる");
    await leaveTown(13, 0, "up");
    await enterPlace("w");
    for (const [x, y] of [[19, 3], [19, 1], [7, 3]]) {
        await walkTo(x, y);
        await settle();
    }
    await walkTo(7, 1, true);
    await talk();
    await settle();
    check(await game("g => Boolean(g.flags.shizuku2)"), "あらしのおおとりを たおして しずく 2 つめ");
    await page.evaluate(() => HF.debug.warp("world", 35, 17));
    await settle();
    await enterPlace("3");
    check((await state()).map === "leaf", "北の山の けっかいが とけて 森の村へ");
    await walkTo(5, 4, true); // ミント
    await talk();
    await settle();
    check(await game("g => g.party.length === 3"), "ミントが 仲間になる");
    await page.evaluate(() => HF.debug.setLevel(21));
    await gear([{ weapon: "haganenotsurugi", armor: "haganenoyoroi", shield: "tetsunotate" }, { weapon: "seinarutsue", armor: "seinarurobu" }, { weapon: "tetsunomeisu", armor: "kusarikatabira", shield: "tetsunotate" }]);
    await leaveTown(11, 17, "down");
    await enterPlace("s");
    for (const [x, y] of [[15, 3], [8, 3]]) {
        await walkTo(x, y);
        await settle();
    }
    await walkTo(8, 1, true);
    await talk();
    await settle();
    check(await game("g => Boolean(g.flags.shizuku3)"), "みずのおおへびを たおして しずく 3 つめ");

    console.log("[かげの城 → エンディング]");
    await page.evaluate(() => HF.debug.setLevel(27));
    await gear([{ weapon: "hoshinotsurugi", armor: "hikarinoyoroi", shield: "hoshinotate" }, { weapon: "seinarutsue", armor: "seinarurobu" }, { weapon: "seinarutsue", armor: "seinarurobu", shield: "tetsunotate" }]);
    await page.evaluate(() => HF.debug.warp("world", 37, 10));
    await settle();
    await enterPlace("k");
    check((await state()).map === "castle1", "光の橋をわたって かげの城へ");
    for (const [x, y] of [[19, 5], [19, 3], [8, 6], [8, 3]]) {
        await walkTo(x, y);
        await settle(4000);
    }
    g = await game("g => ({ cleared: g.cleared, final: Boolean(g.flags.bossFinal), map: g.map })");
    check(g.final && g.cleared, "かげの王を たおして エンディングを むかえる");
    check(g.map === "sora", "エンディングのあと ソラの村から つづけられる");

    await page.reload();
    await wait(400);
    await press("Enter", 600); // つづきから
    await settle();
    check(await game("g => g.cleared === true && g.party.length === 3"), "つづきから 読みこめる");

    console.log("[クリア後：星の遺跡]");
    await walkTo(13, 9, true); // 星のせいれい
    await talk();
    await select("はい");
    await settle();
    check((await state()).map === "ruins1", "星のせいれいに 星の遺跡へ つれていってもらえる");
    // おまけのボスは 運しだいで 負けるので、がんばりのたねを たくさん 食べたことにして 確実に 勝てるようにする
    await page.evaluate(() => {
        HF.debug.setAutoBattle(true); // 読み直したので もう一度 オンにする
        HF.debug.setLevel(30);
        HF.debug.game.party.forEach(member => {
            Object.assign(member.bonus, { hp: 300, str: 80, def: 80, agi: 40 });
            member.hp = member.base.hp + member.bonus.hp;
        });
    });
    await page.evaluate(() => HF.debug.warp("ruins3", 8, 4));
    await settle();
    await walkTo(8, 3);
    await settle(4000);
    check(await game("g => Boolean(g.flags.bossStar)"), "ほしくいを たおせる（Lv 30）");
    await walkTo(8, 1, true);
    await talk();
    await settle();
    check(await game("g => g.bag.some(e => e.id === 'hoshinokanmuri') && g.journal.length > 10"), "ほしのかんむりを 手に入れ、日誌に 冒険が 残っている");

    check(errors.length === 0, `JavaScript のエラーなし ${errors.join(" / ")}`);
    await browser.close();
    console.log();
    if (failed === 0) {
        console.log("すべて OK");
    } else {
        console.log(`${failed} 件の NG があります`);
        process.exit(1);
    }
})();
