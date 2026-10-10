// うつろい（UTSUROI）のルールと CPU。画面には依存しない。
// ブラウザでは window.UtsuroiEngine、Node では module.exports で使える。
// CPU を Web Worker で動かすとき、この関数の中身を文字列にして渡すため、
// createUtsuroiEngine の外側の変数を参照してはいけない。
function createUtsuroiEngine() {
    "use strict";

    // ---------- 盤と駒 ----------
    const SIZE = 7;
    const CELLS = SIZE * SIZE;
    const CENTER = (CELLS - 1) / 2;

    // 床の紋。駒が床を離れると 十 → 斜 → 跳 → 走 → 十 … と 1 段階変わる
    const TILE = { CROSS: 0, DIAG: 1, LEAP: 2, RUN: 3 };
    const TILE_TYPES = 4;
    const TILE_INFO = [
        { key: "cross", kanji: "十", reading: "じゅう", text: "縦横に1マス" },
        { key: "diag", kanji: "斜", reading: "しゃ", text: "斜めに1マス" },
        { key: "leap", kanji: "跳", reading: "ちょう", text: "桂馬の形に跳ぶ（8方向・間の駒は飛び越える）" },
        { key: "run", kanji: "走", reading: "そう", text: "縦横にどこまでも（駒は飛び越えない）" }
    ];

    // 先手 = 黒（下側・上へ進む）、後手 = 白（上側・下へ進む）
    const BLACK = 1;
    const WHITE = -1;
    const STONE = 1;
    const KING = 2;

    // 合計この手数に達したら、残りの駒が多い方の勝ち（同数なら引き分け）
    const MAX_PLY = 100;

    const rowOf = index => Math.floor(index / SIZE);
    const colOf = index => index % SIZE;
    const goalRow = side => (side === BLACK ? 0 : SIZE - 1);
    // 勝ち方と王の動き。arrival: "throne"＝相手の玉座（王の初期位置）に着いたら勝ち
    // （ほかに "row"＝相手の最奥列 / "none"＝到達勝ちなし。AI 同士の対局で比べた結果、throne を採用）
    // kingStep: true＝王だけは床に関係なく周囲 1 歩（false だと王も床に従う。先手が速攻で勝てる盤が多かった）
    const RULES = { arrival: "throne", kingStep: true };
    // 駒の動きの種類：普通は床の紋。kingStep のとき王だけは常に周囲 1 歩
    const moveKind = (piece, tile) => (RULES.kingStep && (piece === KING || piece === -KING) ? KING_STEP : tile);
    const throneOf = side => goalRow(side) * SIZE + Math.floor(SIZE / 2);
    function isArrival(piece, side, to) {
        if (piece !== side * KING) {
            return false;
        }
        if (RULES.arrival === "row") {
            return rowOf(to) === goalRow(side);
        }
        if (RULES.arrival === "throne") {
            return to === throneOf(side);
        }
        return false;
    }
    const homeRow = side => (side === BLACK ? SIZE - 1 : 0);

    // ---------- 移動先の表（起動時に 1 回だけ作る） ----------
    const OFFSETS = [
        [[-1, 0], [1, 0], [0, -1], [0, 1]],
        [[-1, -1], [-1, 1], [1, -1], [1, 1]],
        [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
    ];
    // 4 番目は王の動き（周囲 8 マスに 1 歩）。走（RUN）は RAYS を使うので空
    const KING_STEP = 4;
    OFFSETS.push([]);
    OFFSETS.push(OFFSETS[0].concat(OFFSETS[1]));
    const STEP_TARGETS = OFFSETS.map(offsets => {
        const table = [];
        for (let index = 0; index < CELLS; index += 1) {
            const r = rowOf(index);
            const c = colOf(index);
            const targets = [];
            offsets.forEach(([dr, dc]) => {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
                    targets.push(nr * SIZE + nc);
                }
            });
            table.push(targets);
        }
        return table;
    });
    const RAYS = [];
    for (let index = 0; index < CELLS; index += 1) {
        const r = rowOf(index);
        const c = colOf(index);
        RAYS.push(OFFSETS[0].map(([dr, dc]) => {
            const ray = [];
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
                ray.push(nr * SIZE + nc);
                nr += dr;
                nc += dc;
            }
            return ray;
        }));
    }

    // ---------- 乱数（盤面コードから同じ盤を作れるようにする） ----------
    function mulberry32(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randomSeed() {
        return Math.floor(Math.random() * 0x7fffffff) + 1;
    }

    // 盤面コード：seed を 36 進数の大文字で表したもの（例 "K3Z9QA"）
    function seedToCode(seed) {
        return (seed >>> 0).toString(36).toUpperCase();
    }

    function codeToSeed(code) {
        if (typeof code !== "string") {
            return null;
        }
        const cleaned = code.trim().toLowerCase();
        if (!/^[0-9a-z]{1,7}$/.test(cleaned)) {
            return null;
        }
        const seed = Number.parseInt(cleaned, 36);
        return seed > 0 && seed <= 0x7fffffff ? seed : null;
    }

    // ---------- 盤の床を作る ----------
    // ・点対称（盤を 180 度回すと同じ）なので、先手と後手は完全に同じ条件
    // ・最初に駒が並ぶ列には「走」を置かない（1 手目でいきなり取られるのを防ぐ）
    // ・4 種類の床の数が偏りすぎないようにする
    function generateTiles(seed) {
        const rng = mulberry32(seed);
        for (let attempt = 0; attempt < 1000; attempt += 1) {
            const tiles = new Int8Array(CELLS);
            for (let index = 0; index <= CENTER; index += 1) {
                const onHomeRow = rowOf(index) === 0;
                const tile = onHomeRow
                    ? Math.floor(rng() * (TILE_TYPES - 1))
                    : Math.floor(rng() * TILE_TYPES);
                tiles[index] = tile;
                tiles[CELLS - 1 - index] = tile;
            }

            const counts = [0, 0, 0, 0];
            tiles.forEach(tile => {
                counts[tile] += 1;
            });
            if (counts.every(count => count >= 9 && count <= 15)) {
                return tiles;
            }
        }
        throw new Error("Could not generate a board");
    }

    function newGame(seed) {
        const actualSeed = seed || randomSeed();
        const tiles = generateTiles(actualSeed);
        const board = new Int8Array(CELLS);
        const middle = Math.floor(SIZE / 2);
        for (let c = 0; c < SIZE; c += 1) {
            board[homeRow(WHITE) * SIZE + c] = c === middle ? WHITE * KING : WHITE * STONE;
            board[homeRow(BLACK) * SIZE + c] = c === middle ? BLACK * KING : BLACK * STONE;
        }

        return {
            seed: actualSeed,
            tiles: Array.from(tiles),
            board: Array.from(board),
            turn: BLACK,
            ply: 0,
            result: null,
            lastMove: null
        };
    }

    function clonePosition(position) {
        return {
            seed: position.seed,
            tiles: position.tiles.slice(),
            board: position.board.slice(),
            turn: position.turn,
            ply: position.ply,
            result: position.result ? Object.assign({}, position.result) : null,
            lastMove: position.lastMove ? Object.assign({}, position.lastMove) : null
        };
    }

    // ---------- 合法手 ----------
    function movesFrom(board, tiles, from) {
        const piece = board[from];
        if (piece === 0) {
            return [];
        }
        const side = piece > 0 ? BLACK : WHITE;
        const tile = moveKind(piece, tiles[from]);
        const targets = [];

        if (tile === TILE.RUN) {
            RAYS[from].forEach(ray => {
                for (let k = 0; k < ray.length; k += 1) {
                    const sq = ray[k];
                    if (board[sq] === 0) {
                        targets.push(sq);
                    } else {
                        if (board[sq] * side < 0) {
                            targets.push(sq);
                        }
                        break;
                    }
                }
            });
        } else {
            STEP_TARGETS[tile][from].forEach(sq => {
                if (board[sq] * side <= 0) {
                    targets.push(sq);
                }
            });
        }

        return targets;
    }

    function legalMoves(position) {
        if (position.result) {
            return [];
        }
        const moves = [];
        for (let from = 0; from < CELLS; from += 1) {
            if (position.board[from] * position.turn > 0) {
                movesFrom(position.board, position.tiles, from).forEach(to => {
                    moves.push({ from, to });
                });
            }
        }
        return moves;
    }

    function countPieces(board, side) {
        let count = 0;
        for (let i = 0; i < CELLS; i += 1) {
            if (board[i] * side > 0) {
                count += 1;
            }
        }
        return count;
    }

    // 手を指した後の局面を新しく作って返す（元の局面は変えない）
    function applyMove(position, move) {
        if (position.result) {
            throw new Error("The game is already over");
        }
        const legal = legalMoves(position).some(m => m.from === move.from && m.to === move.to);
        if (!legal) {
            throw new Error("Illegal move");
        }

        const next = clonePosition(position);
        const mover = position.turn;
        const piece = next.board[move.from];
        const captured = next.board[move.to];

        next.board[move.to] = piece;
        next.board[move.from] = 0;
        const tileBefore = next.tiles[move.from];
        next.tiles[move.from] = (tileBefore + 1) % TILE_TYPES;
        next.turn = -mover;
        next.ply = position.ply + 1;
        next.lastMove = {
            from: move.from,
            to: move.to,
            piece,
            captured,
            tileBefore,
            tileAfter: next.tiles[move.from]
        };

        if (captured === -mover * KING) {
            next.result = { winner: mover, reason: "capture" };
        } else if (isArrival(piece, mover, move.to)) {
            next.result = { winner: mover, reason: "arrival" };
        } else if (next.ply >= MAX_PLY) {
            const mine = countPieces(next.board, mover);
            const theirs = countPieces(next.board, -mover);
            next.result = {
                winner: mine === theirs ? 0 : (mine > theirs ? mover : -mover),
                reason: "limit"
            };
        } else if (legalMoves(next).length === 0) {
            next.result = { winner: mover, reason: "stalemate" };
        }

        return next;
    }

    // 入れ替えルール：先手の 1 手目の後、後手は「先手の側を引き受ける」ことができる。
    // 盤上は何も変わらず、両者の担当する色だけが入れ替わる（画面側で扱う）。
    function canOfferSwap(position) {
        return position.ply === 1 && !position.result;
    }

    // ---------- CPU（アルファベータ探索） ----------
    const WIN = 1000000;
    const WIN_THRESHOLD = WIN - 1000;
    const STONE_VALUE = 100;
    const DEFAULT_WEIGHTS = {
        tileStone: [4, 4, 12, 16],
        tileKing: [6, 6, 14, 18],
        kingAdvance: 5,
        mobility: 3,
        threat: 6,
        tempo: 8
    };

    // 同一局面の判定用（Zobrist ハッシュ）。乱数は固定 seed なので毎回同じ
    const zobristRng = mulberry32(0x5EED1234);
    const rand32 = () => (Math.floor(zobristRng() * 4294967296) | 0);
    const PIECE_SLOTS = 4; // 黒の石・黒の王・白の石・白の王
    const pieceSlot = piece => (piece === 1 ? 0 : piece === 2 ? 1 : piece === -1 ? 2 : 3);
    const ZP1 = new Int32Array(CELLS * PIECE_SLOTS);
    const ZP2 = new Int32Array(CELLS * PIECE_SLOTS);
    const ZT1 = new Int32Array(CELLS * TILE_TYPES);
    const ZT2 = new Int32Array(CELLS * TILE_TYPES);
    for (let i = 0; i < ZP1.length; i += 1) {
        ZP1[i] = rand32();
        ZP2[i] = rand32();
    }
    for (let i = 0; i < ZT1.length; i += 1) {
        ZT1[i] = rand32();
        ZT2[i] = rand32();
    }
    const ZSIDE1 = rand32();
    const ZSIDE2 = rand32();

    const TT_BITS = 19;
    const TT_SIZE = 1 << TT_BITS;
    const TT_MASK = TT_SIZE - 1;
    const TT_EXACT = 1;
    const TT_LOWER = 2;
    const TT_UPPER = 3;
    let ttKey = null;
    let ttCheck = null;
    let ttDepth = null;
    let ttFlag = null;
    let ttScore = null;
    let ttMove = null;

    function ensureTable() {
        if (ttKey) {
            return;
        }
        ttKey = new Int32Array(TT_SIZE);
        ttCheck = new Int32Array(TT_SIZE);
        ttDepth = new Int8Array(TT_SIZE);
        ttFlag = new Int8Array(TT_SIZE);
        ttScore = new Int32Array(TT_SIZE);
        ttMove = new Int16Array(TT_SIZE);
    }

    function clearTable() {
        if (ttFlag) {
            ttFlag.fill(0);
        }
    }

    const MAX_SEARCH_PLY = 64;

    // 探索 1 回分の作業領域
    function createSearcher(position, options) {
        const board = Int8Array.from(position.board);
        const tiles = Int8Array.from(position.tiles);
        const weights = Object.assign({}, DEFAULT_WEIGHTS, options.weights || {});
        let side = position.turn;
        let h1 = 0;
        let h2 = 0;
        for (let i = 0; i < CELLS; i += 1) {
            if (board[i] !== 0) {
                h1 ^= ZP1[i * PIECE_SLOTS + pieceSlot(board[i])];
                h2 ^= ZP2[i * PIECE_SLOTS + pieceSlot(board[i])];
            }
            h1 ^= ZT1[i * TILE_TYPES + tiles[i]];
            h2 ^= ZT2[i * TILE_TYPES + tiles[i]];
        }
        if (side === WHITE) {
            h1 ^= ZSIDE1;
            h2 ^= ZSIDE2;
        }

        const moveBuffers = [];
        const scoreBuffers = [];
        for (let p = 0; p <= MAX_SEARCH_PLY + 16; p += 1) {
            moveBuffers.push(new Int32Array(160));
            scoreBuffers.push(new Int32Array(160));
        }
        const killers = new Int32Array((MAX_SEARCH_PLY + 1) * 2).fill(-1);
        const historyScores = new Int32Array(64 * 64);
        const basePly = position.ply;
        const deadline = options.deadline || Infinity;
        let nodes = 0;
        let stopped = false;

        function generate(forSide, out, capturesOnly) {
            let n = 0;
            for (let from = 0; from < CELLS; from += 1) {
                if (board[from] * forSide <= 0) {
                    continue;
                }
                const tile = moveKind(board[from], tiles[from]);
                if (tile === TILE.RUN) {
                    const rays = RAYS[from];
                    for (let d = 0; d < 4; d += 1) {
                        const ray = rays[d];
                        for (let k = 0; k < ray.length; k += 1) {
                            const sq = ray[k];
                            const target = board[sq];
                            if (target === 0) {
                                if (!capturesOnly) {
                                    out[n++] = (from << 6) | sq;
                                }
                            } else {
                                if (target * forSide < 0) {
                                    out[n++] = (from << 6) | sq;
                                }
                                break;
                            }
                        }
                    }
                } else {
                    const targets = STEP_TARGETS[tile][from];
                    for (let k = 0; k < targets.length; k += 1) {
                        const sq = targets[k];
                        const target = board[sq];
                        if (target === 0 ? !capturesOnly : target * forSide < 0) {
                            out[n++] = (from << 6) | sq;
                        }
                    }
                }
            }
            return n;
        }

        // 動ける手の数と、取れる相手の駒の数を数える（評価用）
        function mobilityAndThreats(forSide) {
            let moves = 0;
            let threats = 0;
            for (let from = 0; from < CELLS; from += 1) {
                if (board[from] * forSide <= 0) {
                    continue;
                }
                const tile = moveKind(board[from], tiles[from]);
                if (tile === TILE.RUN) {
                    const rays = RAYS[from];
                    for (let d = 0; d < 4; d += 1) {
                        const ray = rays[d];
                        for (let k = 0; k < ray.length; k += 1) {
                            const target = board[ray[k]];
                            if (target === 0) {
                                moves += 1;
                            } else {
                                if (target * forSide < 0) {
                                    moves += 1;
                                    threats += 1;
                                }
                                break;
                            }
                        }
                    }
                } else {
                    const targets = STEP_TARGETS[tile][from];
                    for (let k = 0; k < targets.length; k += 1) {
                        const target = board[targets[k]];
                        if (target === 0) {
                            moves += 1;
                        } else if (target * forSide < 0) {
                            moves += 1;
                            threats += 1;
                        }
                    }
                }
            }
            return moves * 1000 + threats;
        }

        function evaluate() {
            let score = 0;
            for (let i = 0; i < CELLS; i += 1) {
                const piece = board[i];
                if (piece === 0) {
                    continue;
                }
                const tile = tiles[i];
                if (piece === 1) {
                    score += STONE_VALUE + weights.tileStone[tile];
                } else if (piece === -1) {
                    score -= STONE_VALUE + weights.tileStone[tile];
                } else if (piece === 2) {
                    score += weights.tileKing[tile] + weights.kingAdvance * (SIZE - 1 - rowOf(i));
                } else {
                    score -= weights.tileKing[tile] + weights.kingAdvance * rowOf(i);
                }
            }
            const black = mobilityAndThreats(BLACK);
            const white = mobilityAndThreats(WHITE);
            score += weights.mobility * (Math.floor(black / 1000) - Math.floor(white / 1000));
            score += weights.threat * ((black % 1000) - (white % 1000));
            return side * score + weights.tempo;
        }

        function makeMove(move) {
            const from = move >> 6;
            const to = move & 63;
            const piece = board[from];
            const captured = board[to];
            const oldTile = tiles[from];
            const newTile = (oldTile + 1) & 3;

            const fromSlot = from * PIECE_SLOTS + pieceSlot(piece);
            const toSlot = to * PIECE_SLOTS + pieceSlot(piece);
            h1 ^= ZP1[fromSlot] ^ ZP1[toSlot];
            h2 ^= ZP2[fromSlot] ^ ZP2[toSlot];
            if (captured !== 0) {
                const capSlot = to * PIECE_SLOTS + pieceSlot(captured);
                h1 ^= ZP1[capSlot];
                h2 ^= ZP2[capSlot];
            }
            h1 ^= ZT1[from * TILE_TYPES + oldTile] ^ ZT1[from * TILE_TYPES + newTile] ^ ZSIDE1;
            h2 ^= ZT2[from * TILE_TYPES + oldTile] ^ ZT2[from * TILE_TYPES + newTile] ^ ZSIDE2;

            board[to] = piece;
            board[from] = 0;
            tiles[from] = newTile;
            side = -side;
            return captured;
        }

        function unmakeMove(move, captured) {
            const from = move >> 6;
            const to = move & 63;
            const piece = board[to];
            const newTile = tiles[from];
            const oldTile = (newTile + 3) & 3;

            side = -side;
            tiles[from] = oldTile;
            board[from] = piece;
            board[to] = captured;

            const fromSlot = from * PIECE_SLOTS + pieceSlot(piece);
            const toSlot = to * PIECE_SLOTS + pieceSlot(piece);
            h1 ^= ZP1[fromSlot] ^ ZP1[toSlot];
            h2 ^= ZP2[fromSlot] ^ ZP2[toSlot];
            if (captured !== 0) {
                const capSlot = to * PIECE_SLOTS + pieceSlot(captured);
                h1 ^= ZP1[capSlot];
                h2 ^= ZP2[capSlot];
            }
            h1 ^= ZT1[from * TILE_TYPES + oldTile] ^ ZT1[from * TILE_TYPES + newTile] ^ ZSIDE1;
            h2 ^= ZT2[from * TILE_TYPES + oldTile] ^ ZT2[from * TILE_TYPES + newTile] ^ ZSIDE2;
        }

        // その手で即座に勝つか（王を取る・王が相手の最奥列に着く）
        function isWinningMove(move) {
            const from = move >> 6;
            const to = move & 63;
            if (board[to] === -side * KING) {
                return true;
            }
            return isArrival(board[from], side, to);
        }

        function limitScore(ply) {
            let mine = 0;
            let theirs = 0;
            for (let i = 0; i < CELLS; i += 1) {
                if (board[i] * side > 0) {
                    mine += 1;
                } else if (board[i] !== 0) {
                    theirs += 1;
                }
            }
            if (mine === theirs) {
                return 0;
            }
            return mine > theirs ? WIN - ply : -(WIN - ply);
        }

        function orderMoves(moves, scores, count, ply, ttBest) {
            for (let i = 0; i < count; i += 1) {
                const move = moves[i];
                const from = move >> 6;
                const to = move & 63;
                let score;
                if (move === ttBest) {
                    score = 1 << 30;
                } else if (board[to] !== 0) {
                    score = (1 << 28) + (board[to] === 2 || board[to] === -2 ? 1 << 20 : 0)
                        - Math.abs(board[from]) * 10 + tiles[to] * 4;
                } else if (move === killers[ply * 2] || move === killers[ply * 2 + 1]) {
                    score = 1 << 26;
                } else {
                    score = historyScores[(from << 6) | to] + tiles[to] * 3;
                }
                scores[i] = score;
            }
        }

        function pickNext(moves, scores, start, count) {
            let best = start;
            for (let i = start + 1; i < count; i += 1) {
                if (scores[i] > scores[best]) {
                    best = i;
                }
            }
            if (best !== start) {
                const m = moves[start];
                moves[start] = moves[best];
                moves[best] = m;
                const s = scores[start];
                scores[start] = scores[best];
                scores[best] = s;
            }
            return moves[start];
        }

        function checkTime() {
            if ((nodes & 2047) === 0 && Date.now() > deadline) {
                stopped = true;
            }
        }

        function quiesce(alpha, beta, ply, qdepth) {
            nodes += 1;
            checkTime();
            if (stopped) {
                return 0;
            }
            if (basePly + ply >= MAX_PLY) {
                return limitScore(ply);
            }

            const moves = moveBuffers[ply];
            const count = generate(side, moves, false);
            if (count === 0) {
                return -(WIN - ply);
            }
            for (let i = 0; i < count; i += 1) {
                if (isWinningMove(moves[i])) {
                    return WIN - ply;
                }
            }

            const standPat = evaluate();
            if (standPat >= beta || qdepth <= 0 || ply >= MAX_SEARCH_PLY) {
                return standPat;
            }
            if (standPat > alpha) {
                alpha = standPat;
            }

            const captures = moveBuffers[ply];
            const scores = scoreBuffers[ply];
            const captureCount = generate(side, captures, true);
            orderMoves(captures, scores, captureCount, ply, -1);
            for (let i = 0; i < captureCount; i += 1) {
                const move = pickNext(captures, scores, i, captureCount);
                const captured = makeMove(move);
                const score = -quiesce(-beta, -alpha, ply + 1, qdepth - 1);
                unmakeMove(move, captured);
                if (stopped) {
                    return 0;
                }
                if (score >= beta) {
                    return score;
                }
                if (score > alpha) {
                    alpha = score;
                }
            }
            return alpha;
        }

        function scoreToTable(score, ply) {
            if (score > WIN_THRESHOLD) {
                return score + ply;
            }
            if (score < -WIN_THRESHOLD) {
                return score - ply;
            }
            return score;
        }

        function scoreFromTable(score, ply) {
            if (score > WIN_THRESHOLD) {
                return score - ply;
            }
            if (score < -WIN_THRESHOLD) {
                return score + ply;
            }
            return score;
        }

        function negamax(depth, alpha, beta, ply) {
            if (depth <= 0) {
                return quiesce(alpha, beta, ply, 6);
            }
            nodes += 1;
            checkTime();
            if (stopped) {
                return 0;
            }
            if (basePly + ply >= MAX_PLY) {
                return limitScore(ply);
            }

            const slot = h1 & TT_MASK;
            let ttBest = -1;
            if (ttFlag[slot] !== 0 && ttKey[slot] === h1 && ttCheck[slot] === h2) {
                ttBest = ttMove[slot];
                if (ttDepth[slot] >= depth) {
                    const stored = scoreFromTable(ttScore[slot], ply);
                    const flag = ttFlag[slot];
                    if (flag === TT_EXACT
                        || (flag === TT_LOWER && stored >= beta)
                        || (flag === TT_UPPER && stored <= alpha)) {
                        return stored;
                    }
                }
            }

            const moves = moveBuffers[ply];
            const scores = scoreBuffers[ply];
            const count = generate(side, moves, false);
            if (count === 0) {
                return -(WIN - ply);
            }
            for (let i = 0; i < count; i += 1) {
                if (isWinningMove(moves[i])) {
                    return WIN - ply;
                }
            }

            orderMoves(moves, scores, count, ply, ttBest);
            const alphaStart = alpha;
            let bestScore = -Infinity;
            let bestMove = -1;

            for (let i = 0; i < count; i += 1) {
                const move = pickNext(moves, scores, i, count);
                const captured = makeMove(move);
                let score;
                if (i === 0) {
                    score = -negamax(depth - 1, -beta, -alpha, ply + 1);
                } else {
                    // 2 手目以降はまず狭い窓で調べ、良さそうなときだけ調べ直す
                    score = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
                    if (score > alpha && score < beta) {
                        score = -negamax(depth - 1, -beta, -alpha, ply + 1);
                    }
                }
                unmakeMove(move, captured);
                if (stopped) {
                    return 0;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
                if (score > alpha) {
                    alpha = score;
                }
                if (alpha >= beta) {
                    if (captured === 0) {
                        if (killers[ply * 2] !== move) {
                            killers[ply * 2 + 1] = killers[ply * 2];
                            killers[ply * 2] = move;
                        }
                        historyScores[move] += depth * depth;
                    }
                    break;
                }
            }

            ttKey[slot] = h1;
            ttCheck[slot] = h2;
            ttDepth[slot] = depth;
            ttMove[slot] = bestMove;
            ttScore[slot] = scoreToTable(bestScore, ply);
            ttFlag[slot] = bestScore <= alphaStart ? TT_UPPER : (bestScore >= beta ? TT_LOWER : TT_EXACT);
            return bestScore;
        }

        // ルートの手をすべて同じ深さで採点する（弱い CPU が「ほどほどの手」を選ぶため）
        function scoreRootMoves(depth) {
            const moves = new Int32Array(160);
            const count = generate(side, moves, false);
            const results = [];
            for (let i = 0; i < count; i += 1) {
                const move = moves[i];
                let score;
                if (isWinningMove(move)) {
                    score = WIN;
                } else {
                    const captured = makeMove(move);
                    score = -negamax(depth - 1, -WIN - 1, WIN + 1, 1);
                    unmakeMove(move, captured);
                }
                results.push({ move, score });
            }
            return results;
        }

        function searchBest(maxDepth) {
            const rootMoves = new Int32Array(160);
            const rootCount = generate(side, rootMoves, false);
            const list = Array.from(rootMoves.subarray(0, rootCount));
            if (list.length === 0) {
                return { move: -1, score: -WIN, depth: 0 };
            }
            const immediate = list.find(isWinningMove);
            if (immediate !== undefined) {
                return { move: immediate, score: WIN, depth: 1 };
            }

            let best = { move: list[0], score: 0, depth: 0 };
            for (let depth = 1; depth <= maxDepth; depth += 1) {
                let alpha = -WIN - 1;
                const beta = WIN + 1;
                let iterationBest = -1;
                let iterationScore = -Infinity;

                for (let i = 0; i < list.length; i += 1) {
                    const move = list[i];
                    const captured = makeMove(move);
                    let score;
                    if (i === 0) {
                        score = -negamax(depth - 1, -beta, -alpha, 1);
                    } else {
                        score = -negamax(depth - 1, -alpha - 1, -alpha, 1);
                        if (score > alpha && score < beta) {
                            score = -negamax(depth - 1, -beta, -alpha, 1);
                        }
                    }
                    unmakeMove(move, captured);
                    if (stopped) {
                        break;
                    }
                    if (score > iterationScore) {
                        iterationScore = score;
                        iterationBest = move;
                    }
                    if (score > alpha) {
                        alpha = score;
                    }
                }

                if (stopped) {
                    // 途中で時間切れでも、最善手が見つかっていればそれを採用する
                    // （最初に調べるのは前回の最善手なので、途中結果でも前回より悪くはならない）
                    if (iterationBest !== -1) {
                        best = { move: iterationBest, score: iterationScore, depth: depth - 1 };
                    }
                    break;
                }

                best = { move: iterationBest, score: iterationScore, depth };
                // 次の反復では最善手を最初に調べる
                const index = list.indexOf(iterationBest);
                list.splice(index, 1);
                list.unshift(iterationBest);

                if (iterationScore > WIN_THRESHOLD || iterationScore < -WIN_THRESHOLD) {
                    break;
                }
            }
            return best;
        }

        return {
            searchBest,
            scoreRootMoves,
            evaluate,
            nodes: () => nodes
        };
    }

    const decodeMove = move => ({ from: move >> 6, to: move & 63 });

    // 強さの設定。noise は評価に加えるゆらぎ（大きいほど人間らしく間違える）
    const LEVELS = {
        easy: { depth: 1, timeMs: 300, noise: 90, label: "やさしい" },
        normal: { depth: 3, timeMs: 800, noise: 18, label: "ふつう" },
        hard: { depth: 30, timeMs: 1500, noise: 0, label: "つよい" }
    };

    // options: { level, depth, timeMs, noise, weights, random }
    function chooseMove(position, options = {}) {
        if (position.result) {
            return null;
        }
        ensureTable();
        const level = LEVELS[options.level] || LEVELS.normal;
        const depth = options.depth || level.depth;
        const timeMs = options.timeMs || level.timeMs;
        const noise = options.noise !== undefined ? options.noise : level.noise;
        const random = options.random || Math.random;
        const started = Date.now();
        const searcher = createSearcher(position, {
            deadline: started + timeMs,
            weights: options.weights
        });

        let result;
        if (noise > 0) {
            // 全部の手を採点し、ゆらぎを加えて一番良く見えた手を選ぶ。
            // ただし「すぐ勝てる手」と「すぐ負ける手」は見逃さない
            const scored = searcher.scoreRootMoves(depth);
            let best = null;
            scored.forEach(entry => {
                const decisive = Math.abs(entry.score) > WIN_THRESHOLD;
                const value = decisive ? entry.score : entry.score + (random() * 2 - 1) * noise;
                if (!best || value > best.value) {
                    best = { move: entry.move, score: entry.score, value };
                }
            });
            result = { move: best.move, score: best.score, depth };
        } else {
            result = searcher.searchBest(depth);
        }

        if (result.move < 0) {
            return null;
        }
        return Object.assign(decodeMove(result.move), {
            score: result.score,
            depth: result.depth,
            nodes: searcher.nodes(),
            timeMs: Date.now() - started
        });
    }

    // 局面の形勢（先手から見た点数）。ヒント表示用
    function evaluatePosition(position) {
        ensureTable();
        const searcher = createSearcher(position, {});
        const score = searcher.evaluate();
        return position.turn === BLACK ? score : -score;
    }

    // 入れ替えルールで CPU が交代するか：先手の 1 手目が有利すぎるなら交代する
    function shouldSwap(position, options = {}) {
        if (!canOfferSwap(position)) {
            return false;
        }
        clearTable();
        const reply = chooseMove(position, Object.assign({ level: "hard", timeMs: 600 }, options, { noise: 0 }));
        // reply.score は後手（手番側）から見た点数。マイナスなら先手側が有利
        return Boolean(reply) && reply.score < -20;
    }

    return {
        SIZE,
        CELLS,
        TILE,
        TILE_INFO,
        TILE_TYPES,
        BLACK,
        WHITE,
        STONE,
        KING,
        MAX_PLY,
        LEVELS,
        rowOf,
        colOf,
        goalRow,
        RULES,
        newGame,
        clonePosition,
        generateTiles,
        movesFrom,
        legalMoves,
        applyMove,
        canOfferSwap,
        chooseMove,
        shouldSwap,
        evaluatePosition,
        clearTable,
        seedToCode,
        codeToSeed,
        randomSeed,
        countPieces
    };
}

if (typeof module === "object" && module.exports) {
    module.exports = createUtsuroiEngine;
} else if (typeof window !== "undefined") {
    window.createUtsuroiEngine = createUtsuroiEngine;
    window.UtsuroiEngine = createUtsuroiEngine();
}
