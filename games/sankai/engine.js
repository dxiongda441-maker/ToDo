// 三界戦棋（さんかいせんぎ）のルールと CPU。画面には依存しない。
// ブラウザでは window.SankaiEngine、Node では module.exports で使える。
// CPU を Web Worker で動かすとき、この関数の中身を文字列にして渡すため、
// createSankaiEngine の外側の変数を参照してはいけない。
function createSankaiEngine() {
    "use strict";

    // ---------- 盤 ----------
    // 9×9 の盤が 3 段（0 = 地下、1 = 地上、2 = 空）。マスの番号は 段×81 ＋ 段内の y×9 ＋ x。
    // y = 0 が 後手の 奥、y = 8 が 先手の 奥。先手は y が 小さい ほうへ 進む。
    const SIZE = 9;
    const LAYER_CELLS = SIZE * SIZE;
    const CELLS = LAYER_CELLS * 3;
    const UNDER = 0;
    const GROUND = 1;
    const SKY = 2;
    const LAYER_NAMES = ["地下", "地上", "空"];

    const SENTE = 1; // 先手（下側・青）
    const GOTE = -1; // 後手（上側・赤）

    // ---------- 駒 ----------
    // 盤には 駒の 種類（成ると ＋16）× 先手なら ＋、後手なら − を 入れる。0 は 空き。
    const CMD = 1; // 司令官
    const INF = 2; // 歩兵 → 精鋭兵
    const TNK = 3; // 戦車 → 重戦車
    const CAV = 4; // 騎兵 → 竜騎兵
    const ART = 5; // 砲兵 → 重砲
    const AA = 6; // 対空砲
    const ENG = 7; // 工兵
    const FTR = 8; // 戦闘機
    const BMB = 9; // 爆撃機
    const PROMOTED = 16;
    const HAND_TYPES = [INF, TNK, CAV, ART, AA, ENG, FTR, BMB];
    const PROMOTABLE = { [INF]: true, [TNK]: true, [CAV]: true, [ART]: true };

    const PIECES = {
        [CMD]: { key: "cmd", name: "司令官", short: "司", layers: [GROUND], text: "周り 8 方向に 1 マス。取られたら（逃げ場が なくなったら）負け" },
        [INF]: { key: "inf", name: "歩兵", short: "歩", layers: [GROUND], text: "前に 1 マス", promoted: { name: "精鋭兵", short: "精", text: "前・斜め前・横・後ろに 1 マス（将棋の 金）" } },
        [TNK]: { key: "tnk", name: "戦車", short: "戦", layers: [GROUND], text: "縦横に どこまでも（駒は 跳び越えない）", promoted: { name: "重戦車", short: "重", text: "縦横に どこまでも ＋ 斜めに 1 マス" } },
        [CAV]: { key: "cav", name: "騎兵", short: "騎", layers: [GROUND], text: "ナイトの 跳び（8 方向）", promoted: { name: "竜騎兵", short: "竜", text: "ナイトの 跳び ＋ 周り 1 マス" } },
        [ART]: { key: "art", name: "砲兵", short: "砲", layers: [GROUND], text: "縦横に 1 マス。または 動かずに 縦横 ちょうど 2 マス先の 敵を 撃つ", promoted: { name: "重砲", short: "迫", text: "縦横に 1 マス。または 動かずに 縦横 2〜3 マス先の 敵を 撃つ" } },
        [AA]: { key: "aa", name: "対空砲", short: "対", layers: [GROUND], text: "縦横に 1 マス。または 動かずに 上空 3×3 の 敵機を 撃ち落とす" },
        [ENG]: { key: "eng", name: "工兵", short: "工", layers: [GROUND, UNDER], text: "周り 1 マス。同じ マスで 地上と 地下を 行き来できる。地下から 真上の 敵を 襲って 地上に 出られる" },
        [FTR]: { key: "ftr", name: "戦闘機", short: "闘", layers: [SKY], text: "空を 8 方向に 3 マスまで。空の 敵機を 取る" },
        [BMB]: { key: "bmb", name: "爆撃機", short: "爆", layers: [SKY], text: "空を 8 方向に 2 マスまで（取れない）。または 動かずに 真下の 地上の 敵を 爆撃する" }
    };

    // 駒の 価値（CPU の 評価と、取った駒の 見せ方に 使う）
    const VALUE = {
        [INF]: 100, [INF + PROMOTED]: 420,
        [TNK]: 800, [TNK + PROMOTED]: 1000,
        [CAV]: 420, [CAV + PROMOTED]: 620,
        [ART]: 480, [ART + PROMOTED]: 620,
        [AA]: 360, [ENG]: 420, [FTR]: 640, [BMB]: 720,
        [CMD]: 0
    };

    const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

    const MAX_PLY = 400;

    const idx = (layer, x, y) => layer * LAYER_CELLS + y * SIZE + x;
    const layerOf = sq => Math.floor(sq / LAYER_CELLS);
    const xOf = sq => sq % SIZE;
    const yOf = sq => Math.floor((sq % LAYER_CELLS) / SIZE);
    const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
    const sideOf = p => (p > 0 ? SENTE : p < 0 ? GOTE : 0);
    const kindOf = p => Math.abs(p) & 15;
    const isPromoted = p => (Math.abs(p) & PROMOTED) !== 0;
    const isAir = kind => kind === FTR || kind === BMB;
    // 自陣（手前 3 段）・敵陣（奥 3 段）
    const inOwnCamp = (side, y) => (side === SENTE ? y >= 6 : y <= 2);
    const inEnemyCamp = (side, y) => (side === SENTE ? y <= 2 : y >= 6);
    // 本陣：その側の 司令官が 最初に いた マス
    const honjinOf = side => idx(GROUND, 4, side === SENTE ? 8 : 0);

    // ---------- 最初の 並び ----------
    function initialState() {
        const board = new Int8Array(CELLS);
        const back = [TNK, CAV, ART, ENG, CMD, AA, ART, CAV, TNK];
        for (let x = 0; x < SIZE; x += 1) {
            board[idx(GROUND, x, 8)] = back[x];
            board[idx(GROUND, 8 - x, 0)] = -back[x];
            board[idx(GROUND, x, 6)] = INF;
            board[idx(GROUND, x, 2)] = -INF;
        }
        board[idx(SKY, 2, 7)] = FTR;
        board[idx(SKY, 6, 7)] = BMB;
        board[idx(SKY, 6, 1)] = -FTR;
        board[idx(SKY, 2, 1)] = -BMB;
        return {
            board,
            hands: { [SENTE]: new Int8Array(16), [GOTE]: new Int8Array(16) },
            turn: SENTE,
            ply: 0,
            history: [],
            result: null
        };
    }

    function cloneState(state) {
        return {
            board: new Int8Array(state.board),
            hands: { [SENTE]: new Int8Array(state.hands[SENTE]), [GOTE]: new Int8Array(state.hands[GOTE]) },
            turn: state.turn,
            ply: state.ply,
            history: state.history.slice(),
            result: state.result
        };
    }

    // ---------- 手の 作り方 ----------
    // 手は { kind: "move" | "shot" | "drop", from, to, promote, piece }。
    // shot は 撃った 駒が 動かず、to の 敵だけが 消える。drop の piece は 打つ 駒の 種類。
    function pushMove(list, board, side, from, to, piece) {
        const kind = kindOf(piece);
        const y0 = yOf(from);
        const y1 = yOf(to);
        const canPromote = PROMOTABLE[kind] && !isPromoted(piece) && layerOf(to) === GROUND && (inEnemyCamp(side, y0) || inEnemyCamp(side, y1));
        // 歩兵は 一番 奥で 動けなく なるので 必ず 成る
        const mustPromote = kind === INF && !isPromoted(piece) && (side === SENTE ? y1 === 0 : y1 === 8);
        if (canPromote) {
            list.push({ kind: "move", from, to, promote: true });
            if (!mustPromote) {
                list.push({ kind: "move", from, to, promote: false });
            }
        } else {
            list.push({ kind: "move", from, to, promote: false });
        }
    }

    // 1 マスずつ 進む 動き（空きか 敵の 駒なら 行ける）
    function stepMoves(list, board, side, from, piece, layer, dirs) {
        const x = xOf(from);
        const y = yOf(from);
        dirs.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            if (!inside(nx, ny)) {
                return;
            }
            const to = idx(layer, nx, ny);
            if (sideOf(board[to]) !== side) {
                pushMove(list, board, side, from, to, piece);
            }
        });
    }

    // まっすぐ 進む 動き（limit マスまで。駒に ぶつかったら 止まる）
    function slideMoves(list, board, side, from, piece, layer, dirs, limit, canCapture) {
        const x = xOf(from);
        const y = yOf(from);
        dirs.forEach(([dx, dy]) => {
            for (let n = 1; n <= limit; n += 1) {
                const nx = x + dx * n;
                const ny = y + dy * n;
                if (!inside(nx, ny)) {
                    break;
                }
                const to = idx(layer, nx, ny);
                const target = board[to];
                if (target === 0) {
                    pushMove(list, board, side, from, to, piece);
                    continue;
                }
                if (canCapture && sideOf(target) !== side) {
                    pushMove(list, board, side, from, to, piece);
                }
                break;
            }
        });
    }

    // 前の 向き（先手は y が 減る ほう）
    const forwardDirs = (side, dirs) => dirs.map(([dx, dy]) => [dx, dy * -side]);
    const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]]; // 前を ＋ として 書く

    function pieceMoves(list, board, side, from) {
        const piece = board[from];
        const kind = kindOf(piece);
        const promoted = isPromoted(piece);
        const layer = layerOf(from);
        const x = xOf(from);
        const y = yOf(from);
        switch (kind) {
            case CMD:
                stepMoves(list, board, side, from, piece, GROUND, DIRS8);
                break;
            case INF:
                stepMoves(list, board, side, from, piece, GROUND, promoted ? forwardDirs(side, GOLD) : forwardDirs(side, [[0, 1]]));
                break;
            case TNK:
                slideMoves(list, board, side, from, piece, GROUND, ORTH, SIZE, true);
                if (promoted) {
                    stepMoves(list, board, side, from, piece, GROUND, DIAG);
                }
                break;
            case CAV:
                stepMoves(list, board, side, from, piece, GROUND, KNIGHT);
                if (promoted) {
                    stepMoves(list, board, side, from, piece, GROUND, DIRS8);
                }
                break;
            case ART: {
                stepMoves(list, board, side, from, piece, GROUND, ORTH);
                const ranges = promoted ? [2, 3] : [2];
                ORTH.forEach(([dx, dy]) => ranges.forEach(r => {
                    const nx = x + dx * r;
                    const ny = y + dy * r;
                    if (inside(nx, ny)) {
                        const to = idx(GROUND, nx, ny);
                        if (sideOf(board[to]) === -side) {
                            list.push({ kind: "shot", from, to, promote: false });
                        }
                    }
                }));
                break;
            }
            case AA:
                stepMoves(list, board, side, from, piece, GROUND, ORTH);
                for (let dy = -1; dy <= 1; dy += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        if (inside(x + dx, y + dy)) {
                            const to = idx(SKY, x + dx, y + dy);
                            if (sideOf(board[to]) === -side) {
                                list.push({ kind: "shot", from, to, promote: false });
                            }
                        }
                    }
                }
                break;
            case ENG: {
                stepMoves(list, board, side, from, piece, layer, DIRS8);
                // 同じ マスで 上下に 移る（地下から 出る ときは 真上の 敵を 襲える）
                const other = idx(layer === GROUND ? UNDER : GROUND, x, y);
                if (sideOf(board[other]) !== side) {
                    list.push({ kind: "move", from, to: other, promote: false });
                }
                break;
            }
            case FTR:
                slideMoves(list, board, side, from, piece, SKY, DIRS8, 3, true);
                break;
            case BMB: {
                slideMoves(list, board, side, from, piece, SKY, DIRS8, 2, false);
                const below = idx(GROUND, x, y);
                if (sideOf(board[below]) === -side) {
                    list.push({ kind: "shot", from, to: below, promote: false });
                }
                break;
            }
            default:
                break;
        }
    }

    // 打てる 場所：自陣の 空きマス（段は 駒の 種類で きまる）。歩兵は 二歩 禁止
    function dropMoves(list, state, side) {
        const board = state.board;
        const hand = state.hands[side];
        HAND_TYPES.forEach(kind => {
            if (hand[kind] <= 0) {
                return;
            }
            const layers = PIECES[kind].layers;
            const pawnFiles = new Set();
            if (kind === INF) {
                for (let sq = GROUND * LAYER_CELLS; sq < (GROUND + 1) * LAYER_CELLS; sq += 1) {
                    if (board[sq] === INF * side) {
                        pawnFiles.add(xOf(sq));
                    }
                }
            }
            layers.forEach(layer => {
                for (let y = 0; y < SIZE; y += 1) {
                    if (!inOwnCamp(side, y)) {
                        continue;
                    }
                    for (let x = 0; x < SIZE; x += 1) {
                        const to = idx(layer, x, y);
                        if (board[to] === 0 && !pawnFiles.has(x)) {
                            list.push({ kind: "drop", piece: kind, to, promote: false });
                        }
                    }
                }
            });
        });
    }

    function pseudoMoves(state, side) {
        const list = [];
        const board = state.board;
        for (let sq = 0; sq < CELLS; sq += 1) {
            if (sideOf(board[sq]) === side) {
                pieceMoves(list, board, side, sq);
            }
        }
        dropMoves(list, state, side);
        return list;
    }

    // ---------- 司令官が ねらわれて いるか ----------
    function findCommander(board, side) {
        const target = CMD * side;
        for (let sq = GROUND * LAYER_CELLS; sq < (GROUND + 1) * LAYER_CELLS; sq += 1) {
            if (board[sq] === target) {
                return sq;
            }
        }
        return -1;
    }

    // 地上の マス sq を、by の 駒が 次の 手で 取れるか（動いて 取る・撃つ・爆撃・奇襲）
    function groundAttacked(board, sq, by) {
        const x = xOf(sq);
        const y = yOf(sq);
        const at = (layer, ax, ay) => (inside(ax, ay) ? board[idx(layer, ax, ay)] : 0);
        const mine = (p, kind) => p !== 0 && sideOf(p) === by && kindOf(p) === kind;
        // 周り 1 マス（司令官・工兵・竜騎兵・精鋭兵・重戦車の 斜め・歩兵・砲兵・対空砲の 縦横）
        for (const [dx, dy] of DIRS8) {
            const p = at(GROUND, x + dx, y + dy);
            if (p === 0 || sideOf(p) !== by) {
                continue;
            }
            const kind = kindOf(p);
            const promoted = isPromoted(p);
            const orth = dx === 0 || dy === 0;
            if (kind === CMD || kind === ENG) {
                return true;
            }
            if (kind === CAV && promoted) {
                return true;
            }
            if (kind === TNK && promoted && !orth) {
                return true;
            }
            if ((kind === ART || kind === AA) && orth) {
                return true;
            }
            if (kind === INF) {
                // sq は 攻める 駒から 見て (−dx, −dy) の 位置
                const rx = -dx;
                const ry = -dy * -by; // 前を ＋ に
                if (!promoted && rx === 0 && ry === 1) {
                    return true;
                }
                if (promoted && GOLD.some(([gx, gy]) => gx === rx && gy === ry)) {
                    return true;
                }
            }
        }
        // 戦車の 縦横
        for (const [dx, dy] of ORTH) {
            for (let n = 1; n < SIZE; n += 1) {
                const p = at(GROUND, x + dx * n, y + dy * n);
                if (!inside(x + dx * n, y + dy * n)) {
                    break;
                }
                if (p === 0) {
                    continue;
                }
                if (mine(p, TNK)) {
                    return true;
                }
                break;
            }
        }
        // 騎兵の 跳び
        for (const [dx, dy] of KNIGHT) {
            if (mine(at(GROUND, x + dx, y + dy), CAV)) {
                return true;
            }
        }
        // 砲兵の 射撃（2 マス、重砲は 3 マスも）
        for (const [dx, dy] of ORTH) {
            const p2 = at(GROUND, x + dx * 2, y + dy * 2);
            if (mine(p2, ART)) {
                return true;
            }
            const p3 = at(GROUND, x + dx * 3, y + dy * 3);
            if (mine(p3, ART) && isPromoted(p3)) {
                return true;
            }
        }
        // 真上の 爆撃機・真下の 工兵
        if (mine(board[idx(SKY, x, y)], BMB) || mine(board[idx(UNDER, x, y)], ENG)) {
            return true;
        }
        return false;
    }

    function inCheck(state, side) {
        const sq = findCommander(state.board, side);
        return sq >= 0 && groundAttacked(state.board, sq, -side);
    }

    // ---------- 手を 指す ----------
    // 盤と 持ち駒を 書きかえ、取った 駒を 返す（state.turn などは 変えない）
    function applyRaw(state, move, side) {
        const board = state.board;
        let captured = 0;
        if (move.kind === "drop") {
            board[move.to] = move.piece * side;
            state.hands[side][move.piece] -= 1;
            return 0;
        }
        captured = board[move.to];
        if (move.kind === "shot") {
            board[move.to] = 0;
        } else {
            let piece = board[move.from];
            if (move.promote) {
                piece = side * (Math.abs(piece) | PROMOTED);
            }
            board[move.from] = 0;
            board[move.to] = piece;
        }
        if (captured !== 0 && kindOf(captured) !== CMD) {
            state.hands[side][kindOf(captured)] += 1;
        }
        return captured;
    }

    // 盤を その場で 書きかえる（あとで undoMove で もどす）。読みの 速さの ため、局面を 写さない
    function doMove(state, move, side) {
        const board = state.board;
        const moved = move.kind === "move" ? board[move.from] : 0;
        const captured = applyRaw(state, move, side);
        return { move, side, moved, captured };
    }

    function undoMove(state, undo) {
        const { move, side, moved, captured } = undo;
        const board = state.board;
        if (move.kind === "drop") {
            board[move.to] = 0;
            state.hands[side][move.piece] += 1;
            return;
        }
        if (move.kind === "move") {
            board[move.from] = moved;
        }
        board[move.to] = captured;
        if (captured !== 0 && kindOf(captured) !== CMD) {
            state.hands[side][kindOf(captured)] -= 1;
        }
    }

    // 自分の 司令官を ねらわれた ままに する 手は 指せない
    function filterLegal(state, side, moves) {
        const out = [];
        for (const move of moves) {
            const undo = doMove(state, move, side);
            if (kindOf(undo.captured) === CMD || !inCheck(state, side)) {
                out.push(move);
            }
            undoMove(state, undo);
        }
        return out;
    }

    function legalMoves(state, side = state.turn) {
        if (state.result) {
            return [];
        }
        return filterLegal(state, side, pseudoMoves(state, side));
    }

    function positionKey(state) {
        return `${state.turn}|${Array.from(state.board).join(",")}|${Array.from(state.hands[SENTE]).join("")}|${Array.from(state.hands[GOTE]).join("")}`;
    }

    // 手を 指して 次の 局面を 返す（もとの state は 変えない）。勝ち負けも 決める
    function play(state, move) {
        const side = state.turn;
        const next = cloneState(state);
        const captured = applyRaw(next, move, side);
        next.turn = -side;
        next.ply += 1;
        next.lastMove = Object.assign({ side, captured }, move);
        if (kindOf(captured) === CMD) {
            next.result = { winner: side, reason: "capture" };
            return next;
        }
        // 相手の 駒が 自分の 本陣に 1 手 居座ったら（取り返せなかったら）相手の 勝ち
        const myHonjin = honjinOf(side);
        if (sideOf(next.board[myHonjin]) === -side) {
            next.result = { winner: -side, reason: "occupation" };
            return next;
        }
        const key = positionKey(next);
        next.history = state.history.concat([key]);
        if (next.history.filter(k => k === key).length >= 4) {
            next.result = { winner: 0, reason: "repetition" };
            return next;
        }
        if (legalMoves(next).length === 0) {
            next.result = { winner: side, reason: inCheck(next, -side) ? "checkmate" : "nomoves" };
            return next;
        }
        if (next.ply >= MAX_PLY) {
            next.result = { winner: 0, reason: "maxply" };
        }
        return next;
    }

    // ---------- CPU ----------
    // 評価：駒の 価値 ＋ 持ち駒 ＋ 前へ 出た 度合い ＋ 本陣への せまり ＋ 司令官の 安全
    function evaluate(state, side) {
        const board = state.board;
        let score = 0;
        for (let sq = 0; sq < CELLS; sq += 1) {
            const p = board[sq];
            if (p === 0) {
                continue;
            }
            const s = sideOf(p);
            const kind = kindOf(p);
            const v = VALUE[Math.abs(p) & 31] || VALUE[kind] || 0;
            const y = yOf(sq);
            const advance = s === SENTE ? 8 - y : y; // 0〜8
            let bonus = 0;
            if (kind === INF || kind === CAV || kind === ART) {
                bonus += advance * 6;
            }
            if (kind === FTR || kind === BMB) {
                // 飛行機は 前に 出るほど、爆撃機は 真下に 敵が いると 加点
                bonus += advance * 4;
                if (kind === BMB && sideOf(board[sq - LAYER_CELLS]) === -s) {
                    bonus += 30;
                }
            }
            if (kind !== CMD && layerOf(sq) === GROUND) {
                // 相手の 本陣に 近いほど 少し 加点（占領の ねらい）
                const h = honjinOf(-s);
                const dist = Math.max(Math.abs(xOf(sq) - xOf(h)), Math.abs(y - yOf(h)));
                bonus += Math.max(0, 6 - dist) * 8;
            }
            score += s * (v + bonus);
        }
        [SENTE, GOTE].forEach(s => {
            HAND_TYPES.forEach(kind => {
                score += s * state.hands[s][kind] * VALUE[kind] * 0.97;
            });
            // 司令官の まわりの 味方（守り）
            const c = findCommander(board, s);
            if (c >= 0) {
                let guards = 0;
                DIRS8.forEach(([dx, dy]) => {
                    const nx = xOf(c) + dx;
                    const ny = yOf(c) + dy;
                    if (inside(nx, ny) && sideOf(board[idx(GROUND, nx, ny)]) === s) {
                        guards += 1;
                    }
                });
                score += s * Math.min(guards, 4) * 25;
                if (groundAttacked(board, c, -s)) {
                    score -= s * 60;
                }
            }
            // 自分の 本陣の となりに 敵が いると 危ない
            const h = honjinOf(s);
            DIRS8.concat([[0, 0]]).forEach(([dx, dy]) => {
                const nx = xOf(h) + dx;
                const ny = yOf(h) + dy;
                if (inside(nx, ny) && sideOf(board[idx(GROUND, nx, ny)]) === -s) {
                    score -= s * 70;
                }
            });
        });
        return score * side;
    }

    function moveScore(state, move) {
        if (move.kind === "drop") {
            return 0;
        }
        const target = state.board[move.to];
        let s = 0;
        if (target !== 0) {
            s += 10000 + (VALUE[Math.abs(target) & 31] || 0) - (move.kind === "shot" ? 0 : (VALUE[Math.abs(state.board[move.from]) & 31] || 0) / 10);
        }
        if (move.promote) {
            s += 3000;
        }
        return s;
    }

    function orderMoves(state, moves) {
        return moves.map(m => ({ m, s: moveScore(state, m) })).sort((a, b) => b.s - a.s).map(e => e.m);
    }

    const WIN = 1000000;

    // 読みの 中で 使う 局面（盤を 1 つだけ 持ち、doMove / undoMove で 行き来する）
    // 勝ち負け：司令官を 取る・本陣に 居座られる（相手の 駒が 自分の 本陣に いる まま 手番が 来た）・指す 手が ない
    function search(pos, side, depth, alpha, beta, ctx, ply) {
        ctx.nodes += 1;
        if (ctx.deadline && (ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) {
            ctx.stopped = true;
        }
        if (ctx.stopped) {
            return 0;
        }
        // 本陣占領：自分の 手番に 自分の 本陣に 敵が いれば、この 手で どかさないと 負け
        if (depth <= 0) {
            return quiesce(pos, side, alpha, beta, ctx, 4, ply);
        }
        const honjin = honjinOf(side);
        const occupied = sideOf(pos.board[honjin]) === -side;
        let moves = filterLegal(pos, side, pseudoMoves(pos, side));
        if (moves.length === 0) {
            return -(WIN - ply);
        }
        moves = orderMoves(pos, moves, ctx.killers[ply]);
        // 打つ 手は とても 多いので、浅い ところでは 絞る
        if (depth <= 1) {
            let drops = 0;
            moves = moves.filter(m => m.kind !== "drop" || (drops += 1) % 5 === 1);
        }
        let best = -Infinity;
        for (const move of moves) {
            const undo = doMove(pos, move, side);
            let score;
            if (kindOf(undo.captured) === CMD) {
                score = WIN - ply;
            } else if (occupied && sideOf(pos.board[honjin]) === -side) {
                score = -(WIN - ply); // 本陣の 敵を どかせなかった
            } else if (sideOf(pos.board[honjinOf(-side)]) === side && move.to === honjinOf(-side)) {
                // 相手の 本陣に 入った：相手が どかせるか 1 手 先を 読む
                score = -search(pos, -side, Math.max(1, depth - 1), -beta, -alpha, ctx, ply + 1);
            } else {
                score = -search(pos, -side, depth - 1, -beta, -alpha, ctx, ply + 1);
            }
            undoMove(pos, undo);
            if (ctx.stopped) {
                return best === -Infinity ? 0 : best;
            }
            if (score > best) {
                best = score;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                if (move.kind !== "drop" && pos.board[move.to] === 0) {
                    ctx.killers[ply] = move;
                }
                break;
            }
        }
        return best;
    }

    // 取り合いだけ 先を 読む（取って 取られて の 損得を 見落とさない）
    function quiesce(pos, side, alpha, beta, ctx, depth, ply) {
        ctx.nodes += 1;
        // 自分の 本陣に 敵が いる まま 読みを 止めると 見落とすので、大きく 減点
        const occupiedPenalty = sideOf(pos.board[honjinOf(side)]) === -side ? 5000 : 0;
        const stand = evaluate(pos, side) - occupiedPenalty;
        if (depth <= 0 || stand >= beta) {
            return stand;
        }
        if (stand > alpha) {
            alpha = stand;
        }
        const captures = orderMoves(pos, pseudoMoves(pos, side).filter(m => m.kind !== "drop" && sideOf(pos.board[m.to]) === -side));
        for (const move of captures) {
            const undo = doMove(pos, move, side);
            let score;
            if (kindOf(undo.captured) === CMD) {
                score = WIN - ply;
            } else if (inCheck(pos, side)) {
                undoMove(pos, undo);
                continue; // 自分の 司令官を 取られる 手は 指さない
            } else {
                score = -quiesce(pos, -side, -beta, -alpha, ctx, depth - 1, ply + 1);
            }
            undoMove(pos, undo);
            if (score >= beta) {
                return score;
            }
            if (score > alpha) {
                alpha = score;
            }
        }
        return alpha;
    }

    function moveScore(pos, move, killer) {
        if (move.kind === "drop") {
            return 0;
        }
        const target = pos.board[move.to];
        let s = 0;
        if (target !== 0) {
            s += 10000 + (VALUE[Math.abs(target) & 31] || 0) * 2 - (move.kind === "shot" ? 0 : (VALUE[Math.abs(pos.board[move.from]) & 31] || 0) / 10);
        }
        if (move.promote) {
            s += 3000;
        }
        if (killer && killer.kind === move.kind && killer.from === move.from && killer.to === move.to) {
            s += 5000;
        }
        return s;
    }

    function orderMoves(pos, moves, killer) {
        return moves.map(m => ({ m, s: moveScore(pos, m, killer) })).sort((a, b) => b.s - a.s).map(e => e.m);
    }

    // 強さ：depth は 読む 深さ、noise は 迷い（大きいほど 弱い）、time は 考える 時間の 上限（ミリ秒）
    const LEVELS = {
        easy: { label: "やさしい", depth: 1, noise: 260, time: 800 },
        normal: { label: "ふつう", depth: 3, noise: 40, time: 2500 },
        hard: { label: "つよい", depth: 4, noise: 0, time: 6000 }
    };

    function chooseMove(state, level = "normal", rng = Math.random) {
        const config = LEVELS[level] || LEVELS.normal;
        const side = state.turn;
        const pos = cloneState(state);
        const legal = legalMoves(pos, side);
        if (legal.length === 0) {
            return null;
        }
        const ctx = { nodes: 0, deadline: Date.now() + config.time, stopped: false, killers: [] };
        let ranked = orderMoves(pos, legal).map(m => ({ m, s: 0 }));
        for (let depth = 1; depth <= config.depth; depth += 1) {
            const scored = [];
            let alpha = -Infinity;
            for (const { m } of ranked) {
                // 本当の ルールで 1 手 進めて、くり返し・本陣占領なども 正しく 判定する
                const next = play(state, m);
                let s;
                if (next.result) {
                    s = next.result.winner === side ? WIN : next.result.winner === 0 ? -50 : -WIN;
                } else {
                    const inner = cloneState(next);
                    s = -search(inner, -side, depth - 1, -Infinity, alpha === -Infinity ? Infinity : -alpha + 400, ctx, 1);
                    // 同じ 局面に もどる 手は、有利なら 避ける（追いかけっこで 千日手に ならないように）
                    const key = next.history[next.history.length - 1];
                    const seen = next.history.filter(k => k === key).length - 1;
                    if (seen > 0 && s > -200) {
                        s = Math.min(s, 0) - 40 * seen;
                    }
                }
                if (ctx.stopped && depth > 1) {
                    break;
                }
                alpha = Math.max(alpha, s);
                scored.push({ m, s: s + (config.noise ? (rng() - 0.5) * config.noise : 0) });
            }
            if (ctx.stopped && depth > 1) {
                break;
            }
            scored.sort((a, b) => b.s - a.s);
            ranked = scored;
            if (ranked[0].s >= WIN - 10) {
                break;
            }
        }
        return ranked[0].m;
    }

    // ---------- 表示用 ----------
    function pieceInfo(p) {
        const kind = kindOf(p);
        const info = PIECES[kind];
        if (!info) {
            return null;
        }
        const promoted = isPromoted(p) && info.promoted;
        return {
            kind,
            key: info.key,
            side: sideOf(p),
            promoted: Boolean(promoted),
            name: promoted ? info.promoted.name : info.name,
            short: promoted ? info.promoted.short : info.short,
            text: promoted ? info.promoted.text : info.text
        };
    }

    // 棋譜の 表記（例：▲地上 5五 戦車、△空 3三 爆撃機 → 爆撃）
    function describeMove(state, move) {
        const side = state.turn;
        const mark = side === SENTE ? "▲" : "△";
        const where = sq => `${LAYER_NAMES[layerOf(sq)]}${SIZE - xOf(sq)}${"一二三四五六七八九"[yOf(sq)]}`;
        if (move.kind === "drop") {
            return `${mark}${where(move.to)} ${PIECES[move.piece].name} 打`;
        }
        const piece = pieceInfo(state.board[move.from]);
        if (move.kind === "shot") {
            const target = pieceInfo(state.board[move.to]);
            const verb = piece.kind === BMB ? "爆撃" : piece.kind === AA ? "対空射撃" : "砲撃";
            return `${mark}${piece.name}（${where(move.from)}）${verb} → ${where(move.to)} ${target ? target.name : ""}`;
        }
        const captured = state.board[move.to] ? ` ${pieceInfo(state.board[move.to]).name}を 取る` : "";
        return `${mark}${where(move.to)} ${piece.name}${move.promote ? " 成" : ""}${captured}`;
    }

    return {
        SIZE, LAYER_CELLS, CELLS, UNDER, GROUND, SKY, LAYER_NAMES, SENTE, GOTE,
        CMD, INF, TNK, CAV, ART, AA, ENG, FTR, BMB, PROMOTED, HAND_TYPES, PIECES, VALUE, LEVELS, MAX_PLY,
        idx, layerOf, xOf, yOf, sideOf, kindOf, isPromoted, isAir, inOwnCamp, inEnemyCamp, honjinOf,
        initialState, cloneState, legalMoves, pseudoMoves, play, inCheck, findCommander, groundAttacked,
        evaluate, chooseMove, pieceInfo, describeMove, positionKey
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = createSankaiEngine;
} else if (typeof window !== "undefined") {
    window.createSankaiEngine = createSankaiEngine;
    window.SankaiEngine = createSankaiEngine();
}
