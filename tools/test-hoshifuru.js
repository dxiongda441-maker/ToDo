// ほしふるクエスト（games/hoshifuru）のデータとルールのテスト。
//
//   node tools/test-hoshifuru.js
//
// マップの形・行き来できるか・データの参照・戦闘のルールを確かめる。失敗があれば終了コード 1。
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const dir = path.join(__dirname, "..", "games", "hoshifuru");
const data = require(path.join(dir, "data.js"));
const R = require(path.join(dir, "rules.js"));
const { maps, shops, gates } = require(path.join(dir, "maps.js"));
const audio = require(path.join(dir, "audio.js"));

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  NG  ${name}`);
        console.log(String(error && error.stack ? error.stack : error).split("\n").slice(0, 6).join("\n"));
    }
}

function seededRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// game.js と同じ「通れないマス」
const BLOCKED = { world: "^~", town: "T#c~Abo", cave: "#X*", tower: "#X*", shrine: "#~X*", castle: "#X*K" };
const KNOWN = {
    world: ".T^~:,=abL123cwsk",
    town: ",.T#_Dc~fAbo",
    cave: ".#E<>X*B",
    tower: ".#E<>X*B",
    shrine: ".#~E<>X*B",
    castle: ".#+KME<>X*B"
};

const tileAt = (map, x, y) => (y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[0].length ? null : map.rows[y][x]);
const walkable = (map, x, y, open) => {
    const ch = tileAt(map, x, y);
    if (ch === null) {
        return false;
    }
    if (BLOCKED[map.tileset].includes(ch)) {
        return false;
    }
    if (map.kind === "world" && gates[ch] && !open.includes(ch)) {
        return false;
    }
    return true;
};

function reachable(map, start, open = "") {
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length > 0) {
        const { x, y } = queue.shift();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (!seen.has(key) && walkable(map, nx, ny, open)) {
                seen.add(key);
                queue.push({ x: nx, y: ny });
            }
        });
    }
    return seen;
}

const adjacentReachable = (seen, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
const findChar = (map, ch) => {
    for (let y = 0; y < map.rows.length; y += 1) {
        const x = map.rows[y].indexOf(ch);
        if (x >= 0) {
            return { x, y };
        }
    }
    return null;
};

console.log("[マップの形]");

test("どのマップも長方形で、知らない文字がない", () => {
    Object.entries(maps).forEach(([id, map]) => {
        const width = map.rows[0].length;
        map.rows.forEach((row, y) => {
            assert.equal(row.length, width, `${id} の ${y} 行目`);
            row.split("").forEach(ch => assert.ok(KNOWN[map.tileset].includes(ch), `${id} に知らない文字 ${ch}`));
        });
        if (map.zoneRows) {
            assert.equal(map.zoneRows.length, map.rows.length);
            map.zoneRows.forEach(row => assert.equal(row.length, width));
        }
    });
});

test("入口・階段の行き先・町の人は 歩けるマスにいる", () => {
    Object.entries(maps).forEach(([id, map]) => {
        if (map.entry) {
            assert.ok(walkable(map, map.entry.x, map.entry.y, ""), `${id} の入口`);
        }
        Object.entries(map.warps || {}).forEach(([key, warp]) => {
            const [x, y] = key.split(",").map(Number);
            assert.ok("<>".includes(tileAt(map, x, y)), `${id} ${key} は階段ではない`);
            const target = maps[warp.map];
            assert.ok(target, `${id} から 存在しないマップ ${warp.map}`);
            assert.ok("<>".includes(tileAt(target, warp.x, warp.y)), `${warp.map} ${warp.x},${warp.y} は階段ではない`);
            assert.ok(target.warps[`${warp.x},${warp.y}`], `${warp.map} から ${id} へ もどれない`);
        });
        (map.npcs || []).forEach(npc => {
            assert.ok(walkable(map, npc.x, npc.y, ""), `${id} の人 (${npc.x},${npc.y}) が壁の中`);
        });
    });
});

test("宝箱のマスと中身が 1 対 1 で、中身は実在する", () => {
    Object.entries(maps).forEach(([id, map]) => {
        const boxes = [];
        map.rows.forEach((row, y) => row.split("").forEach((ch, x) => {
            if (ch === "X") {
                boxes.push(`${x},${y}`);
            }
        }));
        assert.deepEqual(boxes.sort(), Object.keys(map.chests || {}).sort(), `${id} の宝箱`);
        Object.values(map.chests || {}).forEach(content => {
            if (content.item) {
                assert.ok(data.items[content.item], content.item);
            }
            if (content.equip) {
                assert.ok(data.equipment[content.equip], content.equip);
            }
        });
    });
});

test("ボスのマスと しずくの台が 正しい場所にある", () => {
    Object.entries(maps).forEach(([id, map]) => {
        if (map.boss) {
            assert.equal(tileAt(map, map.boss.x, map.boss.y), "B", `${id} のボス`);
            map.boss.enemies.forEach(e => assert.ok(data.enemies[e].boss, e));
        }
        if (map.pedestal) {
            assert.equal(tileAt(map, map.pedestal.x, map.pedestal.y), "*", `${id} の台`);
            assert.ok(data.items[map.pedestal.item].key);
        }
    });
});

test("つぼのマスと中身が 1 対 1 で、中身は実在する", () => {
    Object.entries(maps).forEach(([id, map]) => {
        const pots = map.pots || {};
        map.rows.forEach((row, y) => row.split("").forEach((ch, x) => {
            if (ch === "o") {
                assert.ok(pots[`${x},${y}`], `${id} の (${x},${y}) の つぼに 中身がない`);
            }
        }));
        Object.entries(pots).forEach(([key, content]) => {
            const [x, y] = key.split(",").map(Number);
            assert.equal(tileAt(map, x, y), "o", `${id} ${key} は つぼではない`);
            assert.ok(content.gold > 0 || data.items[content.item], `${id} ${key} の 中身`);
        });
    });
});

console.log("[行き来できるか]");

test("世界地図：しずくを集めるたびに 行ける場所が順に広がる", () => {
    const world = maps.world;
    const start = findChar(world, "1");
    const can = (open, place) => {
        const seen = reachable(world, start, open);
        const p = findChar(world, place);
        return seen.has(`${p.x},${p.y}`);
    };
    assert.ok(can("", "c"), "はじめから ほらあなへ行ける");
    assert.ok(!can("", "2"), "しずくなしでは 港町へ行けない");
    assert.ok(can("a", "2") && can("a", "w"), "しずく 1 つで 港町と塔へ");
    assert.ok(!can("a", "3") && !can("a", "s"), "しずく 1 つでは 森の村・神殿へ行けない");
    assert.ok(can("ab", "3") && can("ab", "s"), "しずく 2 つで 森の村と神殿へ");
    assert.ok(!can("ab", "k"), "しずく 2 つでは 城へ行けない");
    assert.ok(can("abL", "k"), "しずく 3 つで 城へ");
});

test("ダンジョン：入口から 階段・ボス・宝箱・台に たどりつける", () => {
    Object.entries(maps).forEach(([id, map]) => {
        if (map.kind !== "dungeon") {
            return;
        }
        const startKey = map.entry ? map.entry : (() => {
            const [x, y] = Object.keys(map.warps)[0].split(",").map(Number);
            return { x, y };
        })();
        const seen = reachable(map, startKey);
        Object.keys(map.warps || {}).forEach(key => assert.ok(seen.has(key), `${id} の階段 ${key}`));
        Object.keys(map.chests || {}).forEach(key => {
            const [x, y] = key.split(",").map(Number);
            assert.ok(adjacentReachable(seen, x, y), `${id} の宝箱 ${key}`);
        });
        if (map.boss) {
            assert.ok(seen.has(`${map.boss.x},${map.boss.y}`), `${id} のボス`);
        }
        if (map.pedestal) {
            assert.ok(adjacentReachable(seen, map.pedestal.x, map.pedestal.y), `${id} の台`);
        }
        (map.events || []).forEach(event => assert.ok(seen.has(`${event.x},${event.y}`), `${id} のできごと`));
        if (map.entry) {
            const exit = findChar(map, "E");
            assert.ok(exit && seen.has(`${exit.x},${exit.y}`), `${id} の出口`);
        }
    });
});

console.log("[データの参照]");

test("店の品物・出現表・職業のじゅもん・魔物の行動は すべて存在する", () => {
    Object.values(shops).forEach(shop => shop.goods.forEach(id => assert.ok(data.items[id] || data.equipment[id], id)));
    Object.values(data.zones).forEach(zone => zone.enemies.concat(zone.rare ? [zone.rare] : []).forEach(id => assert.ok(data.enemies[id], id)));
    Object.values(data.classes).forEach(cls => Object.values(cls.spells).forEach(id => assert.ok(data.spells[id], id)));
    Object.values(data.enemies).forEach(enemy => enemy.actions.forEach(([action]) => {
        if (action.startsWith("spell:")) {
            assert.ok(data.spells[action.slice(6)], action);
        } else if (action !== "attack") {
            assert.ok(data.skills[action], action);
        }
    }));
    const zoneIds = new Set();
    maps.world.zoneRows.forEach(row => row.split("").forEach(ch => zoneIds.add(`field${ch}`)));
    zoneIds.forEach(id => assert.ok(data.zones[id], id));
});

test("魔物と人の絵が すべてある", () => {
    const sprites = require(path.join(dir, "sprites.js"));
    Object.values(data.enemies).forEach(enemy => {
        assert.ok(sprites.MONSTER_SHAPES.includes(enemy.sprite), enemy.sprite);
        assert.ok(sprites.MONSTER_PALETTES.includes(enemy.palette), enemy.palette);
    });
    Object.values(maps).forEach(map => (map.npcs || []).forEach(npc => assert.ok(sprites.PEOPLE.includes(npc.sprite), npc.sprite)));
});

test("とうぎじょう と まものはかせ：魔物・ほうびが 実在し、ランクは 順に ひらく", () => {
    data.arena.forEach((rank, i) => {
        assert.equal(rank.fights.length, 3, rank.name);
        rank.fights.flat().forEach(id => assert.ok(data.enemies[id], `${rank.name} の ${id}`));
        const prize = rank.prize.equip || rank.prize.item;
        assert.ok(data.equipment[prize] || data.items[prize], `${rank.name} の ほうび ${prize}`);
        assert.equal(rank.needs || null, i === 0 ? null : `arena${i}`);
    });
    let last = 0;
    data.bookRewards.forEach(reward => {
        const need = reward.count === "all" ? Object.keys(data.enemies).length : reward.count;
        assert.ok(need > last && need <= Object.keys(data.enemies).length, reward.flag);
        last = need;
        reward.items.forEach(([id]) => assert.ok(data.items[id], id));
    });
    const people = Object.values(maps).flatMap(map => map.npcs || []);
    assert.ok(people.some(npc => npc.arena) && people.some(npc => npc.scholar));
});

test("なかまとの 会話：場所は 実在し、せりふは 文字", () => {
    Object.entries(data.partyTalk).forEach(([mapId, entries]) => {
        assert.ok(maps[mapId], mapId);
        entries.forEach(entry => ["mage", "priest"].forEach(cls => assert.equal(typeof entry[cls], "string", `${mapId} ${cls}`)));
    });
});

console.log("[ルール]");

test("必要な経験値は レベルごとに増え、成長で能力が下がらない", () => {
    for (let level = 2; level <= R.MAX_LEVEL; level += 1) {
        assert.ok(R.expForLevel(level) > R.expForLevel(level - 1));
    }
    const rng = seededRng(1);
    ["hero", "mage", "priest"].forEach(cls => {
        const member = R.createMember(cls, "x", 1, rng);
        let previous = Object.assign({}, member.base);
        for (let level = 2; level <= R.MAX_LEVEL; level += 1) {
            member.exp = R.expForLevel(level);
            R.levelUp(member, rng);
            Object.keys(previous).forEach(stat => assert.ok(member.base[stat] >= previous[stat], `${cls} ${stat}`));
            previous = Object.assign({}, member.base);
        }
        assert.equal(member.level, R.MAX_LEVEL);
    });
});

test("じゅもんは 決まったレベルで覚える", () => {
    const hero = R.createMember("hero", "x", 10, seededRng(2));
    assert.deepEqual(hero.spells.sort(), ["furusato", "hinoko", "iyashi", "nigemichi"].sort());
});

test("戦闘：同じ乱数なら同じ結果になり、必ず終わる", () => {
    const run = seed => {
        const rng = seededRng(seed);
        const hero = R.createMember("hero", "ユウ", 3, rng);
        hero.equip.weapon = "konbou";
        const battle = R.createBattle([hero], ["pururin", "koumorin", "obakekinoko"]);
        const log = [];
        let rounds = 0;
        while (!battle.over && rounds < 100) {
            R.resolveRound(battle, R.autoCommands(battle, []), [], rng).forEach(e => log.push(e.text));
            rounds += 1;
        }
        return { result: battle.result, log: log.join("|") };
    };
    const a = run(5);
    const b = run(5);
    assert.deepEqual(a, b);
    assert.ok(["win", "lose", "empty"].includes(a.result));
});

test("ボスからは にげられない・ぴかりん は にげることがある", () => {
    const rng = seededRng(3);
    const hero = R.createMember("hero", "x", 5, rng);
    const boss = R.createBattle([hero], ["iwaotoko"]);
    assert.equal(boss.canFlee, false);
    let fled = false;
    for (let seed = 1; seed < 40 && !fled; seed += 1) {
        const r = seededRng(seed);
        const h = R.createMember("hero", "x", 5, r);
        const battle = R.createBattle([h], ["pikarin"]);
        for (let turn = 0; turn < 10 && !battle.over; turn += 1) {
            R.resolveRound(battle, [{ type: "defend" }], [], r);
        }
        fled = battle.enemies[0].gone && battle.defeated.length === 0;
    }
    assert.ok(fled);
});

test("どうぐ：袋の出し入れと 売値", () => {
    const bag = R.createBag();
    assert.ok(R.addItem(bag, "yakusou", 3));
    assert.equal(R.itemCount(bag, "yakusou"), 3);
    assert.ok(R.removeItem(bag, "yakusou", 2));
    assert.ok(!R.removeItem(bag, "yakusou", 5));
    assert.equal(R.sellPrice("yakusou"), 4);
    assert.equal(R.sellPrice("shizuku1"), 0);
});

test("とても強くなると 弱い魔物が おそれをなす（ボス・ぴかりん・強い魔物は にげない）", () => {
    const rng = seededRng(5);
    const young = R.createMember("hero", "ユウ", 1, rng);
    young.equip.weapon = "dounotsurugi";
    assert.ok(!R.overwhelms([young], ["pururin"]));
    const veteran = R.createMember("hero", "ユウ", 30, rng);
    veteran.equip.weapon = "hikarinotsurugi";
    assert.ok(R.overwhelms([veteran], ["pururin", "koumorin"]));
    assert.ok(!R.overwhelms([veteran], ["pururin", "pikarin"]));
    assert.ok(!R.overwhelms([veteran], ["iwaotoko"]));
    assert.ok(!R.overwhelms([veteran], ["yaminokishi"]));
});

test("むずかしさ「かんたん」では 経験値と お金が 1.5 倍", () => {
    const rng = seededRng(9);
    const make = () => {
        const battle = R.createBattle([R.createMember("hero", "ユウ", 1, rng)], ["pururin", "koumorin"]);
        battle.defeated = ["pururin", "koumorin"];
        return battle;
    };
    const normal = R.battleRewards(make(), rng);
    const easy = R.battleRewards(make(), rng, 1.5);
    assert.equal(normal.exp, 5);
    assert.equal(easy.exp, Math.round(5 * 1.5));
    assert.equal(easy.gold, Math.round(normal.gold * 1.5));
});

test("さくせん：じゅもんせつやく では 攻撃じゅもんを つかわない・ガンガンいこうぜ では つかう", () => {
    const rng = seededRng(4);
    const mage = R.createMember("mage", "ルナ", 20, rng);
    mage.mp = 30; // 3 わり ほど（ふつうなら せつやくする）
    const battle = R.createBattle([mage], ["morinokemono", "mizuhebi"]);
    const spellOf = tactic => R.autoCommands(battle, R.createBag(), tactic)[0];
    assert.equal(spellOf("save").type, "attack");
    assert.equal(spellOf("attack").type, "spell");
});

console.log("[音]");

test("MML：音の高さと長さ", () => {
    const { notes, beats } = audio.parseMml("o4 a4 r8 >c8. [e16]2");
    assert.equal(notes.length, 4);
    assert.equal(notes[0].freq, 440);
    assert.equal(Math.round(notes[1].freq), 523);
    assert.equal(notes[1].at, 1.5);
    assert.equal(notes[1].beats, 0.75);
    assert.equal(beats, 1 + 0.5 + 0.75 + 0.5);
});

test("くり返す曲は どのパートも同じ長さ・場所と戦闘の曲が そろっている", () => {
    for (const [name, track] of Object.entries(audio.tracks)) {
        if (track.loop) {
            track.voices.forEach((voice, i) => assert.equal(voice.beats, track.beats, `${name} のパート ${i + 1}`));
        }
        track.voices.forEach(voice => voice.notes.forEach(note => assert.ok(note.freq > 50 && note.freq < 3000, `${name} の音が 高すぎる・低すぎる`)));
    }
    const wanted = new Set(["title", "battle", "boss", "ending", "victory", "levelup", "item", "join", "inn"]);
    Object.values(maps).forEach(map => map.music && wanted.add(map.music));
    wanted.forEach(name => assert.ok(audio.tracks[name], `曲 ${name} がない`));
});

console.log();
if (failed === 0) {
    console.log("すべて OK");
} else {
    console.log(`${failed} 件の NG があります`);
    process.exit(1);
}
