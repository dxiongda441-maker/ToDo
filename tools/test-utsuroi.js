// うつろい（games/utsuroi）のルールと CPU のテスト。
//
//   node tools/test-utsuroi.js
//
// ライブラリ不要（Node の標準機能だけ）。失敗があれば終了コード 1。
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const createEngine = require(path.join(__dirname, "..", "games", "utsuroi", "engine.js"));

const E = createEngine();
const { BLACK, WHITE, KING, STONE, TILE, SIZE, CELLS, MAX_PLY } = E;
const at = (r, c) => r * SIZE + c;

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

// テスト用：空の盤に駒と床を自由に置いた局面を作る
function makePosition({ pieces = {}, tiles = {}, fill = TILE.CROSS, turn = BLACK, ply = 2 }) {
    const position = E.newGame(1);
    position.board = new Array(CELLS).fill(0);
    position.tiles = new Array(CELLS).fill(fill);
    Object.entries(pieces).forEach(([index, piece]) => {
        position.board[Number(index)] = piece;
    });
    Object.entries(tiles).forEach(([index, tile]) => {
        position.tiles[Number(index)] = tile;
    });
    position.turn = turn;
    position.ply = ply;
    return position;
}

// 王が 2 枚とも必要（王を取る判定のため）。邪魔にならない隅に置く
const kings = { [at(6, 0)]: BLACK * KING, [at(0, 6)]: WHITE * KING };
const targetsOf = (position, from) => E.movesFrom(position.board, position.tiles, from).sort((a, b) => a - b);

console.log("[盤の生成]");

test("床は点対称（先手と後手が同じ条件）", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
        const tiles = E.generateTiles(seed);
        for (let i = 0; i < CELLS; i += 1) {
            assert.equal(tiles[i], tiles[CELLS - 1 - i], `seed ${seed} index ${i}`);
        }
    }
});

test("駒が最初に並ぶ列には『走』がない", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
        const tiles = E.generateTiles(seed);
        for (let c = 0; c < SIZE; c += 1) {
            assert.notEqual(tiles[at(0, c)], TILE.RUN);
            assert.notEqual(tiles[at(SIZE - 1, c)], TILE.RUN);
        }
    }
});

test("4 種類の床の数が偏りすぎない", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
        const counts = [0, 0, 0, 0];
        E.generateTiles(seed).forEach(tile => {
            counts[tile] += 1;
        });
        counts.forEach(count => assert.ok(count >= 9 && count <= 15, `seed ${seed}: ${counts}`));
    }
});

test("同じ盤面コードからは同じ盤ができる", () => {
    const a = E.newGame(123456);
    const b = E.newGame(E.codeToSeed(E.seedToCode(123456)));
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual(a.board, b.board);
});

test("盤面コードの変換と不正な入力", () => {
    assert.equal(E.codeToSeed("k3z9qa"), E.codeToSeed("K3Z9QA"));
    assert.equal(E.seedToCode(E.codeToSeed("TEST1")), "TEST1");
    assert.equal(E.codeToSeed(""), null);
    assert.equal(E.codeToSeed("ab-cd"), null);
    assert.equal(E.codeToSeed("ZZZZZZZZ"), null);
});

test("初期配置：各 7 枚、王は中央、先手は黒", () => {
    const position = E.newGame(42);
    assert.equal(E.countPieces(position.board, BLACK), 7);
    assert.equal(E.countPieces(position.board, WHITE), 7);
    assert.equal(position.board[at(6, 3)], BLACK * KING);
    assert.equal(position.board[at(0, 3)], WHITE * KING);
    assert.equal(position.turn, BLACK);
    assert.equal(position.ply, 0);
});

test("1 手目で駒を取れる手はない", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
        const position = E.newGame(seed);
        E.legalMoves(position).forEach(move => {
            assert.equal(position.board[move.to], 0, `seed ${seed}`);
        });
    }
});

console.log("[駒の動き]");

test("十：縦横に 1 マス", () => {
    const p = makePosition({ pieces: Object.assign({ [at(3, 3)]: STONE }, kings), tiles: { [at(3, 3)]: TILE.CROSS } });
    assert.deepEqual(targetsOf(p, at(3, 3)), [at(2, 3), at(3, 2), at(3, 4), at(4, 3)]);
});

test("斜：斜めに 1 マス", () => {
    const p = makePosition({ pieces: Object.assign({ [at(3, 3)]: STONE }, kings), tiles: { [at(3, 3)]: TILE.DIAG } });
    assert.deepEqual(targetsOf(p, at(3, 3)), [at(2, 2), at(2, 4), at(4, 2), at(4, 4)]);
});

