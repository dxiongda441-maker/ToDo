// ほしふるクエスト：画面と進行（入力・ウィンドウ・移動・戦闘・店・セーブ）
(() => {
    "use strict";

    const { data, rules: R, maps: MAPS, shops: SHOPS, gates: GATES, sprites: S } = window.HF;
    const audio = window.HF.audio;

    const TILE = 16;
    const VIEW_W = 17;
    const VIEW_H = 13;
    const STEP_MS = 150;
    const SAVE_KEY = "hoshifuru.save.v1";
    const SETTINGS_KEY = "hoshifuru.settings.v1";
    const TODO_DAILY_LIMIT = 5;
    const EASY_RATE = 1.5; // むずかしさ「かんたん」の 経験値と お金の 倍率

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const ui = document.getElementById("ui");
    const screenEl = document.getElementById("screen");
    const fadeEl = document.getElementById("fade");
    const rng = Math.random;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // ---------- 設定 ----------
    const TEXT_SPEEDS = { fast: 8, normal: 22, slow: 45 };
    let settings = Object.assign({ textSpeed: "normal", sound: false, pad: false, easy: false }, readJson(SETTINGS_KEY, {}));

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_error) {
            return false;
        }
    }

    function applySettings() {
        audio.setEnabled(settings.sound);
        document.getElementById("pad").classList.toggle("show", Boolean(settings.pad));
        writeJson(SETTINGS_KEY, settings);
    }

    // ---------- ゲームの状態（セーブされる） ----------
    let game = null;
    let scene = "title"; // title / field / battle / ending
    let busy = false; // できごと・戦闘の最中は 歩けない

    function newGameState(name) {
        const hero = R.createMember("hero", name, 1, rng);
        hero.equip.weapon = "hinokinobou";
        hero.equip.armor = "nunonofuku";
        return {
            version: 1,
            party: [hero],
            bag: R.createBag(),
            gold: 0,
            flags: {},
            chests: {},
            visited: { sora: true },
            map: "sora",
            x: 5,
            y: 12,
            dir: "left",
            lastTown: "sora",
            holyWater: 0,
            stats: { steps: 0, battles: 0, wins: 0, playMs: 0, chests: 0 },
            kills: {},
            seen: {},
            todo: { redeemed: [], day: "", today: 0 },
            journal: [],
            cleared: false
        };
    }

    // ぼうけん日誌：できごとを プレイ時間と いっしょに 残す（強くなった足あとを あとで ふりかえれる）
    function note(text) {
        if (!game) {
            return;
        }
        const now = performance.now();
        game.stats.playMs += now - playClock;
        playClock = now;
        game.journal.push({ t: Math.round(game.stats.playMs), text });
        if (game.journal.length > 200) {
            game.journal.splice(1, game.journal.length - 200);
        }
    }

    let playClock = performance.now();

    function saveGame() {
        if (!game) {
            return false;
        }
        const now = performance.now();
        game.stats.playMs += now - playClock;
        playClock = now;
        return writeJson(SAVE_KEY, Object.assign({}, game, { savedAt: Date.now() }));
    }

    function loadSave() {
        const saved = readJson(SAVE_KEY, null);
        if (!saved || saved.version !== 1 || !Array.isArray(saved.party)) {
            return null;
        }
        // 日誌が入る前の 冒険の書も そのまま読めるように
        if (!Array.isArray(saved.journal)) {
            saved.journal = [];
        }
        if (saved.cleared && saved.flags) {
            saved.flags.cleared = true;
        }
        return saved;
    }

    // ---------- 入力 ----------
    const held = new Set();
    const KEYMAP = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
        z: "ok", Z: "ok", Enter: "ok", " ": "ok",
        x: "cancel", X: "cancel", Escape: "cancel", Backspace: "cancel"
    };
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const layers = [];

    function dispatch(action) {
        const top = layers[layers.length - 1];
        if (top) {
            top.onKey(action);
            return;
        }
        if (scene === "field" && !busy && (action === "ok" || action === "cancel")) {
            fieldAction(action);
        }
    }

    document.addEventListener("keydown", event => {
        const target = event.target;
        if (target && target.tagName === "INPUT" && event.key !== "Enter" && event.key !== "Escape") {
            return;
        }
        const action = KEYMAP[event.key];
        if (!action) {
            return;
        }
        event.preventDefault();
        if (DIRS[action]) {
            held.add(action);
        }
        if (!event.repeat || DIRS[action]) {
            dispatch(action);
        }
    });
    document.addEventListener("keyup", event => {
        const action = KEYMAP[event.key];
        if (action) {
            held.delete(action);
        }
    });
    window.addEventListener("blur", () => held.clear());

    document.querySelectorAll(".pad-btn").forEach(button => {
        const action = button.dataset.key;
        let repeat = null;
        const release = () => {
            held.delete(action);
            button.classList.remove("pressed");
            clearInterval(repeat);
        };
        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            button.classList.add("pressed");
            if (DIRS[action]) {
                held.add(action);
                repeat = setInterval(() => {
                    if (layers.length > 0) {
                        dispatch(action);
                    }
                }, 220);
            }
            dispatch(action);
        });
        ["pointerup", "pointerleave", "pointercancel"].forEach(type => button.addEventListener(type, release));
    });

    // ---------- ウィンドウ ----------
    function makeWin(className, style) {
        const el = document.createElement("div");
        el.className = `win ${className || ""}`;
        Object.assign(el.style, style || {});
        ui.appendChild(el);
        return el;
    }

    function pushLayer(layer) {
        layers.push(layer);
        return () => {
            const index = layers.indexOf(layer);
            if (index >= 0) {
                layers.splice(index, 1);
            }
        };
    }

    // ---------- メッセージ ----------
    let messageEl = null;

    function openMessage() {
        if (!messageEl) {
            messageEl = makeWin("message");
            messageEl.setAttribute("role", "status");
            messageEl.setAttribute("aria-live", "polite");
        }
        return messageEl;
    }

    function closeMessage() {
        if (messageEl) {
            messageEl.remove();
            messageEl = null;
        }
    }

    // 1 ページ表示して、決定キーを待つ
    function say(text) {
        return new Promise(resolve => {
            const el = openMessage();
            el.textContent = "";
            const body = document.createElement("span");
            el.appendChild(body);
            let shown = 0;
            let done = false;
            const speed = TEXT_SPEEDS[settings.textSpeed] || 22;
            const more = document.createElement("span");
            more.className = "more";
            more.textContent = "▼";
            const finish = () => {
                done = true;
                body.textContent = text;
                el.appendChild(more);
            };
            const timer = setInterval(() => {
                shown += 1;
                body.textContent = text.slice(0, shown);
                if (shown >= text.length) {
                    clearInterval(timer);
                    finish();
                }
            }, speed);
            const pop = pushLayer({
                onKey(action) {
                    if (action !== "ok" && action !== "cancel") {
                        return;
                    }
                    if (!done) {
                        clearInterval(timer);
                        finish();
                        return;
                    }
                    pop();
                    more.remove();
                    resolve();
                }
            });
            el.onclick = () => layers[layers.length - 1] && layers[layers.length - 1].onKey("ok");
        });
    }

    async function sayAll(lines) {
        for (const line of lines) {
            await say(line);
        }
    }

    // 戦闘の記録：行をためていき、自動で進む（決定キーで早送り）
    let logLines = [];

    function battleLog(text) {
        return new Promise(resolve => {
            if (!text) {
                resolve();
                return;
            }
            const el = openMessage();
            logLines.push(text);
            if (logLines.length > 4) {
                logLines = logLines.slice(-4);
            }
            el.textContent = logLines.join("\n");
            const wait = { fast: 260, normal: 520, slow: 900 }[settings.textSpeed] || 520;
            let finished = false;
            const end = () => {
                if (finished) {
                    return;
                }
                finished = true;
                pop();
                resolve();
            };
            const pop = pushLayer({
                onKey(action) {
                    if (action === "ok" || action === "cancel") {
                        end();
                    }
                }
            });
            setTimeout(end, wait);
        });
    }

    function clearLog() {
        logLines = [];
        if (messageEl) {
            messageEl.textContent = "";
        }
    }

    // ---------- 選択のメニュー ----------
    // items: [{ label, value, disabled, right, info }]
    function choose(items, options = {}) {
        return new Promise(resolve => {
            const el = makeWin(`menu-win ${options.className || ""}`, options.style || {});
            if (options.title) {
                const title = document.createElement("div");
                title.className = "win-title";
                title.textContent = options.title;
                el.appendChild(title);
            }
            const list = document.createElement("div");
            list.className = "menu";
            const cols = options.cols || 1;
            list.style.gridTemplateColumns = `repeat(${cols}, auto)`;
            el.appendChild(list);
            const rows = items.map((item, index) => {
                const row = document.createElement("div");
                row.className = `menu-item${item.disabled ? " disabled" : ""}`;
                row.textContent = item.label;
                if (item.right !== undefined) {
                    const right = document.createElement("span");
                    right.className = "right";
                    right.textContent = item.right;
                    row.appendChild(right);
                }
                row.addEventListener("click", () => {
                    current = index;
                    update();
                    select();
                });
                list.appendChild(row);
                return row;
            });
            let current = Math.max(0, Math.min(items.length - 1, options.start || 0));
            const maxRows = options.maxRows || 0;
            const update = () => {
                rows.forEach((row, i) => {
                    row.classList.toggle("current", i === current);
                    if (maxRows) {
                        const first = Math.max(0, Math.min(current - Math.floor(maxRows / 2), items.length - maxRows));
                        row.style.display = i >= first && i < first + maxRows ? "" : "none";
                    }
                });
                if (options.onMove) {
                    options.onMove(items[current], current);
                }
            };
            const close = value => {
                pop();
                if (!options.keep) {
                    el.remove();
                }
                resolve(value);
            };
            const select = () => {
                const item = items[current];
                if (!item || item.disabled) {
                    audio.se("buzz");
                    return;
                }
                audio.se("ok");
                close(options.returnIndex ? current : item.value);
            };
            const pop = pushLayer({
                onKey(action) {
                    if (action === "up") {
                        current = (current - cols + items.length) % items.length;
                    } else if (action === "down") {
                        current = (current + cols) % items.length;
                    } else if (action === "left" && cols > 1) {
                        current = (current - 1 + items.length) % items.length;
                    } else if (action === "right" && cols > 1) {
                        current = (current + 1) % items.length;
                    } else if (action === "ok") {
                        select();
                        return;
                    } else if (action === "cancel") {
                        if (options.cancel !== false) {
                            audio.se("cancel");
                            close(null);
                        }
                        return;
                    }
                    audio.se("cursor");
                    update();
                }
            });
            update();
            if (options.onOpen) {
                options.onOpen(el);
            }
            choose.lastEl = el;
        });
    }

    async function yesNo(question) {
        if (question) {
            await say(question);
        }
        const answer = await choose([{ label: "はい", value: true }, { label: "いいえ", value: false }], { style: { right: "6%", bottom: "38%" } });
        return answer === true;
    }

    function infoWin(style) {
        return makeWin("info", style);
    }

    // ---------- ステータスの表示 ----------
    function memberHtml(member, shown) {
        const hp = shown ? shown.hp : member.hp;
        const mp = shown ? shown.mp : member.mp;
        const max = R.maxHp(member);
        const state = hp <= 0 ? "dead" : hp < max / 4 ? "low" : "";
        return `<div class="member ${state}${member.poison && hp > 0 ? " poison" : ""}">
            <div class="name">${escapeHtml(member.name)}</div>
            <div>H ${String(hp).padStart(3, " ")}</div>
            <div>M ${String(mp).padStart(3, " ")}</div>
            <div>Lv ${member.level}</div>
        </div>`;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
    }

    function statusWin(style, shown) {
        const el = makeWin("party-status", Object.assign({ left: "3%", top: "3%" }, style || {}));
        const render = () => {
            el.innerHTML = `<div class="status-row" style="--cols:${game.party.length}">${game.party.map((m, i) => memberHtml(m, shown && shown[i])).join("")}</div>`;
        };
        render();
        el.refresh = render;
        return el;
    }

    // ---------- 画面の切りかえ ----------
    async function fade(change, color) {
        fadeEl.classList.toggle("white", color === "white");
        fadeEl.classList.add("on");
        await sleep(260);
        if (change) {
            await change();
        }
        render(performance.now());
        fadeEl.classList.remove("on");
        await sleep(260);
    }

    function shake() {
        screenEl.classList.remove("shake");
        void screenEl.offsetWidth;
        screenEl.classList.add("shake");
    }

    // ---------- マップ ----------
    const field = {
        map: null,
        npcs: [],
        moving: null, // { fromX, fromY, start }
        trail: [],
        grace: 4, // この歩数のあいだは 魔物が出ない
        lastBlocked: ""
    };

    const BLOCKED = {
        world: "^~",
        town: "T#c~Ab",
        cave: "#X*",
        tower: "#X*",
        shrine: "#~X*",
        castle: "#X*K"
    };
    const ENCOUNTER_RATE = { ".": 1 / 22, "T": 1 / 12, ":": 1 / 18, ",": 1 / 14 };

    function currentMap() {
        return MAPS[game.map];
    }

    function tileAt(x, y, map) {
        const m = map || currentMap();
        if (y < 0 || y >= m.rows.length || x < 0 || x >= m.rows[0].length) {
            return null;
        }
        return m.rows[y][x];
    }

    const gateOpen = ch => !GATES[ch] || Boolean(game.flags[GATES[ch]]);

    function placePosition(placeChar) {
        const world = MAPS.world;
        for (let y = 0; y < world.rows.length; y += 1) {
            const x = world.rows[y].indexOf(placeChar);
            if (x >= 0) {
                return { x, y };
            }
        }
        return { x: 1, y: 1 };
    }

    function loadNpcs() {
        const map = currentMap();
        field.npcs = (map.npcs || []).filter(npc => !(npc.hideIf && game.flags[npc.hideIf]) && !(npc.showIf && !game.flags[npc.showIf])).map(npc => Object.assign({ hx: npc.x, hy: npc.y, cx: npc.x, cy: npc.y, timer: 1000 + rng() * 2000 }, npc));
    }

    function npcAt(x, y) {
        return field.npcs.find(npc => npc.cx === x && npc.cy === y) || null;
    }

    function passable(x, y, forNpc) {
        const map = currentMap();
        const ch = tileAt(x, y);
        if (ch === null) {
            return !forNpc && map.kind === "town";
        }
        if ((BLOCKED[map.tileset] || "").includes(ch)) {
            return false;
        }
        if (map.kind === "world" && GATES[ch] && !gateOpen(ch)) {
            return false;
        }
        if (npcAt(x, y)) {
            return false;
        }
        if (forNpc && (x === game.x && y === game.y)) {
            return false;
        }
        return true;
    }

    async function enterMap(mapId, x, y, dir) {
        game.map = mapId;
        game.x = x;
        game.y = y;
        if (dir) {
            game.dir = dir;
        }
        field.trail = [];
        field.grace = 4;
        const map = currentMap();
        if (map.kind === "town") {
            if (!game.visited[mapId] || game.journal.length === 0) {
                note(game.journal.length === 0 ? `${map.name}から 旅が はじまった。` : `${map.name}に たどりついた。`);
            }
            game.visited[mapId] = true;
            game.lastTown = mapId;
        }
        loadNpcs();
        audio.bgm(map.music);
        saveGame();
    }

    async function warpTo(mapId, x, y, dir) {
        busy = true;
        await fade(() => enterMap(mapId, x, y, dir));
        busy = false;
        await afterArrive();
    }

    async function exitToWorld() {
        const map = currentMap();
        // 世界地図に 入口がない ダンジョン（星の遺跡）は 決まった場所へ 出る
        if (map.exitTo) {
            await warpTo(map.exitTo.map, map.exitTo.x, map.exitTo.y, "down");
            return;
        }
        const pos = placePosition(map.place);
        await warpTo("world", pos.x, pos.y, "down");
    }

    // 着いたときに起きる できごと（オープニングなど）
    async function afterArrive() {
        const map = currentMap();
        if (map.kind === "town") {
            await giveTodoSeeds();
        }
        for (const event of map.events || []) {
            if (event.auto && !(event.once && game.flags[event.once])) {
                await runEvent(event);
            }
        }
    }

    // ---------- 歩く ----------
    function update(now) {
        if (scene !== "field" || !game) {
            return;
        }
        // NPC がうろうろする
        field.npcs.forEach(npc => {
            if (npc.move !== "wander") {
                return;
            }
            npc.timer -= 16;
            if (npc.timer > 0) {
                return;
            }
            npc.timer = 1200 + rng() * 2400;
            if (busy || layers.length > 0) {
                return;
            }
            const dirs = Object.values(DIRS);
            const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
            const nx = npc.cx + dx;
            const ny = npc.cy + dy;
            if (Math.abs(nx - npc.hx) <= 2 && Math.abs(ny - npc.hy) <= 2 && passable(nx, ny, true)) {
                npc.cx = nx;
                npc.cy = ny;
            }
        });

        if (field.moving) {
            if (now - field.moving.start >= STEP_MS) {
                field.moving = null;
                onStep();
            }
            return;
        }
        if (busy || layers.length > 0) {
            return;
        }
        const dir = ["up", "down", "left", "right"].find(d => held.has(d));
        if (dir) {
            tryMove(dir, now);
        }
    }

    function tryMove(dir, now) {
        game.dir = dir;
        const [dx, dy] = DIRS[dir];
        const nx = game.x + dx;
        const ny = game.y + dy;
        const map = currentMap();
        if (map.kind === "town" && tileAt(nx, ny) === null) {
            exitToWorld();
            return;
        }
        const ch = tileAt(nx, ny);
        if (map.kind === "world" && GATES[ch] && !gateOpen(ch)) {
            const key = `${nx},${ny}`;
            if (field.lastBlocked !== key) {
                field.lastBlocked = key;
                busy = true;
                say(ch === "L" ? "湖の むこうに 黒い 城が 見える。 わたる 道は ない…" : "ふしぎな 光の かべが 道を ふさいでいる…").then(() => {
                    closeMessage();
                    busy = false;
                });
            }
            return;
        }
        field.lastBlocked = "";
        if (!passable(nx, ny)) {
            return;
        }
        field.trail.unshift({ x: game.x, y: game.y, dir: game.dir });
        field.trail = field.trail.slice(0, 4);
        field.moving = { fromX: game.x, fromY: game.y, start: now };
        game.x = nx;
        game.y = ny;
    }

    async function onStep() {
        game.stats.steps += 1;
        const map = currentMap();
        const ch = tileAt(game.x, game.y);

        // どく・ぬま（移動中は HP 1 までしか へらない）
        let hurt = false;
        game.party.forEach(member => {
            if (member.hp > 1 && (member.poison || (map.kind === "world" && ch === ","))) {
                member.hp -= 1;
                hurt = true;
            }
        });
        if (hurt) {
            flashRed = 6;
        }
        if (game.holyWater > 0) {
            game.holyWater -= 1;
            if (game.holyWater === 0) {
                busy = true;
                await say("せいすいの こうかが きれた。");
                closeMessage();
                busy = false;
            }
        }

        // 場所に入る
        if (map.kind === "world" && map.places[ch]) {
            const target = MAPS[map.places[ch].map];
            await warpTo(map.places[ch].map, target.entry.x, target.entry.y, "up");
            return;
        }
        const key = `${game.x},${game.y}`;
        if (map.warps && map.warps[key]) {
            const warp = map.warps[key];
            audio.se("stairs");
            await warpTo(warp.map, warp.x, warp.y);
            return;
        }
        if (ch === "E" && map.kind === "dungeon") {
            await exitToWorld();
            return;
        }
        if (map.boss && map.boss.x === game.x && map.boss.y === game.y && !game.flags[map.boss.flag]) {
            await runBoss(map.boss);
            return;
        }
        for (const event of map.events || []) {
            if (!event.auto && event.x === game.x && event.y === game.y && !(event.once && game.flags[event.once])) {
                await runEvent(event);
                return;
            }
        }

        // 魔物が出る
        if (field.grace > 0) {
            field.grace -= 1;
            return;
        }
        let rate = 0;
        let zone = null;
        if (map.kind === "world") {
            rate = ENCOUNTER_RATE[ch] || 0;
            zone = `field${map.zoneRows[game.y][game.x]}`;
        } else if (map.kind === "dungeon" && map.zone) {
            rate = 1 / 16;
            zone = map.zone;
        }
        if (game.holyWater > 0) {
            rate = 0;
        }
        if (zone && rng() < rate) {
            const enemies = R.rollEncounter(zone, rng);
            if (enemies.length > 0) {
                await startBattle(enemies, {});
            }
        }
    }

    // ---------- しらべる・はなす ----------
    async function fieldAction(action) {
        if (field.moving) {
            return;
        }
        if (action === "ok") {
            const [dx, dy] = DIRS[game.dir];
            let tx = game.x + dx;
            let ty = game.y + dy;
            let npc = npcAt(tx, ty);
            if (!npc && tileAt(tx, ty) === "c") {
                tx += dx;
                ty += dy;
                npc = npcAt(tx, ty);
            }
            busy = true;
            if (npc) {
                await talkTo(npc);
            } else if (tileAt(tx, ty) === "X") {
                await openChest(tx, ty);
            } else if (tileAt(tx, ty) === "*") {
                await checkPedestal(tx, ty);
            } else {
                busy = false;
                await fieldMenu();
                return;
            }
            closeMessage();
            busy = false;
            return;
        }
        await fieldMenu();
    }

    async function talkTo(npc) {
        // こちらを向く（正面の絵しかないので、向きは変えない）
        if (npc.shop) {
            await shopDialog(npc.shop);
            return;
        }
        if (npc.inn) {
            await innDialog(npc.inn);
            return;
        }
        if (npc.church) {
            await churchDialog();
            return;
        }
        if (npc.arena) {
            await arenaDialog();
            return;
        }
        if (npc.scholar) {
            await scholarDialog();
            return;
        }
        const entry = (npc.talk || []).find(t => (!t.if || game.flags[t.if]) && (!t.unless || !game.flags[t.unless]));
        if (!entry) {
            return;
        }
        await sayAll(entry.say || []);
        if (entry.script) {
            await runScript(entry.script);
        }
    }

    function chestKey(x, y) {
        return `${game.map}:${x},${y}`;
    }

    async function openChest(x, y) {
        const key = chestKey(x, y);
        if (game.chests[key]) {
            await say("たからばこは からっぽだ。");
            return;
        }
        const content = (currentMap().chests || {})[`${x},${y}`];
        if (!content) {
            await say("たからばこは からっぽだ。");
            return;
        }
        const id = content.item || content.equip;
        if (id && !R.addItem(game.bag, id)) {
            await say("どうぐぶくろが いっぱいで もてない！");
            return;
        }
        game.chests[key] = true;
        game.stats.chests += 1;
        audio.se("chest");
        if (content.gold) {
            game.gold += content.gold;
            await say(`たからばこを あけた！\n${content.gold} ゴールドを 手に入れた！`);
        } else {
            const name = (data.items[id] || data.equipment[id]).name;
            await say(`たからばこを あけた！\n${name}を 手に入れた！`);
        }
        saveGame();
    }

    async function checkPedestal() {
        const pedestal = currentMap().pedestal;
        if (!pedestal) {
            return;
        }
        if (game.flags[pedestal.flag]) {
            await say("だいざは しずかに 光っている。");
            return;
        }
        if (!game.flags[pedestal.needs]) {
            await say("だいざの 上で なにかが 光っている。");
            return;
        }
        game.flags[pedestal.flag] = true;
        R.addItem(game.bag, pedestal.item);
        note(`${data.items[pedestal.item].name}を 手に入れた。`);
        audio.jingle("item");
        await sayAll(pedestal.text);
        saveGame();
    }

    // ---------- できごと（スクリプト） ----------
    async function runEvent(event) {
        busy = true;
        if (event.once && !event.script.some(cmd => cmd[0] === "battle")) {
            game.flags[event.once] = true;
        }
        const ok = await runScript(event.script);
        if (ok && event.once) {
            game.flags[event.once] = true;
        }
        closeMessage();
        busy = false;
        saveGame();
    }

    async function runBoss(boss) {
        busy = true;
        await sayAll(boss.intro);
        closeMessage();
        const result = await startBattle(boss.enemies, { boss: true, music: boss.music });
        if (result === "win") {
            game.flags[boss.flag] = true;
            note(`${data.enemies[boss.enemies[0]].name}を たおした！`);
            saveGame();
            await say("だいざの 上で なにかが 光っている。");
            closeMessage();
        }
        busy = false;
    }

    // 戦闘に負けたら false を返して、そこで止める
    async function runScript(script) {
        for (const command of script) {
            const [name, arg, extra] = command;
            if (name === "say") {
                await say(arg);
            } else if (name === "flag") {
                game.flags[arg] = true;
            } else if (name === "ask") {
                // 「いいえ」なら ここで やめる（失敗では ない）
                if (!(await yesNo(arg))) {
                    return true;
                }
            } else if (name === "warp") {
                closeMessage();
                await warpTo(arg, extra[0], extra[1], extra[2] || "up");
                return true;
            } else if (name === "give") {
                R.addItem(game.bag, arg);
                await say(`${data.items[arg].name}を 手に入れた！`);
            } else if (name === "equip") {
                R.addItem(game.bag, arg);
            } else if (name === "gold") {
                game.gold += arg;
                await say(`${arg} ゴールドを 手に入れた！`);
            } else if (name === "join") {
                const level = Math.max(command[3] || 1, game.party[0].level - 1);
                const member = R.createMember(arg, extra, level, rng);
                member.equip.weapon = arg === "mage" ? "kashinotsue" : "konbou";
                member.equip.armor = arg === "mage" ? "tabibitonofuku" : "kawanoyoroi";
                game.party.push(member);
                note(`${extra}が 仲間に なった。（Lv ${level}）`);
                audio.jingle("join");
                loadNpcs();
            } else if (name === "heal") {
                healAll();
            } else if (name === "battle") {
                closeMessage();
                const result = await startBattle(arg, Object.assign({ boss: true }, extra || {}));
                if (result !== "win") {
                    return false;
                }
                if (extra && extra.flag) {
                    game.flags[extra.flag] = true;
                }
                note(`${data.enemies[arg[arg.length - 1]].name}を たおした！`);
            } else if (name === "ending") {
                await playEnding();
                return true;
            }
        }
        return true;
    }

    function healAll() {
        game.party.forEach(member => {
            if (member.hp > 0) {
                member.hp = R.maxHp(member);
                member.mp = R.maxMp(member);
                member.poison = false;
            }
        });
    }

    // ---------- 戦闘 ----------
    let battleView = null;
    let flashRed = 0;

    function battleBackground() {
        const map = currentMap();
        if (map.kind === "world") {
            return { top: "#4d8fd6", bottom: "#3d7a3a", ground: "#5fae4e" };
        }
        const bgs = {
            cave: { top: "#1a1410", bottom: "#3a2e22", ground: "#5a4a3a" },
            tower: { top: "#3a4a6a", bottom: "#7d7464", ground: "#b9b09a" },
            shrine: { top: "#16304f", bottom: "#2a6fc9", ground: "#cfe0ee" },
            castle: { top: "#0b0812", bottom: "#2a2338", ground: "#3d3550" }
        };
        return bgs[map.tileset] || bgs.cave;
    }

    async function startBattle(enemyIds, options) {
        busy = true;
        held.clear();
        const battle = R.createBattle(game.party, enemyIds, { canFlee: !options.boss });
        game.stats.battles += 1;
        enemyIds.forEach(id => {
            game.seen[id] = true;
        });
        battleView = {
            battle,
            bg: battleBackground(),
            flash: {},
            fading: {},
            screenFlash: 0
        };
        audio.bgm(options.music || (options.boss ? "boss" : "battle"));
        await fade(() => {
            scene = "battle";
        }, "white");

        const shown = game.party.map(m => ({ hp: m.hp, mp: m.mp }));
        const status = statusWin({ left: "50%", transform: "translateX(-50%)" }, shown);
        clearLog();
        const groups = {};
        enemyIds.forEach(id => {
            groups[id] = (groups[id] || 0) + 1;
        });
        for (const [id, count] of Object.entries(groups)) {
            await battleLog(count > 1 ? `${data.enemies[id].name}が ${count}ひき あらわれた！` : `${data.enemies[id].name}が あらわれた！`);
        }
        // ずっと強くなると、弱い魔物は おそれをなして にげていく
        if (!options.boss && R.overwhelms(game.party, enemyIds) && rng() < 0.5) {
            await battleLog("まものたちは おそれをなして にげだした！");
            battle.over = true;
            battle.result = "scared";
        }

        let result = null;
        while (!battle.over) {
            closeMessage();
            clearLog();
            game.party.forEach((m, i) => {
                shown[i].hp = m.hp;
                shown[i].mp = m.mp;
            });
            status.refresh();
            const commands = await chooseCommands(battle, status);
            clearLog();
            const events = R.resolveRound(battle, commands, game.bag, rng);
            await playEvents(events, shown, status);
        }
        result = battle.result;
        status.refresh();

        if (result === "win") {
            const rewards = R.battleRewards(battle, rng, settings.easy ? EASY_RATE : 1);
            game.gold += rewards.gold;
            game.stats.wins += 1;
            battle.defeated.forEach(id => {
                if (!game.kills[id] && data.enemies[id].rare) {
                    note(`はじめて ${data.enemies[id].name}を たおした！`);
                }
                game.kills[id] = (game.kills[id] || 0) + 1;
            });
            audio.jingle("victory");
            await battleLog("まものたちを やっつけた！");
            if (rewards.exp > 0) {
                await say(`それぞれ ${rewards.exp}ポイントの 経験値を かくとく！\n${rewards.gold}ゴールドを 手に入れた！`);
            }
            for (const up of rewards.levelUps) {
                audio.jingle("levelup");
                status.refresh();
                const gains = [["hp", "さいだいHP"], ["mp", "さいだいMP"], ["str", "ちから"], ["def", "みのまもり"], ["agi", "すばやさ"], ["wis", "かしこさ"]]
                    .filter(([key]) => up.gains[key] > 0)
                    .map(([key, label]) => `${label}が ${up.gains[key]} あがった`);
                await say(`${up.name}は レベル ${up.level}に あがった！\n${gains.join("、")}！`);
                if (up.level % 5 === 0 || up.level === R.MAX_LEVEL) {
                    const member = game.party.find(m => m.name === up.name);
                    const stats = member ? `（HP ${R.maxHp(member)}・こうげき力 ${R.attackOf(member)}）` : "";
                    note(`${up.name}が レベル ${up.level}に なった。${stats}`);
                }
                for (const spellId of up.learned) {
                    await say(`${up.name}は ${data.spells[spellId].name}を おぼえた！`);
                    note(`${up.name}が ${data.spells[spellId].name}を おぼえた。`);
                }
            }
        } else if (result === "empty") {
            await battleLog("まものは みんな にげてしまった。");
            result = "win";
        } else if (result === "scared") {
            result = "win";
        } else if (result === "flee") {
            await battleLog("うまく にげきれた！");
        }

        closeMessage();
        status.remove();
        if (result === "lose" && options.arena) {
            // とうぎじょうでは 負けても 全滅に ならない（お金も へらない）
            await say(`${game.party[0].name}たちは たおれてしまった…`);
            closeMessage();
            await fade(() => {
                scene = "field";
                battleView = null;
                game.party.forEach(member => {
                    member.hp = Math.max(1, member.hp);
                    member.poison = false;
                });
                audio.bgm(currentMap().music);
            });
            busy = false;
            return "lose";
        }
        if (result === "lose") {
            await wipeOut();
            busy = false;
            return "lose";
        }
        await fade(() => {
            scene = "field";
            battleView = null;
            audio.bgm(currentMap().music);
        });
        field.grace = 3;
        saveGame();
        busy = false;
        return result;
    }

    async function wipeOut() {
        audio.bgm(null);
        await say(`${game.party[0].name}たちは ぜんめつした…`);
        closeMessage();
        await fade(async () => {
            scene = "field";
            battleView = null;
            if (!settings.easy) {
                game.gold = Math.floor(game.gold / 2);
            }
            game.party.forEach(member => {
                member.hp = R.maxHp(member);
                member.mp = R.maxMp(member);
                member.poison = false;
            });
            const town = MAPS[game.lastTown];
            const church = (town.npcs || []).find(n => n.church);
            await enterMap(game.lastTown, church ? church.x : town.entry.x, church ? church.y + 1 : town.entry.y, "up");
        });
        await say(`「おお ${game.party[0].name}！ しんでしまうとは なさけない…」${settings.easy ? "" : "\n（おかねが はんぶんに なった）"}`);
        await say("「もういちど ちからを つけて、ちょうせん するのです。」");
        closeMessage();
    }

    function aliveTargets(battle) {
        return battle.enemies.map((e, i) => ({ e, i })).filter(({ e }) => !e.gone && e.hp > 0);
    }

    async function pickEnemy(battle) {
        const targets = aliveTargets(battle);
        if (targets.length === 1) {
            return targets[0].i;
        }
        return choose(targets.map(({ e, i }) => ({ label: e.name, value: i })), {
            style: { right: "3%", bottom: "3%", minWidth: "44%" },
            title: "だれに？",
            onMove: item => {
                battleView.flash = { [item.value]: 999 };
            }
        }).then(value => {
            battleView.flash = {};
            return value;
        });
    }

    async function pickAlly(title) {
        return choose(game.party.map((m, i) => ({ label: m.name, value: i, right: `H${m.hp}` })), {
            style: { right: "3%", bottom: "3%", minWidth: "44%" },
            title: title || "だれに？"
        });
    }

    let testAutoBattle = false; // テスト用：命令を自動で決める

    async function chooseCommands(battle, status) {
        if (testAutoBattle) {
            await sleep(10);
            return R.autoCommands(battle, game.bag);
        }
        const commands = [];
        const members = game.party.map((m, i) => i);
        let k = 0;
        while (k < members.length) {
            const i = members[k];
            const member = game.party[i];
            if (member.hp <= 0 || battle.allyState[i].sleep > 0) {
                commands[i] = { type: "attack", target: 0 };
                k += 1;
                continue;
            }
            const enemyList = makeWin("enemy-list", { right: "3%", bottom: "3%", width: "48%" });
            const counts = {};
            aliveTargets(battle).forEach(({ e }) => {
                const base = data.enemies[e.id].name;
                counts[base] = (counts[base] || 0) + 1;
            });
            enemyList.innerHTML = Object.entries(counts).map(([name, n]) => `<div>${escapeHtml(name)}<span style="float:right">${n}ひき</span></div>`).join("");
            const options = [
                { label: "たたかう", value: "attack" },
                { label: "じゅもん", value: "spell", disabled: member.spells.filter(id => data.spells[id].battle !== false).length === 0 },
                { label: "どうぐ", value: "item" },
                { label: "ぼうぎょ", value: "defend" }
            ];
            if (k === 0) {
                options.push({ label: "にげる", value: "flee" });
                options.push({ label: "おまかせ", value: "auto" });
            }
            const choice = await choose(options, { style: { left: "3%", bottom: "3%", minWidth: "38%" }, title: member.name, cols: 2, cancel: k > 0 });
            enemyList.remove();
            if (choice === null) {
                // ひとつ前の人の命令からやり直す
                k -= 1;
                while (k > 0 && (game.party[members[k]].hp <= 0 || battle.allyState[members[k]].sleep > 0)) {
                    k -= 1;
                }
                k = Math.max(0, k);
                continue;
            }
            if (choice === "flee") {
                return { flee: true };
            }
            if (choice === "auto") {
                const auto = R.autoCommands(battle, game.bag);
                return game.party.map((m, idx) => commands[idx] || auto[idx] || { type: "attack", target: 0 });
            }
            if (choice === "attack") {
                const target = await pickEnemy(battle);
                if (target === null) {
                    continue;
                }
                commands[i] = { type: "attack", target };
            } else if (choice === "defend") {
                commands[i] = { type: "defend" };
            } else if (choice === "spell") {
                const usable = member.spells.filter(id => data.spells[id].battle !== false);
                const spellId = await choose(usable.map(id => ({ label: data.spells[id].name, value: id, right: data.spells[id].mp, disabled: member.mp < data.spells[id].mp })), {
                    style: { right: "3%", bottom: "3%", minWidth: "48%" },
                    title: `じゅもん（MP ${member.mp}）`,
                    cols: 1,
                    maxRows: 5
                });
                if (spellId === null) {
                    continue;
                }
                const spell = data.spells[spellId];
                let target = 0;
                if (spell.target === "enemy") {
                    target = await pickEnemy(battle);
                } else if (spell.target === "ally") {
                    target = await pickAlly(spell.name);
                }
                if (target === null) {
                    continue;
                }
                commands[i] = { type: "spell", spell: spellId, target };
            } else if (choice === "item") {
                const usable = game.bag.filter(entry => data.items[entry.id] && data.items[entry.id].use && data.items[entry.id].use.battle !== false);
                if (usable.length === 0) {
                    await battleLog("つかえる どうぐを もっていない。");
                    closeMessage();
                    clearLog();
                    continue;
                }
                const itemId = await choose(usable.map(entry => ({ label: data.items[entry.id].name, value: entry.id, right: entry.count })), {
                    style: { right: "3%", bottom: "3%", minWidth: "48%" },
                    title: "どうぐ",
                    maxRows: 5
                });
                if (itemId === null) {
                    continue;
                }
                const target = await pickAlly(data.items[itemId].name);
                if (target === null) {
                    continue;
                }
                commands[i] = { type: "item", item: itemId, target };
            }
            k += 1;
        }
        return commands;
    }

    // じゅもんの 光の色（属性ごと）
    const SPELL_COLORS = { fire: "#ff8a3d", ice: "#7fdcff", thunder: "#ffe94d", light: "#fff2b3", blast: "#ff5a5a" };

    async function playEvents(events, shown, status) {
        for (const event of events) {
            if (event.type === "enemyHit") {
                battleView.flash = { [event.index]: performance.now() + 300 };
                audio.se(event.amount > 0 ? "hit" : "miss");
            } else if (event.type === "enemyDown") {
                battleView.fading[event.index] = performance.now();
                audio.se("defeat");
            } else if (event.type === "enemyFlee") {
                battleView.fading[event.index] = performance.now();
                event.text = `${battleView.battle.enemies[event.index].name}は にげだした！`;
            } else if (event.type === "allyHit") {
                if (event.amount > 0) {
                    shake();
                    audio.se("damage");
                }
                shown[event.index].hp = event.hp;
                status.refresh();
            } else if (event.type === "allyHeal") {
                shown[event.index].hp = event.hp;
                status.refresh();
                audio.se("heal");
            } else if (event.type === "allyMp") {
                shown[event.index].mp = event.mp;
                status.refresh();
            } else if (event.type === "spell") {
                shown[event.caster].mp = event.mp;
                status.refresh();
                const spell = data.spells[event.spell] || {};
                const color = SPELL_COLORS[spell.element] || (spell.effect === "heal" || spell.effect === "revive" || spell.effect === "cure" ? "#7dffa8" : "#ffffff");
                battleView.screenFlash = performance.now() + 180;
                battleView.flashColor = color;
                battleView.effect = { color, start: performance.now(), rise: spell.target === "ally" || spell.target === "allies" };
                audio.se("spell");
            } else if (event.type === "critical") {
                battleView.screenFlash = performance.now() + 120;
                battleView.flashColor = "#ffffff";
                audio.se("critical");
            } else if (event.type === "enemyAct") {
                battleView.lunge = { index: event.index, until: performance.now() + 200 };
            } else if (event.type === "allyDown") {
                status.refresh();
            }
            await battleLog(event.text);
        }
    }

    // ---------- 町：宿屋・教会・店 ----------
    async function innDialog(price) {
        const total = price * game.party.length;
        const ok = await yesNo(`いらっしゃいませ。 旅人の やどやへ ようこそ。\nひとばん ${total} ゴールドですが、おとまりに なりますか？`);
        if (!ok) {
            await say("またの おこしを おまちしております。");
            return;
        }
        if (game.gold < total) {
            await say("おや、おかねが たりないようですね。");
            return;
        }
        game.gold -= total;
        closeMessage();
        await fade(async () => {
            healAll();
            await audio.jingle("inn");
            await sleep(600);
        });
        saveGame();
        await say("おはようございます。 ゆうべは よく おやすみに なれましたか？\n（HP と MP が かいふくした。 冒険の書に きろくした）");
    }

    // とうぎじょう：3 回 つづけて 戦う
    async function arenaDialog() {
        await say("とうぎじょうへ ようこそ！ ここでは 3かい つづけて まものと たたかうのだ。\nとちゅうで やすむことは できないが、まけても いのちまでは とられないぞ。");
        const ranks = data.arena;
        // ふくろが いっぱいで わたせなかった ほうびを わたす
        for (let i = 0; i < ranks.length; i += 1) {
            if (game.flags[`arenaPending${i + 1}`] && await giveArenaPrize(ranks[i], i)) {
                return;
            }
        }
        const info = makeWin("info", { left: "3%", top: "3%", width: "40%", whiteSpace: "pre-wrap" });
        const open = rank => (!rank.needs || game.flags[rank.needs]) && (!rank.needsAlso || game.flags[rank.needsAlso]);
        const index = await choose(ranks.map((rank, i) => ({
            label: open(rank) ? `${rank.name}ランク` : "？？？？",
            value: i,
            right: open(rank) ? `${rank.fee}G` : "",
            disabled: !open(rank)
        })).concat([{ label: "やめる", value: null }]), {
            style: { right: "3%", top: "3%", minWidth: "50%" },
            title: "どのランクに いどむ？",
            onMove: item => {
                const rank = ranks[item.value];
                info.textContent = rank && open(rank)
                    ? `めやす：Lv ${rank.lv}・${rank.party}人\n${game.flags[`arena${item.value + 1}`] ? "（クリアずみ）" : "はじめて 勝つと とくべつな ほうび"}`
                    : "";
            }
        }).finally(() => info.remove());
        if (index === null || index === undefined) {
            await say("またの ちょうせんを まっているぞ！");
            return;
        }
        const rank = ranks[index];
        if (game.gold < rank.fee) {
            await say(`さんかひは ${rank.fee}ゴールドだ。 おかねが たりないようだな。`);
            return;
        }
        if (!(await yesNo(`${rank.name}ランクの さんかひは ${rank.fee}ゴールドだ。 いどむか？`))) {
            await say("またの ちょうせんを まっているぞ！");
            return;
        }
        game.gold -= rank.fee;
        for (let round = 0; round < rank.fights.length; round += 1) {
            await say(round === 0 ? "それでは はじめ！" : round === rank.fights.length - 1 ? "いよいよ さいごの あいてだ！" : "つぎの あいてだ！");
            closeMessage();
            const result = await startBattle(rank.fights[round], { boss: true, arena: true, music: round === rank.fights.length - 1 ? "boss" : "battle" });
            busy = true;
            if (result !== "win") {
                await say("ざんねん！ また ちょうせん してくれ。\n（とうぎじょうの いしゃが てあてを してくれた）");
                return;
            }
        }
        const flag = `arena${index + 1}`;
        if (!game.flags[flag]) {
            game.flags[flag] = true;
            note(`とうぎじょうの ${rank.name}ランクで ゆうしょうした！`);
            await say(`おめでとう！ ${rank.name}ランク ゆうしょうだ！`);
            game.flags[`arenaPending${index + 1}`] = true;
            await giveArenaPrize(rank, index);
        } else {
            game.gold += rank.gold;
            await say(`おめでとう！ ${rank.name}ランク ゆうしょうだ！\nしょうきんの ${rank.gold}ゴールドを うけとれ！`);
        }
        saveGame();
    }

    async function giveArenaPrize(rank, index) {
        const prize = rank.prize;
        const id = prize.equip || prize.item;
        const name = (data.equipment[id] || data.items[id]).name;
        if (!R.addItem(game.bag, id)) {
            await say(`ほうびの ${name}を わたしたいが、ふくろが いっぱいのようだ。\nあけてから また 話しかけてくれ。`);
            return true;
        }
        delete game.flags[`arenaPending${index + 1}`];
        audio.jingle("item");
        await say(`${rank.name}ランクの ほうびに ${name}を さずけよう！`);
        saveGame();
        return true;
    }

    // まものはかせ：ずかんの 数に おうじて ほうび
    async function scholarDialog() {
        const total = Object.keys(data.enemies).length;
        const seen = Object.keys(game.seen).length;
        await say(`わしは まものはかせ。 せかいじゅうの まものを しらべておる。\nおぬしの ずかんには ${seen}しゅるいの まものが のっておるな。`);
        let gave = false;
        for (const reward of data.bookRewards) {
            const need = reward.count === "all" ? total : reward.count;
            if (game.flags[reward.flag] || seen < need) {
                continue;
            }
            // ふくろに 入りきらないときは わたさない（あとで もういちど 話せば もらえる）
            const before = JSON.stringify(game.bag);
            if (!reward.items.every(([id, count]) => R.addItem(game.bag, id, count))) {
                game.bag = JSON.parse(before);
                await say("おや、ふくろが いっぱいじゃな。 あけてから また くるのじゃ。");
                break;
            }
            game.flags[reward.flag] = true;
            gave = true;
            const names = reward.items.map(([id, count]) => (count > 1 ? `${data.items[id].name}を ${count}こ` : `${data.items[id].name}を`));
            audio.jingle("item");
            await say(`${need === total ? "なんと ぜんぶの" : `${need}しゅるいの`} まものを しらべたか！ おれいに ${names.join("、")} あげよう。`);
        }
        const next = data.bookRewards.find(reward => !game.flags[reward.flag]);
        if (next) {
            const need = next.count === "all" ? total : next.count;
            await say(`${need}しゅるい しらべたら また くるのじゃ。 ${gave ? "" : "まだ "}たのしみに しておるぞ。`);
        } else if (!gave) {
            await say("ぜんぶの まものを しらべるとは… おぬしこそ まことの まものはかせじゃ！");
        }
        saveGame();
    }

    async function churchDialog() {
        await say("神の いえに ようこそ。 きょうは なにを なさいますか？");
        while (true) {
            const choice = await choose([
                { label: "きろくする", value: "save" },
                { label: "いきかえらせる", value: "revive" },
                { label: "どくを けす", value: "cure" },
                { label: "やめる", value: null }
            ], { style: { right: "6%", bottom: "38%" } });
            if (choice === "save") {
                game.lastTown = game.map;
                const ok = saveGame();
                await say(ok ? "冒険の書に きろくしました。\nあなたに 神の ごかごが ありますように。" : "冒険の書に きろくできませんでした…（ブラウザの保存が つかえないようです）");
            } else if (choice === "revive") {
                const dead = game.party.filter(m => m.hp <= 0);
                if (dead.length === 0) {
                    await say("たおれている なかまは いないようです。");
                    continue;
                }
                const member = dead[0];
                const cost = member.level * 10;
                if (await yesNo(`${member.name}を いきかえらせるには ${cost} ゴールド ひつようです。 よろしいですか？`)) {
                    if (game.gold < cost) {
                        await say("おかねが たりないようです。");
                    } else {
                        game.gold -= cost;
                        R.revive(member, 1);
                        await say(`${member.name}は いきかえった！`);
                    }
                }
            } else if (choice === "cure") {
                const sick = game.party.filter(m => m.poison && m.hp > 0);
                if (sick.length === 0) {
                    await say("どくに おかされた 人は いないようです。");
                    continue;
                }
                const cost = 10 * sick.length;
                if (game.gold < cost) {
                    await say("おかねが たりないようです。");
                    continue;
                }
                game.gold -= cost;
                sick.forEach(m => {
                    m.poison = false;
                });
                await say(`${cost} ゴールド いただきました。 どくを けしましたよ。`);
            } else {
                await say("あなたに 神の ごかごが ありますように。");
                return;
            }
        }
    }

    function itemName(id) {
        return (data.items[id] || data.equipment[id] || { name: id }).name;
    }

    // そうび品を だれが つけられるか、つけると どう変わるか
    function equipCompare(equipId) {
        const item = data.equipment[equipId];
        if (!item) {
            return "";
        }
        return game.party.map(member => {
            if (!R.canEquip(member, equipId)) {
                return `${member.name}：そうびできない`;
            }
            const currentId = member.equip[item.slot];
            const current = currentId ? data.equipment[currentId] : null;
            if (item.slot === "weapon") {
                const before = R.attackOf(member);
                const after = before - (current ? current.atk : 0) + item.atk;
                return `${member.name}：こうげき ${before} → ${after}`;
            }
            const before = R.defenseOf(member);
            const after = before - (current ? current.def : 0) + item.def;
            return `${member.name}：しゅび ${before} → ${after}`;
        }).join("\n");
    }

    function goldWin() {
        const el = makeWin("gold", { right: "3%", top: "3%" });
        el.refresh = () => {
            el.textContent = `${game.gold} G`;
        };
        el.refresh();
        return el;
    }

    async function shopDialog(shopId) {
        const shop = SHOPS[shopId];
        const gold = goldWin();
        await say(`いらっしゃいませ！ ここは ${shop.name}です。 どんな ごようでしょう？`);
        while (true) {
            const choice = await choose([{ label: "かう", value: "buy" }, { label: "うる", value: "sell" }, { label: "やめる", value: null }], { style: { right: "6%", bottom: "38%" } });
            if (choice === "buy") {
                await shopBuy(shop, gold);
            } else if (choice === "sell") {
                await shopSell(gold);
            } else {
                break;
            }
        }
        gold.remove();
        await say("またの おこしを おまちしております。");
    }

    async function shopBuy(shop, gold) {
        const info = infoWin({ left: "3%", top: "3%", width: "52%", whiteSpace: "pre-wrap" });
        while (true) {
            const id = await choose(shop.goods.map(goodId => {
                const item = data.items[goodId] || data.equipment[goodId];
                return { label: item.name, value: goodId, right: `${item.price}G` };
            }), {
                style: { right: "3%", top: "14%", minWidth: "42%" },
                title: "なにを かいますか？",
                maxRows: 9,
                onMove: item => {
                    const goodId = item.value;
                    info.textContent = data.equipment[goodId] ? equipCompare(goodId) : (data.items[goodId].text || "");
                }
            });
            if (id === null) {
                break;
            }
            const item = data.items[id] || data.equipment[id];
            if (game.gold < item.price) {
                await say("おかねが たりないようですね。");
                continue;
            }
            if (!R.addItem(game.bag, id)) {
                await say("どうぐぶくろが いっぱいですよ。");
                continue;
            }
            game.gold -= item.price;
            gold.refresh();
            audio.se("buy");
            if (data.equipment[id]) {
                const able = game.party.map((m, i) => i).filter(i => R.canEquip(game.party[i], id));
                if (able.length > 0 && await yesNo(`${item.name}ですね。 まいど ありがとうございます！\nいま ここで そうびして いきますか？`)) {
                    const who = able.length === 1 ? able[0] : await choose(able.map(i => ({ label: game.party[i].name, value: i })), { style: { right: "6%", bottom: "38%" }, title: "だれが？" });
                    if (who !== null) {
                        equipItem(game.party[who], id);
                        await say(`${game.party[who].name}は ${item.name}を そうびした！`);
                    }
                }
            } else {
                await say(`${item.name}ですね。 まいど ありがとうございます！`);
            }
        }
        info.remove();
    }

    async function shopSell(gold) {
        while (true) {
            const sellable = game.bag.filter(entry => R.sellPrice(entry.id) > 0);
            if (sellable.length === 0) {
                await say("うれる ものを もっていないようですね。");
                return;
            }
            const id = await choose(sellable.map(entry => ({ label: itemName(entry.id), value: entry.id, right: `${R.sellPrice(entry.id)}G` })), {
                style: { right: "3%", top: "14%", minWidth: "42%" },
                title: "なにを うりますか？",
                maxRows: 9
            });
            if (id === null) {
                return;
            }
            const price = R.sellPrice(id);
            if (await yesNo(`${itemName(id)}なら ${price} ゴールドで かいとりましょう。 よろしいですか？`)) {
                R.removeItem(game.bag, id);
                game.gold += price;
                gold.refresh();
                audio.se("buy");
            }
        }
    }

    // そうびする（今つけている物は 袋にもどす）
    function equipItem(member, equipId) {
        const item = data.equipment[equipId];
        const old = member.equip[item.slot];
        if (!R.removeItem(game.bag, equipId)) {
            return false;
        }
        if (old) {
            R.addItem(game.bag, old);
        }
        member.equip[item.slot] = equipId;
        return true;
    }

    // ---------- 移動中のメニュー ----------
    async function fieldMenu() {
        busy = true;
        audio.se("ok");
        const status = statusWin({ left: "3%", top: "auto", bottom: "3%" });
        const gold = goldWin();
        while (true) {
            const choice = await choose([
                { label: "じゅもん", value: "spell" },
                { label: "どうぐ", value: "item" },
                { label: "そうび", value: "equip" },
                { label: "つよさ", value: "status" },
                { label: "ちず", value: "map" },
                { label: "きろく", value: "records" },
                { label: "せってい", value: "settings" }
            ], { style: { left: "3%", top: "3%" }, cols: 2 });
            if (choice === null) {
                break;
            }
            if (choice === "spell") {
                await menuSpells(status);
            } else if (choice === "item") {
                await menuItems(status);
            } else if (choice === "equip") {
                await menuEquip(status);
            } else if (choice === "status") {
                await menuStatus();
            } else if (choice === "map") {
                await menuMap();
            } else if (choice === "records") {
                await menuRecords();
            } else if (choice === "settings") {
                await menuSettings();
            }
            closeMessage();
            status.refresh();
            gold.refresh();
            if (scene !== "field") {
                break;
            }
        }
        status.remove();
        gold.remove();
        closeMessage();
        busy = false;
    }

    async function pickMember(title, style) {
        if (game.party.length === 1) {
            return 0;
        }
        return choose(game.party.map((m, i) => ({ label: m.name, value: i, right: `H${m.hp}/${R.maxHp(m)}` })), {
            style: style || { left: "36%", top: "3%" },
            title
        });
    }

    async function menuSpells(status) {
        const casterIndex = await pickMember("だれが？");
        if (casterIndex === null) {
            return;
        }
        const caster = game.party[casterIndex];
        const fieldSpells = caster.spells.filter(id => data.spells[id].field);
        if (fieldSpells.length === 0 || caster.hp <= 0) {
            await say(caster.hp <= 0 ? `${caster.name}は たおれている。` : `${caster.name}は いま つかえる じゅもんを おぼえていない。`);
            return;
        }
        const info = infoWin({ left: "3%", top: "40%", right: "3%", display: "none" });
        const spellId = await choose(fieldSpells.map(id => ({ label: data.spells[id].name, value: id, right: data.spells[id].mp, disabled: caster.mp < data.spells[id].mp })), {
            style: { left: "36%", top: "3%", minWidth: "40%" },
            title: `MP ${caster.mp}`,
            maxRows: 6,
            onMove: item => {
                info.style.display = "";
                info.textContent = data.spells[item.value].text;
            }
        });
        info.remove();
        if (spellId === null) {
            return;
        }
        await castFieldSpell(caster, spellId);
        status.refresh();
    }

    async function castFieldSpell(caster, spellId) {
        const spell = data.spells[spellId];
        if (spell.effect === "escape") {
            if (currentMap().kind !== "dungeon") {
                await say("ここでは つかえない。");
                return;
            }
            caster.mp -= spell.mp;
            await say(`${caster.name}は ${spell.name}を となえた！`);
            closeMessage();
            await exitToWorld();
            return;
        }
        if (spell.effect === "return") {
            if (currentMap().kind === "dungeon") {
                await say("てんじょうが あって とべない！");
                return;
            }
            const town = await pickTown();
            if (!town) {
                return;
            }
            caster.mp -= spell.mp;
            await say(`${caster.name}は ${spell.name}を となえた！`);
            closeMessage();
            await warpTo(town, MAPS[town].entry.x, MAPS[town].entry.y, "up");
            return;
        }
        const targets = spell.target === "allies" ? game.party.map((m, i) => i) : [await pickMember(spell.name)];
        if (targets[0] === null || targets[0] === undefined) {
            return;
        }
        caster.mp -= spell.mp;
        const lines = [`${caster.name}は ${spell.name}を となえた！`];
        targets.forEach(i => {
            const member = game.party[i];
            if (spell.effect === "heal") {
                const amount = R.heal(member, R.healAmount(spell.power, R.wisdomOf(caster), rng));
                lines.push(member.hp > 0 ? `${member.name}の HP が ${amount} かいふくした！` : `${member.name}は たおれている…`);
            } else if (spell.effect === "cure") {
                member.poison = false;
                lines.push(`${member.name}の どくが きえた！`);
            } else if (spell.effect === "revive") {
                lines.push(R.revive(member, 0.5) ? `${member.name}は いきかえった！` : "しかし なにも おこらなかった。");
            }
        });
        audio.se("heal");
        await say(lines.join("\n"));
    }

    async function pickTown() {
        const towns = ["sora", "marine", "leaf"].filter(id => game.visited[id]);
        return choose(towns.map(id => ({ label: MAPS[id].name, value: id })), { style: { left: "36%", top: "3%" }, title: "どこへ？" });
    }

    async function menuItems(status) {
        if (game.bag.length === 0) {
            await say("どうぐを なにも もっていない。");
            return;
        }
        const info = infoWin({ left: "3%", top: "40%", right: "3%", whiteSpace: "pre-wrap" });
        const id = await choose(game.bag.map(entry => ({ label: itemName(entry.id), value: entry.id, right: entry.count > 1 ? entry.count : "" })), {
            style: { left: "36%", top: "3%", minWidth: "44%" },
            title: "どうぐ",
            maxRows: 6,
            onMove: item => {
                const itemId = item.value;
                info.textContent = data.equipment[itemId] ? equipCompare(itemId) : (data.items[itemId].text || "");
            }
        });
        info.remove();
        if (id === null) {
            return;
        }
        if (data.equipment[id]) {
            await say("そうびは『そうび』から つけられます。");
            return;
        }
        const item = data.items[id];
        if (!item.use || item.use.field === false && item.use.effect !== "heal") {
            await say(`${item.name}： ${item.text}`);
            return;
        }
        await useFieldItem(id);
        status.refresh();
    }

    async function useFieldItem(id) {
        const item = data.items[id];
        const use = item.use;
        if (use.effect === "return") {
            if (currentMap().kind === "dungeon") {
                await say("てんじょうが あって とべない！");
                return;
            }
            const town = await pickTown();
            if (!town) {
                return;
            }
            R.removeItem(game.bag, id);
            await say(`${item.name}を 空に なげた！`);
            closeMessage();
            await warpTo(town, MAPS[town].entry.x, MAPS[town].entry.y, "up");
            return;
        }
        if (use.effect === "holywater") {
            R.removeItem(game.bag, id);
            game.holyWater = use.steps;
            await say(`${item.name}を ふりかけた！\nしばらく 魔物が よってこない。`);
            return;
        }
        const index = await pickMember(item.name);
        if (index === null) {
            return;
        }
        const member = game.party[index];
        if (use.effect === "seed") {
            R.removeItem(game.bag, id);
            const stat = ["str", "def", "agi", "wis", "hp", "mp"][Math.floor(rng() * 6)];
            const amount = stat === "hp" || stat === "mp" ? 3 : 1;
            member.bonus[stat] += amount;
            const label = { str: "ちから", def: "みのまもり", agi: "すばやさ", wis: "かしこさ", hp: "さいだいHP", mp: "さいだいMP" }[stat];
            audio.jingle("levelup");
            await say(`${member.name}は ${item.name}を たべた！\n${label}が ${amount} あがった！`);
            return;
        }
        if (member.hp <= 0 && use.effect !== "revive") {
            await say(`${member.name}は たおれている…`);
            return;
        }
        R.removeItem(game.bag, id);
        if (use.effect === "heal") {
            const amount = R.heal(member, R.randInt(rng, use.power[0], use.power[1]));
            await say(`${member.name}は ${item.name}を つかった！\nHP が ${amount} かいふくした！`);
        } else if (use.effect === "mp") {
            const amount = R.restoreMp(member, R.randInt(rng, use.power[0], use.power[1]));
            await say(`${member.name}は ${item.name}を つかった！\nMP が ${amount} かいふくした！`);
        } else if (use.effect === "cure") {
            member.poison = false;
            await say(`${member.name}の どくが きえた！`);
        } else if (use.effect === "revive") {
            await say(R.revive(member, 0.5) ? `${member.name}は いきかえった！` : "しかし なにも おこらなかった。");
        }
        audio.se("heal");
    }

    async function menuEquip(status) {
        const index = await pickMember("だれの？");
        if (index === null) {
            return;
        }
        const member = game.party[index];
        const slots = [["weapon", "ぶき"], ["armor", "よろい"], ["shield", "たて"]];
        while (true) {
            const info = infoWin({ left: "3%", top: "40%", right: "3%" });
            info.textContent = `こうげき力 ${R.attackOf(member)}　しゅび力 ${R.defenseOf(member)}`;
            const slot = await choose(slots.map(([key, label]) => ({ label: `${label}：${member.equip[key] ? data.equipment[member.equip[key]].name : "なし"}`, value: key })), {
                style: { left: "3%", top: "3%", minWidth: "60%" },
                title: member.name
            });
            info.remove();
            if (slot === null) {
                return;
            }
            const options = game.bag
                .filter(entry => data.equipment[entry.id] && data.equipment[entry.id].slot === slot && R.canEquip(member, entry.id))
                .map(entry => ({ label: data.equipment[entry.id].name, value: entry.id }));
            options.push({ label: "はずす", value: "__none" });
            const compare = infoWin({ left: "3%", top: "40%", right: "3%", whiteSpace: "pre-wrap" });
            const choice = await choose(options, {
                style: { left: "40%", top: "3%", minWidth: "50%" },
                title: "どれを？",
                maxRows: 6,
                onMove: item => {
                    if (item.value === "__none") {
                        compare.textContent = "そうびを はずします";
                        return;
                    }
                    const lines = equipCompare(item.value).split("\n");
                    compare.textContent = lines[index] || "";
                }
            });
            compare.remove();
            if (choice === null) {
                continue;
            }
            if (choice === "__none") {
                const old = member.equip[slot];
                if (old && R.addItem(game.bag, old)) {
                    member.equip[slot] = null;
                }
            } else {
                equipItem(member, choice);
                audio.se("equip");
            }
            status.refresh();
        }
    }

    async function menuStatus() {
        const index = await pickMember("だれの？");
        if (index === null) {
            return;
        }
        const m = game.party[index];
        const next = m.level >= R.MAX_LEVEL ? "—" : R.expForLevel(m.level + 1) - m.exp;
        const el = makeWin("status-detail", { left: "3%", top: "3%", right: "3%", bottom: "3%", overflow: "hidden" });
        el.innerHTML = `
            <div>${escapeHtml(m.name)}（${data.classes[m.cls].name}） Lv ${m.level}</div>
            <table class="stat-table">
                <tr><td>HP</td><td class="num">${m.hp}/${R.maxHp(m)}</td><td>MP</td><td class="num">${m.mp}/${R.maxMp(m)}</td></tr>
                <tr><td>ちから</td><td class="num">${m.base.str + m.bonus.str}</td><td>みのまもり</td><td class="num">${m.base.def + m.bonus.def}</td></tr>
                <tr><td>すばやさ</td><td class="num">${R.agilityOf(m)}</td><td>かしこさ</td><td class="num">${R.wisdomOf(m)}</td></tr>
                <tr><td>こうげき力</td><td class="num">${R.attackOf(m)}</td><td>しゅび力</td><td class="num">${R.defenseOf(m)}</td></tr>
                <tr><td>けいけんち</td><td class="num">${m.exp}</td><td>つぎまで</td><td class="num">${next}</td></tr>
            </table>
            <div class="info">そうび：${["weapon", "armor", "shield"].map(s => (m.equip[s] ? data.equipment[m.equip[s]].name : "—")).join("・")}</div>
            <div class="info">じゅもん：${m.spells.map(id => data.spells[id].name).join("・") || "なし"}</div>`;
        await new Promise(resolve => {
            const pop = pushLayer({
                onKey(action) {
                    if (action === "ok" || action === "cancel") {
                        pop();
                        resolve();
                    }
                }
            });
        });
        el.remove();
    }

    function formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        return `${Math.floor(minutes / 60)}じかん ${minutes % 60}ふん`;
    }

    // 決定・キャンセルで 閉じる 大きな ウィンドウ。onKey で 上下の 操作も うけとれる
    function panel(style, render, onKey) {
        const el = makeWin("records", Object.assign({ left: "3%", top: "3%", right: "3%", bottom: "3%", overflow: "hidden" }, style));
        render(el);
        return new Promise(resolve => {
            const pop = pushLayer({
                onKey(action) {
                    if (action === "ok" || action === "cancel") {
                        audio.se("cancel");
                        pop();
                        el.remove();
                        resolve();
                    } else if (onKey && onKey(action)) {
                        audio.se("cursor");
                        render(el);
                    }
                }
            });
        });
    }

    async function menuRecords() {
        saveGame();
        while (true) {
            const page = await choose([
                { label: "ぼうけんの きろく", value: "stats" },
                { label: "まもの ずかん", value: "book" },
                { label: "ぼうけん にっし", value: "journal" }
            ], { style: { left: "3%", top: "3%" }, title: "きろく" });
            if (page === null) {
                return;
            }
            if (page === "stats") {
                await recordsStats();
            } else if (page === "book") {
                await monsterBook();
            } else {
                await journalView();
            }
        }
    }

    // つぎに どこへ 行けば いいか（フラグから 決める）。place は 世界地図の 記号
    function nextGoal() {
        const f = game.flags;
        if (!f.shizuku1) {
            return { place: "c", text: "北の ほらあなの おくで、ほしのしずくを さがそう。" };
        }
        if (!f.joinedLuna) {
            return { place: "2", text: "東の 川を わたって、南東の 港町マリンへ 行こう。" };
        }
        if (!f.shizuku2) {
            return { place: "w", text: "港町マリンの 北の さばくに たつ、風の塔の てっぺんを めざそう。" };
        }
        if (!f.joinedMint) {
            return { place: "3", text: "北の 山の けっかいが とけた。 北東の 森の村リーフへ 行こう。" };
        }
        if (!f.shizuku3) {
            return { place: "s", text: "東の はずれの 湖の神殿で、さいごの しずくを さがそう。" };
        }
        if (!f.bossFinal) {
            return { place: "k", text: "湖に かかった 光の橋を わたり、かげの城へ のりこもう。" };
        }
        if (!f.bossStar) {
            return { place: "1", text: "ソラの村の 星のせいれいが、星の遺跡へ つれていってくれる。" };
        }
        return { place: "2", text: "港町マリンの とうぎじょうや、まもの ずかん あつめに ちょうせんしよう。" };
    }

    // 世界地図の ぜんたいと、いまいる場所・つぎの 目的地を 見せる
    function menuMap() {
        const world = MAPS.world;
        const scale = 4;
        const COLORS = {
            ".": "#5fae4e", T: "#2e7d32", "^": "#8d7b68", "~": "#2a6fc9", ":": "#d8c27a", ",": "#6b5a7b", "=": "#a0703a"
        };
        const goal = nextGoal();
        const here = (() => {
            if (game.map === "world") {
                return { x: game.x, y: game.y };
            }
            const map = currentMap();
            const ch = map.place || Object.keys(world.places).find(key => world.places[key].map === game.map);
            return ch ? placePosition(ch) : null;
        })();
        const goalAt = placePosition(goal.place);
        let blink = 0;
        let timer = null;
        return panel({}, el => {
            if (!el.querySelector("canvas")) {
                el.innerHTML = '<div>せかいちず</div><canvas style="display:block;width:100%;max-height:72%;object-fit:contain;image-rendering:pixelated;margin:0.2em 0"></canvas><div class="info"></div>';
                const mapCanvas = el.querySelector("canvas");
                mapCanvas.width = world.rows[0].length * scale;
                mapCanvas.height = world.rows.length * scale;
                const draw = () => {
                    const g2 = mapCanvas.getContext("2d");
                    world.rows.forEach((row, y) => {
                        [...row].forEach((ch, x) => {
                            let color = COLORS[ch];
                            if (GATES[ch]) {
                                color = gateOpen(ch) ? (ch === "L" ? "#ffe066" : "#a0703a") : (ch === "L" ? "#2a6fc9" : "#b07ad8");
                            } else if (world.places[ch]) {
                                color = game.visited[world.places[ch].map] || ch === "1" ? "#ffffff" : "#d0d0d0";
                            }
                            g2.fillStyle = color || "#5fae4e";
                            g2.fillRect(x * scale, y * scale, scale, scale);
                        });
                    });
                    blink += 1;
                    if (goalAt) {
                        g2.strokeStyle = blink % 2 ? "#ffd34d" : "#ff6b6b";
                        g2.lineWidth = 1;
                        g2.strokeRect(goalAt.x * scale - 2.5, goalAt.y * scale - 2.5, scale + 5, scale + 5);
                    }
                    if (here && blink % 2) {
                        g2.fillStyle = "#ff2d2d";
                        g2.fillRect(here.x * scale, here.y * scale, scale, scale);
                    }
                    if (!document.body.contains(mapCanvas)) {
                        clearInterval(timer);
                    }
                };
                draw();
                timer = setInterval(draw, 400);
                el.querySelector(".info").textContent = `■ いまいる ところ（${currentMap().name}）　□ つぎの もくてき\n${goal.text}`;
                el.querySelector(".info").style.whiteSpace = "pre-wrap";
            }
        });
    }

    // ずかんに のる まもの（かげの王の しんのすがたは 出会うまで ひみつ）
    function bookKinds() {
        return Object.keys(data.enemies).filter(id => id !== "kagenoou2" || game.seen[id]);
    }

    function recordsStats() {
        const kinds = bookKinds();
        const seen = kinds.filter(id => game.seen[id]).length;
        const kills = Object.values(game.kills).reduce((sum, n) => sum + n, 0);
        const members = game.party.map(m => `${escapeHtml(m.name)}　Lv ${m.level}　HP ${R.maxHp(m)}　こうげき ${R.attackOf(m)}　しゅび ${R.defenseOf(m)}`);
        return panel({}, el => {
            el.innerHTML = `
                <div>ぼうけんの きろく</div>
                <div class="info">プレイじかん ${formatTime(game.stats.playMs)}<br>あるいた歩数 ${game.stats.steps}<br>たたかい ${game.stats.battles}かい（かち ${game.stats.wins}）<br>たおした まもの ${kills}ひき<br>たからばこ ${game.stats.chests}こ<br>まもの ずかん ${seen} / ${kinds.length}</div>
                <div style="margin-top:0.4em">いまの つよさ</div>
                <div class="info">${members.join("<br>")}</div>`;
        });
    }

    // ずかんの せつめい（たおしたことが あると くわしく わかる）
    function bookText(id) {
        const enemy = data.enemies[id];
        const kills = game.kills[id] || 0;
        if (!kills) {
            return `${enemy.name}\nたおした数 0\n\nたおすと くわしいことが わかる。`;
        }
        const notes = [];
        const resist = enemy.resist || {};
        const ELEMENT = { fire: "火", ice: "氷", thunder: "雷", light: "光", blast: "ばくはつ" };
        Object.entries(resist).forEach(([element, rate]) => {
            if (rate === 0) {
                notes.push(`${ELEMENT[element]}が きかない`);
            } else if (rate < 1) {
                notes.push(`${ELEMENT[element]}に つよい`);
            } else if (rate > 1) {
                notes.push(`${ELEMENT[element]}に よわい`);
            }
        });
        if (enemy.sleepImmune) {
            notes.push("ねむらない");
        }
        if (enemy.rare) {
            notes.push("すぐ にげる めずらしい まもの");
        }
        return `${enemy.name}\nたおした数 ${kills}\nHP ${enemy.hp}　こうげき ${enemy.atk}　まもり ${enemy.def}\nけいけんち ${enemy.exp}　ゴールド ${enemy.gold}${notes.length ? `\n${notes.join("・")}` : ""}`;
    }

    async function monsterBook() {
        const kinds = bookKinds();
        const info = makeWin("info book", { left: "3%", top: "3%", width: "50%", bottom: "3%", whiteSpace: "pre-wrap" });
        const picture = document.createElement("canvas");
        picture.width = 64;
        picture.height = 64;
        picture.style.cssText = "display:block;width:5em;height:5em;margin:0 auto 0.3em;image-rendering:pixelated";
        const text = document.createElement("div");
        info.append(picture, text);
        const g2 = picture.getContext("2d");
        g2.imageSmoothingEnabled = false;
        let at = 0;
        while (true) {
            const index = await choose(kinds.map((id, i) => ({
                label: game.seen[id] ? data.enemies[id].name : "？？？？",
                value: id,
                right: String(i + 1).padStart(2, "0")
            })), {
                style: { right: "3%", top: "3%", width: "42%" },
                className: "book",
                title: `ずかん ${kinds.filter(id => game.seen[id]).length}/${kinds.length}`,
                maxRows: 9,
                start: at,
                returnIndex: true,
                onMove: item => {
                    g2.clearRect(0, 0, 64, 64);
                    if (!game.seen[item.value]) {
                        text.textContent = "まだ 出会っていない。";
                        return;
                    }
                    const enemy = data.enemies[item.value];
                    const sprite = S.monster(enemy.sprite, enemy.palette);
                    const scale = Math.min(64 / sprite.width, 64 / sprite.height);
                    const w = sprite.width * scale;
                    const h = sprite.height * scale;
                    g2.drawImage(sprite, (64 - w) / 2, 64 - h, w, h);
                    text.textContent = bookText(item.value);
                }
            });
            // 決定しても 閉じずに 見つづけられる。キャンセルで もどる
            if (index === null) {
                break;
            }
            at = index;
        }
        info.remove();
    }

    function journalView() {
        const lines = game.journal.map(entry => `${formatClock(entry.t)}　${entry.text}`);
        const visible = 8;
        let first = Math.max(0, lines.length - visible); // さいしょは 新しい ほうを 見せる
        return panel({}, el => {
            const shown = lines.slice(first, first + visible);
            el.innerHTML = `
                <div>ぼうけん にっし${lines.length > visible ? `（${first + 1}〜${first + shown.length} / ${lines.length}）` : ""}</div>
                <div class="info" style="white-space:pre-wrap">${shown.map(escapeHtml).join("\n") || "まだ なにも かかれていない。"}</div>
                ${lines.length > visible ? '<div class="info" style="position:absolute;right:0.8em;bottom:0.3em">▲▼で めくる</div>' : ""}`;
        }, action => {
            const before = first;
            if (action === "up") {
                first = Math.max(0, first - 1);
            } else if (action === "down") {
                first = Math.max(0, Math.min(lines.length - visible, first + 1));
            } else if (action === "left") {
                first = Math.max(0, first - visible);
            } else if (action === "right") {
                first = Math.max(0, Math.min(lines.length - visible, first + visible));
            }
            return first !== before;
        });
    }

    // 1:23 のような プレイ時間の 書き方（日誌の 左はし）
    function formatClock(ms) {
        const minutes = Math.floor(ms / 60000);
        return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    }

    async function menuSettings() {
        while (true) {
            const choice = await choose([
                { label: "メッセージ", value: "text", right: { fast: "はやい", normal: "ふつう", slow: "おそい" }[settings.textSpeed] },
                { label: "おと", value: "sound", right: settings.sound ? "オン" : "オフ" },
                { label: "がめんの ボタン", value: "pad", right: settings.pad ? "だす" : "ださない" },
                { label: "むずかしさ", value: "easy", right: settings.easy ? "かんたん" : "ふつう" },
                { label: "タイトルへ もどる", value: "title" }
            ], { style: { left: "3%", top: "3%", minWidth: "56%" }, title: "せってい" });
            if (choice === null) {
                return;
            }
            if (choice === "text") {
                settings.textSpeed = { fast: "normal", normal: "slow", slow: "fast" }[settings.textSpeed];
            } else if (choice === "sound") {
                settings.sound = !settings.sound;
            } else if (choice === "pad") {
                settings.pad = !settings.pad;
            } else if (choice === "easy") {
                settings.easy = !settings.easy;
                await say(settings.easy
                    ? "むずかしさを「かんたん」に した。\n（経験値と お金が 1.5ばい。 全滅しても お金が へらない）"
                    : "むずかしさを「ふつう」に した。");
                closeMessage();
            } else if (choice === "title") {
                if (await yesNo("冒険の書に きろくして タイトルへ もどりますか？")) {
                    saveGame();
                    closeMessage();
                    showTitle();
                    return;
                }
            }
            applySettings();
        }
    }

    // ---------- ToDo のがんばり → がんばりのたね ----------
    function completedTodoIds() {
        const ids = [];
        const tasks = readJson("todo.tasks.v1", []);
        const archive = readJson("todo.archive.v1", []);
        (Array.isArray(tasks) ? tasks : []).forEach(task => {
            if (task && task.completed && typeof task.id === "string") {
                ids.push(task.id);
            }
        });
        (Array.isArray(archive) ? archive : []).forEach(record => {
            if (record && (record.completed || record.reason === "cleared") && typeof record.id === "string") {
                ids.push(record.id);
            }
        });
        // 集中タイマー（ポモドーロ）で 集中しきった 回数も がんばりに 数える
        const focus = readJson("todo.focus.v1", null);
        const days = focus && focus.days && typeof focus.days === "object" ? focus.days : {};
        Object.entries(days).forEach(([day, record]) => {
            const sessions = Math.min(50, Number(record && record.sessions) || 0);
            for (let i = 1; i <= sessions; i += 1) {
                ids.push(`focus:${day}:${i}`);
            }
        });
        return Array.from(new Set(ids));
    }

    async function giveTodoSeeds() {
        // 日付は その土地の暦で数える（toISOString だと 日本の朝 9 時まで 前の日になる）
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (game.todo.day !== today) {
            game.todo.day = today;
            game.todo.today = 0;
        }
        const fresh = completedTodoIds().filter(id => !game.todo.redeemed.includes(id));
        const room = TODO_DAILY_LIMIT - game.todo.today;
        const count = Math.min(fresh.length, room);
        if (count <= 0) {
            return;
        }
        busy = true;
        if (!R.addItem(game.bag, "ganbarinotane", count)) {
            // ふくろが いっぱいなら 受け取らずに おいておく（つぎに 町へ 入ったときに とどく）
            await say("がんばりのたねが とどいたが、どうぐぶくろが いっぱいで うけとれなかった…");
            closeMessage();
            busy = false;
            return;
        }
        fresh.slice(0, count).forEach(id => game.todo.redeemed.push(id));
        game.todo.today += count;
        audio.jingle("item");
        await say(`ToDo で がんばった ${count}この 成果が、\n『がんばりのたね』に なって とどいた！（1日 ${TODO_DAILY_LIMIT}こ まで）`);
        closeMessage();
        saveGame();
        busy = false;
    }

    // ---------- 描画 ----------
    let frameNo = 0;
    let lastAnim = 0;

    function render(now) {
        if (now - lastAnim > 450) {
            frameNo = (frameNo + 1) % 2;
            lastAnim = now;
        }
        if (scene === "field" && game) {
            drawField(now);
        } else if (scene === "battle" && battleView) {
            drawBattle(now);
        } else if (scene === "title" || scene === "ending") {
            drawSky(now);
        }
    }

    function drawField(now) {
        const map = currentMap();
        let px = game.x * TILE;
        let py = game.y * TILE;
        let walking = false;
        if (field.moving) {
            const t = Math.min(1, (now - field.moving.start) / STEP_MS);
            px = (field.moving.fromX + (game.x - field.moving.fromX) * t) * TILE;
            py = (field.moving.fromY + (game.y - field.moving.fromY) * t) * TILE;
            walking = true;
        }
        const camX = Math.round(px - Math.floor(VIEW_W / 2) * TILE);
        const camY = Math.round(py - Math.floor(VIEW_H / 2) * TILE);
        const startX = Math.floor(camX / TILE);
        const startY = Math.floor(camY / TILE);
        const outside = map.kind === "world" ? "~" : map.kind === "town" ? "," : "#";
        for (let ty = startY; ty <= startY + VIEW_H; ty += 1) {
            for (let tx = startX; tx <= startX + VIEW_W; tx += 1) {
                let ch = tileAt(tx, ty);
                if (ch === null) {
                    ch = outside;
                }
                let open = false;
                if (ch === "X") {
                    open = Boolean(game.chests[`${game.map}:${tx},${ty}`]);
                } else if (ch === "*") {
                    open = Boolean(map.pedestal && game.flags[map.pedestal.flag]);
                } else if (GATES[ch] && map.kind === "world") {
                    open = gateOpen(ch);
                }
                ctx.drawImage(S.tile(map.tileset, ch, frameNo, open), tx * TILE - camX, ty * TILE - camY);
            }
        }
        // 人
        field.npcs.forEach(npc => {
            ctx.drawImage(S.person(npc.sprite, "down", frameNo), npc.cx * TILE - camX, npc.cy * TILE - camY);
        });
        // 後ろについてくる仲間
        const followers = game.party.slice(1).filter(m => m.hp > 0);
        followers.forEach((member, i) => {
            // trail[i] が今の位置。歩いている間は trail[i + 1] から なめらかに動く
            const to = field.trail[i];
            if (!to) {
                return;
            }
            const from = field.moving ? field.trail[i + 1] || to : to;
            const t = field.moving ? Math.min(1, (now - field.moving.start) / STEP_MS) : 1;
            const fx = (from.x + (to.x - from.x) * t) * TILE;
            const fy = (from.y + (to.y - from.y) * t) * TILE;
            ctx.drawImage(S.person(member.cls, "down", frameNo), Math.round(fx - camX), Math.round(fy - camY));
        });
        const step = walking ? Math.floor(now / 120) % 2 : frameNo;
        ctx.drawImage(S.person("hero", game.dir, step), Math.round(px - camX), Math.round(py - camY));

        if (flashRed > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${flashRed * 0.05})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            flashRed -= 1;
        }
        // 場所の名前
        if (map.kind !== "world") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
            ctx.fillRect(0, 0, canvas.width, 11);
            ctx.fillStyle = "#fff";
            ctx.font = "9px sans-serif";
            ctx.fillText(map.name, 4, 8.5);
        }
    }

    function drawBattle(now) {
        const view = battleView;
        const { bg } = view;
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, bg.top);
        g.addColorStop(0.62, bg.bottom);
        g.addColorStop(0.62, bg.ground);
        g.addColorStop(1, bg.ground);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const enemies = view.battle.enemies;
        const boss = enemies.some(e => data.enemies[e.id].boss);
        const scale = boss ? 3 : enemies.length > 3 ? 1.5 : 2;
        const size = 24 * scale;
        const gap = 4;
        const total = enemies.length * size + (enemies.length - 1) * gap;
        let x = (canvas.width - total) / 2;
        const y = boss ? 40 : 70;
        enemies.forEach((enemy, i) => {
            const def = data.enemies[enemy.id];
            const fadeStart = view.fading[i];
            let alpha = 1;
            if (enemy.gone) {
                alpha = fadeStart ? Math.max(0, 1 - (now - fadeStart) / 400) : 0;
            }
            const flashUntil = view.flash[i];
            const blink = flashUntil && (flashUntil === 999 ? Math.floor(now / 200) % 2 === 0 : now < flashUntil && Math.floor(now / 60) % 2 === 0);
            let dy = 0;
            if (view.lunge && view.lunge.index === i && now < view.lunge.until) {
                dy = 4;
            }
            if (alpha > 0 && !blink) {
                ctx.globalAlpha = alpha;
                ctx.drawImage(S.monster(def.sprite, def.palette), Math.round(x), Math.round(y + dy), size, size);
                ctx.globalAlpha = 1;
            }
            if (enemy.sleep > 0 && !enemy.gone) {
                ctx.fillStyle = "#fff";
                ctx.font = "8px sans-serif";
                ctx.fillText("Zz", x + size - 10, y + 6);
            }
            x += size + gap;
        });
        // じゅもんの 光のつぶ（攻撃は 上から ふりそそぎ、回復は 下から のぼる）
        const effect = view.effect;
        if (effect && now - effect.start < 600) {
            const t = (now - effect.start) / 600;
            ctx.fillStyle = effect.color;
            for (let i = 0; i < 28; i += 1) {
                const px = ((i * 97) % 240) + 16;
                const offset = ((i * 53) % 60) / 60;
                const p = (t + offset) % 1;
                const py = effect.rise ? 200 - p * 150 : 20 + p * 120;
                const size = i % 3 === 0 ? 3 : 2;
                ctx.globalAlpha = 1 - t * 0.7;
                ctx.fillRect(px, py, size, size);
            }
            ctx.globalAlpha = 1;
        }
        if (view.screenFlash && now < view.screenFlash) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = view.flashColor || "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
        }
    }

    // タイトルと エンディングの 星空
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random() * 272, y: Math.random() * 150, s: Math.random() * 1.5 + 0.5, p: Math.random() * 6 }));
    let skyStars = 1;

    function drawSky(now) {
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#050817");
        g.addColorStop(0.7, "#1a2350");
        g.addColorStop(1, "#2a2a4a");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const visible = Math.floor(stars.length * skyStars);
        stars.slice(0, visible).forEach(star => {
            const tw = 0.55 + 0.45 * Math.sin(now / 500 + star.p);
            ctx.fillStyle = `rgba(255, 255, 230, ${tw})`;
            ctx.fillRect(Math.round(star.x), Math.round(star.y), star.s, star.s);
        });
        // 地平線の 山
        ctx.fillStyle = "#101428";
        ctx.beginPath();
        ctx.moveTo(0, 190);
        for (let x = 0; x <= 272; x += 34) {
            ctx.lineTo(x + 17, 165 + ((x * 7) % 23));
            ctx.lineTo(x + 34, 190);
        }
        ctx.lineTo(272, 208);
        ctx.lineTo(0, 208);
        ctx.fill();
        if (scene === "title") {
            ctx.drawImage(S.person("hero", "up", Math.floor(now / 600) % 2), 128, 176);
        }
    }

    function loop(now) {
        update(now);
        render(now);
        requestAnimationFrame(loop);
    }

    // ---------- タイトル・はじまり・エンディング ----------
    let titleEl = null;

    async function showTitle() {
        scene = "title";
        busy = true;
        layers.length = 0;
        ui.innerHTML = "";
        messageEl = null;
        skyStars = 1;
        audio.bgm("title");
        titleEl = document.createElement("div");
        titleEl.className = "title-screen";
        titleEl.innerHTML = '<div class="title-logo">ほしふるクエスト</div><div class="title-sub">― 星をとりもどす 旅 ―</div>';
        ui.appendChild(titleEl);
        const saved = loadSave();
        const choice = await choose([
            { label: "はじめから", value: "new" },
            { label: "つづきから", value: "continue", disabled: !saved },
            { label: "せってい", value: "settings" }
        ], { style: { left: "50%", top: "62%", transform: "translateX(-50%)" }, cancel: false, start: saved ? 1 : 0 });
        if (choice === "settings") {
            titleEl.remove();
            await menuSettingsTitle();
            showTitle();
            return;
        }
        titleEl.remove();
        if (choice === "continue" && saved) {
            game = saved;
            playClock = performance.now();
            await fade(async () => {
                scene = "field";
                await enterMap(game.map, game.x, game.y, game.dir);
            });
            busy = false;
            await say(`冒険の書を よみこんだ。\n${MAPS[game.map].name}から つづけます。`);
            closeMessage();
            await afterArrive();
            return;
        }
        if (saved && !(await yesNo("いまの 冒険の書は きえてしまいます。 はじめから あそびますか？"))) {
            closeMessage();
            showTitle();
            return;
        }
        closeMessage();
        const name = await askName();
        game = newGameState(name);
        playClock = performance.now();
        await fade(async () => {
            scene = "field";
            await enterMap("sora", 5, 12, "left");
        });
        busy = false;
        await afterArrive();
    }

    async function menuSettingsTitle() {
        while (true) {
            const choice = await choose([
                { label: "メッセージ", value: "text", right: { fast: "はやい", normal: "ふつう", slow: "おそい" }[settings.textSpeed] },
                { label: "おと", value: "sound", right: settings.sound ? "オン" : "オフ" },
                { label: "がめんの ボタン", value: "pad", right: settings.pad ? "だす" : "ださない" },
                { label: "むずかしさ", value: "easy", right: settings.easy ? "かんたん" : "ふつう" }
            ], { style: { left: "50%", top: "40%", transform: "translateX(-50%)", minWidth: "60%" }, title: "せってい" });
            if (choice === null) {
                return;
            }
            if (choice === "text") {
                settings.textSpeed = { fast: "normal", normal: "slow", slow: "fast" }[settings.textSpeed];
            } else if (choice === "sound") {
                settings.sound = !settings.sound;
            } else if (choice === "pad") {
                settings.pad = !settings.pad;
            } else if (choice === "easy") {
                settings.easy = !settings.easy;
                await say(settings.easy
                    ? "むずかしさを「かんたん」に した。\n（経験値と お金が 1.5ばい。 全滅しても お金が へらない）"
                    : "むずかしさを「ふつう」に した。");
                closeMessage();
            }
            applySettings();
        }
    }

    function askName() {
        return new Promise(resolve => {
            const el = makeWin("name-win", { left: "50%", top: "40%", transform: "translateX(-50%)", textAlign: "center" });
            el.innerHTML = '<div>ゆうしゃの なまえを きめてください</div><input class="name-input" maxlength="6" value="ユウ" aria-label="ゆうしゃの なまえ"><div class="info">決定キーで つぎへ</div>';
            const input = el.querySelector("input");
            input.focus();
            input.select();
            const done = () => {
                const name = input.value.trim().slice(0, 6) || "ユウ";
                pop();
                el.remove();
                resolve(name);
            };
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    done();
                }
            });
            const pop = pushLayer({
                onKey(action) {
                    if (action === "ok" && document.activeElement !== input) {
                        done();
                    }
                }
            });
        });
    }

    async function playEnding() {
        if (!game.cleared) {
            note("空に 星を とりもどした！");
        }
        game.cleared = true;
        game.flags.cleared = true; // クリア後に 出てくる人の 目じるし
        saveGame();
        closeMessage();
        await fade(() => {
            scene = "ending";
            skyStars = 0;
        });
        audio.bgm("ending");
        for (let i = 0; i <= 40; i += 1) {
            skyStars = i / 40;
            await sleep(80);
        }
        await sayAll([
            "かげの王が たおれると、3つの しずくが 空へ のぼっていった。",
            "ひとつ、またひとつ… 夜空に 星が もどってくる。",
            `${game.party.map(m => m.name).join("と ")}は、満天の 星を みあげた。`,
            "ソラの村では、人びとが 星を 見上げて よろこんでいる。",
            "こうして 世界に ふたたび 星が ふりそそいだ。"
        ]);
        closeMessage();
        const credits = document.createElement("div");
        credits.className = "credits";
        const hero = game.party[0];
        credits.innerHTML = `
            <div class="title-logo" style="font-size:1.6em">ほしふるクエスト</div>
            <div>おしまい</div>
            <div class="info">プレイじかん ${formatTime(game.stats.playMs)}</div>
            <div class="info">${escapeHtml(hero.name)} Lv ${hero.level}　たたかい ${game.stats.battles}かい　まもの ずかん ${Object.keys(game.seen).length}/${Object.keys(data.enemies).length}</div>
            <div class="info">あそんでくれて ありがとう！</div>`;
        ui.appendChild(credits);
        await new Promise(resolve => {
            const pop = pushLayer({
                onKey(action) {
                    if (action === "ok") {
                        pop();
                        resolve();
                    }
                }
            });
        });
        credits.remove();
        // クリア後は ソラの村から 冒険を つづけられる
        await fade(async () => {
            scene = "field";
            healAll();
            await enterMap("sora", 11, 15, "up");
        });
        await say("（冒険の書に きろくしました。 このまま 冒険を つづけることも できます）");
        closeMessage();
    }

    // ---------- 起動 ----------
    applySettings();
    requestAnimationFrame(loop);
    showTitle();

    // テストやデバッグ用（画面からは使わない）
    window.HF.debug = {
        get game() {
            return game;
        },
        get scene() {
            return scene;
        },
        get busy() {
            return busy;
        },
        startBattle: (ids, options) => startBattle(ids, options || {}),
        warp: (mapId, x, y) => warpTo(mapId, x, y),
        layers: () => layers.length,
        passable: (x, y) => passable(x, y),
        tileAt: (x, y) => tileAt(x, y),
        moving: () => Boolean(field.moving),
        setAutoBattle: on => {
            testAutoBattle = Boolean(on);
        },
        setLevel: level => {
            game.party = game.party.map(m => {
                const fresh = R.createMember(m.cls, m.name, level, rng);
                fresh.equip = m.equip;
                return fresh;
            });
        }
    };
})();
