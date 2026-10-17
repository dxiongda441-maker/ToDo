// うつろいの詰め問題を作り、games/utsuroi/puzzles.js に書き出す。
//
//   node tools/utsuroi-make-puzzles.js
//
// CPU 同士の対局の途中の局面から「勝ちにつながる最初の 1 手が 1 つだけ」の局面を探す。
// 結果は毎回同じ（乱数の seed を固定している）。時間がかかる（数分）。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const createEngine = require(path.join(__dirname, "..", "games", "utsuroi", "engine.js"));

const E = createEngine();
const TARGET = { 1: 12, 2: 20, 3: 18 }; // 自分の手数ごとの問題数
const found = { 1: [], 2: [], 3: [] };
const seen = new Set();

// 再現できる乱数（Math.random を置き換えて CPU の「ゆらぎ」も固定する）
let state = 20261010;
Math.random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
};

// 局面から決まる短い ID（FNV-1a）。作り直しても同じ局面なら同じ ID になり、
// 「解いた」記録（ID で保存）が別の問題に付け替わらない
function positionId(position) {
    const text = `${position.tiles}|${position.board}|${position.turn}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

function enough() {
    return Object.keys(TARGET).every(k => found[k].length >= TARGET[k]);
}

// 自分の手数 n で勝てる、最初の手が 1 つだけの局面なら n を返す
function classify(position) {
    for (let moves = 1; moves <= 3; moves += 1) {
        const plies = moves * 2 - 1;
        const wins = E.winningMoves(position, plies);
        if (wins.length === 0) {
            continue;
        }
        return wins.length === 1 ? { moves, solution: wins[0] } : null;
    }
    return null;
}

for (let game = 1; game <= 800 && !enough(); game += 1) {
    let position = E.newGame(game * 7919 + 13);
    const levels = game % 3 === 0 ? ["easy", "normal"] : ["normal", "normal"];
    let fromThisGame = 0; // 似た問題が並ばないよう、1 局から取るのは 2 問まで
    while (!position.result && !enough()) {
        const pieces = position.board.filter(piece => piece !== 0).length;
        if (position.ply >= 6 && position.ply <= 80 && pieces >= 5 && fromThisGame < 2) {
            const key = position.tiles.join("") + position.board.join(",") + position.turn;
            if (!seen.has(key)) {
                seen.add(key);
                const puzzle = classify(position);
                if (puzzle && found[puzzle.moves].length < TARGET[puzzle.moves]) {
                    found[puzzle.moves].push({
                        moves: puzzle.moves,
                        position: E.encodePosition(position),
                        solution: { from: puzzle.solution.from, to: puzzle.solution.to }
                    });
                    fromThisGame += 1;
                    process.stdout.write(String(puzzle.moves));
                }
            }
        }
        const level = levels[position.turn === E.BLACK ? 0 : 1];
        position = E.applyMove(position, E.chooseMove(position, { level, depth: level === "normal" ? 2 : 1 }));
    }
}
console.log();

const puzzles = [];
[1, 2, 3].forEach(moves => {
    found[moves].forEach(entry => {
        puzzles.push(Object.assign({ id: `m${moves}-${positionId(entry.position)}` }, entry.position, {
            moves: entry.moves,
            solution: entry.solution
        }));
    });
});

const body = puzzles.map(p => `        ${JSON.stringify(p)}`).join(",\n");
const output = `// うつろいの詰め問題（自動生成：node tools/utsuroi-make-puzzles.js。手で直さない）
// moves：自分の手数。tiles：床（0=十 1=斜 2=跳 3=走）。board：駒（b/B=黒の石/王、w/W=白の石/王、.=空き）
(function (root) {
    const PUZZLES = [
${body}
    ];
    if (typeof module === "object" && module.exports) {
        module.exports = PUZZLES;
    } else {
        root.UTSUROI_PUZZLES = PUZZLES;
    }
})(this);
`;
fs.writeFileSync(path.join(__dirname, "..", "games", "utsuroi", "puzzles.js"), output);
console.log(`書き出しました：1 手 ${found[1].length} 問・2 手 ${found[2].length} 問・3 手 ${found[3].length} 問`);
