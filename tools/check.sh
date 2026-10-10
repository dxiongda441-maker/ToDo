#!/usr/bin/env bash
# ToDo アプリの基本チェック。変更後・コミット前に実行する。
#
#   bash tools/check.sh
#
# 何も書き換えない。問題があれば NG を出して終了コード 1 で終わる。
set -uo pipefail

cd "$(dirname "$0")/.."
FAIL=0
ok() { echo "  ok  $1"; }
ng() { echo "  NG  $1"; FAIL=1; }

echo "[index.html が読み込むファイルが存在する]"
for f in $(grep -o '\(href\|src\)="[^"#:]*\.\(css\|js\)"' index.html | sed 's/.*="\(.*\)"/\1/'); do
  [ -f "$f" ] && ok "$f" || ng "$f が無い"
done

echo "[JavaScript の文法]"
for f in js/*.js; do
  node --check "$f" 2>/dev/null && ok "$f" || ng "$f に文法エラーがある"
done

echo "[js/ のファイルがすべて読み込まれている]"
for f in js/*.js; do
  grep -q "src=\"$f\"" index.html && ok "$f" || ng "$f が index.html で読み込まれていない"
done

echo "[読み込み順（使う側より前に定義されている）]"
order=$(grep -o 'src="js/[^"]*"' index.html | sed 's/src="js\/\(.*\)\.js"/\1/' | tr '\n' ' ')
expected="utils state storage theme toast tasks history backup main "
[ "$order" = "$expected" ] && ok "$order" || ng "順番が「$order」になっている（「$expected」のはず）"

echo "[ゲーム（games/utsuroi）のファイルと文法]"
for f in $(grep -o '\(href\|src\)="[^"#:]*\.\(css\|js\)"' games/utsuroi/index.html | sed 's/.*="\(.*\)"/\1/'); do
  [ -f "games/utsuroi/$f" ] && ok "games/utsuroi/$f" || ng "games/utsuroi/$f が無い"
done
for f in games/utsuroi/*.js tools/*.js; do
  node --check "$f" 2>/dev/null && ok "$f" || ng "$f に文法エラーがある"
done

echo "[ゲームのルールと CPU のテスト]"
if test_output=$(node tools/test-utsuroi.js 2>&1); then
  ok "node tools/test-utsuroi.js"
else
  echo "$test_output"
  ng "ゲームのテストが失敗した（node tools/test-utsuroi.js で詳細）"
fi

echo "[RPG（games/hoshifuru）のファイルと文法]"
for f in $(grep -o 'src="[^"#:]*\.js"' games/hoshifuru/index.html | sed 's/.*="\(.*\)"/\1/'); do
  [ -f "games/hoshifuru/$f" ] && ok "games/hoshifuru/$f" || ng "games/hoshifuru/$f が無い"
done
for f in games/hoshifuru/*.js; do
  node --check "$f" 2>/dev/null && ok "$f" || ng "$f に文法エラーがある"
done

echo "[RPG のマップ・データ・ルールのテスト]"
if rpg_output=$(node tools/test-hoshifuru.js 2>&1); then
  ok "node tools/test-hoshifuru.js"
else
  echo "$rpg_output"
  ng "RPG のテストが失敗した（node tools/test-hoshifuru.js で詳細）"
fi

echo
if [ "$FAIL" -eq 0 ]; then echo "すべて OK"; else echo "NG があります"; exit 1; fi
