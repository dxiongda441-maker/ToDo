// うつろい：画面の操作と描画
(() => {
    "use strict";

    const E = window.UtsuroiEngine;
    const { BLACK, WHITE, SIZE, CELLS, KING, TILE_INFO, MAX_PLY } = E;

    const SETTINGS_KEY = "utsuroi.settings.v1";
    const RECORD_KEY = "utsuroi.record.v1";
    const GAME_KEY = "utsuroi.game.v1";
    const SEEN_RULES_KEY = "utsuroi.seenRules.v1";
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
    const defaultSettings = { mode: "cpu", level: "normal", side: "black", swap: true };
    let settings = Object.assign({}, defaultSettings, load(SETTINGS_KEY, {}));

    const game = {
        mode: "cpu",
        level: "normal",
        swapEnabled: true,
        startHuman: BLACK, // CPU 戦で、対局開始時に人が持った色
        human: BLACK, // いま人が持っている色（入れ替えで変わる）
        names: { [BLACK]: "プレイヤー1", [WHITE]: "プレイヤー2" }, // 2 人対戦のときの名前
        swapTaken: null, // null: まだ決めていない / true / false
        history: [], // 局面の列（history[0] が初期局面）
        moves: [], // 指した手 [from, to]
        selected: null,
        hint: null,
        flipped: false,
        flipManual: false,
        thinking: false,
        token: 0,
        recorded: false
    };

    const current = () => game.history[game.history.length - 1];
    const isCpuTurn = () => game.mode === "cpu" && current().turn !== game.human && !current().result;
    const isHumanTurn = () => !current().result && (game.mode === "local" || current().turn === game.human);

    function squareName(index) {
        return `${COLUMNS[E.colOf(index)]}${SIZE - E.rowOf(index)}`;
    }

    function playerLabel(side) {
        if (game.mode === "cpu") {
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
        const viewer = game.mode === "cpu" ? game.human : position.turn;
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
            if (index === throneBlack || index === throneWhite) {
                label += "。玉座";
            }
            cell.setAttribute("aria-label", label);
        });

        renderCoords();
        renderStrips();
        renderTurn();
        renderSelection();
        renderLog();
        boardCodeEl.textContent = E.seedToCode(position.seed);
        undoButton.disabled = game.history.length <= 1 || game.thinking;
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
        return `<span class="strip-name"><span class="mini-piece mini-piece--${side === BLACK ? "black" : "white"}"></span>${SIDE_NAME[side]}・${playerLabel(side)}</span>${thinking}<span class="strip-count">駒 ${count}</span>`;
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
        const items = game.history.slice(1).map((position, i) => {
            const move = position.lastMove;
            const side = position.turn === BLACK ? WHITE : BLACK;
            const capture = move.captured !== 0 ? "×" : "→";
            const king = Math.abs(move.piece) === KING ? "王" : "";
            const tileChange = `${TILE_INFO[move.tileBefore].kanji}→${TILE_INFO[move.tileAfter].kanji}`;
            const swapNote = i === 0 && game.swapTaken ? "（入れ替え）" : "";
            return `<li${i === game.history.length - 2 ? ' class="current"' : ""}>${SIDE_NAME[side]} ${king}${squareName(move.from)}${capture}${squareName(move.to)} <span class="muted small">床 ${tileChange}</span>${swapNote}</li>`;
        });
        moveLogEl.innerHTML = items.join("");
        moveLogEl.scrollTop = moveLogEl.scrollHeight;
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
                const black = E.countPieces(position.board, BLACK);
                const white = E.countPieces(position.board, WHITE);
                return `${MAX_PLY} 手に達しました。残りの駒は 黒 ${black}・白 ${white}。`;
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
        if (game.mode === "cpu" && !game.recorded) {
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
        $("#result-emoji").textContent = description.emoji;
        $("#result-title").textContent = description.title;
        $("#result-text").textContent = description.text;
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
        }
    });

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

    function resetGameState(options) {
        game.token += 1;
        game.mode = options.mode === "local" ? "local" : "cpu";
        game.level = E.LEVELS[options.level] ? options.level : "normal";
        game.swapEnabled = options.swap !== false;
        game.startHuman = options.startHuman !== undefined ? options.startHuman : resolveSide(options.side);
        game.human = game.startHuman;
        game.names = { [BLACK]: "プレイヤー1", [WHITE]: "プレイヤー2" };
        game.swapTaken = null;
        game.history = [E.newGame(options.seed || null)];
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
        if (game.mode === "cpu") {
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
        save(GAME_KEY, {
            version: 1,
            seed: current().seed,
            moves: game.moves,
            mode: game.mode,
            level: game.level,
            swapEnabled: game.swapEnabled,
            startHuman: game.startHuman,
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
        setupForm.elements.code.value = "";
        setupError.hidden = true;
        updateSetupVisibility();
        setupDialog.showModal();
    }

    function updateSetupVisibility() {
        const cpu = setupForm.elements.mode.value === "cpu";
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
            swap: setupForm.elements.swap.checked
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

        if (!load(SEEN_RULES_KEY, false)) {
            save(SEEN_RULES_KEY, true);
            rulesDialog.showModal();
        }
    }

    init();
})();
