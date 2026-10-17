// うつろいの CPU 同士の対局で、ルールの釣り合い（先手の勝率・終わり方・長さ）を調べる。
// ルールを変えたときに使う。時間がかかるので tools/check.sh からは呼ばない。
//
//   node tools/utsuroi-selfplay.js [対局数] [強さ] [1手の考慮時間ms] [盤の番号のずらし]
//   例: node tools/utsuroi-selfplay.js 40 hard 150
//
// 環境変数 ARRIVAL（throne / row / none）と KING_STEP（1 / 0）でルールを切り替えて比べられる。
"use strict";

const path = require("node:path");
const createEngine = require(path.join(__dirname, "..", "games", "utsuroi", "engine.js"));

const E = createEngine();
if (process.env.ARRIVAL) {
    E.RULES.arrival = process.env.ARRIVAL;
}
if (process.env.KING_STEP) {
    E.RULES.kingStep = process.env.KING_STEP === "1";
}

const games = Number(process.argv[2]) || 20;
const level = process.argv[3] || "hard";
const timeMs = Number(process.argv[4]) || 150;
const offset = Number(process.argv[5]) || 0;

const wins = { first: 0, second: 0, draw: 0 };
const reasons = {};
const lengths = [];

for (let g = 1; g <= games; g += 1) {
    E.clearTable();
    let position = E.newGame((g + offset) * 104729);
    while (!position.result) {
        position = E.applyMove(position, E.chooseMove(position, { level, timeMs }));
    }
    const winner = position.result.winner;
    wins[winner === E.BLACK ? "first" : winner === E.WHITE ? "second" : "draw"] += 1;
    reasons[position.result.reason] = (reasons[position.result.reason] || 0) + 1;
    lengths.push(position.ply);
    process.stdout.write(".");
}

lengths.sort((a, b) => a - b);
console.log();
console.log(`ルール: ${JSON.stringify(E.RULES)}  強さ: ${level}  ${timeMs}ms/手  ${games} 局`);
console.log(`勝ち: 先手 ${wins.first} / 後手 ${wins.second} / 引き分け ${wins.draw}`);
console.log(`終わり方: ${JSON.stringify(reasons)}`);
console.log(`手数: 中央値 ${lengths[lengths.length >> 1]}（最短 ${lengths[0]}・最長 ${lengths[lengths.length - 1]}）`);