test("跳：桂馬の形 8 方向。間の駒は飛び越える", () => {
    const pieces = Object.assign({
        [at(3, 3)]: STONE,
        [at(2, 3)]: STONE,
        [at(3, 2)]: -STONE,
        [at(1, 2)]: STONE // 自分の駒がいる先には行けない
    }, kings);
    const p = makePosition({ pieces, tiles: { [at(3, 3)]: TILE.LEAP } });
    assert.deepEqual(targetsOf(p, at(3, 3)), [
        at(1, 4), at(2, 1), at(2, 5), at(4, 1), at(4, 5), at(5, 2), at(5, 4)
    ]);
});

test("走：縦横にどこまでも。自分の駒の手前で止まり、相手の駒は取れる", () => {
    const pieces = Object.assign({
        [at(3, 1)]: STONE,
        [at(3, 4)]: -STONE,
        [at(1, 1)]: STONE
    }, kings);
    const p = makePosition({ pieces, tiles: { [at(3, 1)]: TILE.RUN } });
    assert.deepEqual(targetsOf(p, at(3, 1)), [
        at(2, 1), at(3, 0), at(3, 2), at(3, 3), at(3, 4), at(4, 1), at(5, 1), at(6, 1)
    ]);
});

test("王は床に関係なく周囲 8 マスに 1 歩", () => {
    [TILE.CROSS, TILE.DIAG, TILE.LEAP, TILE.RUN].forEach(tile => {
        const p = makePosition({
            pieces: { [at(3, 3)]: BLACK * KING, [at(0, 6)]: WHITE * KING },
            tiles: { [at(3, 3)]: tile }
        });
        assert.equal(targetsOf(p, at(3, 3)).length, 8, `tile ${tile}`);
    });
});

console.log("[床の移ろい]");

test("駒が離れた床は 十→斜→跳→走→十 と 1 段階変わる", () => {
    [TILE.CROSS, TILE.DIAG, TILE.LEAP, TILE.RUN].forEach(tile => {
        const p = makePosition({ pieces: Object.assign({ [at(3, 3)]: STONE }, kings), tiles: { [at(3, 3)]: tile } });
        const to = targetsOf(p, at(3, 3))[0];
        const next = E.applyMove(p, { from: at(3, 3), to });
        assert.equal(next.tiles[at(3, 3)], (tile + 1) % 4);
        assert.equal(next.tiles[to], p.tiles[to], "着いた先の床は変わらない");
        assert.equal(next.lastMove.tileBefore, tile);
    });
});

test("王が離れた床も変わる", () => {
    const p = makePosition({ pieces: { [at(3, 3)]: BLACK * KING, [at(0, 6)]: WHITE * KING }, tiles: { [at(3, 3)]: TILE.RUN } });
    const next = E.applyMove(p, { from: at(3, 3), to: at(2, 2) });
    assert.equal(next.tiles[at(3, 3)], TILE.CROSS);
});

test("applyMove は元の局面を変えない・反則手は受け付けない", () => {
    const p = E.newGame(7);
    const copy = JSON.stringify(p);
    const move = E.legalMoves(p)[0];
    E.applyMove(p, move);
    assert.equal(JSON.stringify(p), copy);
    assert.throws(() => E.applyMove(p, { from: at(6, 0), to: at(0, 0) }));
    assert.throws(() => E.applyMove(p, { from: at(0, 0), to: at(1, 0) }), "相手の駒は動かせない");
});

console.log("[勝ち負け]");

test("相手の王を取ったら勝ち", () => {
    const p = makePosition({
        pieces: { [at(3, 3)]: STONE, [at(3, 5)]: WHITE * KING, [at(6, 0)]: BLACK * KING },
        tiles: { [at(3, 3)]: TILE.RUN }
    });
    const next = E.applyMove(p, { from: at(3, 3), to: at(3, 5) });
    assert.deepEqual(next.result, { winner: BLACK, reason: "capture" });
    assert.deepEqual(E.legalMoves(next), []);
});

test("王が相手の玉座（相手の王の初期位置）に着いたら勝ち", () => {
    const p = makePosition({ pieces: { [at(1, 3)]: BLACK * KING, [at(4, 6)]: WHITE * KING } });
    const next = E.applyMove(p, { from: at(1, 3), to: at(0, 3) });
    assert.deepEqual(next.result, { winner: BLACK, reason: "arrival" });

    const white = makePosition({ pieces: { [at(5, 2)]: WHITE * KING, [at(2, 0)]: BLACK * KING }, turn: WHITE });
    assert.deepEqual(E.applyMove(white, { from: at(5, 2), to: at(6, 3) }).result, { winner: WHITE, reason: "arrival" });
});

test("玉座以外の最奥列に着いても勝ちではない・石が玉座に着いても勝ちではない", () => {
    const p = makePosition({ pieces: { [at(1, 1)]: BLACK * KING, [at(1, 4)]: STONE, [at(4, 6)]: WHITE * KING } });
    assert.equal(E.applyMove(p, { from: at(1, 1), to: at(0, 1) }).result, null);
    assert.equal(E.applyMove(p, { from: at(1, 4), to: at(0, 4) }).result, null);
    const stone = makePosition({ pieces: { [at(1, 3)]: STONE, [at(6, 0)]: BLACK * KING, [at(4, 6)]: WHITE * KING } });
    assert.equal(E.applyMove(stone, { from: at(1, 3), to: at(0, 3) }).result, null);
});

