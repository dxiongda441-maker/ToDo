// うつろい：画面の操作と描画
(() => {
    "use strict";

    const E = window.UtsuroiEngine;
    const { BLACK, WHITE, SIZE, CELLS, KING, TILE_INFO, MAX_PLY } = E;

    const SETTINGS_KEY = "utsuroi.settings.v1";
    const RECORD_KEY = "utsuroi.record.v1";
    const GAME_KEY = "utsuroi.game.v1";
    const SEEN_RULES_KEY = "utsuroi.seenRules.v1";
    const PUZZLE_KEY = "utsuroi.puzzles.v1";
    const PUZZLES = Array.isArray(window.UTSUROI_PUZZLES) ? window.UTSUROI_PUZZLES : [];
    const CPU_MIN_DELAY = 450;
    const COLUMNS = "abcdefg";
    const SIDE_NAME = { [BLACK]: "黒", [WHITE]: "白" };
    const KING_KIND = 4;

    const $ = selector => document.querySelector(selector);
    const boardEl = $("#board");
    const statusEl = $("#status");
    const stripTop = $("#strip-top");
    const stripBottom = $("#strip-bottom");
    const turnBadge = $("#turn-badge");
    const plyCounter = $("#ply-counter");
    const plyBarFill = $("#ply-bar-fill");
    const undoButton = $("#undo-button");
    const hintButton = $("#hint-button");
    const flipButton = $("#flip-button");
    const dangerToggle = $("#danger-toggle");
    const selectionInfo = $("#selection-info");
    const legendEl = $("#legend");
    const boardCodeEl = $("#board-code");
    const copyCodeButton = $("#copy-code");
    const moveLogEl = $("#move-log");
    const recordTable = $("#record-table");
    const toastEl = $("#toast");
    const setupDialog = $("#setup-dialog");
    const setupForm = $("#setup-form");
    const setupError = $("#setup-error");
    const swapDialog = $("#swap-dialog");
    const swapText = $("#swap-text");
    const resultDialog = $("#result-dialog");
    const rulesDialog = $("#rules-dialog");
    const puzzleDialog = $("#puzzle-dialog");
    const puzzleCard = $("#puzzle-card");
    const codeCard = $("#code-card");

    // ---------- 保存（使えない環境でも遊べるように失敗は無視する） ----------
    function load(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_error) {
            return fallback;
        }
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (_error) {
            // 保存できなくても対局は続けられる
        }
    }

    // ---------- 状態 ----------
    const defaultSettings = { mode: "cpu", level: "normal", side: "black", swap: true, handicap: "none" };
    let settings = Object.assign({}, defaultSettings, load(SETTINGS_KEY, {}));

    const game = {
        mode: "cpu",
        level: "normal",
        swapEnabled: true,
        startHuman: BLACK, // CPU 戦で、対局開始時に人が持った色
        human: BLACK, // いま人が持っている色（入れ替えで変わる）
        names: { [BLACK]: "プレイヤー1", [WHITE]: "プレイヤー2" }, // 2 人対戦のときの名前
        swapTaken: null, // null: まだ決めていない / true / false
        handicap: null, // 駒落ち { side, stones } または null
        history: [], // 局面の列（history[0] が初期局面）
        moves: [], // 指した手 [from, to]
        selected: null,
        hint: null,
        flipped: false,
        flipManual: false,
        thinking: false,
        token: 0,
        recorded: false,
        puzzle: null, // 詰め問題を解いているときの問題データ
        replay: null // 棋譜を再生しているとき { positions, index }
    };

    const current = () => game.history[game.history.length - 1];
    // mode は "cpu"（CPU 対戦）/ "local"（2 人対戦）/ "puzzle"（詰め問題。相手は CPU）/ "replay"（棋譜の再生）
    const isCpuTurn = () => (game.mode === "cpu" || game.mode === "puzzle") && current().turn !== game.human && !current().result;
    const isHumanTurn = () => game.mode !== "replay" && !current().result
        && (game.mode === "local" || current().turn === game.human);

    function squareName(index) {
        return `${COLUMNS[E.colOf(index)]}${SIZE - E.rowOf(index)}`;
    }

    function playerLabel(side) {
        if (game.mode === "replay") {
            return side === BLACK ? "先手" : "後手";
        }
        if (game.mode !== "local") {
            return side === game.human ? "あなた" : "CPU";
        }
        return game.names[side];
    }

    function moveKind(piece, tile) {
        return E.RULES.kingStep && Math.abs(piece) === KING ? KING_KIND : tile;
    }

    // ---------- 図形（床の紋） ----------
    const GLYPHS = [
        '<path d="M50 20v60M20 50h60" stroke="currentColor" stroke-width="10" stroke-linecap="round" fill="none"/>',
        '<path d="M27 27l46 46M73 27l-46 46" stroke="currentColor" stroke-width="10" stroke-linecap="round" fill="none"/>',
        '<g fill="currentColor"><circle cx="35" cy="20" r="7"/><circle cx="65" cy="20" r="7"/><circle cx="20" cy="35" r="7"/><circle cx="80" cy="35" r="7"/><circle cx="20" cy="65" r="7"/><circle cx="80" cy="65" r="7"/><circle cx="35" cy="80" r="7"/><circle cx="65" cy="80" r="7"/><circle cx="50" cy="50" r="5"/></g>',
        '<g stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M50 8v84M8 50h84"/><path d="M40 18l10-10 10 10M40 82l10 10 10-10M18 40L8 50l10 10M82 40l10 10-10 10"/></g>'
    ];

    function glyphSvg(tile) {
        return `<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true">${GLYPHS[tile]}</svg>`;
    }

    // ---------- 盤のマスを作る（1 回だけ） ----------
    const cells = [];
    function buildBoard() {
        boardEl.innerHTML = "";
        for (let view = 0; view < CELLS; view += 1) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.setAttribute("role", "gridcell");
            cell.tabIndex = view === 45 ? 0 : -1;
            cell.dataset.view = String(view);
            cell.addEventListener("click", () => onCellClick(viewToIndex(view)));
            cell.addEventListener("keydown", event => onCellKeydown(event, view));
            boardEl.appendChild(cell);
            cells.push(cell);
        }
    }

    const viewToIndex = view => (game.flipped ? CELLS - 1 - view : view);
    const indexToView = index => (game.flipped ? CELLS - 1 - index : index);

    function onCellKeydown(event, view) {
        const row = Math.floor(view / SIZE);
        const col = view % SIZE;
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        const delta = moves[event.key];
        if (event.key === "Escape") {
            clearSelection();
            render();
            return;
        }
        if (!delta) {
            return;
        }
        event.preventDefault();
        const nr = Math.min(SIZE - 1, Math.max(0, row + delta[0]));
        const nc = Math.min(SIZE - 1, Math.max(0, col + delta[1]));
        const next = cells[nr * SIZE + nc];
        cells.forEach(c => {
            c.tabIndex = -1;
        });
        next.tabIndex = 0;
        next.focus();
    }

    // ---------- 描画 ----------
    function threatsAgainst(position, side) {
        // side の駒のうち、相手の番なら取られてしまうもの
        const asOpponent = E.clonePosition(position);
        asOpponent.turn = -side;
        asOpponent.result = null;
        const targets = new Set();
        E.legalMoves(asOpponent).forEach(move => {
            if (position.board[move.to] * side > 0) {
                targets.add(move.to);
            }
        });
        return targets;
    }

    function render() {
        const position = current();
        const last = position.lastMove;
        const selectedTargets = game.selected === null
            ? new Set()
            : new Set(E.movesFrom(position.board, position.tiles, game.selected));

        // 取られそうな駒・取れる駒（自分の側から見て）
        let inDanger = new Set();
        let canCapture = new Set();
        const viewer = game.mode !== "local" ? game.human : position.turn;
        if (dangerToggle.checked && !position.result) {
            inDanger = threatsAgainst(position, viewer);
            canCapture = threatsAgainst(position, -viewer);
        }

        const throneBlack = E.RULES.arrival === "throne" ? E.goalRow(WHITE) * SIZE + 3 : -1;
        const throneWhite = E.RULES.arrival === "throne" ? E.goalRow(BLACK) * SIZE + 3 : -1;

        cells.forEach((cell, view) => {
            const index = viewToIndex(view);
            const tile = position.tiles[index];
            const piece = position.board[index];
            cell.dataset.tile = String(tile);
            cell.className = "cell";
            if (last && index === last.from) {
                cell.classList.add("last-from", "changed");
            }
            if (last && index === last.to) {
                cell.classList.add("last-to");
            }
            if (index === game.selected) {
                cell.classList.add("selected");
            }
            if (selectedTargets.has(index)) {
                cell.classList.add("target");
                if (piece !== 0) {
                    cell.classList.add("capture");
                }
            }
            if (game.hint && (index === game.hint.from || index === game.hint.to)) {
                cell.classList.add("hint");
            }
            if (index === throneBlack || index === throneWhite) {
                cell.classList.add("throne");
            }
            if (inDanger.has(index)) {
                cell.classList.add("in-danger");
            }
            if (canCapture.has(index)) {
                cell.classList.add("can-capture");
            }

            const info = TILE_INFO[tile];
            let html = glyphSvg(tile) + `<span class="tile-kanji" aria-hidden="true">${info.kanji}</span>`;
            let pieceText = "";
            if (piece !== 0) {
                const side = piece > 0 ? BLACK : WHITE;
                const king = Math.abs(piece) === KING;
                const arrived = last && index === last.to ? " arrived" : "";
                html += `<span class="piece piece--${side === BLACK ? "black" : "white"}${king ? " piece--king" : ""}${arrived}" aria-hidden="true">${king ? "王" : ""}</span>`;
                pieceText = `、${SIDE_NAME[side]}の${king ? "王" : "石"}`;
                if (inDanger.has(index)) {
                    pieceText += "（取られる危険あり）";
                }
            }
            cell.innerHTML = html;

            let label = `${squareName(index)}、床「${info.kanji}」${pieceText}`;
            if (selectedTargets.has(index)) {
                label += piece !== 0 ? "。ここへ動いて取れます" : "。ここへ動けます";
            }
            if (index === throneBlack) {
                label += "。黒の玉座（白の王が着くと白の勝ち）";
            } else if (index === throneWhite) {
                label += "。白の玉座（黒の王が着くと黒の勝ち）";
            }
            cell.setAttribute("aria-label", label);
        });

        renderCoords();
        renderStrips();
        renderTurn();
        renderSelection();
        renderLog();
        boardCodeEl.textContent = E.seedToCode(position.seed);
        codeCard.hidden = game.mode === "puzzle";
        $("#play-card").hidden = game.mode === "replay";
        $(".record-actions").hidden = game.mode === "puzzle" || game.mode === "replay";
        renderPuzzleCard();
        renderReplayCard();
        undoButton.disabled = game.history.length <= 1 || game.thinking || game.mode === "replay";
        hintButton.disabled = !isHumanTurn() || game.thinking;
    }

    function renderCoords() {
        const cols = $("#coords-cols");
        const rows = $("#coords-rows");
        const colLetters = COLUMNS.split("");
        const rowNumbers = Array.from({ length: SIZE }, (_, r) => String(SIZE - r));
        if (game.flipped) {
            colLetters.reverse();
            rowNumbers.reverse();
        }
        cols.innerHTML = colLetters.map(c => `<span>${c}</span>`).join("");
        rows.innerHTML = rowNumbers.map(r => `<span>${r}</span>`).join("");
    }

    function stripHtml(side) {
        const position = current();
        const count = E.countPieces(position.board, side);
        const thinking = game.thinking && position.turn === side
            ? '<span class="thinking">考え中…</span>'
            : "";
        const handicap = game.handicap && game.handicap.side === side ? `（${game.handicap.stones} 枚落ち）` : "";
        return `<span class="strip-name"><span class="mini-piece mini-piece--${side === BLACK ? "black" : "white"}"></span>${SIDE_NAME[side]}・${playerLabel(side)}</span>${thinking}<span class="strip-count">駒 ${count}${handicap}</span>`;
    }

    function renderStrips() {
        const bottomSide = game.flipped ? WHITE : BLACK;
        const position = current();
        stripBottom.innerHTML = stripHtml(bottomSide);
        stripTop.innerHTML = stripHtml(-bottomSide);
        stripBottom.classList.toggle("active", !position.result && position.turn === bottomSide);
        stripTop.classList.toggle("active", !position.result && position.turn === -bottomSide);
    }

    function renderTurn() {
        const position = current();
        const side = position.turn;
        turnBadge.innerHTML = position.result
            ? "対局終了"
            : `<span class="mini-piece mini-piece--${side === BLACK ? "black" : "white"}"></span>${SIDE_NAME[side]}（${playerLabel(side)}）の番`;
        plyCounter.textContent = `${position.ply} / ${MAX_PLY} 手`;
        plyBarFill.style.width = `${(position.ply / MAX_PLY) * 100}%`;

        let status;
        if (position.result) {
            status = describeResult(position.result).title;
        } else if (game.thinking) {
            status = "CPU が考えています…";
        } else if (game.mode === "replay") {
            status = `棋譜の再生中（${game.replay.index} / ${game.replay.positions.length - 1} 手）`;
        } else if (game.mode === "puzzle") {
            status = `あなたの番（${SIDE_NAME[game.human]}）。あと ${puzzleMovesLeft()} 手以内に勝ってください。`;
        } else if (game.mode === "cpu") {
            status = game.selected === null
                ? `あなたの番です（${SIDE_NAME[game.human]}）。動かす駒を選んでください。`
                : "動かす先を選んでください（もう一度押すと取り消し）。";
        } else {
            status = `${SIDE_NAME[side]}（${playerLabel(side)}）の番です。`;
        }
        statusEl.textContent = status;
    }

    function tileChip(kind) {
        if (kind === KING_KIND) {
            return '<span class="tile-chip" data-tile="4">王</span>';
        }
        return `<span class="tile-chip" data-tile="${kind}">${TILE_INFO[kind].kanji}</span>`;
    }

    function renderSelection() {
        const position = current();
        if (game.selected === null) {
            selectionInfo.innerHTML = '<p class="muted">自分の駒を選ぶと、動ける先と「離れたあと床がどう変わるか」が表示されます。</p>';
            return;
        }
        const index = game.selected;
        const piece = position.board[index];
        const tile = position.tiles[index];
        const kind = moveKind(piece, tile);
        const next = (tile + 1) % TILE_INFO.length;
        const count = E.movesFrom(position.board, position.tiles, index).length;
        const how = kind === KING_KIND ? "王は床に関係なく、周囲 8 マスに 1 歩" : TILE_INFO[tile].text;
        selectionInfo.innerHTML = `
            <p class="selection-line"><strong>${squareName(index)} の${Math.abs(piece) === KING ? "王" : "石"}</strong>${tileChip(kind)}</p>
            <p>${how}。動ける先は ${count} か所。</p>
            <p class="selection-line">ここを離れると床は ${tileChip(tile)} → ${tileChip(next)} に変わります。</p>`;
    }

    function renderLog() {
        // 再生中は全部の手を並べ、今表示している手に印を付ける
        const source = game.mode === "replay" ? game.replay.positions : game.history;
        const currentIndex = game.mode === "replay" ? game.replay.index - 1 : game.history.length - 2;
        const items = source.slice(1).map((position, i) => {
            const move = position.lastMove;
            const side = position.turn === BLACK ? WHITE : BLACK;
            const capture = move.captured !== 0 ? "×" : "→";
            const king = Math.abs(move.piece) === KING ? "王" : "";
            const tileChange = `${TILE_INFO[move.tileBefore].kanji}→${TILE_INFO[move.tileAfter].kanji}`;
            const swapNote = i === 0 && game.swapTaken ? "（入れ替え）" : "";
            return `<li${i === currentIndex ? ' class="current"' : ""} data-step="${i + 1}">${SIDE_NAME[side]} ${king}${squareName(move.from)}${capture}${squareName(move.to)} <span class="muted small">床 ${tileChange}</span>${swapNote}</li>`;
        });
        moveLogEl.innerHTML = items.join("");
        const currentItem = moveLogEl.querySelector(".current");
        if (game.mode === "replay" && currentItem) {
            moveLogEl.scrollTop = currentItem.offsetTop - moveLogEl.clientHeight / 2;
        } else {
            moveLogEl.scrollTop = moveLogEl.scrollHeight;
        }
    }

    function renderLegend() {
        const kingRule = E.RULES.kingStep;
        legendEl.innerHTML = TILE_INFO.map((info, tile) => {
            const next = TILE_INFO[(tile + 1) % TILE_INFO.length].kanji;
            return `<li><span class="cell legend-tile" data-tile="${tile}">${glyphSvg(tile)}<span class="tile-kanji">${info.kanji}</span></span><span><strong>${info.kanji}（${info.reading}）→ 離れると「${next}」</strong>${info.text}</span></li>`;
        }).join("") + (kingRule
            ? '<li><span class="cell legend-tile" data-tile="0"><span class="piece piece--black piece--king">王</span></span><span><strong>王</strong>床に関係なく周囲 8 マスに 1 歩。離れた床はふつうに変わる</span></li>'
            : "");
    }

    function renderRecord() {
        const record = load(RECORD_KEY, {});
        const rows = Object.keys(E.LEVELS).map(level => {
            const r = record[level] || { win: 0, loss: 0, draw: 0 };
            return `<tr><td>${E.LEVELS[level].label}</td><td>${r.win}</td><td>${r.loss}</td><td>${r.draw}</td></tr>`;
        });
        recordTable.innerHTML = `<thead><tr><th>強さ</th><th>勝</th><th>負</th><th>分</th></tr></thead><tbody>${rows.join("")}</tbody>`;
    }

    function renderRules() {
        const rulesTiles = $("#rules-tiles");
        const pattern = [
            [[-1, 0], [1, 0], [0, -1], [0, 1]],
            [[-1, -1], [-1, 1], [1, -1], [1, 1]],
            [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
            null
        ];
        rulesTiles.innerHTML = TILE_INFO.map((info, tile) => {
            let mini = "";
            for (let r = -2; r <= 2; r += 1) {
                for (let c = -2; c <= 2; c += 1) {
                    let cls = "";
                    if (r === 0 && c === 0) {
                        cls = "from";
                    } else if (pattern[tile] && pattern[tile].some(([dr, dc]) => dr === r && dc === c)) {
                        cls = "to";
                    } else if (!pattern[tile] && (r === 0 || c === 0)) {
                        cls = "ray";
                    }
                    mini += `<span class="${cls}"></span>`;
                }
            }
            return `<div class="rule-tile"><span class="cell legend-tile" data-tile="${tile}">${glyphSvg(tile)}<span class="tile-kanji">${info.kanji}</span></span><strong>${info.kanji}（${info.reading}）</strong><div class="mini-board" aria-hidden="true">${mini}</div><span>${info.text}</span></div>`;
        }).join("");

        $("#rules-king").innerHTML = E.RULES.kingStep
            ? "<strong>王</strong>だけは床に関係なく、周囲 8 マスのどこかに 1 歩動きます（王が離れたマスの床も、ふつうに変わります）。"
            : "<strong>王</strong>も石と同じく、床の紋のとおりに動きます。";
        $("#rules-max-ply").textContent = String(MAX_PLY);
    }

    // ---------- 操作 ----------
    function clearSelection() {
        game.selected = null;
    }

    function onCellClick(index) {
        if (!isHumanTurn() || game.thinking) {
            return;
        }
        const position = current();
        const piece = position.board[index];

        if (game.selected !== null) {
            const targets = E.movesFrom(position.board, position.tiles, game.selected);
            if (targets.includes(index)) {
                playMove({ from: game.selected, to: index });
                return;
            }
            if (index === game.selected) {
                clearSelection();
                render();
                return;
            }
        }

        if (piece * position.turn > 0) {
            game.selected = index;
            game.hint = null;
            render();
            const view = indexToView(index);
            cells.forEach(c => {
                c.tabIndex = -1;
            });
            cells[view].tabIndex = 0;
            if (document.activeElement && document.activeElement.classList.contains("cell")) {
                cells[view].focus();
            }
        } else {
            clearSelection();
            render();
        }
    }

    function playMove(move) {
        const next = E.applyMove(current(), move);
        game.history.push(next);
        game.moves.push([move.from, move.to]);
        clearSelection();
        game.hint = null;
        saveGame();
        render();
        afterMove();
    }

    async function afterMove() {
        const position = current();
        if (game.mode === "puzzle") {
            puzzleAfterMove();
            return;
        }
        if (position.result) {
            finishGame();
            return;
        }

        if (game.swapEnabled && E.canOfferSwap(position) && game.swapTaken === null) {
            const proceed = await decideSwap();
            if (!proceed) {
                return;
            }
        }

        if (isCpuTurn()) {
            runCpu();
        }
    }

    // 入れ替えルール。続けてよければ true を返す
    async function decideSwap() {
        const token = game.token;
        const firstMover = BLACK;
        let swap = false;

        if (game.mode === "cpu" && game.human === firstMover) {
            // 人が先手で指した → CPU が入れ替えるか決める
            game.thinking = true;
            render();
            const [result] = await Promise.all([askAi("swap", current(), { level: game.level }), wait(CPU_MIN_DELAY)]);
            if (token !== game.token) {
                return false;
            }
            game.thinking = false;
            swap = Boolean(result);
            if (swap) {
                showToast("CPU は入れ替えを選びました。あなたは今から白（後手）で、次はあなたの番です。");
            } else {
                showToast("CPU は入れ替えずに、白（後手）で指します。");
            }
        } else {
            const text = game.mode === "cpu"
                ? "CPU が先手で 1 手目を指しました。入れ替えると、あなたがこの黒を引き継ぎ、CPU が白で次の手を指します。"
                : `後手（${game.names[WHITE]}）の人へ：先手の 1 手目を見て、黒と白を入れ替えることができます。入れ替えると、あなたが黒を引き継ぎ、相手が白で次の手を指します。`;
            swap = await askSwap(text);
            if (token !== game.token) {
                return false;
            }
        }

        applySwapDecision(swap);
        saveGame();
        render();
        return true;
    }

    function applySwapDecision(swap) {
        game.swapTaken = swap;
        if (!swap) {
            return;
        }
        if (game.mode === "cpu") {
            game.human = -game.human;
            if (!game.flipManual) {
                game.flipped = game.human === WHITE;
            }
        } else {
            const black = game.names[BLACK];
            game.names[BLACK] = game.names[WHITE];
            game.names[WHITE] = black;
        }
    }

    function askSwap(text) {
        return new Promise(resolve => {
            swapText.textContent = text;
            swapDialog.returnValue = "";
            const onClose = () => {
                swapDialog.removeEventListener("close", onClose);
                resolve(swapDialog.returnValue === "swap");
            };
            swapDialog.addEventListener("close", onClose);
            swapDialog.showModal();
        });
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function runCpu() {
        const token = game.token;
        game.thinking = true;
        render();
        const [move] = await Promise.all([
            askAi("move", current(), { level: game.level }),
            wait(CPU_MIN_DELAY)
        ]);
        if (token !== game.token) {
            return;
        }
        game.thinking = false;
        if (!move) {
            render();
            return;
        }
        playMove({ from: move.from, to: move.to });
    }

    // ---------- CPU は Web Worker で動かす（画面が固まらないように） ----------
    let worker = null;
    let requestId = 0;
    const pending = new Map();

    function createWorker() {
        try {
            const source = `${window.createUtsuroiEngine.toString()}
const engine = createUtsuroiEngine();
self.onmessage = event => {
    const data = event.data;
    Object.assign(engine.RULES, data.rules);
    let result = null;
    if (data.kind === "move") {
        result = engine.chooseMove(data.position, data.options);
    } else if (data.kind === "line") {
        result = engine.evaluateLine(data.position, data.options.depth);
    } else if (data.kind === "analyze") {
        result = engine.analyzePosition(data.position, data.options.depth);
    } else if (data.kind === "swap") {
        result = engine.shouldSwap(data.position, data.options);
    }
    self.postMessage({ id: data.id, result });
};`;
            const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            const created = new Worker(url);
            created.addEventListener("message", event => {
                const entry = pending.get(event.data.id);
                if (entry) {
                    pending.delete(event.data.id);
                    entry.resolve(event.data.result);
                }
            });
            created.addEventListener("error", () => {
                // Worker が使えない環境：以後は画面と同じところで計算する
                worker = null;
                pending.forEach(entry => entry.fallback());
                pending.clear();
            });
            return created;
        } catch (_error) {
            return null;
        }
    }

    function computeHere(kind, position, options) {
        if (kind === "analyze") {
            return E.analyzePosition(position, options.depth);
        }
        if (kind === "line") {
            return E.evaluateLine(position, options.depth);
        }
        return kind === "move" ? E.chooseMove(position, options) : E.shouldSwap(position, options);
    }

    function askAi(kind, position, options) {
        return new Promise(resolve => {
            const fallback = () => setTimeout(() => resolve(computeHere(kind, position, options)), 20);
            if (!worker) {
                fallback();
                return;
            }
            requestId += 1;
            pending.set(requestId, { resolve, fallback });
            worker.postMessage({ id: requestId, kind, position, options, rules: Object.assign({}, E.RULES) });
        });
    }

    // ---------- 終局 ----------
    function describeResult(result) {
        const winnerName = result.winner === 0 ? "" : `${SIDE_NAME[result.winner]}（${playerLabel(result.winner)}）`;
        const reasons = {
            capture: "王を取りました。",
            arrival: E.RULES.arrival === "throne" ? "王が相手の玉座に到達しました。" : "王が相手の陣の奥に到達しました。",
            stalemate: "相手は動ける手がなくなりました。",
            limit: (() => {
                const position = current();
                const black = E.lostPieces(position, BLACK);
                const white = E.lostPieces(position, WHITE);
                return `${MAX_PLY} 手に達しました。取られた駒は 黒 ${black}・白 ${white}。`;
            })()
        };
        if (result.winner === 0) {
            return { title: "引き分け", text: reasons[result.reason], emoji: "🤝" };
        }
        let emoji = "🏆";
        if (game.mode === "cpu") {
            emoji = result.winner === game.human ? "🎉" : "🍵";
        }
        return { title: `${winnerName}の勝ち`, text: reasons[result.reason], emoji };
    }

    function finishGame() {
        const position = current();
        const result = position.result;
        if (game.mode === "cpu" && !game.recorded && !game.handicap) {
            const record = load(RECORD_KEY, {});
            const r = record[game.level] || { win: 0, loss: 0, draw: 0 };
            if (result.winner === 0) {
                r.draw += 1;
            } else if (result.winner === game.human) {
                r.win += 1;
            } else {
                r.loss += 1;
            }
            record[game.level] = r;
            save(RECORD_KEY, record);
            game.recorded = true;
            saveGame();
            renderRecord();
        }

        const description = describeResult(result);
        showResult(description.emoji, description.title, description.text, [
            ["replay", "振り返る"],
            ["same", "同じ盤でもう一度"],
            ["new", "新しい盤で", true]
        ]);
    }

    function showResult(emoji, title, text, buttons) {
        $("#result-emoji").textContent = emoji;
        $("#result-title").textContent = title;
        $("#result-text").textContent = text;
        $("#result-actions").innerHTML = buttons
            .map(([value, label, primary]) => `<button type="submit" class="${primary ? "primary" : "secondary"}" value="${value}">${label}</button>`)
            .join("");
        render();
        setTimeout(() => {
            if (!resultDialog.open) {
                resultDialog.showModal();
            }
        }, 500);
    }

    resultDialog.addEventListener("close", () => {
        const choice = resultDialog.returnValue;
        if (choice === "same") {
            startGame(Object.assign({}, settings, { seed: current().seed }));
        } else if (choice === "new") {
            startGame(Object.assign({}, settings, { seed: null }));
        } else if (choice === "replay") {
            startReplay(game.history.slice());
        } else if (choice === "puzzle-next") {
            startPuzzle(nextPuzzle());
        } else if (choice === "puzzle-list") {
            openPuzzleList();
        }
    });

    // ---------- 棋譜コード（共有と再生） ----------
    // 形式：UT1-<盤面コード>-<駒落ち>-<手>。駒落ちは 0 / b1〜b3 / w1〜w3。
    // 手は「動かす前のマス」「動かした先のマス」を 1 文字ずつ（0〜48 を下の文字に置き換える）
    const SQUARE_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM";

    function encodeRecord(positions) {
        const start = positions[0];
        const handicap = start.handicap
            ? `${start.handicap.side === BLACK ? "b" : "w"}${start.handicap.stones}`
            : "0";
        const moves = positions.slice(1)
            .map(position => SQUARE_CHARS[position.lastMove.from] + SQUARE_CHARS[position.lastMove.to])
            .join("");
        return `UT1-${E.seedToCode(start.seed)}-${handicap}-${moves || "_"}`;
    }

    // 棋譜コードを局面の列にする。読めないときは Error（画面に出すメッセージ付き）
    function decodeRecord(text) {
        const match = /^UT1-([0-9A-Za-z]{1,7})-(0|[bw][1-3])-([0-9a-zA-M]*|_)$/.exec(String(text).replace(/\s+/g, ""));
        if (!match) {
            throw new Error("棋譜コードの形が正しくありません（UT1- で始まる文字列を、そのまま貼り付けてください）。");
        }
        const seed = E.codeToSeed(match[1]);
        if (!seed) {
            throw new Error("棋譜コードの盤面コードが読めません。");
        }
        const handicap = match[2] === "0"
            ? null
            : { side: match[2][0] === "b" ? BLACK : WHITE, stones: Number(match[2][1]) };
        const moves = match[3] === "_" ? "" : match[3];
        if (moves.length % 2 !== 0) {
            throw new Error("棋譜コードが途中で切れているようです。");
        }
        const positions = [E.newGame(seed, { handicap })];
        for (let k = 0; k < moves.length; k += 2) {
            const from = SQUARE_CHARS.indexOf(moves[k]);
            const to = SQUARE_CHARS.indexOf(moves[k + 1]);
            try {
                positions.push(E.applyMove(positions[positions.length - 1], { from, to }));
            } catch (_error) {
                throw new Error(`${k / 2 + 1} 手目が、ルール上指せない手になっています。`);
            }
        }
        return positions;
    }

    function startReplay(positions, index) {
        game.token += 1;
        game.mode = "replay";
        game.puzzle = null;
        game.replay = { positions, index: index === undefined ? positions.length - 1 : index, evals: null };
        game.selected = null;
        game.hint = null;
        game.thinking = false;
        game.flipManual = false;
        game.flipped = false;
        game.handicap = positions[0].handicap || null;
        showReplayStep();
        loadEvalLine();
    }

    // ---------- 形勢グラフ（再生中だけ） ----------
    const GRAPH_WIDTH = 300;
    const GRAPH_HEIGHT = 120;
    const GRAPH_MID = GRAPH_HEIGHT / 2;
    const evalSvg = $("#eval-svg");
    const evalTooltip = $("#eval-tooltip");
    const evalStatus = $("#eval-status");
    const evalTable = $("#eval-table");
    const SVG_NS = "http://www.w3.org/2000/svg";

    // 点数をグラフの高さに。大きな差は tanh で頭打ちにして、互角付近の動きを見やすくする
    const evalToY = value => GRAPH_MID - Math.tanh(value / 250) * (GRAPH_MID - 6);
    const indexToX = (index, count) => (count <= 1 ? GRAPH_WIDTH / 2 : (index / (count - 1)) * GRAPH_WIDTH);

    function describeEval(value) {
        const side = value > 0 ? "黒" : "白";
        const size = Math.abs(value);
        if (size >= E.LINE_LIMIT) {
            return `${side}の勝ち`;
        }
        if (size < 40) {
            return "互角";
        }
        if (size < 150) {
            return `${side}がやや有利`;
        }
        if (size < 400) {
            return `${side}が有利`;
        }
        return `${side}が優勢`;
    }

    const signed = value => (Math.abs(value) >= E.LINE_LIMIT ? (value > 0 ? "+勝" : "−勝") : `${value > 0 ? "+" : ""}${value}`);

    async function loadEvalLine() {
        const replay = game.replay;
        const token = game.token;
        evalStatus.textContent = "形勢を計算しています…";
        renderEvalGraph();
        const values = await askAi("line", replay.positions, { depth: 4 });
        if (token !== game.token || game.replay !== replay || !Array.isArray(values)) {
            return;
        }
        replay.evals = values;
        evalStatus.textContent = "";
        evalTable.innerHTML = "";
        values.forEach((value, i) => {
            const item = document.createElement("li");
            item.textContent = `${describeEval(value)}（${signed(value)}）`;
            item.setAttribute("aria-label", `${i} 手目：${describeEval(value)}`);
            evalTable.appendChild(item);
        });
        renderEvalGraph();
    }

    function svgElement(name, attributes) {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
        return element;
    }

    function renderEvalGraph() {
        const plot = evalSvg.parentElement;
        const oldMarker = plot.querySelector(".eval-marker");
        if (oldMarker) {
            oldMarker.remove();
        }
        evalSvg.innerHTML = "";
        evalSvg.appendChild(svgElement("line", { class: "eval-zero", x1: 0, x2: GRAPH_WIDTH, y1: GRAPH_MID, y2: GRAPH_MID }));
        if (game.mode !== "replay" || !game.replay.evals) {
            return;
        }
        const values = game.replay.evals;
        const points = values.map((value, i) => `${indexToX(i, values.length).toFixed(2)},${evalToY(value).toFixed(2)}`);

        const defs = svgElement("defs", {});
        const clipBlack = svgElement("clipPath", { id: "eval-clip-black" });
        clipBlack.appendChild(svgElement("rect", { x: 0, y: 0, width: GRAPH_WIDTH, height: GRAPH_MID }));
        const clipWhite = svgElement("clipPath", { id: "eval-clip-white" });
        clipWhite.appendChild(svgElement("rect", { x: 0, y: GRAPH_MID, width: GRAPH_WIDTH, height: GRAPH_MID }));
        defs.append(clipBlack, clipWhite);
        evalSvg.appendChild(defs);

        const area = `M0,${GRAPH_MID} L${points.join(" L")} L${GRAPH_WIDTH},${GRAPH_MID} Z`;
        evalSvg.appendChild(svgElement("path", { class: "eval-area--black", d: area, "clip-path": "url(#eval-clip-black)" }));
        evalSvg.appendChild(svgElement("path", { class: "eval-area--white", d: area, "clip-path": "url(#eval-clip-white)" }));
        evalSvg.appendChild(svgElement("line", { class: "eval-zero", x1: 0, x2: GRAPH_WIDTH, y1: GRAPH_MID, y2: GRAPH_MID }));
        evalSvg.appendChild(svgElement("polyline", { class: "eval-line", points: points.join(" ") }));
        const cross = svgElement("line", { class: "eval-cross", x1: 0, x2: 0, y1: 0, y2: GRAPH_HEIGHT, visibility: "hidden" });
        cross.id = "eval-cross";
        evalSvg.appendChild(cross);

        // 今表示している手の位置に点（丸がつぶれないよう、SVG の外に重ねる）
        const index = game.replay.index;
        const marker = document.createElement("span");
        marker.className = "eval-marker";
        marker.style.left = `${(indexToX(index, values.length) / GRAPH_WIDTH) * 100}%`;
        marker.style.top = `calc(18px + ${(evalToY(values[index]) / GRAPH_HEIGHT) * 120}px)`;
        plot.appendChild(marker);

        evalSvg.setAttribute("aria-label", `形勢グラフ。今の ${index} 手目は${describeEval(values[index])}`);
        Array.from(evalTable.children).forEach((item, i) => item.classList.toggle("current", i === index));
    }

    function graphIndexAt(event) {
        const values = game.replay && game.replay.evals;
        if (!values) {
            return null;
        }
        const rect = evalSvg.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        return Math.round(ratio * (values.length - 1));
    }

    function onGraphHover(event) {
        const index = graphIndexAt(event);
        const cross = $("#eval-cross");
        if (index === null || !cross) {
            return;
        }
        const values = game.replay.evals;
        const x = indexToX(index, values.length);
        cross.setAttribute("x1", x);
        cross.setAttribute("x2", x);
        cross.setAttribute("visibility", "visible");
        evalTooltip.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = signed(values[index]);
        evalTooltip.append(strong, ` ${index} 手目・${describeEval(values[index])}`);
        evalTooltip.style.left = `${Math.min(80, Math.max(20, (x / GRAPH_WIDTH) * 100))}%`;
        evalTooltip.hidden = false;
    }

    function onGraphLeave() {
        const cross = $("#eval-cross");
        if (cross) {
            cross.setAttribute("visibility", "hidden");
        }
        evalTooltip.hidden = true;
    }

    function showReplayStep() {
        const replay = game.replay;
        replay.index = Math.max(0, Math.min(replay.positions.length - 1, replay.index));
        game.history = replay.positions.slice(0, replay.index + 1);
        render();
        const position = current();
        if (position.result) {
            statusEl.textContent = `${describeResult(position.result).title}（${position.result.reason === "capture" ? "王を取った" : position.result.reason === "arrival" ? "玉座に到達" : position.result.reason === "limit" ? "手数切れ" : "相手が動けない"}）`;
        }
    }

    function renderReplayCard() {
        const card = $("#replay-card");
        card.hidden = game.mode !== "replay";
        if (game.mode !== "replay") {
            return;
        }
        const replay = game.replay;
        const total = replay.positions.length - 1;
        $("#replay-step").textContent = `${replay.index} / ${total} 手目`;
        const slider = $("#replay-slider");
        slider.max = String(total);
        slider.value = String(replay.index);
        card.querySelector('[data-replay="first"]').disabled = replay.index === 0;
        card.querySelector('[data-replay="prev"]').disabled = replay.index === 0;
        card.querySelector('[data-replay="next"]').disabled = replay.index === total;
        card.querySelector('[data-replay="last"]').disabled = replay.index === total;
        renderEvalGraph();
    }

    function stepReplay(action) {
        if (game.mode !== "replay") {
            return;
        }
        const replay = game.replay;
        const steps = { first: -Infinity, prev: -1, next: 1, last: Infinity };
        const delta = steps[action];
        if (delta === -Infinity) {
            replay.index = 0;
        } else if (delta === Infinity) {
            replay.index = replay.positions.length - 1;
        } else {
            replay.index += delta;
        }
        showReplayStep();
    }

    async function copyRecord() {
        const code = encodeRecord(game.history);
        try {
            await navigator.clipboard.writeText(code);
            showToast("棋譜コードをコピーしました。「棋譜を読み込む」に貼り付けると再生できます。");
        } catch (_error) {
            // クリップボードが使えないときは、読み込み欄に入れて見せる（そこから手でコピーできる）
            const form = $("#record-form");
            form.elements.record.value = code;
            $("#record-error").hidden = true;
            $("#record-dialog").showModal();
            form.elements.record.select();
            showToast("棋譜コードを表示しました。選択してコピーしてください。");
        }
    }

    // ---------- 詰め問題 ----------
    function loadSolved() {
        const solved = load(PUZZLE_KEY, {});
        return solved && typeof solved === "object" ? solved : {};
    }

    // あと何手（自分の手）で勝たなければならないか
    function puzzleMovesLeft() {
        if (!game.puzzle) {
            return 0;
        }
        const myMoves = Math.ceil((game.history.length - 1) / 2);
        return game.puzzle.moves - myMoves;
    }

    function puzzleLabel(puzzle) {
        const group = PUZZLES.filter(p => p.moves === puzzle.moves);
        return `${puzzle.moves} 手で勝ち・第 ${group.indexOf(puzzle) + 1} 問`;
    }

    function renderPuzzleCard() {
        puzzleCard.hidden = game.mode !== "puzzle";
        if (game.mode !== "puzzle") {
            return;
        }
        const puzzle = game.puzzle;
        $("#puzzle-title").textContent = `詰め問題（${puzzleLabel(puzzle)}）`;
        const solved = loadSolved()[puzzle.id] ? "（解いたことがあります ✓）" : "";
        $("#puzzle-text").textContent = `${SIDE_NAME[game.human]}番です。${puzzle.moves} 手以内に勝ってください。相手（CPU）は最善の受けをします。${solved}`;
    }

    function nextPuzzle() {
        if (PUZZLES.length === 0) {
            return null;
        }
        const solved = loadSolved();
        const start = game.puzzle ? PUZZLES.indexOf(game.puzzle) + 1 : 0;
        for (let k = 0; k < PUZZLES.length; k += 1) {
            const candidate = PUZZLES[(start + k) % PUZZLES.length];
            if (!solved[candidate.id]) {
                return candidate;
            }
        }
        return PUZZLES[start % PUZZLES.length];
    }

    function startPuzzle(puzzle) {
        if (!puzzle) {
            return;
        }
        const position = E.decodePosition(puzzle);
        game.token += 1;
        game.mode = "puzzle";
        game.puzzle = puzzle;
        game.level = "hard";
        game.handicap = null;
        game.swapEnabled = false;
        game.swapTaken = null;
        game.human = position.turn;
        game.startHuman = position.turn;
        game.history = [position];
        game.moves = [];
        game.selected = null;
        game.hint = null;
        game.thinking = false;
        game.recorded = true;
        game.flipManual = false;
        game.flipped = game.human === WHITE;
        render();
    }

    async function puzzleAfterMove() {
        const position = current();
        if (position.result) {
            finishPuzzle(position.result.winner === game.human);
            return;
        }
        if (position.turn === game.human) {
            render();
            return;
        }

        // 人が指した直後：残りの手数で勝ちきれる手だったかを、相手側から読み切って確かめる
        const movesLeft = puzzleMovesLeft();
        const token = game.token;
        let analysis = null;
        if (movesLeft > 0) {
            game.thinking = true;
            render();
            [analysis] = await Promise.all([
                askAi("analyze", position, { depth: movesLeft * 2 }),
                wait(CPU_MIN_DELAY)
            ]);
            if (token !== game.token) {
                return;
            }
            game.thinking = false;
        }

        const stillWinning = analysis && analysis.outcome && !analysis.outcome.win
            && analysis.outcome.plies <= movesLeft * 2;
        if (!stillWinning) {
            // 間違い：その手を取り消して、もう一度考えてもらう
            game.history.pop();
            game.moves.pop();
            render();
            const message = `その手では ${game.puzzle.moves} 手以内に勝てません。別の手を考えてみましょう。`;
            statusEl.textContent = message;
            showToast(message);
            return;
        }
        playMove({ from: analysis.from, to: analysis.to });
    }

    function finishPuzzle(success) {
        const puzzle = game.puzzle;
        if (success) {
            const solved = loadSolved();
            solved[puzzle.id] = true;
            save(PUZZLE_KEY, solved);
        }
        const count = Object.keys(loadSolved()).filter(id => PUZZLES.some(p => p.id === id)).length;
        showResult(
            success ? "⭕" : "🍵",
            success ? "正解！" : "残念…",
            success
                ? `${puzzleLabel(puzzle)}を解きました（${count} / ${PUZZLES.length} 問）。`
                : "相手に勝たれてしまいました。もう一度挑戦してみましょう。",
            [
                ["review", "盤面を見る"],
                ["puzzle-list", "問題の一覧"],
                ["puzzle-next", "次の問題", true]
            ]
        );
    }

    function openPuzzleList() {
        const solved = loadSolved();
        const titles = { 1: "1 手で勝ち（入門）", 2: "2 手で勝ち", 3: "3 手で勝ち（上級）" };
        const groups = [...new Set(PUZZLES.map(p => p.moves))].sort();
        const list = $("#puzzle-list");
        list.innerHTML = "";
        groups.forEach(moves => {
            const section = document.createElement("section");
            section.className = "puzzle-group";
            const heading = document.createElement("h3");
            heading.textContent = titles[moves] || `${moves} 手で勝ち`;
            const buttons = document.createElement("div");
            buttons.className = "puzzle-buttons";
            PUZZLES.filter(p => p.moves === moves).forEach((puzzle, i) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "puzzle-button";
                button.textContent = String(i + 1);
                button.classList.toggle("solved", Boolean(solved[puzzle.id]));
                button.setAttribute("aria-label", `${heading.textContent} 第 ${i + 1} 問${solved[puzzle.id] ? "（解いた）" : ""}`);
                button.addEventListener("click", () => {
                    puzzleDialog.close();
                    startPuzzle(puzzle);
                });
                buttons.appendChild(button);
            });
            section.append(heading, buttons);
            list.appendChild(section);
        });
        const count = Object.keys(solved).filter(id => PUZZLES.some(p => p.id === id)).length;
        $("#puzzle-progress").textContent = `解いた問題：${count} / ${PUZZLES.length}`;
        if (!puzzleDialog.open) {
            puzzleDialog.showModal();
        }
    }

    // 保存してある対局に戻る（無ければ新しく始める）
    function resumeSavedOrNew() {
        game.puzzle = null;
        game.replay = null;
        if (restoreGame()) {
            render();
            if (current().result) {
                statusEl.textContent = `${describeResult(current().result).title}（前回の対局）`;
            } else if (game.swapEnabled && E.canOfferSwap(current()) && game.swapTaken === null) {
                afterMove();
            } else if (isCpuTurn()) {
                runCpu();
            }
        } else {
            startGame(settings);
        }
    }

    // ---------- 開始・待った・ヒント ----------
    function resolveSide(side) {
        if (side === "white") {
            return WHITE;
        }
        if (side === "random") {
            return Math.random() < 0.5 ? BLACK : WHITE;
        }
        return BLACK;
    }

    // 設定の値（"cpu:2" / "you:1" / "black:3" / "white:1" / "none"）を { side, stones } にする
    function resolveHandicap(choice, mode, human) {
        const match = /^(cpu|you|black|white):([1-3])$/.exec(choice || "");
        if (!match) {
            return null;
        }
        const stones = Number(match[2]);
        let side;
        if (match[1] === "cpu" || match[1] === "you") {
            if (mode !== "cpu") {
                return null;
            }
            side = match[1] === "you" ? human : -human;
        } else {
            if (mode !== "local") {
                return null;
            }
            side = match[1] === "black" ? BLACK : WHITE;
        }
        return { side, stones };
    }

    function handicapOptions(mode) {
        const options = [["none", "なし"]];
        if (mode === "cpu") {
            [1, 2, 3].forEach(n => options.push([`cpu:${n}`, `CPU の石を ${n} 枚減らす`]));
            [1, 2, 3].forEach(n => options.push([`you:${n}`, `あなたの石を ${n} 枚減らす`]));
        } else {
            [1, 2, 3].forEach(n => options.push([`black:${n}`, `黒の石を ${n} 枚減らす`]));
            [1, 2, 3].forEach(n => options.push([`white:${n}`, `白の石を ${n} 枚減らす`]));
        }
        return options;
    }

    function resetGameState(options) {
        game.token += 1;
        game.puzzle = null;
        game.replay = null;
        game.mode = options.mode === "local" ? "local" : "cpu";
        game.level = E.LEVELS[options.level] ? options.level : "normal";
        game.startHuman = options.startHuman !== undefined ? options.startHuman : resolveSide(options.side);
        game.human = game.startHuman;
        game.handicap = options.resolvedHandicap !== undefined
            ? options.resolvedHandicap
            : resolveHandicap(options.handicap, game.mode, game.human);
        // 駒落ちはわざと条件を変えるので、入れ替えルールとは組み合わせない
        game.swapEnabled = options.swap !== false && !game.handicap;
        game.names = { [BLACK]: "プレイヤー1", [WHITE]: "プレイヤー2" };
        game.swapTaken = null;
        game.history = [E.newGame(options.seed || null, { handicap: game.handicap })];
        game.moves = [];
        game.selected = null;
        game.hint = null;
        game.thinking = false;
        game.recorded = false;
        game.flipManual = false;
        game.flipped = game.mode === "cpu" && game.human === WHITE;
        E.clearTable();
    }

    function startGame(options) {
        resetGameState(options);
        saveGame();
        render();
        if (isCpuTurn()) {
            runCpu();
        }
    }

    function undo() {
        if (game.history.length <= 1) {
            return;
        }
        game.token += 1;
        game.thinking = false;
        game.selected = null;
        game.hint = null;

        const popOne = () => {
            game.history.pop();
            game.moves.pop();
            if (game.history.length <= 1 && game.swapTaken !== null) {
                // 1 手目まで戻したら、入れ替えの決定も取り消す
                if (game.swapTaken) {
                    applySwapDecision(false);
                    if (game.mode === "cpu") {
                        game.human = game.startHuman;
                        if (!game.flipManual) {
                            game.flipped = game.human === WHITE;
                        }
                    } else {
                        game.names = { [BLACK]: "プレイヤー1", [WHITE]: "プレイヤー2" };
                    }
                }
                game.swapTaken = null;
            }
        };

        popOne();
        if (game.mode !== "local") {
            // 自分の番まで戻す
            while (game.history.length > 1 && current().turn !== game.human) {
                popOne();
            }
        }
        game.recorded = false;
        saveGame();
        render();
        if (isCpuTurn()) {
            runCpu();
        } else if (game.swapEnabled && E.canOfferSwap(current()) && game.swapTaken === null) {
            afterMove();
        }
    }

    async function showHint() {
        if (!isHumanTurn() || game.thinking) {
            return;
        }
        const token = game.token;
        hintButton.disabled = true;
        statusEl.textContent = "ヒントを考えています…";
        const move = await askAi("move", current(), { level: "hard", timeMs: 1000 });
        if (token !== game.token || !move) {
            render();
            return;
        }
        game.hint = { from: move.from, to: move.to };
        game.selected = null;
        render();
        statusEl.textContent = `ヒント：${squareName(move.from)} の駒を ${squareName(move.to)} へ（緑の枠）。`;
    }

    // ---------- 対局の保存と再開 ----------
    function saveGame() {
        if (game.mode === "puzzle" || game.mode === "replay") {
            return; // 詰め問題は保存しない（保存してある対局を上書きしない）
        }
        save(GAME_KEY, {
            version: 1,
            seed: current().seed,
            moves: game.moves,
            mode: game.mode,
            level: game.level,
            swapEnabled: game.swapEnabled,
            startHuman: game.startHuman,
            handicap: game.handicap,
            swapTaken: game.swapTaken,
            recorded: game.recorded
        });
    }

    function restoreGame() {
        const saved = load(GAME_KEY, null);
        if (!saved || saved.version !== 1 || !Array.isArray(saved.moves)) {
            return false;
        }
        try {
            resetGameState({
                mode: saved.mode,
                level: saved.level,
                swap: saved.swapEnabled,
                startHuman: saved.startHuman === WHITE ? WHITE : BLACK,
                resolvedHandicap: saved.handicap && (saved.handicap.side === BLACK || saved.handicap.side === WHITE)
                    ? { side: saved.handicap.side, stones: Number(saved.handicap.stones) || 0 }
                    : null,
                seed: saved.seed
            });
            saved.moves.forEach(([from, to], i) => {
                game.history.push(E.applyMove(current(), { from, to }));
                game.moves.push([from, to]);
                if (i === 0 && saved.swapTaken !== null && saved.swapTaken !== undefined) {
                    applySwapDecision(Boolean(saved.swapTaken));
                }
            });
            game.recorded = Boolean(saved.recorded);
            return true;
        } catch (error) {
            console.warn("Could not restore the saved game", error);
            return false;
        }
    }

    // ---------- 設定ダイアログ ----------
    function openSetup() {
        setupForm.elements.mode.value = settings.mode;
        setupForm.elements.level.value = settings.level;
        setupForm.elements.side.value = settings.side;
        setupForm.elements.swap.checked = settings.swap;
        fillHandicapOptions(settings.mode, settings.handicap);
        setupForm.elements.code.value = "";
        setupError.hidden = true;
        updateSetupVisibility();
        setupDialog.showModal();
    }

    function fillHandicapOptions(mode, selected) {
        const select = setupForm.elements.handicap;
        const options = handicapOptions(mode);
        select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
        select.value = options.some(([value]) => value === selected) ? selected : "none";
    }

    function updateSetupVisibility(event) {
        const mode = setupForm.elements.mode.value;
        const cpu = mode === "cpu";
        if (event && event.target && event.target.name === "mode") {
            fillHandicapOptions(mode, "none");
        }
        const handicapOn = setupForm.elements.handicap.value !== "none";
        setupForm.elements.swap.disabled = handicapOn;
        $("#handicap-note").hidden = !handicapOn;
        $("#cpu-options").disabled = !cpu;
        $("#side-options").disabled = !cpu;
        $("#cpu-options").hidden = !cpu;
        $("#side-options").hidden = !cpu;
    }

    setupForm.addEventListener("change", updateSetupVisibility);

    setupForm.addEventListener("submit", event => {
        const code = setupForm.elements.code.value.trim();
        let seed = null;
        if (code) {
            seed = E.codeToSeed(code);
            if (!seed) {
                event.preventDefault();
                setupError.textContent = "盤面コードは英数字 7 文字以内です（例：K3Z9QA）。";
                setupError.hidden = false;
                return;
            }
        }
        settings = {
            mode: setupForm.elements.mode.value,
            level: setupForm.elements.level.value,
            side: setupForm.elements.side.value,
            swap: setupForm.elements.swap.checked,
            handicap: setupForm.elements.handicap.value
        };
        save(SETTINGS_KEY, settings);
        startGame(Object.assign({}, settings, { seed }));
    });

    // ---------- お知らせ ----------
    let toastTimer = null;
    function showToast(message) {
        toastEl.textContent = message;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.hidden = true;
        }, 4500);
    }

    // ---------- 起動 ----------
    function init() {
        buildBoard();
        renderLegend();
        renderRules();
        renderRecord();
        worker = createWorker();

        document.querySelectorAll("[data-open]").forEach(button => {
            button.addEventListener("click", () => {
                const target = document.getElementById(button.dataset.open);
                if (target === setupDialog) {
                    openSetup();
                } else if (target === puzzleDialog) {
                    openPuzzleList();
                } else if (target) {
                    target.showModal();
                }
            });
        });
        document.querySelectorAll("[data-close]").forEach(button => {
            button.addEventListener("click", () => {
                button.closest("dialog").close();
            });
        });

        undoButton.addEventListener("click", undo);
        hintButton.addEventListener("click", showHint);
        flipButton.addEventListener("click", () => {
            game.flipped = !game.flipped;
            game.flipManual = true;
            render();
        });
        dangerToggle.addEventListener("change", render);
        copyCodeButton.addEventListener("click", async () => {
            const code = E.seedToCode(current().seed);
            try {
                await navigator.clipboard.writeText(code);
                showToast(`盤面コード ${code} をコピーしました。`);
            } catch (_error) {
                showToast(`盤面コード：${code}`);
            }
        });

        $("#record-review").addEventListener("click", () => startReplay(game.history.slice(), 0));
        $("#record-copy").addEventListener("click", copyRecord);
        $("#record-load").addEventListener("click", () => {
            $("#record-error").hidden = true;
            $("#record-form").elements.record.value = "";
            $("#record-dialog").showModal();
        });
        $("#record-form").addEventListener("submit", event => {
            const text = $("#record-form").elements.record.value.trim();
            try {
                const positions = decodeRecord(text);
                startReplay(positions, 0);
            } catch (error) {
                event.preventDefault();
                $("#record-error").textContent = error.message;
                $("#record-error").hidden = false;
            }
        });
        document.querySelectorAll("[data-replay]").forEach(button => {
            button.addEventListener("click", () => stepReplay(button.dataset.replay));
        });
        $("#replay-slider").addEventListener("input", event => {
            game.replay.index = Number(event.target.value);
            showReplayStep();
        });
        $("#replay-exit").addEventListener("click", resumeSavedOrNew);
        evalSvg.addEventListener("pointermove", onGraphHover);
        evalSvg.addEventListener("pointerleave", onGraphLeave);
        evalSvg.addEventListener("click", event => {
            const index = graphIndexAt(event);
            if (index !== null) {
                game.replay.index = index;
                showReplayStep();
                onGraphHover(event);
            }
        });
        moveLogEl.addEventListener("click", event => {
            const item = event.target.closest("li[data-step]");
            if (item && game.mode === "replay") {
                game.replay.index = Number(item.dataset.step);
                showReplayStep();
            }
        });
        document.addEventListener("keydown", event => {
            if (game.mode !== "replay" || document.querySelector("dialog[open]")) {
                return;
            }
            const tag = event.target && event.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") {
                return;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                if (event.target && event.target.classList && event.target.classList.contains("cell")) {
                    return; // 盤の上では矢印キーはマスの移動に使う
                }
                event.preventDefault();
                stepReplay(event.key === "ArrowLeft" ? "prev" : "next");
            }
        });

        $("#puzzle-retry").addEventListener("click", () => startPuzzle(game.puzzle));
        $("#puzzle-next").addEventListener("click", () => startPuzzle(nextPuzzle()));
        $("#puzzle-exit").addEventListener("click", resumeSavedOrNew);

        resumeSavedOrNew();

        if (!load(SEEN_RULES_KEY, false)) {
            save(SEEN_RULES_KEY, true);
            rulesDialog.showModal();
        }
    }

    init();
})();
