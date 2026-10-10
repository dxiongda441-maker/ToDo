// ほしふるクエストの難しさを、ふつうの遊び方をまねた自動プレイで調べる。
//
//   node tools/hoshifuru-balance.js [seed]
//
// 各段階で「その場所の魔物と戦う → 傷ついたら宿で休む → 買える一番いい装備を買う」をくり返し、
// ボスに 6 割以上勝てるようになったら次へ進む。段階ごとのレベル・戦闘回数・ボスの勝率を表示する。
// 数字を変えたら、これで「どこで詰まるか・稼ぎが長すぎないか」を確かめる。
"use strict";

const path = require("node:path");
const dir = path.join(__dirname, "..", "games", "hoshifuru");
const data = require(path.join(dir, "data.js"));
const R = require(path.join(dir, "rules.js"));
const { shops } = require(path.join(dir, "maps.js"));

const seed = Number(process.argv[2]) || 1;
let state = seed >>> 0;
const rng = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
};

const clone = value => JSON.parse(JSON.stringify(value));

// 段階：戦う場所・買える店・ボス・この段階で仲間になる人
const STAGES = [
    { name: "ソラの村まわり", zones: ["field1"], shops: ["sora_arms", "sora_items"], minLevel: 3 },
    { name: "北のほらあな", zones: ["field2", "cave"], shops: ["sora_arms", "sora_items"], boss: ["iwaotoko"] },
    { name: "港町・風の塔", zones: ["field3", "tower"], shops: ["marine_arms", "marine_armor", "marine_items"], join: ["mage", "ルナ", 5], boss: ["arashinooodori"] },
    { name: "森の村・湖の神殿", zones: ["field4", "shrine"], shops: ["leaf_arms", "leaf_items"], join: ["priest", "ミント", 10], boss: ["mizunooohebi"] },
    { name: "かげの城（もんばん）", zones: ["field5", "castle"], shops: ["leaf_arms", "leaf_items"], boss: ["yaminomonban"] },
    { name: "かげの城（かげの王）", zones: ["castle"], shops: ["leaf_arms", "leaf_items"], boss: ["kagenoou", "kagenoou2"] }
];

// 宝箱の装備は、その段階で手に入るものとして扱う
const CHEST_GEAR = { 1: ["kawanotate"], 2: ["tetsunoyari", "kusarikatabira", "madoushinotsue"], 3: ["tetsunomeisu", "seinarurobu"], 4: ["hikarinoyoroi", "hoshinotsurugi"] };

function fullHeal(party) {
    party.forEach(m => {
        m.hp = R.maxHp(m);
        m.mp = R.maxMp(m);
        m.poison = false;
    });
}

function shopGoods(stage) {
    return stage.shops.flatMap(id => shops[id].goods);
}

// 買える中で一番強い装備を、全員ぶん買う（強い順）
function buyGear(game, stage, stageIndex) {
    const goods = shopGoods(stage).filter(id => data.equipment[id]);
    const free = (CHEST_GEAR[stageIndex] || []).filter(id => !game.gotChest[id]);
    free.forEach(id => {
        game.gotChest[id] = true;
        R.addItem(game.bag, id);
    });
    game.party.forEach(member => {
        ["weapon", "armor", "shield"].forEach(slot => {
            const value = id => (id ? (data.equipment[id].atk || 0) + (data.equipment[id].def || 0) : 0);
            const owned = game.bag.filter(e => data.equipment[e.id] && data.equipment[e.id].slot === slot && R.canEquip(member, e.id)).map(e => e.id);
            const buyable = goods.filter(id => data.equipment[id].slot === slot && R.canEquip(member, id) && data.equipment[id].price <= game.gold);
            const best = owned.concat(buyable).sort((a, b) => value(b) - value(a))[0];
            if (best && value(best) > value(member.equip[slot])) {
                if (!owned.includes(best)) {
                    game.gold -= data.equipment[best].price;
                } else {
                    R.removeItem(game.bag, best);
                }
                member.equip[slot] = best;
            }
        });
    });
    // やくそうを 少し持つ
    const herb = shopGoods(stage).includes("jouyakusou") ? "jouyakusou" : "yakusou";
    while (R.itemCount(game.bag, herb) < 6 && game.gold >= data.items[herb].price) {
        game.gold -= data.items[herb].price;
        R.addItem(game.bag, herb);
    }
}

