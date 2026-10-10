// ほしふるクエスト：ルール（成長・ダメージ・戦闘の進行・持ち物）。画面には依存しない。
// 戦闘は「1 ターン分の命令」を受け取って状態を進め、画面に出す出来事（events）の列を返す。
(function (root) {
    "use strict";

    const data = typeof module === "object" && module.exports
        ? require("./data.js")
        : root.HF.data;

    const MAX_LEVEL = 30;
    const BAG_LIMIT = 24;
    const STATS = ["hp", "mp", "str", "def", "agi", "wis"];

    // ---------- 成長 ----------
    // Lv L に必要な経験値の合計
    function expForLevel(level) {
        if (level <= 1) {
            return 0;
        }
        return Math.round(7 * Math.pow(level - 1, 2.25));
    }

    // 職業ごとの成長曲線上の値（小数）
    function growthAt(classId, stat, level) {
        const cls = data.classes[classId];
        const t = Math.pow((Math.min(level, MAX_LEVEL) - 1) / (MAX_LEVEL - 1), cls.curve);
        return cls.start[stat] + (cls.end[stat] - cls.start[stat]) * t;
    }

    function createMember(classId, name, level, rng) {
        const cls = data.classes[classId];
        const member = {
            cls: classId,
            name,
            level: 1,
            exp: 0,
            base: Object.assign({}, cls.start),
            bonus: { hp: 0, mp: 0, str: 0, def: 0, agi: 0, wis: 0 },
            hp: cls.start.hp,
            mp: cls.start.mp,
            equip: { weapon: null, armor: null, shield: null },
            spells: [],
            poison: false
        };
        learnSpells(member);
        const target = Math.max(1, Math.min(MAX_LEVEL, level || 1));
        while (member.level < target) {
            member.exp = expForLevel(member.level + 1);
            levelUp(member, rng);
        }
        member.hp = maxHp(member);
        member.mp = maxMp(member);
        return member;
    }

    function learnSpells(member) {
        const learned = [];
        const table = data.classes[member.cls].spells;
        Object.keys(table).forEach(level => {
            const spellId = table[level];
            if (Number(level) <= member.level && !member.spells.includes(spellId)) {
                member.spells.push(spellId);
                learned.push(spellId);
            }
        });
        return learned;
    }

    // 1 つレベルを上げ、上がった能力と覚えたじゅもんを返す
    function levelUp(member, rng) {
        const before = member.level;
        member.level += 1;
        const gains = {};
        STATS.forEach(stat => {
            const ideal = growthAt(member.cls, stat, member.level) - growthAt(member.cls, stat, before);
            const wobble = (stat === "hp" || stat === "mp" ? 2 : 1) * (rng() * 2 - 1);
            const gain = Math.max(stat === "hp" ? 1 : 0, Math.round(ideal + wobble));
            member.base[stat] += gain;
            gains[stat] = gain;
        });
        // 上がった分だけ今の HP・MP も増える
        member.hp += gains.hp;
        member.mp += gains.mp;
        const learned = learnSpells(member);
        return { level: member.level, gains, learned };
    }

    function gainExp(member, amount, rng) {
        const events = [];
        if (member.level >= MAX_LEVEL) {
            return events;
        }
        member.exp += amount;
        while (member.level < MAX_LEVEL && member.exp >= expForLevel(member.level + 1)) {
            events.push(levelUp(member, rng));
        }
        return events;
    }

    // ---------- 能力値 ----------
    const equipOf = id => (id ? data.equipment[id] : null);

    function maxHp(member) {
        return member.base.hp + member.bonus.hp;
    }

    function maxMp(member) {
        return member.base.mp + member.bonus.mp;
    }

    function attackOf(member) {
        const weapon = equipOf(member.equip.weapon);
        return member.base.str + member.bonus.str + (weapon ? weapon.atk : 0);
    }

    function defenseOf(member) {
        let total = member.base.def + member.bonus.def;
        ["armor", "shield"].forEach(slot => {
            const item = equipOf(member.equip[slot]);
            total += item ? item.def : 0;
        });
        return total;
    }

    function agilityOf(member) {
        return member.base.agi + member.bonus.agi;
    }

    function wisdomOf(member) {
        return member.base.wis + member.bonus.wis;
    }

    function canEquip(member, equipId) {
        const item = data.equipment[equipId];
        return Boolean(item) && (!item.classes || item.classes.includes(member.cls));
    }

    // ---------- 計算の部品 ----------
    const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

    // ドラクエ風：(攻撃力 / 2 − 守備力 / 4) をゆらす。差が小さいと 0 か 1
    function physicalDamage(atk, def, rng) {
        const base = atk / 2 - def / 4;
        if (base < 2) {
            return rng() < 0.5 ? 0 : 1;
        }
        return Math.max(1, Math.round(base * (0.875 + rng() * 0.25)));
    }

    function criticalDamage(atk, rng) {
        return Math.max(1, Math.round(atk * (0.95 + rng() * 0.1)));
    }

    // ---------- 持ち物 ----------
    function createBag() {
        return [];
    }

    function itemCount(bag, id) {
        const entry = bag.find(e => e.id === id);
        return entry ? entry.count : 0;
    }

    // 入りきらないとき（種類が いっぱい・99 こを こえる）は 何も 入れずに false
    function canAddItem(bag, id, count = 1) {
        const entry = bag.find(e => e.id === id);
        if (entry) {
            return entry.count + count <= 99;
        }
        return bag.length < BAG_LIMIT && count <= 99;
    }

    function addItem(bag, id, count = 1) {
        if (!canAddItem(bag, id, count)) {
            return false;
        }
        const entry = bag.find(e => e.id === id);
        if (entry) {
            entry.count += count;
        } else {
            bag.push({ id, count });
        }
        return true;
    }

    function removeItem(bag, id, count = 1) {
        const entry = bag.find(e => e.id === id);
        if (!entry || entry.count < count) {
            return false;
        }
        entry.count -= count;
        if (entry.count === 0) {
            bag.splice(bag.indexOf(entry), 1);
        }
        return true;
    }

    const sellPrice = id => {
        const item = data.items[id] || data.equipment[id];
        if (!item || item.key) {
            return 0;
        }
        if (item.sell !== undefined) {
            return item.sell;
        }
        return Math.floor((item.price || 0) / 2);
    };

    // ---------- 回復（移動中・戦闘中の共通） ----------
    function healAmount(power, wis, rng) {
        return Math.round(randInt(rng, power[0], power[1]) * (1 + wis / 400));
    }

    function heal(member, amount) {
        if (member.hp <= 0) {
            return 0;
        }
        const before = member.hp;
        member.hp = Math.min(maxHp(member), member.hp + amount);
        return member.hp - before;
    }

    function restoreMp(member, amount) {
        const before = member.mp;
        member.mp = Math.min(maxMp(member), member.mp + amount);
        return member.mp - before;
    }

    function revive(member, ratio) {
        if (member.hp > 0) {
            return false;
        }
        member.hp = Math.max(1, Math.round(maxHp(member) * ratio));
        member.poison = false;
        return true;
    }

    // ---------- 出現 ----------
    function rollEncounter(zoneId, rng) {
        const zone = data.zones[zoneId];
        if (!zone) {
            return [];
        }
        if (zone.rare && rng() < 0.035) {
            return [zone.rare];
        }
        const count = randInt(rng, 1, zone.max);
        const group = [];
        for (let i = 0; i < count; i += 1) {
            group.push(zone.enemies[Math.floor(rng() * zone.enemies.length)]);
        }
        return group;
    }

    // とても強くなった仲間には、弱い魔物が おそれをなす（強くなったことを 感じられるように）。
    // 先頭の人の ふつうの攻撃で、どの魔物も 一撃で たおせるほど 差があるとき true
    function overwhelms(party, enemyIds) {
        const leader = party.find(member => member.hp > 0);
        if (!leader || enemyIds.length === 0) {
            return false;
        }
        const atk = attackOf(leader);
        return enemyIds.every(id => {
            const enemy = data.enemies[id];
            return !enemy.boss && !enemy.rare && (atk / 2 - enemy.def / 4) * 0.875 >= enemy.hp * 1.5;
        });
    }

    // ---------- 戦闘 ----------
    const LETTERS = "ABCDEFGH";

    function createBattle(party, enemyIds, options = {}) {
        const counts = {};
        enemyIds.forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
        });
        const seen = {};
        const enemies = enemyIds.map(id => {
            const def = data.enemies[id];
            seen[id] = (seen[id] || 0) + 1;
            return {
                id,
                name: counts[id] > 1 ? `${def.name}${LETTERS[seen[id] - 1]}` : def.name,
                hp: def.hp,
                maxHp: def.hp,
                sleep: 0,
                gone: false // 倒れた・にげた
            };
        });
        return {
            party,
            allyState: party.map(() => ({ atkUp: 0, defUp: 0, sleep: 0, defending: false })),
            enemies,
            canFlee: options.canFlee !== false && !enemyIds.some(id => data.enemies[id].boss),
            fleeTries: 0,
            turn: 0,
            over: false,
            result: null,
            defeated: [] // 倒した敵の id（経験値の計算用）
        };
    }

    const aliveEnemies = battle => battle.enemies.filter(e => !e.gone && e.hp > 0);
    const aliveAllies = battle => battle.party.map((m, i) => i).filter(i => battle.party[i].hp > 0);

    function enemyAttack(enemy) {
        return data.enemies[enemy.id].atk;
    }

    function allyAttack(battle, index) {
        const state = battle.allyState[index];
        return Math.round(attackOf(battle.party[index]) * (1 + 0.3 * state.atkUp));
    }

    function allyDefense(battle, index) {
        const state = battle.allyState[index];
        return Math.round(defenseOf(battle.party[index]) * (1 + 0.35 * state.defUp));
    }

    // 敵がねらう味方：前の人ほどねらわれやすい
    function pickAllyTarget(battle, rng) {
        const alive = aliveAllies(battle);
        const weights = alive.map(i => [4, 3, 2][i] || 2);
        let roll = rng() * weights.reduce((a, b) => a + b, 0);
        for (let k = 0; k < alive.length; k += 1) {
            roll -= weights[k];
            if (roll < 0) {
                return alive[k];
            }
        }
        return alive[alive.length - 1];
    }

    function firstAliveEnemy(battle, preferred) {
        if (preferred !== undefined && battle.enemies[preferred] && !battle.enemies[preferred].gone && battle.enemies[preferred].hp > 0) {
            return preferred;
        }
        return battle.enemies.findIndex(e => !e.gone && e.hp > 0);
    }

    function damageEnemy(battle, index, amount, events, rng) {
        const enemy = battle.enemies[index];
        enemy.hp = Math.max(0, enemy.hp - amount);
        events.push({ type: "enemyHit", index, amount, text: amount > 0 ? `${enemy.name}に ${amount}の ダメージ！` : `${enemy.name}に ダメージを あたえられない！` });
        if (enemy.sleep > 0 && amount > 0 && rng() < 0.5) {
            enemy.sleep = 0;
        }
        if (enemy.hp <= 0) {
            enemy.gone = true;
            battle.defeated.push(enemy.id);
            events.push({ type: "enemyDown", index, text: `${enemy.name}を たおした！` });
        }
    }

    function damageAlly(battle, index, amount, events) {
        const member = battle.party[index];
        let dealt = amount;
        if (battle.allyState[index].defending) {
            dealt = Math.floor(dealt / 2);
        }
        member.hp = Math.max(0, member.hp - dealt);
        events.push({ type: "allyHit", index, amount: dealt, hp: member.hp, text: dealt > 0 ? `${member.name}は ${dealt}の ダメージを うけた！` : `${member.name}は ダメージを うけなかった！` });
        if (member.hp <= 0) {
            member.poison = false;
            battle.allyState[index] = { atkUp: 0, defUp: 0, sleep: 0, defending: false };
            events.push({ type: "allyDown", index, text: `${member.name}は たおれた…` });
        }
    }

    function spellDamage(spell, wis, rng) {
        return Math.round(randInt(rng, spell.power[0], spell.power[1]) * (1 + wis / 400));
    }

    function resistOf(enemyId, element) {
        const resist = data.enemies[enemyId].resist || {};
        return resist[element] !== undefined ? resist[element] : 1;
    }

    // 味方のじゅもん（戦闘中）。target は敵または味方の番号
    function castAllySpell(battle, casterIndex, spellId, target, rng, events) {
        const caster = battle.party[casterIndex];
        const spell = data.spells[spellId];
        if (caster.mp < spell.mp) {
            events.push({ type: "text", text: `${caster.name}は ${spell.name}を となえた！` });
            events.push({ type: "text", text: "しかし MP が たりない！" });
            return;
        }
        caster.mp -= spell.mp;
        events.push({ type: "spell", caster: casterIndex, spell: spellId, mp: caster.mp, text: `${caster.name}は ${spell.name}を となえた！` });
        const wis = wisdomOf(caster);

        if (spell.effect === "damage") {
            const targets = spell.target === "enemies"
                ? battle.enemies.map((e, i) => i).filter(i => !battle.enemies[i].gone && battle.enemies[i].hp > 0)
                : [firstAliveEnemy(battle, target)].filter(i => i >= 0);
            targets.forEach(i => {
                const enemy = battle.enemies[i];
                const amount = Math.round(spellDamage(spell, wis, rng) * resistOf(enemy.id, spell.element));
                damageEnemy(battle, i, amount, events, rng);
            });
        } else if (spell.effect === "heal") {
            const targets = spell.target === "allies" ? aliveAllies(battle) : [target];
            targets.forEach(i => {
                const member = battle.party[i];
                if (member.hp <= 0) {
                    events.push({ type: "text", text: `${member.name}は たおれている…` });
                    return;
                }
                const amount = heal(member, healAmount(spell.power, wis, rng));
                events.push({ type: "allyHeal", index: i, amount, hp: member.hp, text: `${member.name}の HP が ${amount} かいふくした！` });
            });
        } else if (spell.effect === "cure") {
            const member = battle.party[target];
            member.poison = false;
            events.push({ type: "text", text: `${member.name}の どくが きえた！` });
        } else if (spell.effect === "revive") {
            const member = battle.party[target];
            if (revive(member, 0.5)) {
                events.push({ type: "allyHeal", index: target, amount: member.hp, hp: member.hp, text: `${member.name}は いきかえった！` });
            } else {
                events.push({ type: "text", text: "しかし なにも おこらなかった。" });
            }
        } else if (spell.effect === "defUp") {
            aliveAllies(battle).forEach(i => {
                const state = battle.allyState[i];
                state.defUp = Math.min(2, state.defUp + 1);
            });
            events.push({ type: "text", text: "みんなの みのまもりが あがった！" });
        } else if (spell.effect === "atkUp") {
            const state = battle.allyState[target];
            state.atkUp = Math.min(2, state.atkUp + 1);
            events.push({ type: "text", text: `${battle.party[target].name}の こうげき力が あがった！` });
        } else if (spell.effect === "sleep") {
            let any = false;
            battle.enemies.forEach((enemy, i) => {
                if (enemy.gone || enemy.hp <= 0) {
                    return;
                }
                const def = data.enemies[enemy.id];
                if (!def.sleepImmune && rng() < spell.chance) {
                    enemy.sleep = 3;
                    any = true;
                    events.push({ type: "enemySleep", index: i, text: `${enemy.name}は ねむってしまった！` });
                }
            });
            if (!any) {
                events.push({ type: "text", text: "しかし きかなかった！" });
            }
        }
    }

    function useItemInBattle(battle, userIndex, itemId, target, bag, rng, events) {
        const user = battle.party[userIndex];
        const item = data.items[itemId];
        if (!item || !item.use || !removeItem(bag, itemId)) {
            events.push({ type: "text", text: `${user.name}は どうぐを さがしたが みつからない！` });
            return;
        }
        events.push({ type: "text", text: `${user.name}は ${item.name}を つかった！` });
        const member = battle.party[target];
        const use = item.use;
        if (use.effect === "heal") {
            const amount = heal(member, randInt(rng, use.power[0], use.power[1]));
            events.push({ type: "allyHeal", index: target, amount, hp: member.hp, text: `${member.name}の HP が ${amount} かいふくした！` });
        } else if (use.effect === "mp") {
            const amount = restoreMp(member, randInt(rng, use.power[0], use.power[1]));
            events.push({ type: "allyMp", index: target, mp: member.mp, text: `${member.name}の MP が ${amount} かいふくした！` });
        } else if (use.effect === "cure") {
            member.poison = false;
            events.push({ type: "text", text: `${member.name}の どくが きえた！` });
        } else if (use.effect === "revive") {
            if (revive(member, 0.5)) {
                events.push({ type: "allyHeal", index: target, amount: member.hp, hp: member.hp, text: `${member.name}は いきかえった！` });
            } else {
                events.push({ type: "text", text: "しかし なにも おこらなかった。" });
            }
        }
    }

    function enemyChooseAction(battle, enemyIndex, rng) {
        const enemy = battle.enemies[enemyIndex];
        const def = data.enemies[enemy.id];
        const wounded = battle.enemies.some(e => !e.gone && e.hp > 0 && e.hp < e.maxHp * 0.6);
        const options = def.actions.filter(([action]) => {
            if (action === "healAlly") {
                return wounded;
            }
            if (action === "selfHeal") {
                return enemy.hp < enemy.maxHp * 0.5;
            }
            if (action === "dispel") {
                return battle.allyState.some(s => s.atkUp > 0 || s.defUp > 0);
            }
            return true;
        });
        const total = options.reduce((sum, [, w]) => sum + w, 0);
        let roll = rng() * total;
        for (const [action, w] of options) {
            roll -= w;
            if (roll < 0) {
                return action;
            }
        }
        return "attack";
    }

    function enemyAct(battle, enemyIndex, rng, events) {
        const enemy = battle.enemies[enemyIndex];
        if (enemy.gone || enemy.hp <= 0 || aliveAllies(battle).length === 0) {
            return;
        }
        if (enemy.sleep > 0) {
            enemy.sleep -= 1;
            if (enemy.sleep === 0 || rng() < 0.33) {
                enemy.sleep = 0;
                events.push({ type: "text", text: `${enemy.name}は めを さました！` });
            } else {
                events.push({ type: "text", text: `${enemy.name}は ねむっている。` });
            }
            return;
        }
        const action = enemyChooseAction(battle, enemyIndex, rng);
        const name = enemy.name;
        const atk = enemyAttack(enemy);

        if (action === "attack") {
            const target = pickAllyTarget(battle, rng);
            events.push({ type: "enemyAct", index: enemyIndex, text: `${name}の こうげき！` });
            if (rng() < 1 / 40) {
                events.push({ type: "text", text: `${battle.party[target].name}は ひらりと みをかわした！` });
                return;
            }
            damageAlly(battle, target, physicalDamage(atk, allyDefense(battle, target), rng), events);
            return;
        }
        if (action.startsWith("spell:")) {
            const spell = data.spells[action.slice(6)];
            events.push({ type: "enemyAct", index: enemyIndex, text: `${name}は ${spell.name}を となえた！` });
            const targets = spell.target === "enemies" ? aliveAllies(battle) : [pickAllyTarget(battle, rng)];
            targets.forEach(i => {
                damageAlly(battle, i, Math.round(randInt(rng, spell.power[0], spell.power[1]) * 0.9), events);
            });
            return;
        }

        const skill = data.skills[action];
        const text = skill.text.replace("{name}", name);
        events.push({ type: "enemyAct", index: enemyIndex, text });
        if (skill.kind === "attack") {
            const target = pickAllyTarget(battle, rng);
            damageAlly(battle, target, physicalDamage(atk * skill.mult, allyDefense(battle, target), rng), events);
            const member = battle.party[target];
            if (skill.poison && member.hp > 0 && !member.poison && rng() < skill.poison) {
                member.poison = true;
                events.push({ type: "allyStatus", index: target, text: `${member.name}は どくに おかされた！` });
            }
        } else if (skill.kind === "status") {
            const target = pickAllyTarget(battle, rng);
            const member = battle.party[target];
            if (rng() < skill.chance) {
                if (skill.status === "poison") {
                    member.poison = true;
                    events.push({ type: "allyStatus", index: target, text: `${member.name}は どくに おかされた！` });
                } else {
                    battle.allyState[target].sleep = 2;
                    events.push({ type: "allyStatus", index: target, text: `${member.name}は ねむってしまった！` });
                }
            } else {
                events.push({ type: "text", text: `${member.name}には きかなかった！` });
            }
        } else if (skill.kind === "group") {
            aliveAllies(battle).forEach(i => {
                damageAlly(battle, i, randInt(rng, skill.power[0], skill.power[1]), events);
            });
        } else if (skill.kind === "healAlly" || skill.kind === "selfHeal") {
            const candidates = skill.kind === "selfHeal"
                ? [enemyIndex]
                : battle.enemies.map((e, i) => i).filter(i => !battle.enemies[i].gone && battle.enemies[i].hp > 0);
            const target = candidates.reduce((best, i) => (battle.enemies[i].hp / battle.enemies[i].maxHp < battle.enemies[best].hp / battle.enemies[best].maxHp ? i : best), candidates[0]);
            const foe = battle.enemies[target];
            const amount = Math.min(foe.maxHp - foe.hp, randInt(rng, skill.power[0], skill.power[1]));
            foe.hp += amount;
            events.push({ type: "enemyHeal", index: target, amount, text: `${foe.name}の きずが ${amount} かいふくした！` });
        } else if (skill.kind === "dispel") {
            battle.allyState.forEach(state => {
                state.atkUp = 0;
                state.defUp = 0;
            });
            events.push({ type: "text", text: "じゅもんの こうかが かきけされた！" });
        } else if (skill.kind === "flee") {
            enemy.gone = true;
            events.push({ type: "enemyFlee", index: enemyIndex, text: "" });
        }
    }

    function allyAct(battle, index, command, bag, rng, events) {
        const member = battle.party[index];
        const state = battle.allyState[index];
        if (member.hp <= 0) {
            return;
        }
        if (state.sleep > 0) {
            state.sleep -= 1;
            if (state.sleep === 0 || rng() < 0.4) {
                state.sleep = 0;
                events.push({ type: "text", text: `${member.name}は めを さました！` });
            } else {
                events.push({ type: "text", text: `${member.name}は ねむっている。` });
            }
            return;
        }
        if (aliveEnemies(battle).length === 0) {
            return;
        }
        if (command.type === "attack") {
            const target = firstAliveEnemy(battle, command.target);
            const enemy = battle.enemies[target];
            events.push({ type: "allyAct", index, text: `${member.name}の こうげき！` });
            const critRate = member.cls === "hero" ? 1 / 24 : 1 / 40;
            if (rng() < critRate) {
                events.push({ type: "critical", text: "かいしんの いちげき！" });
                damageEnemy(battle, target, criticalDamage(allyAttack(battle, index), rng), events, rng);
                return;
            }
            const enemyDef = data.enemies[enemy.id];
            if (rng() < (enemyDef.agi > agilityOf(member) * 2 ? 1 / 10 : 1 / 50)) {
                events.push({ type: "text", text: `${enemy.name}は ひらりと みをかわした！` });
                return;
            }
            damageEnemy(battle, target, physicalDamage(allyAttack(battle, index), enemyDef.def, rng), events, rng);
        } else if (command.type === "spell") {
            castAllySpell(battle, index, command.spell, command.target, rng, events);
        } else if (command.type === "item") {
            useItemInBattle(battle, index, command.item, command.target, bag, rng, events);
        } else if (command.type === "defend") {
            // ぼうぎょは ターンのはじめに処理ずみ
        }
    }

    function tryFlee(battle, rng, events) {
        events.push({ type: "text", text: `${battle.party[aliveAllies(battle)[0]].name}たちは にげだした！` });
        if (!battle.canFlee) {
            events.push({ type: "text", text: "しかし まわりこまれてしまった！" });
            return false;
        }
        const partyAgi = Math.max(...aliveAllies(battle).map(i => agilityOf(battle.party[i])));
        const foes = aliveEnemies(battle);
        const enemyAgi = foes.reduce((sum, e) => sum + data.enemies[e.id].agi, 0) / Math.max(1, foes.length);
        const chance = Math.max(0.3, Math.min(0.92, 0.55 + (partyAgi - enemyAgi) / 60 + battle.fleeTries * 0.15));
        battle.fleeTries += 1;
        if (rng() < chance) {
            battle.over = true;
            battle.result = "flee";
            events.push({ type: "fled", text: "" });
            return true;
        }
        events.push({ type: "text", text: "しかし まわりこまれてしまった！" });
        return false;
    }

    function finishCheck(battle, events) {
        if (battle.over) {
            return;
        }
        if (aliveAllies(battle).length === 0) {
            battle.over = true;
            battle.result = "lose";
            events.push({ type: "lose", text: "ぜんめつしてしまった…" });
            return;
        }
        if (aliveEnemies(battle).length === 0) {
            battle.over = true;
            battle.result = battle.defeated.length > 0 ? "win" : "empty";
        }
    }

    // 1 ターン進める。commands は味方ごとの命令の配列、または { flee: true }
    function resolveRound(battle, commands, bag, rng) {
        const events = [];
        battle.turn += 1;
        battle.allyState.forEach(state => {
            state.defending = false;
        });

        if (commands && commands.flee) {
            if (!tryFlee(battle, rng, events)) {
                aliveEnemies(battle).forEach(enemy => {
                    const index = battle.enemies.indexOf(enemy);
                    const times = data.enemies[enemy.id].actionsPerTurn || 1;
                    for (let k = 0; k < times && !battle.over; k += 1) {
                        enemyAct(battle, index, rng, events);
                        finishCheck(battle, events);
                    }
                });
            }
            finishCheck(battle, events);
            return events;
        }

        // ぼうぎょは だれよりも先に
        battle.party.forEach((member, i) => {
            if (commands[i] && commands[i].type === "defend" && member.hp > 0) {
                battle.allyState[i].defending = true;
                events.push({ type: "text", text: `${member.name}は みをまもっている。` });
            }
        });

        const actors = [];
        battle.party.forEach((member, i) => {
            if (member.hp > 0 && commands[i] && commands[i].type !== "defend") {
                actors.push({ side: "ally", index: i, speed: agilityOf(member) * (0.55 + rng() * 0.45) });
            }
        });
        battle.enemies.forEach((enemy, i) => {
            if (!enemy.gone && enemy.hp > 0) {
                const def = data.enemies[enemy.id];
                const times = def.actionsPerTurn || 1;
                for (let k = 0; k < times; k += 1) {
                    // 2 回目の行動は 少し遅れがち
                    actors.push({ side: "enemy", index: i, speed: def.agi * (0.55 + rng() * 0.45) - (k > 0 ? rng() * def.agi * 0.5 : 0) });
                }
            }
        });
        actors.sort((a, b) => b.speed - a.speed);

        for (const actor of actors) {
            if (battle.over) {
                break;
            }
            if (actor.side === "ally") {
                allyAct(battle, actor.index, commands[actor.index], bag, rng, events);
            } else {
                enemyAct(battle, actor.index, rng, events);
            }
            finishCheck(battle, events);
        }

        // ターンの終わりに どくのダメージ
        if (!battle.over) {
            battle.party.forEach((member, i) => {
                if (member.hp > 0 && member.poison) {
                    const amount = Math.max(1, Math.floor(maxHp(member) / 14));
                    member.hp = Math.max(0, member.hp - amount);
                    events.push({ type: "allyHit", index: i, amount, hp: member.hp, poison: true, text: `${member.name}は どくで ${amount}の ダメージ！` });
                    if (member.hp <= 0) {
                        member.poison = false;
                        // たおれたら ねむりや 強化も なくなる（damageAlly と 同じ）
                        battle.allyState[i] = { atkUp: 0, defUp: 0, sleep: 0, defending: false };
                        events.push({ type: "allyDown", index: i, text: `${member.name}は たおれた…` });
                    }
                }
            });
            finishCheck(battle, events);
        }
        return events;
    }

    // 勝ったあとの経験値とゴールド。生き残った味方 ぜんいんが 同じだけ もらう
    // rate は「かんたん」のときの ほうびの 倍率
    function battleRewards(battle, rng, rate = 1) {
        let exp = 0;
        let gold = 0;
        battle.defeated.forEach(id => {
            const def = data.enemies[id];
            exp += def.exp;
            gold += def.gold;
        });
        exp = Math.round(exp * rate);
        gold = Math.round(gold * rate);
        const levelUps = [];
        battle.party.forEach((member, index) => {
            if (member.hp > 0) {
                gainExp(member, exp, rng).forEach(up => levelUps.push(Object.assign({ index, name: member.name }, up)));
            }
        });
        return { exp, gold, levelUps };
    }

    // ---------- おまかせ（自動で命令を決める） ----------
    // 体力が減った味方がいれば回復、敵が多ければ全体じゅもん、そうでなければ弱った敵をねらう
    // tactic（さくせん）：normal バッチリがんばれ / attack ガンガンいこうぜ / safe いのちだいじに / save じゅもんせつやく
    const TACTICS = ["normal", "attack", "safe", "save"];

    function autoCommands(battle, bag, tactic = "normal") {
        const commands = [];
        const enemiesAlive = battle.enemies.map((e, i) => i).filter(i => !battle.enemies[i].gone && battle.enemies[i].hp > 0);
        const weakest = enemiesAlive.reduce((best, i) => (best === -1 || battle.enemies[i].hp < battle.enemies[best].hp ? i : best), -1);
        const isBoss = enemiesAlive.some(i => data.enemies[battle.enemies[i].id].boss);
        battle.party.forEach((member, index) => {
            if (member.hp <= 0) {
                commands.push(null);
                return;
            }
            const has = spellId => member.spells.includes(spellId) && member.mp >= data.spells[spellId].mp;
            const threshold = { normal: isBoss ? 0.55 : 0.4, attack: isBoss ? 0.4 : 0.25, safe: isBoss ? 0.7 : 0.6, save: isBoss ? 0.55 : 0.4 }[tactic] || 0.4;
            const hurt = battle.party.map((m, i) => i).filter(i => battle.party[i].hp > 0 && battle.party[i].hp < maxHp(battle.party[i]) * threshold);
            const down = battle.party.map((m, i) => i).filter(i => battle.party[i].hp <= 0);
            if (down.length > 0 && has("yomigaeri")) {
                commands.push({ type: "spell", spell: "yomigaeri", target: down[0] });
                return;
            }
            if (hurt.length >= 2 && has("iyashinohikari")) {
                commands.push({ type: "spell", spell: "iyashinohikari" });
                return;
            }
            if (hurt.length > 0) {
                const target = hurt.reduce((best, i) => (battle.party[i].hp < battle.party[best].hp ? i : best), hurt[0]);
                const heavy = maxHp(battle.party[target]) - battle.party[target].hp > 70;
                if (heavy && has("daiiyashi")) {
                    commands.push({ type: "spell", spell: "daiiyashi", target });
                    return;
                }
                if (has("iyashi")) {
                    commands.push({ type: "spell", spell: "iyashi", target });
                    return;
                }
                const potion = ["jouyakusou", "yakusou"].find(id => itemCount(bag, id) > 0);
                // いのちだいじに では 仲間にも やくそうを つかう
                if (potion && (target === index || tactic === "safe")) {
                    commands.push({ type: "item", item: potion, target });
                    return;
                }
            }
            if (isBoss && member.cls === "priest" && has("mamori") && battle.allyState[index].defUp === 0 && battle.turn < 3) {
                commands.push({ type: "spell", spell: "mamori" });
                return;
            }
            // じゅもんせつやく：回復いがいの じゅもんは つかわない
            if (tactic === "save") {
                commands.push({ type: "attack", target: weakest });
                return;
            }
            const group = ["bakuhatsu", "ikazuchi", "honoo", "koori"].find(has);
            // ガンガンいこうぜ では MP が 少なくても 攻撃じゅもんを つかう
            const mpRatio = tactic === "attack" ? 1 : member.mp / Math.max(1, maxMp(member));
            if (group && enemiesAlive.length >= 2 && (mpRatio > 0.35 || isBoss)) {
                commands.push({ type: "spell", spell: group });
                return;
            }
            // ボスには いちばん強い じゅもんを（1 体でも 全体じゅもんの方が強いことがある）
            if (isBoss && member.cls === "mage") {
                const strongest = ["bakuhatsu", "honoo", "koori", "hinoko"].find(has);
                if (strongest) {
                    commands.push({ type: "spell", spell: strongest, target: weakest });
                    return;
                }
            }
            const single = ["hoshinohikari", "hikarinoya", "hinoko"].find(has);
            if (single && member.cls !== "hero" && (mpRatio > 0.5 || isBoss)) {
                commands.push({ type: "spell", spell: single, target: weakest });
                return;
            }
            if (isBoss && member.cls === "hero" && has("hoshinohikari")) {
                commands.push({ type: "spell", spell: "hoshinohikari", target: weakest });
                return;
            }
            commands.push({ type: "attack", target: weakest });
        });
        return commands;
    }

    const rules = {
        MAX_LEVEL,
        BAG_LIMIT,
        expForLevel,
        growthAt,
        createMember,
        levelUp,
        gainExp,
        maxHp,
        maxMp,
        attackOf,
        defenseOf,
        agilityOf,
        wisdomOf,
        canEquip,
        physicalDamage,
        createBag,
        itemCount,
        addItem,
        canAddItem,
        removeItem,
        sellPrice,
        healAmount,
        heal,
        restoreMp,
        revive,
        rollEncounter,
        overwhelms,
        TACTICS,
        createBattle,
        resolveRound,
        battleRewards,
        autoCommands,
        aliveEnemies,
        aliveAllies,
        randInt
    };

    const HF = root.HF = root.HF || {};
    HF.rules = rules;
    if (typeof module === "object" && module.exports) {
        module.exports = rules;
    }
})(typeof window !== "undefined" ? window : globalThis);
