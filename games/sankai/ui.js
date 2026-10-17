// 三界戦棋：画面の 操作（駒を えらぶ・動かす・CPU・演出・持ち駒・棋譜・保存）
(() => {
    "use strict";

    const E = window.SankaiEngine;
    const Art = window.SankaiArt;
    const $ = selector => document.querySelector(selector);

    const GAME_KEY = "sankai.game.v1";
    const SETTINGS_KEY = "sankai.settings.v1";

    const canvasEl = $("#scene");
    const scene = window.SankaiScene.create(canvasEl, E);

    const load = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value === null ? fallback : value;
        } catch (_error) {
            return fallback;
        }
    };
    const save = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (_error) {
            // 保存できなくても 遊べる
        }
    };

    const settings = Object.assign({ sound: false }, load(SETTINGS_KEY, {}));

    // ---------- 対局の 状態 ----------
    let game = null; // { mode: "cpu" | "local" | "watch"（CPU どうしを 見る）, level, human, moves: [], states: [] }
    let selected = null; // { sq } か { drop: kind }
    let targets = []; // いまの 選択で 行ける 手
    let busy = false; // 演出中・CPU の 考え中
    let hover = -1;

    const current = () => game.states[game.states.length - 1];
    const isCpuTurn = state => game.mode === "watch" || (game.mode === "cpu" && state.turn !== game.human);
    const isHumanTurn = () => !current().result && !isCpuTurn(current());
    const sideName = side => (side === E.SENTE ? "先手（青）" : "後手（赤）");

    // ---------- 音（その場で 作る） ----------
    let audioCtx = null;
    function audio() {
        if (!settings.sound) {
            return null;
        }
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                return null;
            }
            audioCtx = new AC();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        return audioCtx.state === "running" ? audioCtx : null;
    }

    function noiseBurst(duration, volume, cutoff, delay = 0) {
        const ac = audio();
        if (!ac) {
            return;
        }
        const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        const src = ac.createBufferSource();
        src.buffer = buffer;
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = cutoff;
        const gain = ac.createGain();
        gain.gain.value = volume;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        src.start(ac.currentTime + delay);
    }

    function tone(freq, toFreq, duration, type = "square", volume = 0.15, delay = 0) {
        const ac = audio();
        if (!ac) {
            return;
        }
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const t = ac.currentTime + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + duration);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    const SOUND = {
        select: () => tone(880, 880, 0.05, "triangle", 0.08),
        move: () => noiseBurst(0.12, 0.25, 700),
        boom: () => {
            noiseBurst(0.7, 0.9, 380);
            tone(90, 35, 0.6, "sine", 0.4);
        },
        bigBoom: () => {
            noiseBurst(1.1, 1, 300);
            tone(70, 25, 0.9, "sine", 0.6);
        },
        cannon: () => {
            tone(160, 50, 0.25, "sine", 0.4);
            noiseBurst(0.25, 0.5, 1200);
        },
        aa: () => {
            for (let i = 0; i < 6; i += 1) {
                noiseBurst(0.05, 0.4, 2500, i * 0.06);
            }
        },
        whistle: () => tone(1400, 300, 0.55, "sine", 0.12),
        fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, "square", 0.08, i * 0.12))
    };

    function playSoundForMove(move, before) {
        if (move.kind === "shot") {
            const kind = E.kindOf(before.board[move.from]);
            if (kind === E.ART) {
                SOUND.cannon();
                setTimeout(SOUND.boom, 650);
            } else if (kind === E.AA) {
                SOUND.aa();
                setTimeout(SOUND.boom, 420);
            } else {
                SOUND.whistle();
                setTimeout(SOUND.bigBoom, 520);
            }
            return;
        }
        SOUND.move();
        if (move.kind === "move" && before.board[move.to] !== 0) {
            setTimeout(SOUND.boom, 400);
        }
    }

    // ---------- 演出の 帯 ----------
    function cutin(big, small, side) {
        const el = $("#cutin");
        el.innerHTML = "";
        const band = document.createElement("div");
        band.className = "cutin-band";
        band.style.setProperty("--band", side === E.SENTE ? "rgba(36, 80, 170, 0.92)" : side === E.GOTE ? "rgba(160, 36, 28, 0.92)" : "rgba(40, 40, 40, 0.92)");
        band.innerHTML = `<span class="big"></span><span class="small"></span>`;
        band.querySelector(".big").textContent = big;
        band.querySelector(".small").textContent = small || "";
        el.appendChild(band);
        return new Promise(resolve => setTimeout(resolve, 1250));
    }

    // 指した 手に 合わせて 何を 見せるか（大事な ものを 1 つだけ）
    function cutinFor(move, before, after) {
        const side = before.turn;
        if (after.result) {
            return null; // 結果は 別に 見せる
        }
        if (move.kind === "shot") {
            const kind = E.kindOf(before.board[move.from]);
            const victim = E.pieceInfo(before.board[move.to]).name;
            if (kind === E.BMB) {
                return ["爆撃", `${victim}を 撃破`];
            }
            if (kind === E.AA) {
                return ["撃墜", `${victim}を 撃ち落とした`];
            }
        }
        if (move.kind === "move" && E.layerOf(move.from) === E.UNDER && E.layerOf(move.to) === E.GROUND && before.board[move.to] !== 0) {
            return ["奇襲", `地下から ${E.pieceInfo(before.board[move.to]).name}を 襲った`];
        }
        if (E.inCheck(after, -side)) {
            return ["司令官 危機", `${sideName(-side)}の 司令官が ねらわれている`];
        }
        if (move.promote) {
            return ["昇進", `${E.pieceInfo(after.board[move.to]).name}に なった`];
        }
        if (move.kind === "move" && before.board[move.to] !== 0 && (E.VALUE[Math.abs(before.board[move.to]) & 31] || 0) >= 640) {
            return ["撃破", `${E.pieceInfo(before.board[move.to]).name}を 倒した`];
        }
        return null;
    }

    // ---------- 1 手 指す ----------
    async function commit(move) {
        busy = true;
        selected = null;
        targets = [];
        const before = current();
        const after = E.play(before, move);
        const text = E.describeMove(before, move);
        updateHighlights();
        playSoundForMove(move, before);
        await scene.playMove(move, before, after);
        game.moves.push(move);
        game.states.push(after);
        addLog(text);
        save(GAME_KEY, { mode: game.mode, level: game.level, human: game.human, moves: game.moves });
        render();
        const show = cutinFor(move, before, after);
        if (show) {
            await cutin(show[0], show[1], before.turn);
        }
        busy = false;
        if (after.result) {
            await finish(after.result);
            return;
        }
        render();
        maybeCpu();
    }

    async function finish(result) {
        const reasons = {
            checkmate: "司令官を 追いつめた（詰み）",
            nomoves: "相手の 打つ 手が なくなった",
            occupation: "本陣を 占領した",
            capture: "司令官を 取った",
            repetition: "同じ 局面の くり返し",
            maxply: "400 手に 達した"
        };
        const winner = result.winner;
        SOUND.fanfare();
        if (winner === 0) {
            await cutin("引き分け", reasons[result.reason], 0);
        } else {
            await cutin(result.reason === "occupation" ? "本陣 占領" : "勝利", `${sideName(winner)}の 勝ち`, winner);
        }
        const youWon = game.mode === "cpu" && winner === game.human;
        $("#result-title").textContent = winner === 0 ? "引き分け" : game.mode === "cpu" ? (youWon ? "あなたの 勝ち！" : "CPU の 勝ち") : `${sideName(winner)}の 勝ち`;
        $("#result-text").textContent = `${reasons[result.reason] || ""}（${current().ply} 手）`;
        render();
        $("#result-dialog").showModal();
    }

    // ---------- CPU（Web Worker で 考える。画面が 固まらないように） ----------
    let worker = null;
    let workerFailed = false;
    function getWorker() {
        if (worker || workerFailed) {
            return worker;
        }
        try {
            const source = `${window.createSankaiEngine.toString()}
const engine = createSankaiEngine();
self.onmessage = event => {
    const { state, level, id } = event.data;
    const s = {
        board: new Int8Array(state.board),
        hands: { 1: new Int8Array(state.hands[1]), "-1": new Int8Array(state.hands[-1]) },
        turn: state.turn,
        ply: state.ply,
        history: state.history,
        result: null
    };
    const move = engine.chooseMove(s, level);
    self.postMessage({ id, move });
};`;
            const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            worker = new Worker(url);
        } catch (_error) {
            workerFailed = true;
            worker = null;
        }
        return worker;
    }

    let thinkId = 0;
    function maybeCpu() {
        const state = current();
        if (!isCpuTurn(state) || state.result || busy) {
            return;
        }
        busy = true;
        const id = (thinkId += 1);
        render();
        const started = Date.now();
        const done = move => {
            if (id !== thinkId) {
                return;
            }
            // すぐ 指すと 早すぎて 分かりにくいので、少し 待つ
            setTimeout(() => {
                if (id !== thinkId) {
                    return;
                }
                busy = false;
                commit(move);
            }, Math.max(0, (game.mode === "watch" ? 900 : 500) - (Date.now() - started)));
        };
        const w = getWorker();
        if (w) {
            w.onmessage = event => {
                if (event.data.id === id) {
                    done(event.data.move);
                }
            };
            w.onerror = () => {
                workerFailed = true;
                worker = null;
                done(E.chooseMove(state, game.level));
            };
            w.postMessage({
                id,
                level: game.level,
                state: { board: Array.from(state.board), hands: { 1: Array.from(state.hands[1]), [-1]: Array.from(state.hands[-1]) }, turn: state.turn, ply: state.ply, history: state.history }
            });
        } else {
            setTimeout(() => done(E.chooseMove(state, game.level)), 30);
        }
    }

    // ---------- 選ぶ ----------
    function legalFromSelection() {
        const moves = E.legalMoves(current());
        if (!selected) {
            return [];
        }
        if (selected.drop) {
            return moves.filter(m => m.kind === "drop" && m.piece === selected.drop);
        }
        return moves.filter(m => m.kind !== "drop" && m.from === selected.sq);
    }

    function select(sel) {
        selected = sel;
        targets = legalFromSelection();
        if (sel && targets.length === 0 && !sel.drop) {
            // 動けない 駒は 説明だけ
            targets = [];
        }
        SOUND.select();
        render();
    }

    async function onCellClick(sq) {
        if (busy || !game || current().result) {
            return;
        }
        const state = current();
        if (sq >= 0) {
            showInfo(state.board[sq]);
        }
        if (!isHumanTurn()) {
            return;
        }
        // 行き先を えらんだ
        const options = targets.filter(m => m.to === sq);
        if (options.length > 0) {
            let move = options[0];
            if (options.length > 1) {
                const piece = E.pieceInfo(state.board[move.from]);
                const promotedName = E.PIECES[piece.kind].promoted.name;
                $("#promote-text").textContent = `${piece.name} → ${promotedName}`;
                const answer = await askDialog("#promote-dialog");
                move = options.find(m => m.promote === (answer === "yes")) || options[0];
            }
            commit(move);
            return;
        }
        // 自分の 駒を えらぶ
        if (sq >= 0 && E.sideOf(state.board[sq]) === state.turn) {
            select(selected && selected.sq === sq ? null : { sq });
            return;
        }
        select(null);
    }

    function askDialog(selector) {
        const dialog = $(selector);
        return new Promise(resolve => {
            const onClose = () => {
                dialog.removeEventListener("close", onClose);
                resolve(dialog.returnValue);
            };
            dialog.addEventListener("close", onClose);
            dialog.showModal();
        });
    }

    // ---------- 盤の 操作（クリック・ドラッグで 回す） ----------
    let drag = null;
    canvasEl.addEventListener("pointerdown", event => {
        drag = { x: event.clientX, y: event.clientY, yaw: scene.view.yaw, pitch: scene.view.pitch, moved: false };
        canvasEl.setPointerCapture(event.pointerId);
    });
    canvasEl.addEventListener("pointermove", event => {
        const rect = canvasEl.getBoundingClientRect();
        if (drag) {
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 8) {
                drag.moved = true;
            }
            if (drag.moved) {
                scene.setView({
                    yaw: drag.yaw - dx * 0.008,
                    pitch: Math.min(1.25, Math.max(0.55, drag.pitch + dy * 0.004))
                });
            }
            return;
        }
        const sq = scene.pick(event.clientX - rect.left, event.clientY - rect.top, targets.map(m => m.to));
        if (sq !== hover) {
            hover = sq;
            updateHighlights();
        }
    });
    canvasEl.addEventListener("pointerup", event => {
        const rect = canvasEl.getBoundingClientRect();
        const wasDrag = drag && drag.moved;
        drag = null;
        if (!wasDrag) {
            onCellClick(scene.pick(event.clientX - rect.left, event.clientY - rect.top, targets.map(m => m.to)));
        }
    });
    canvasEl.addEventListener("pointerleave", () => {
        hover = -1;
        updateHighlights();
    });

    function setFocus(focus) {
        scene.setView({ focus });
        document.querySelectorAll(".focus-buttons button").forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.focus === String(focus)));
        });
    }
    document.querySelectorAll(".focus-buttons button").forEach(button => {
        button.addEventListener("click", () => setFocus(button.dataset.focus === "all" ? "all" : Number(button.dataset.focus)));
    });
    // せまい 画面では 地上を 大きく 見せて はじめる
    if (window.matchMedia("(max-width: 600px)").matches) {
        setFocus(1);
    }

    $("#rotate-left").addEventListener("click", () => scene.setView({ yaw: scene.view.yaw + Math.PI / 8 }));
    $("#rotate-right").addEventListener("click", () => scene.setView({ yaw: scene.view.yaw - Math.PI / 8 }));
    $("#rotate-reset").addEventListener("click", () => scene.setView({ yaw: 0, pitch: 0.66 }));
    $("#flip-button").addEventListener("click", () => {
        scene.setView({ bottomSide: -scene.view.bottomSide });
        render();
    });

    // ---------- 表示 ----------
    function updateHighlights() {
        if (!game) {
            return;
        }
        const state = current();
        const last = state.lastMove ? [state.lastMove.from, state.lastMove.to].filter(sq => sq !== undefined) : [];
        const check = [E.SENTE, E.GOTE].map(side => (E.inCheck(state, side) ? E.findCommander(state.board, side) : -1)).find(sq => sq >= 0);
        scene.setHighlights({
            selected: selected && selected.sq !== undefined ? selected.sq : -1,
            targets: targets.map(m => ({
                sq: m.to,
                kind: m.kind === "shot" ? "shot" : m.kind !== "drop" && state.board[m.to] !== 0 ? "capture" : "move"
            })),
            last,
            check: check === undefined ? -1 : check,
            hover
        });
    }

    const artUrlCache = new Map();
    function artUrl(key, side, promoted = false) {
        const id = `${key}:${side}:${promoted}`;
        if (!artUrlCache.has(id)) {
            artUrlCache.set(id, Art.piece(key, side, promoted).toDataURL());
        }
        return artUrlCache.get(id);
    }

    function renderHand(el, side) {
        const state = current();
        const hand = state.hands[side];
        el.innerHTML = "";
        el.style.setProperty("--side-color", side === E.SENTE ? "var(--blue)" : "var(--red)");
        el.classList.toggle("turn", !state.result && state.turn === side);
        const title = document.createElement("h2");
        const who = game.mode === "watch" ? "CPU" : game.mode === "cpu" ? (side === game.human ? "あなた" : "CPU") : "";
        title.textContent = `${sideName(side)}${who ? `・${who}` : ""}の 持ち駒`;
        el.appendChild(title);
        const items = document.createElement("div");
        items.className = "hand-items";
        let any = false;
        E.HAND_TYPES.forEach(kind => {
            if (hand[kind] <= 0) {
                return;
            }
            any = true;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "hand-item";
            const canUse = isHumanTurn() && state.turn === side && !busy;
            button.disabled = !canUse;
            if (selected && selected.drop === kind && state.turn === side) {
                button.classList.add("selected");
            }
            const info = E.PIECES[kind];
            button.setAttribute("aria-label", `${info.name}（${hand[kind]} 枚）を 打つ`);
            button.innerHTML = `<img alt="" src="${artUrl(info.key, side)}"><span class="name">${info.name}</span><span class="count">×${hand[kind]}</span>`;
            button.addEventListener("click", () => {
                showInfo(kind * side);
                select(selected && selected.drop === kind ? null : { drop: kind });
            });
            items.appendChild(button);
        });
        if (!any) {
            const empty = document.createElement("p");
            empty.className = "hand-empty";
            empty.textContent = "なし";
            items.appendChild(empty);
        }
        el.appendChild(items);
    }

    function showInfo(piece) {
        const info = piece ? E.pieceInfo(piece) : null;
        const art = $("#info-art").getContext("2d");
        art.clearRect(0, 0, 128, 128);
        if (!info) {
            return;
        }
        art.drawImage(Art.piece(info.key, info.side, info.promoted), 0, 0);
        $("#info-name").textContent = `${info.name}（${info.side === E.SENTE ? "先手・青" : "後手・赤"}）`;
        $("#info-text").textContent = info.text;
    }

    function render() {
        if (!game) {
            return;
        }
        const state = current();
        scene.setState(state);
        updateHighlights();
        const top = scene.view.bottomSide === E.SENTE ? E.GOTE : E.SENTE;
        renderHand($("#hand-top"), top);
        renderHand($("#hand-bottom"), -top);
        const status = $("#status");
        status.classList.toggle("sente", state.turn === E.SENTE);
        status.classList.toggle("gote", state.turn === E.GOTE);
        if (state.result) {
            status.textContent = state.result.winner === 0 ? "引き分け" : `${sideName(state.result.winner)}の 勝ち`;
        } else if (isCpuTurn(state)) {
            status.textContent = `${state.ply + 1} 手目：CPU（${sideName(state.turn)}）が 考えています…`;
        } else {
            status.textContent = `${state.ply + 1} 手目：${sideName(state.turn)}${game.mode === "cpu" ? "（あなた）" : ""}の 番${E.inCheck(state, state.turn) ? "　司令官が ねらわれている！" : ""}`;
        }
        $("#undo-button").disabled = busy || game.moves.length === 0 || game.mode === "watch";
        $("#sound-button").textContent = `音：${settings.sound ? "オン" : "オフ"}`;
        $("#sound-button").setAttribute("aria-pressed", String(settings.sound));
    }

    function addLog(text) {
        const li = document.createElement("li");
        li.textContent = text;
        $("#log-list").appendChild(li);
        $("#log-list").scrollTop = $("#log-list").scrollHeight;
        $("#log-count").textContent = `（${game.moves.length} 手）`;
    }

    function rebuildLog() {
        $("#log-list").innerHTML = "";
        game.states.slice(0, -1).forEach((state, i) => {
            const li = document.createElement("li");
            li.textContent = E.describeMove(state, game.moves[i]);
            $("#log-list").appendChild(li);
        });
        $("#log-count").textContent = `（${game.moves.length} 手）`;
    }

    // ---------- 対局の 始まり・待った ----------
    function startGame(config, moves = []) {
        thinkId += 1;
        busy = false;
        selected = null;
        targets = [];
        const states = [E.initialState()];
        for (const move of moves) {
            const legal = E.legalMoves(states[states.length - 1]).some(m => m.kind === move.kind && m.to === move.to && m.from === move.from && m.piece === move.piece && Boolean(m.promote) === Boolean(move.promote));
            if (!legal) {
                break;
            }
            states.push(E.play(states[states.length - 1], move));
        }
        game = Object.assign({ mode: "cpu", level: "normal", human: E.SENTE }, config, { moves: moves.slice(0, states.length - 1), states });
        scene.setView({ bottomSide: game.mode === "cpu" ? game.human : E.SENTE, yaw: 0 });
        rebuildLog();
        save(GAME_KEY, { mode: game.mode, level: game.level, human: game.human, moves: game.moves });
        render();
        if (current().result) {
            return;
        }
        maybeCpu();
    }

    function undo() {
        if (busy || game.moves.length === 0 || game.mode === "watch") {
            return;
        }
        thinkId += 1;
        let back = 1;
        if (game.mode === "cpu") {
            // 自分の 手番まで もどす
            back = current().turn === game.human ? 2 : 1;
            back = Math.min(back, game.moves.length);
        }
        game.moves.splice(-back);
        game.states.splice(-back);
        if (game.mode === "cpu" && current().turn !== game.human && game.moves.length > 0) {
            game.moves.pop();
            game.states.pop();
        }
        selected = null;
        targets = [];
        rebuildLog();
        save(GAME_KEY, { mode: game.mode, level: game.level, human: game.human, moves: game.moves });
        render();
        maybeCpu();
    }

    async function openSetup() {
        const answer = await askDialog("#setup-dialog");
        if (answer !== "start") {
            return;
        }
        const form = $("#setup-form");
        const data = new FormData(form);
        startGame({ mode: data.get("mode"), level: data.get("level"), human: Number(data.get("side")) });
    }

    $("#setup-form").addEventListener("change", () => {
        const mode = new FormData($("#setup-form")).get("mode");
        $("#level-field").disabled = mode === "local";
        $("#side-field").disabled = mode !== "cpu";
    });
    $("#new-button").addEventListener("click", openSetup);
    $("#undo-button").addEventListener("click", undo);
    $("#sound-button").addEventListener("click", () => {
        settings.sound = !settings.sound;
        save(SETTINGS_KEY, settings);
        if (settings.sound) {
            SOUND.select();
        }
        render();
    });
    $("#rules-button").addEventListener("click", () => $("#rules-dialog").showModal());
    $("#result-dialog").addEventListener("close", () => {
        if ($("#result-dialog").returnValue === "again") {
            openSetup();
        }
    });

    // ルールの 駒一覧
    (function fillRules() {
        const box = $("#rules-pieces");
        Object.keys(E.PIECES).map(Number).forEach(kind => {
            const info = E.PIECES[kind];
            const row = document.createElement("div");
            row.className = "rules-piece";
            const promoted = info.promoted ? `<br>成ると「${info.promoted.name}」：${info.promoted.text}` : "";
            row.innerHTML = `<img alt="" src="${artUrl(info.key, E.SENTE)}"><div><strong>${info.name}（${info.layers.map(l => E.LAYER_NAMES[l]).join("・")}）</strong>${info.text}${promoted}</div>`;
            box.appendChild(row);
        });
    })();

    // つづきから（なければ 対局の 準備を 出す）
    const saved = load(GAME_KEY, null);
    if (saved && Array.isArray(saved.moves)) {
        startGame({ mode: saved.mode, level: saved.level, human: saved.human }, saved.moves);
    } else {
        startGame({ mode: "cpu", level: "normal", human: E.SENTE });
        openSetup();
    }

    window.SankaiDebug = { get game() { return game; }, scene, commit, current, get busy() { return busy; } };
})();
