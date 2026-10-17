// 三界戦棋（games/sankai）のルールと CPU のテスト。
//
//   node tools/test-sankai.js
//
// 失敗があれば終了コード 1。
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const enginePath = path.join(__dirname, "..", "games", "sankai", "engine.js");
const E = require(enginePath)();

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

// 何も 置いていない 局面（テスト用）
function emptyState(turn = E.SENTE) {
    const state = E.initialState();
    state.board.fill(0);
    state.turn = turn;
    return state;
}

const put = (state, layer, x, y, piece) => {
    state.board[E.idx(layer, x, y)] = piece;
};

console.log("[最初の 局面]");

test("駒は 1 人 20 枚、司令官は 本陣に いる", () => {
    const s = E.initialState();
    const count = side => Array.from(s.board).filter(p => E.sideOf(p) === side).length;
    assert.equal(count(E.SENTE), 20);
    assert.equal(count(E.GOTE), 20);
    assert.equal(s.board[E.honjinOf(E.SENTE)], E.CMD);
    assert.equal(s.board[E.honjinOf(E.GOTE)], -E.CMD);
});

test("先手と 後手は 点対称（盤を 回すと 同じ）", () => {
    const s = E.initialState();
    for (let layer = 0; layer < 3; layer += 1) {
        for (let y = 0; y < 9; y += 1) {
            for (let x = 0; x < 9; x += 1) {
                assert.equal(s.board[E.idx(layer, x, y)], -s.board[E.idx(layer, 8 - x, 8 - y)] || 0);
            }
        }
    }
});

console.log("[駒の 動き]");

test("砲兵は 動かずに 2 マス先を 撃てる（間の 駒を 越える）", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.GROUND, 4, 5, E.ART);
    put(s, E.GROUND, 4, 4, E.INF);
    put(s, E.GROUND, 4, 3, -E.TNK);
    const shots = E.legalMoves(s).filter(m => m.kind === "shot");
    assert.deepEqual(shots.map(m => m.to), [E.idx(E.GROUND, 4, 3)]);
    const next = E.play(s, shots[0]);
    assert.equal(next.board[E.idx(E.GROUND, 4, 5)], E.ART, "撃った 砲兵は 動かない");
    assert.equal(next.board[E.idx(E.GROUND, 4, 3)], 0);
    assert.equal(next.hands[E.SENTE][E.TNK], 1, "撃った 駒も 持ち駒に なる");
});

test("爆撃機は 真下を 爆撃でき、対空砲は 上空 3×3 の 敵機を 撃てる", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.SKY, 3, 3, E.BMB);
    put(s, E.GROUND, 3, 3, -E.INF);
    put(s, E.GROUND, 6, 6, E.AA);
    put(s, E.SKY, 7, 5, -E.FTR);
    const shots = E.legalMoves(s).filter(m => m.kind === "shot").map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(shots, [E.idx(E.GROUND, 3, 3), E.idx(E.SKY, 7, 5)].sort((a, b) => a - b));
});

test("工兵は 地下に もぐり、地下から 真上の 敵を 襲える", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.UNDER, 2, 2, E.ENG);
    put(s, E.GROUND, 2, 2, -E.TNK);
    const up = E.legalMoves(s).find(m => m.from === E.idx(E.UNDER, 2, 2) && m.to === E.idx(E.GROUND, 2, 2));
    assert.ok(up);
    const next = E.play(s, up);
    assert.equal(next.board[E.idx(E.GROUND, 2, 2)], E.ENG);
    assert.equal(next.hands[E.SENTE][E.TNK], 1);
});

test("持ち駒は 自陣にだけ 打てる（飛行機は 空、工兵は 地上か 地下）。二歩は 打てない", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.GROUND, 3, 7, E.INF);
    s.hands[E.SENTE][E.FTR] = 1;
    s.hands[E.SENTE][E.ENG] = 1;
    s.hands[E.SENTE][E.INF] = 1;
    const drops = E.legalMoves(s).filter(m => m.kind === "drop");
    drops.forEach(m => assert.ok(E.inOwnCamp(E.SENTE, E.yOf(m.to)), "自陣だけ"));
    assert.ok(drops.filter(m => m.piece === E.FTR).every(m => E.layerOf(m.to) === E.SKY));
    assert.deepEqual([...new Set(drops.filter(m => m.piece === E.ENG).map(m => E.layerOf(m.to)))].sort(), [E.UNDER, E.GROUND]);
    assert.ok(!drops.some(m => m.piece === E.INF && E.xOf(m.to) === 3), "二歩");
});