function fight(game, enemyIds) {
    const battle = R.createBattle(game.party, enemyIds, {});
    let rounds = 0;
    while (!battle.over && rounds < 200) {
        R.resolveRound(battle, R.autoCommands(battle, game.bag), game.bag, rng);
        rounds += 1;
    }
    if (battle.result === "win") {
        const rewards = R.battleRewards(battle, rng);
        game.gold += rewards.gold;
    }
    return battle.result;
}

function needsRest(party) {
    return party.some(m => m.hp < R.maxHp(m) * 0.45) || party.reduce((s, m) => s + m.mp, 0) < party.reduce((s, m) => s + R.maxMp(m), 0) * 0.3;
}

// ボスに挑んだらどうなるか（今の状態の写しで 試す）
function bossWinRate(game, boss, tries) {
    let wins = 0;
    for (let t = 0; t < tries; t += 1) {
        const copy = clone(game);
        fullHeal(copy.party);
        let ok = true;
        for (const id of boss) {
            // 最後の戦いは 2 回目の前に しずくの光で 全回復する（maps.js の できごとと同じ）
            fullHeal(copy.party);
            if (fight(copy, [id]) !== "win") {
                ok = false;
                break;
            }
        }
        if (ok) {
            wins += 1;
        }
    }
    return wins / tries;
}

const hero = R.createMember("hero", "ユウ", 1, rng);
hero.equip.weapon = "hinokinobou";
hero.equip.armor = "nunonofuku";
const game = { party: [hero], bag: R.createBag(), gold: 60, gotChest: {} };
R.addItem(game.bag, "yakusou", 2);

let totalBattles = 0;
const rows = [];
STAGES.forEach((stage, index) => {
    if (stage.join) {
        const [cls, name, minLevel] = stage.join;
        const member = R.createMember(cls, name, Math.max(minLevel, game.party[0].level - 1), rng);
        member.equip.weapon = cls === "mage" ? "kashinotsue" : "konbou";
        member.equip.armor = cls === "mage" ? "tabibitonofuku" : "kawanoyoroi";
        game.party.push(member);
    }
    let battles = 0;
    let rests = 0;
    let wipes = 0;
    let rate = 0;
    buyGear(game, stage, index);
    fullHeal(game.party);
    for (let guard = 0; guard < 3000; guard += 1) {
        const done = stage.boss
            ? (battles % 10 === 0 && (rate = bossWinRate(game, stage.boss, 30)) >= 0.6)
            : game.party[0].level >= stage.minLevel;
        if (done) {
            break;
        }
        const zone = stage.zones[battles % stage.zones.length];
        const result = fight(game, R.rollEncounter(zone, rng));
        battles += 1;
        if (result === "lose") {
            wipes += 1;
            game.gold = Math.floor(game.gold / 2);
            fullHeal(game.party);
        } else if (needsRest(game.party)) {
            rests += 1;
            fullHeal(game.party);
        }
        if (battles % 15 === 0) {
            buyGear(game, stage, index);
        }
    }
    totalBattles += battles;
    rows.push({
        stage: stage.name,
        level: game.party.map(m => m.level).join("/"),
        battles,
        rests,
        wipes,
        boss: stage.boss ? `${Math.round(rate * 100)}%` : "-",
        gold: game.gold,
        gear: game.party.map(m => [m.equip.weapon, m.equip.armor, m.equip.shield].filter(Boolean).map(id => data.equipment[id].name).join("+")).join(" | ")
    });
    // ボスに勝ったものとして 進む（経験値も入れる）
    if (stage.boss) {
        stage.boss.forEach(id => {
            game.party.forEach(m => R.gainExp(m, data.enemies[id].exp, rng));
            game.gold += data.enemies[id].gold;
        });
    }
});

console.log(`seed ${seed}`);
rows.forEach(row => {
    console.log(`${row.stage.padEnd(14, "　")} Lv ${row.level.padEnd(9)} 戦闘 ${String(row.battles).padStart(4)}  休み ${String(row.rests).padStart(3)}  全滅 ${row.wipes}  ボス勝率 ${row.boss.padStart(4)}  所持金 ${row.gold}`);
    console.log(`    ${row.gear}`);
});
console.log(`合計の戦闘回数：${totalBattles}`);