test(`${MAX_PLY} 手で駒の多い方が勝ち・同数なら引き分け`, () => {
    const more = makePosition({
        pieces: { [at(3, 0)]: STONE, [at(5, 5)]: STONE, [at(6, 0)]: BLACK * KING, [at(0, 6)]: WHITE * KING },
        ply: MAX_PLY - 1
    });
    assert.deepEqual(E.applyMove(more, { from: at(3, 0), to: at(2, 0) }).result, { winner: BLACK, reason: "limit" });

    const even = makePosition({
        pieces: { [at(3, 0)]: STONE, [at(5, 5)]: -STONE, [at(6, 0)]: BLACK * KING, [at(0, 6)]: WHITE * KING },
        ply: MAX_PLY - 1
    });
    assert.deepEqual(E.applyMove(even, { from: at(3, 0), to: at(2, 0) }).result, { winner: 0, reason: "limit" });
});

test("相手が動けなくなったら勝ち", () => {
    // 盤をほぼ白の石で埋めた形（探索で見つけた局面）。黒の王が g7 の石を取ると、
    // 白の駒はどれも味方の駒にふさがれて 1 手も指せなくなる
    const W = -STONE;
    const board = new Array(CELLS).fill(W);
    board[12] = BLACK * KING;
    board[20] = STONE;
    board[31] = WHITE * KING;
    const tiles = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1];
    const p = Object.assign(E.newGame(1), { board, tiles, turn: BLACK, ply: 10 });
    const next = E.applyMove(p, { from: 12, to: 6 });
    assert.deepEqual(next.result, { winner: BLACK, reason: "stalemate" });
});

test("ランダムに最後まで指しても壊れない（必ず終局する）", () => {
    let seedState = 99;
    const random = () => {
        seedState = (seedState * 1103515245 + 12345) % 2147483648;
        return seedState / 2147483648;
    };
    for (let g = 1; g <= 200; g += 1) {
        let position = E.newGame(g);
        while (!position.result) {
            const moves = E.legalMoves(position);
            assert.ok(moves.length > 0);
            position = E.applyMove(position, moves[Math.floor(random() * moves.length)]);
            assert.ok(position.ply <= MAX_PLY);
        }
        assert.ok([BLACK, WHITE, 0].includes(position.result.winner));
    }
});

console.log("[CPU]");

test("CPU は合法手を返す（全レベル）", () => {
    const position = E.newGame(2024);
    Object.keys(E.LEVELS).forEach(level => {
        const move = E.chooseMove(position, { level, timeMs: 200 });
        assert.ok(E.legalMoves(position).some(m => m.from === move.from && m.to === move.to), level);
    });
});

test("CPU は 1 手で勝てる手を見逃さない（やさしいでも）", () => {
    const p = makePosition({
        pieces: { [at(3, 3)]: STONE, [at(3, 6)]: WHITE * KING, [at(6, 0)]: BLACK * KING, [at(5, 5)]: STONE },
        tiles: { [at(3, 3)]: TILE.RUN }
    });
    ["easy", "normal", "hard"].forEach(level => {
        const move = E.chooseMove(p, { level, timeMs: 200 });
        assert.deepEqual({ from: move.from, to: move.to }, { from: at(3, 3), to: at(3, 6) }, level);
    });
});

test("CPU（つよい）は 1 手で王を取られる形を避ける", () => {
    // 白の石が「走」に乗っていて、黒の王と同じ列にいる。黒は王を逃がすか間に駒を入れる必要がある
    const p = makePosition({
        pieces: { [at(6, 3)]: BLACK * KING, [at(1, 3)]: -STONE, [at(0, 0)]: WHITE * KING, [at(6, 6)]: STONE },
        tiles: { [at(1, 3)]: TILE.RUN }
    });
    const move = E.chooseMove(p, { level: "hard", timeMs: 300 });
    const next = E.applyMove(p, move);
    const replies = E.legalMoves(next);
    assert.ok(!replies.some(m => next.board[m.to] === BLACK * KING), "王がまだ取られる位置にある");
});

test("CPU の関数は外の変数を使わない（Web Worker に文字列で渡せる）", () => {
    const rebuilt = new Function(`return (${createEngine.toString()})`)()();
    const move = rebuilt.chooseMove(rebuilt.newGame(5), { level: "easy" });
    assert.ok(move && typeof move.from === "number");
});

console.log();
if (failed === 0) {
    console.log("すべて OK");
} else {
    console.log(`${failed} 件の NG があります`);
    process.exit(1);
}