test("歩兵は 敵陣で 成れる。一番 奥では 必ず 成る", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 8, 0, -E.CMD);
    put(s, E.GROUND, 2, 3, E.INF);
    put(s, E.GROUND, 5, 1, E.INF);
    const moves = E.legalMoves(s);
    const into = moves.filter(m => m.from === E.idx(E.GROUND, 2, 3));
    assert.deepEqual(into.map(m => m.promote).sort(), [false, true]);
    const last = moves.filter(m => m.from === E.idx(E.GROUND, 5, 1));
    assert.deepEqual(last.map(m => m.promote), [true]);
});

console.log("[勝ち負け]");

test("相手の 本陣に 1 手 居座ると 勝ち", () => {
    const s = emptyState();
    put(s, E.GROUND, 0, 8, E.CMD);
    put(s, E.GROUND, 8, 8, -E.CMD);
    put(s, E.GROUND, 4, 1, E.INF + E.PROMOTED); // 精鋭兵が 本陣（5一）の となり
    const enter = E.legalMoves(s).find(m => m.to === E.honjinOf(E.GOTE));
    let next = E.play(s, enter);
    assert.equal(next.result, null, "入った だけでは まだ");
    const reply = E.legalMoves(next).find(m => m.kind !== "drop");
    next = E.play(next, reply);
    assert.equal(next.result && next.result.winner, E.SENTE);
    assert.equal(next.result.reason, "occupation");
});

test("司令官を 守れなければ 詰み", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.GROUND, 1, 2, E.TNK);
    put(s, E.GROUND, 2, 1, E.TNK + E.PROMOTED);
    const mate = E.legalMoves(s).find(m => m.from === E.idx(E.GROUND, 1, 2) && m.to === E.idx(E.GROUND, 1, 0));
    const next = E.play(s, mate);
    assert.equal(next.result && next.result.reason, "checkmate");
});

console.log("[ねらわれ判定の 正しさ]");

test("司令官が ねらわれて いるかの 速い 判定が、全部の 手を 作った 結果と 一致する（ランダムな 局面 3000）", () => {
    const rng = seededRng(7);
    let checked = 0;
    for (let g = 0; g < 40 && checked < 3000; g += 1) {
        let s = E.initialState();
        while (!s.result && checked < 3000) {
            [E.SENTE, E.GOTE].forEach(side => {
                const c = E.findCommander(s.board, side);
                if (c < 0) {
                    return;
                }
                const fast = E.groundAttacked(s.board, c, -side);
                const slow = E.pseudoMoves(s, -side).some(m => m.kind !== "drop" && m.to === c);
                assert.equal(fast, slow, `局面 ${checked}`);
                checked += 1;
            });
            const moves = E.legalMoves(s);
            s = E.play(s, moves[Math.floor(rng() * moves.length)]);
        }
    }
});

console.log("[CPU]");

test("CPU は 1 手で 取れる 司令官を 見のがさない・本陣占領も 見のがさない", () => {
    const s = emptyState();
    put(s, E.GROUND, 4, 8, E.CMD);
    put(s, E.GROUND, 0, 0, -E.CMD);
    put(s, E.GROUND, 4, 1, E.INF + E.PROMOTED);
    put(s, E.GROUND, 3, 0, -E.INF);
    const move = E.chooseMove(s, "normal", seededRng(1));
    assert.equal(move.to, E.honjinOf(E.GOTE));
});

test("CPU は Web Worker で 動かせる（関数の 外の 変数を 使っていない）", () => {
    const source = fs.readFileSync(enginePath, "utf8");
    const fnSource = source.slice(source.indexOf("function createSankaiEngine"), source.lastIndexOf("\n}\n") + 2);
    // eslint-disable-next-line no-new-func
    const factory = new Function(`${fnSource}; return createSankaiEngine;`)();
    const engine = factory();
    assert.ok(engine.legalMoves(engine.initialState()).length > 0);
});

console.log();
if (failed === 0) {
    console.log("すべて OK");
} else {
    console.log(`${failed} 件の NG があります`);
    process.exit(1);
}
