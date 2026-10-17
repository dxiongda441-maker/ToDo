// 三界戦棋の CPU どうしの 対局で、ルールの 釣り合いを 調べる。
//
//   node tools/sankai-selfplay.js [局数] [強さ] [seed]
//
// 先手・後手の 勝率、勝ち方（詰み・本陣占領・引き分け）、平均手数、どの 駒が よく 取られたかを 表示する。
"use strict";

const path = require("node:path");
const E = require(path.join(__dirname, "..", "games", "sankai", "engine.js"))();

const games = Number(process.argv[2]) || 10;
const level = process.argv[3] || "normal";
let seed = Number(process.argv[4]) || 1;
const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
};

const wins = { [E.SENTE]: 0, [E.GOTE]: 0, 0: 0 };
const reasons = {};
const captured = {};
const shots = {};
let plies = 0;
let skyMoves = 0; // 空で 動いた 手（多すぎると 地上の 戦いが 進まない）
for (let g = 0; g < games; g += 1) {
    let s = E.initialState();
    // 序盤を 少し ばらけさせる（同じ 対局ばかりに ならないように）
    for (let i = 0; i < 2 && !s.result; i += 1) {
        const moves = E.legalMoves(s).filter(m => m.kind === "move");
        s = E.play(s, moves[Math.floor(rng() * moves.length)]);
    }
    while (!s.result) {
        const move = E.chooseMove(s, level, rng);
        const target = s.board[move.to];
        if (move.kind === "move" && E.layerOf(move.from) === E.SKY) {
            skyMoves += 1;
        }
        if (move.kind !== "drop" && target && E.sideOf(target) !== s.turn) {
            const name = E.pieceInfo(target).name;
            captured[name] = (captured[name] || 0) + 1;
            if (move.kind === "shot") {
                const by = E.pieceInfo(s.board[move.from]).name;
                shots[by] = (shots[by] || 0) + 1;
            }
        }
        s = E.play(s, move);
    }
    wins[s.result.winner] += 1;
    reasons[s.result.reason] = (reasons[s.result.reason] || 0) + 1;
    plies += s.ply;
    console.log(`対局 ${g + 1}: ${s.result.winner === E.SENTE ? "先手" : s.result.winner === E.GOTE ? "後手" : "引き分け"}（${s.result.reason}、${s.ply} 手）`);
}
console.log();
console.log(`先手 ${wins[E.SENTE]} 勝・後手 ${wins[E.GOTE]} 勝・引き分け ${wins[0]}`);
console.log("勝ち方:", reasons);
console.log("平均手数:", (plies / games).toFixed(1));
console.log("空を 飛んだ 手の 割合:", `${Math.round((skyMoves / plies) * 100)}%`);
console.log("取られた駒:", captured);
console.log("撃って取った（砲兵・対空砲・爆撃機）:", shots);
