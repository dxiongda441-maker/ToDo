// Python。目標：自分でコードを書き、eval（評価）を作れるようになる。
//
// 段階（lockStages: 前の段階をクリアするまで次の段階は出題しない）
//   1. 基礎知識（文法・制御構文・データ構造・関数）
//   2. コードを読む（実行結果を予想する）
//   3. コードを選ぶ（目的に合うコード・バグの直し方を選ぶ）
//   4. コードを書く（ブラウザ内の Python で実行して自動採点）とテスト
//   5. eval（評価）を作る
//
// v0.2 で段階を作り直したため、一部の問題は ID の分類名（stdlib / errors / oop など）と
// 出題トピックが一致しない。ID は復習記録が参照しているので変えない。
// 選択問題の出力は tests/content.test.js で実際に Python を実行して検証している。

import { bank } from "./helpers.js";

const { choice, codeChoice, cloze, free, code } = bank("python");

const questions = [
    // ── 基本文法・型 ──
    choice("basics.001", "basics", 1, "次のコードの出力はどれか。", ["3", "3.5", "4", "1"], 0,
        "// は切り捨て除算です。7 / 2 なら 3.5 になります。", "print(7 // 2)"),
    choice("basics.002", "basics", 1, "次のコードの出力はどれか。",
        ["<class 'int'>", "<class 'float'>", "<class 'str'>", "<class 'double'>"], 1,
        "小数点を含む数値は float です。Python に double 型はありません。", "print(type(3.0))"),
    choice("basics.003", "basics", 2, "次のコードの出力はどれか。", ["ab3", "ababab", "エラー", "aaabbb"], 1,
        "文字列に整数を掛けると、その回数だけ繰り返した文字列になります。", 'print("ab" * 3)'),
    cloze("basics.004", "basics", 1, "Python で 2 の 10 乗を求める式は 2 {0} 10 である。", [["**"]],
        "** がべき乗の演算子です。pow(2, 10) でも同じです。"),
    choice("basics.005", "basics", 2, "次のコードの出力はどれか。", ["52", "7", "エラー", "\"5\"2"], 1,
        "int() で文字列を整数に変換してから足しています。変換しないと TypeError になります。",
        'x = "5"\nprint(int(x) + 2)'),
    choice("basics.006", "basics", 3, "次のコードの出力はどれか。", ["True", "False", "0.3", "エラー"], 1,
        "0.1 や 0.2 は 2 進数で正確に表せないため、わずかな誤差が出ます。小数の比較には math.isclose() を使います。",
        "print(0.1 + 0.2 == 0.3)"),
    choice("basics.007", "basics", 2, "次のコードの出力はどれか。", ["Hi {name}!", "Hi Py!", "Hi name!", "エラー"], 1,
        "f 文字列では {} の中に書いた式の値が埋め込まれます。", 'name = "Py"\nprint(f"Hi {name}!")'),

    // ── 制御構文 ──
    choice("control.001", "control", 1, "次のコードの出力（改行区切り）はどれか。", ["0 1 2", "1 2 3", "0 1 2 3", "1 2"], 0,
        "range(3) は 0, 1, 2 を生成します（3 は含まない）。", "for i in range(3):\n    print(i)"),
    choice("control.002", "control", 2, "次のコードの出力はどれか。", ["10", "15", "6", "14"], 0,
        "range(1, 5) は 1, 2, 3, 4。合計は 10 です。", "print(sum(range(1, 5)))"),
    cloze("control.003", "control", 2, "ループを途中で抜けるには {0} 文、残りの処理を飛ばして次の繰り返しに進むには {1} 文を使う。",
        [["break"], ["continue"]], "どちらも for と while の両方で使えます。"),
    choice("control.004", "control", 3, "次のコードの出力はどれか。", ["2", "3", "4", "5"], 1,
        "n は 10 → 5 → 2 → 1 と変化し、ループは 3 回まわります。",
        "n = 10\ncount = 0\nwhile n > 1:\n    n //= 2\n    count += 1\nprint(count)"),
    code("control.005", "write", 2,
        "関数 fizzbuzz(n) を作りなさい。n が 3 と 5 の両方で割り切れれば \"FizzBuzz\"、3 で割り切れれば \"Fizz\"、5 で割り切れれば \"Buzz\"、それ以外は n を文字列にして返す。",
        "def fizzbuzz(n):\n    # ここに書く\n    pass\n",
        [
            { name: "fizzbuzz(1) == \"1\"", code: "assert fizzbuzz(1) == \"1\"" },
            { name: "fizzbuzz(3) == \"Fizz\"", code: "assert fizzbuzz(3) == \"Fizz\"" },
            { name: "fizzbuzz(10) == \"Buzz\"", code: "assert fizzbuzz(10) == \"Buzz\"" },
            { name: "fizzbuzz(30) == \"FizzBuzz\"", code: "assert fizzbuzz(30) == \"FizzBuzz\"" }
        ],
        "def fizzbuzz(n):\n    if n % 15 == 0:\n        return \"FizzBuzz\"\n    if n % 3 == 0:\n        return \"Fizz\"\n    if n % 5 == 0:\n        return \"Buzz\"\n    return str(n)\n",
        "15 で割り切れるかを先に判定するのがポイントです。"),

    // ── データ構造 ──
    choice("datastruct.001", "datastruct", 1, "次のコードの出力はどれか。", ["3", "4", "[1, 2, 3, 4]", "エラー"], 1,
        "append で末尾に要素を追加したので要素数は 4 です。", "a = [1, 2, 3]\na.append(4)\nprint(len(a))"),
    choice("datastruct.002", "datastruct", 2, "次のコードの出力はどれか。", ["None", "0", "KeyError", "b"], 1,
        "get はキーがなければ第 2 引数（既定値）を返します。d[\"b\"] と書くと KeyError になります。",
        'd = {"a": 1}\nprint(d.get("b", 0))'),
    choice("datastruct.003", "datastruct", 2, "次のコードの出力はどれか。", ["[2, 3]", "[1, 2, 3]", "[2, 3, 4]", "[1, 2]"], 0,
        "スライス [1:3] は番号 1 から 3 の手前（1 と 2）までを取り出します。", "print([1, 2, 3, 4, 5][1:3])"),
    choice("datastruct.004", "datastruct", 3, "次のコードの出力はどれか。", ["[1, 2]", "[1, 2, 3]", "[3]", "エラー"], 1,
        "b = a はリストのコピーではなく、同じリストに別名を付けただけです。コピーするには a.copy() を使います。",
        "a = [1, 2]\nb = a\nb.append(3)\nprint(a)"),
    cloze("datastruct.005", "datastruct", 2, "重複を許さない要素の集まりを表す組み込み型は {0}（英字3文字）である。", [["set"]],
        "set(リスト) で重複を取り除けます。in による検索も高速です。"),
    choice("datastruct.006", "datastruct", 3, "次のコードの出力はどれか。", ["['a', 'b']", "[1, 2]", "[('a', 1), ('b', 2)]", "['b', 'a']"], 0,
        "辞書をそのまま sorted に渡すと、キーが並べ替えられたリストになります。", 'print(sorted({"b": 2, "a": 1}))'),
    code("datastruct.007", "write", 2,
        "関数 count_words(text) を作りなさい。空白で区切った単語ごとの出現回数を辞書で返す。例：count_words(\"a b a\") → {\"a\": 2, \"b\": 1}",
        "def count_words(text):\n    # ここに書く\n    pass\n",
        [
            { name: "\"a b a\" → {\"a\": 2, \"b\": 1}", code: "assert count_words(\"a b a\") == {\"a\": 2, \"b\": 1}" },
            { name: "空文字列 → {}", code: "assert count_words(\"\") == {}" },
            { name: "連続した空白も区切りとして扱う", code: "assert count_words(\"x  y\") == {\"x\": 1, \"y\": 1}" }
        ],
        "def count_words(text):\n    counts = {}\n    for word in text.split():\n        counts[word] = counts.get(word, 0) + 1\n    return counts\n",
        "split() を引数なしで呼ぶと、連続した空白もまとめて区切ってくれます。collections.Counter を使っても書けます。"),

    // ── 関数 ──
    choice("functions.001", "functions", 2, "次のコードの出力はどれか。", ["5", "15", "エラー", "None"], 1,
        "y を省略したので既定値 10 が使われます。", "def f(x, y=10):\n    return x + y\n\nprint(f(5))"),
    choice("functions.002", "read", 4, "次のコードの出力はどれか。", ["[2]", "[1, 2]", "[[1], [2]]", "エラー"], 1,
        "既定値の [] は関数を定義したときに 1 回だけ作られ、呼び出しの間で共有されます。既定値には None を使い、関数の中でリストを作るのが定石です。",
        "def add(item, box=[]):\n    box.append(item)\n    return box\n\nadd(1)\nprint(add(2))"),
    code("functions.003", "write", 2,
        "関数 average(nums) を作りなさい。数値のリストの平均を返す。空のリストのときは 0.0 を返す。",
        "def average(nums):\n    # ここに書く\n    pass\n",
        [
            { name: "average([1, 2, 3]) == 2", code: "assert average([1, 2, 3]) == 2" },
            { name: "average([1, 2]) == 1.5", code: "assert average([1, 2]) == 1.5" },
            { name: "average([]) == 0.0", code: "assert average([]) == 0.0" }
        ],
        "def average(nums):\n    if not nums:\n        return 0.0\n    return sum(nums) / len(nums)\n",
        "空のリストで len(nums) が 0 になり ZeroDivisionError になるのを先に防ぎます。"),
    cloze("functions.004", "functions", 3, "関数の中からモジュール（関数の外側）の変数に代入するには {0} 宣言が必要である。", [["global"]],
        "宣言せずに代入すると、関数の中だけのローカル変数が新しく作られます。"),
    free("functions.005", "functions", 3, "関数の中で使う return と print の違いを説明しなさい。",
        "print は値を画面に表示するだけで、呼び出し元には値を返さない（戻り値は None）。return は関数の結果を呼び出し元に返すので、変数に代入したり別の計算に使ったりできる。",
        [["呼び出し", "返"], ["None", "表示", "出力", "画面"]]),

    // ── 内包表記（→ コードを読む / 書く）──
    choice("stdlib.001", "read", 2, "次のコードの出力はどれか。", ["[0, 2, 4]", "[2, 4, 6]", "[0, 1, 2]", "[0, 2, 4, 6]"], 0,
        "リスト内包表記。range(3) の各要素を 2 倍しています。", "print([x * 2 for x in range(3)])"),
    choice("stdlib.002", "read", 3, "次のコードの出力はどれか。", ["[3, 6, 9]", "[0, 3, 6, 9]", "[0, 3, 6]", "[1, 4, 7]"], 1,
        "0 も 3 で割り切れる（余り 0）ので含まれます。", "print([x for x in range(10) if x % 3 == 0])"),
    choice("stdlib.003", "read", 3, "次のコードの出力はどれか。", ["[('a', 3)]", "[('b', 1)]", "{'a': 3}", "[('n', 2)]"], 0,
        "Counter は要素の出現回数を数え、most_common(1) で最も多いものを返します。",
        'from collections import Counter\nprint(Counter("banana").most_common(1))'),
    code("stdlib.004", "write", 3,
        "関数 squares_of_evens(nums) を作りなさい。リストの中の偶数だけを 2 乗したリストを、元の順番で返す（リスト内包表記を使ってみよう）。",
        "def squares_of_evens(nums):\n    # ここに書く\n    pass\n",
        [
            { name: "[1, 2, 3, 4] → [4, 16]", code: "assert squares_of_evens([1, 2, 3, 4]) == [4, 16]" },
            { name: "[] → []", code: "assert squares_of_evens([]) == []" },
            { name: "負の偶数も対象", code: "assert squares_of_evens([-2, 5]) == [4]" }
        ],
        "def squares_of_evens(nums):\n    return [n * n for n in nums if n % 2 == 0]\n",
        "[式 for 変数 in リスト if 条件] の形です。"),

    // ── 例外・ファイル（→ コードを読む / 書く）──
    choice("errors.001", "read", 2, "次のコードを実行したときに発生する例外はどれか。",
        ["TypeError", "ValueError", "KeyError", "SyntaxError"], 1,
        "型は正しい（文字列）が、値が整数として解釈できないので ValueError です。", 'int("abc")'),
    choice("errors.002", "read", 2, "次のコードを実行したときに発生する例外はどれか。",
        ["IndexError", "ValueError", "KeyError", "NameError"], 2,
        "辞書に存在しないキーを [] で取り出すと KeyError です。", 'd = {"a": 1}\nd["b"]'),
    code("errors.003", "write", 3,
        "関数 safe_divide(a, b) を作りなさい。a / b を返すが、b が 0 のときは例外を出さずに None を返す（try / except を使ってみよう）。",
        "def safe_divide(a, b):\n    # ここに書く\n    pass\n",
        [
            { name: "safe_divide(6, 3) == 2", code: "assert safe_divide(6, 3) == 2" },
            { name: "safe_divide(1, 0) is None", code: "assert safe_divide(1, 0) is None" }
        ],
        "def safe_divide(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None\n",
        "except には捕まえたい例外の種類を具体的に書くのが良い習慣です。"),
    cloze("errors.004", "basics", 2, "ファイルを確実に閉じるために、{0} open(\"a.txt\") as f: のように書く。", [["with"]],
        "with ブロックを抜けると、例外が起きても自動でファイルが閉じられます。"),

    // ── クラス（→ 関数とクラス / コードを読む / 書く）──
    choice("oop.001", "functions", 2, "クラスの __init__ メソッドの役割として正しいものはどれか。",
        ["インスタンスが作られるときに初期化を行う", "インスタンスを削除する", "クラスを文字列に変換する", "クラスをコピーする"], 0,
        "obj = MyClass(...) のときに自動で呼ばれ、self.属性 = 値 のように初期値を設定します。"),
    choice("oop.002", "read", 3, "次のコードの出力はどれか。", ["wan", "wanwan", "sound2", "エラー"], 1,
        "self.sound はクラス変数 sound を参照し、それを 2 回繰り返しています。",
        'class Dog:\n    sound = "wan"\n\n    def speak(self):\n        return self.sound * 2\n\nprint(Dog().speak())'),
    code("oop.003", "write", 3,
        "クラス Stack を作りなさい。push(x) で積む、pop() で最後に積んだ要素を取り出して返す、is_empty() で空かどうかを返す。",
        "class Stack:\n    def __init__(self):\n        pass\n",
        [
            { name: "作った直後は空", code: "assert Stack().is_empty() is True" },
            { name: "後に入れたものが先に出る", code: "s = Stack()\ns.push(1)\ns.push(2)\nassert s.pop() == 2\nassert s.pop() == 1" },
            { name: "取り出し切ったら空", code: "s = Stack()\ns.push(1)\ns.pop()\nassert s.is_empty() is True" }
        ],
        "class Stack:\n    def __init__(self):\n        self.items = []\n\n    def push(self, x):\n        self.items.append(x)\n\n    def pop(self):\n        return self.items.pop()\n\n    def is_empty(self):\n        return len(self.items) == 0\n",
        "内部にリストを持ち、append と pop を使うと簡単に作れます。"),

    // ── テスト ──
    choice("testing.001", "testing", 2, "次のコードを実行したときに発生する例外はどれか。",
        ["AssertionError", "ValueError", "何も起きない", "SyntaxError"], 0,
        "assert の条件が False のとき AssertionError が発生します。テストの基本です。", "assert 1 + 1 == 3"),
    cloze("testing.002", "testing", 2, "pytest は、名前が {0} で始まる関数をテストとして自動で実行する。", [["test_", "test"]],
        "ファイル名も test_*.py にしておくと自動で見つけてくれます。"),
    free("testing.003", "testing", 3, "プログラムにテストを書くメリットを 2 つ挙げなさい。",
        "コードを変更したときに、既存の機能が壊れていないかすぐ確認できる（不具合の早期発見）。期待する動作（仕様）がテストとして明確になり、安心してリファクタリングできる。",
        [["壊", "バグ", "不具合", "回帰", "デグレ"], ["仕様", "リファクタ", "安心", "変更"]]),

    // ── eval（評価）を作る ──
    choice("eval.001", "eval", 2, "eval（評価）で使う「正解率 (accuracy)」の求め方として正しいものはどれか。",
        ["正解した件数 ÷ 全件数", "不正解の件数 ÷ 正解の件数", "全件数 ÷ 正解した件数", "正解した件数 − 不正解の件数"], 0,
        "例えば 100 件中 85 件正解なら 0.85（85%）です。"),
    code("eval.002", "eval", 3,
        "関数 accuracy(preds, labels) を作りなさい。予測 preds と正解 labels（同じ長さのリスト）を比べて正解率を返す。空のときは 0.0 を返す。",
        "def accuracy(preds, labels):\n    # ここに書く\n    pass\n",
        [
            { name: "全部正解で 1.0", code: "assert accuracy([1, 2], [1, 2]) == 1.0" },
            { name: "半分正解で 0.5", code: "assert accuracy([\"a\", \"b\"], [\"a\", \"c\"]) == 0.5" },
            { name: "空なら 0.0", code: "assert accuracy([], []) == 0.0" }
        ],
        "def accuracy(preds, labels):\n    if not labels:\n        return 0.0\n    correct = sum(1 for p, y in zip(preds, labels) if p == y)\n    return correct / len(labels)\n",
        "zip で予測と正解をペアにして数えます。"),
    code("eval.003", "eval", 4,
        "関数 run_eval(cases, fn) を作りなさい。cases は {\"input\": 入力, \"expected\": 期待する出力} の辞書のリスト。各ケースで fn(入力) を呼び、期待どおりなら合格。結果を {\"passed\": 合格数, \"total\": 件数, \"failures\": 不合格だったケースの input のリスト} で返す。fn が例外を出したケースも不合格とする。",
        "def run_eval(cases, fn):\n    # ここに書く\n    pass\n",
        [
            { name: "全部合格", code: "r = run_eval([{\"input\": 2, \"expected\": 4}], lambda x: x * 2)\nassert r == {\"passed\": 1, \"total\": 1, \"failures\": []}" },
            { name: "不合格を記録する", code: "r = run_eval([{\"input\": 1, \"expected\": 2}, {\"input\": 3, \"expected\": 5}], lambda x: x + 1)\nassert r[\"passed\"] == 1 and r[\"failures\"] == [3]" },
            { name: "例外も不合格として続行", code: "r = run_eval([{\"input\": 0, \"expected\": 1}, {\"input\": 1, \"expected\": 1.0}], lambda x: 1 / x)\nassert r == {\"passed\": 1, \"total\": 2, \"failures\": [0]}" }
        ],
        "def run_eval(cases, fn):\n    passed = 0\n    failures = []\n    for case in cases:\n        try:\n            ok = fn(case[\"input\"]) == case[\"expected\"]\n        except Exception:\n            ok = False\n        if ok:\n            passed += 1\n        else:\n            failures.append(case[\"input\"])\n    return {\"passed\": passed, \"total\": len(cases), \"failures\": failures}\n",
        "これが評価ハーネスの骨組みです。fn を AI を呼ぶ関数に変えれば、AI の出力の eval になります。"),
    code("eval.004", "eval", 4,
        "関数 exact_match(pred, gold) を作りなさい。前後の空白を除き、大文字小文字を区別せずに 2 つの文字列が一致すれば True を返す。",
        "def exact_match(pred, gold):\n    # ここに書く\n    pass\n",
        [
            { name: "大文字小文字を無視", code: "assert exact_match(\"Tokyo\", \"tokyo\") is True" },
            { name: "前後の空白を無視", code: "assert exact_match(\" Paris \\n\", \"Paris\") is True" },
            { name: "違う文字列は False", code: "assert exact_match(\"Kyoto\", \"Tokyo\") is False" }
        ],
        "def exact_match(pred, gold):\n    return pred.strip().lower() == gold.strip().lower()\n",
        "AI の出力は余計な空白や大文字小文字の違いが出やすいので、比較の前に正規化します。"),
    free("eval.005", "eval", 4, "AI（LLM）の出力を評価する eval を作るとき、テストケース（データセット）に含めるべきものを挙げて説明しなさい。",
        "よくある典型的な入力、境界やエッジケース（空の入力・長い入力・紛らわしい入力など）、過去に失敗したケース。それぞれに期待する出力（正解）または採点基準（ルーブリック）を用意する。",
        [["典型", "代表", "よくある", "普通"], ["境界", "エッジ", "例外", "失敗", "難しい"], ["期待", "正解", "基準", "ルーブリック"]]),
    choice("eval.006", "eval", 3, "LLM の出力のように正解が 1 つに決まらない場合に、よく使われる採点方法はどれか。",
        ["完全一致で比較する", "採点基準（ルーブリック）を用意し、人や別の LLM が採点する", "出力の文字数で判定する", "採点しない"], 1,
        "別の LLM に採点させる方法は LLM-as-a-judge と呼ばれます。採点する LLM 自体も、人の採点と比べて信頼できるか確認します。"),
    choice("eval.007", "eval", 3, "次のコードの出力はどれか。", ["14", "20", "2 + 3 * 4", "エラー"], 0,
        "組み込み関数 eval() は文字列を Python の式として実行します。掛け算が先なので 14。信頼できない入力に eval() を使うと任意のコードを実行されるので危険です（「評価」の eval とは別物）。",
        'print(eval("2 + 3 * 4"))'),

    // ════ ここから v0.2 で追加（基礎 → 読む → 選ぶ → 書く の段階に合わせた問題）════

    // ── 基礎知識: 基本文法・型 ──
    choice("basics.008", "basics", 1, "Python で画面に文字や値を表示する関数はどれか。", ["print", "echo", "write", "show"], 0,
        "print(\"こんにちは\") のように使います。最初に覚える関数です。"),
    choice("basics.009", "basics", 1, "次のコードの出力はどれか。", ["5", "8", "3", "x + 3"], 1,
        "x = x + 3 は「今の x に 3 を足して、x に入れ直す」という意味です。5 + 3 = 8。",
        "x = 5\nx = x + 3\nprint(x)"),
    cloze("basics.010", "basics", 1, "Python でコメント（実行されないメモ）を書くときは、先頭に {0} を付ける。", [["#", "＃"]],
        "# から行末まではコメントとして無視されます。"),
    choice("basics.011", "basics", 1, "変数名として使えないものはどれか。", ["my_name", "age2", "2nd_place", "_count"], 2,
        "変数名は数字で始めることができません。英字かアンダースコア (_) で始めます。"),
    choice("basics.012", "basics", 2, "次のコードの出力はどれか。", ["5", "4", "hello", "エラー"], 0,
        "len() は文字列の文字数（リストなら要素数）を返します。", 'print(len("hello"))'),
    choice("basics.013", "basics", 2, "次のコードの出力はどれか。", ["7", "34", "3 4", "エラー"], 1,
        "\"3\" と \"4\" は文字列なので、+ は足し算ではなく文字列の連結になります。", 'print("3" + "4")'),
    choice("basics.014", "basics", 2, "Python で、if や for の中身（ブロック）を表すために使うものはどれか。",
        ["波かっこ { }", "インデント（行頭の字下げ）", "begin と end", "セミコロン ;"], 1,
        "Python は行頭のスペース（ふつうは 4 つ）でブロックを表します。字下げがずれるとエラーになります。"),
    cloze("basics.015", "basics", 2, "True と False の 2 つの値だけをとる型を {0} 型という（英字4文字）。", [["bool"]],
        "比較の結果（5 > 3 など）は bool 型になります。"),

    // ── 基礎知識: 制御構文 ──
    choice("control.006", "control", 1, "次のコードの出力はどれか。", ["big", "small", "big small", "何も表示されない"], 0,
        "7 > 5 は True なので、if のブロックが実行されます。",
        'x = 7\nif x > 5:\n    print("big")\nelse:\n    print("small")'),
    cloze("control.007", "control", 1, "「等しい」かどうかを比べる比較演算子は {0} である（= 1 つは代入）。", [["=="]],
        "if x == 3: のように使います。「等しくない」は != です。"),
    choice("control.008", "control", 2, "次のコードの出力（改行区切り）はどれか。", ["2 4 6", "2 4 6 8", "2 3 4 5 6 7", "0 2 4 6"], 0,
        "range(開始, 終了, 増やす数)。終了の 8 は含まないので 2, 4, 6 です。",
        "for i in range(2, 8, 2):\n    print(i)"),
    choice("control.009", "control", 2, "次のコードの出力はどれか。", ["A", "B", "C", "B C"], 1,
        "上から順に条件を調べ、最初に True になったブロックだけを実行します。75 >= 80 は False、75 >= 60 は True。",
        'score = 75\nif score >= 80:\n    print("A")\nelif score >= 60:\n    print("B")\nelse:\n    print("C")'),
    choice("control.010", "control", 2, "次のコードの出力はどれか。", ["True", "False", "None", "エラー"], 1,
        "not True は False。False or False は False です。", "print(not True or False)"),

    // ── 基礎知識: データ構造 ──
    choice("datastruct.008", "datastruct", 1, "次のコードの出力はどれか。", ["apple", "banana", "cherry", "エラー"], 0,
        "リストの番号（インデックス）は 0 から始まります。", 'fruits = ["apple", "banana", "cherry"]\nprint(fruits[0])'),
    choice("datastruct.009", "datastruct", 1, "次のコードの出力はどれか。", ["apple", "banana", "cherry", "エラー"], 2,
        "マイナスの番号は後ろから数えます。-1 は最後の要素です。", 'fruits = ["apple", "banana", "cherry"]\nprint(fruits[-1])'),
    choice("datastruct.010", "datastruct", 2, "次のコードの出力はどれか。", ["20", "25", "hanako", "エラー"], 1,
        "辞書は「キー: 値」の組。辞書[キー] で値を取り出します。", 'ages = {"taro": 20, "hanako": 25}\nprint(ages["hanako"])'),
    cloze("datastruct.011", "datastruct", 2, "(1, 2, 3) のように丸かっこで作る、要素を変更できない並びの型を {0} という（英字5文字）。", [["tuple"]],
        "リスト [ ] は変更できますが、タプル ( ) は作った後に変更できません。"),
    choice("datastruct.012", "datastruct", 2, "次のコードの出力はどれか。", ["[3, 1, 2]", "[1, 2, 3]", "[3, 2, 1]", "None"], 1,
        "sort() はリストそのものを小さい順に並べ替えます。", "nums = [3, 1, 2]\nnums.sort()\nprint(nums)"),

    // ── 基礎知識: 関数とクラス ──
    cloze("functions.006", "functions", 1, "関数を定義するときに使うキーワードは {0} である。", [["def"]],
        "def 関数名(引数): のあとに、字下げして中身を書きます。"),
    choice("functions.007", "functions", 1, "次のコードの出力はどれか。", ["Hello, Ken", "Hello, name", "greet", "エラー"], 0,
        "greet(\"Ken\") を呼ぶと name に \"Ken\" が入り、\"Hello, \" とつないだ文字列が返ります。",
        'def greet(name):\n    return "Hello, " + name\n\nprint(greet("Ken"))'),
    choice("functions.008", "functions", 2, "次のコードの出力（改行区切り）はどれか。", ["hi None", "hi", "None", "hi hi"], 0,
        "f() は hi を表示しますが return がないので、戻り値は None。それを print すると None と表示されます。",
        'def f():\n    print("hi")\n\nx = f()\nprint(x)'),
    choice("functions.009", "functions", 2, "関数を呼び出すときに、かっこの中に書いて渡す値を何というか。", ["引数", "戻り値", "変数名", "演算子"], 0,
        "関数が return で返す値は「戻り値（返り値）」です。"),

    // ── コードを読む（実行結果を予想する）──
    choice("read.001", "read", 2, "次のコードの出力はどれか。", ["6", "12", "246", "0"], 1,
        "total に 2, 4, 6 を順に足していくので 12 になります。合計を求める定番の形です。",
        "total = 0\nfor n in [2, 4, 6]:\n    total += n\nprint(total)"),
    choice("read.002", "read", 2, "次のコードの出力はどれか。", ["Pyt", "Pyth", "yth", "P"], 0,
        "s[0:3] は 0 番目から 3 番目の手前まで（0, 1, 2 番目）を取り出します。", 's = "Python"\nprint(s[0:3])'),
    choice("read.003", "read", 3, "次のコードの出力はどれか。", ["[1, 2, 3]", "['a', 'bb', 'ccc']", "6", "[3, 2, 1]"], 0,
        "各要素の文字数（len）を並べたリストを作っています。", 'words = ["a", "bb", "ccc"]\nprint([len(w) for w in words])'),
    choice("read.004", "read", 3, "次のコードの出力はどれか。", ["3", "4", "10", "18"], 0,
        "1〜10 のうち 3 で割り切れるのは 3, 6, 9 の 3 個です。",
        "count = 0\nfor i in range(1, 11):\n    if i % 3 == 0:\n        count += 1\nprint(count)"),
    choice("read.005", "read", 3, "次のコードの出力はどれか。", ["6", "12", "9", "エラー"], 1,
        "内側の double(3) が先に計算されて 6、それをさらに double して 12 です。",
        "def double(x):\n    return x * 2\n\nprint(double(double(3)))"),
    choice("read.006", "read", 3, "次のコードの出力（改行区切り）はどれか。", ["a 1 b 2", "a b", "1 2", "('a', 1) ('b', 2)"], 0,
        "items() でキーと値の組を順に取り出し、print(k, v) で空白区切りで表示します。",
        'd = {"a": 1, "b": 2}\nfor k, v in d.items():\n    print(k, v)'),
    choice("read.007", "read", 4, "次のコードの出力はどれか。", ["10", "20", "None", "エラー"], 0,
        "関数の中で x = 20 と代入すると、関数の中だけの新しい変数になります。外側の x は 10 のままです。",
        "x = 10\n\ndef change():\n    x = 20\n\nchange()\nprint(x)"),
    choice("read.008", "read", 4, "次のコードの出力（改行区切り）はどれか。", ["error end", "ok end", "error", "ok error end"], 0,
        "int(\"12a\") で ValueError が起きるので ok は表示されず except へ。finally は例外があってもなくても必ず実行されます。",
        'try:\n    n = int("12a")\n    print("ok")\nexcept ValueError:\n    print("error")\nfinally:\n    print("end")'),
    choice("read.009", "read", 4, "次のコードの出力はどれか。", ["[10, 30]", "[20, 40]", "[10, 20, 30, 40]", "[1, 3]"], 0,
        "偶数のときは continue で残りを飛ばすので、奇数 1 と 3 だけが 10 倍されて追加されます。",
        "nums = [1, 2, 3, 4]\nresult = []\nfor n in nums:\n    if n % 2 == 0:\n        continue\n    result.append(n * 10)\nprint(result)"),
    choice("read.010", "read", 5, "次のコードの出力はどれか。", ["4", "10", "24", "エラー（無限ループ）"], 1,
        "f(4) = 4 + f(3) = 4 + 3 + f(2) = … = 4 + 3 + 2 + 1 + 0 = 10。自分自身を呼ぶ「再帰」です。",
        "def f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\n\nprint(f(4))"),

    // ── コードを選ぶ（目的に合うコード・バグの直し方）──
    codeChoice("choose.001", "choose", 2, "リスト nums の合計を表示するコードはどれか。",
        ["print(sum(nums))", "print(nums.sum())", "print(total(nums))", "print(add(nums))"], 0,
        "合計は組み込み関数 sum() で求めます。リストに sum というメソッドはありません。"),
    codeChoice("choose.002", "choose", 2, "変数 name が空文字のとき「名前がありません」と表示するコードはどれか。",
        ['if name == "":\n    print("名前がありません")',
            'if name = "":\n    print("名前がありません")',
            'if name == "" print("名前がありません")',
            'if name == "":\nprint("名前がありません")'], 0,
        "比較は ==（= は代入でエラー）、条件のあとに :（コロン）、中身は字下げが必要です。"),
    codeChoice("choose.003", "choose", 3, "1 から 5 までの整数を順に表示するコードはどれか。",
        ["for i in range(5):\n    print(i)", "for i in range(1, 5):\n    print(i)", "for i in range(1, 6):\n    print(i)", "for i in range(6):\n    print(i + 1)"], 2,
        "range(1, 6) は 1〜5。range(5) は 0〜4、range(1, 5) は 1〜4、range(6) に +1 すると 1〜6 になります。"),
    codeChoice("choose.004", "choose", 3, "辞書 stock にキー \"apple\" があるときだけ、その値を表示するコードはどれか。",
        ['if "apple" in stock:\n    print(stock["apple"])',
            'if stock.has("apple"):\n    print(stock["apple"])',
            'if "apple" in stock.values():\n    print(stock["apple"])',
            'print(stock["apple"])'], 0,
        "キー in 辞書 でキーがあるか調べます。values() は値の一覧なのでキーの確認にはなりません。最後のものはキーがないと KeyError です。"),
    choice("choose.005", "choose", 3, "次の関数は、リストの最大値を返すつもりだが、ある場合に正しく動かない。どう直すべきか。",
        ["best = 0 を best = nums[0] にする", "if n > best を if n < best にする", "return best を for の中に入れる", "直す必要はない"], 0,
        "best = 0 から始めると、[-5, -2] のように全部マイナスのとき 0 が返ってしまいます。最初の要素から始めるのが正解です。",
        "def my_max(nums):\n    best = 0\n    for n in nums:\n        if n > best:\n            best = n\n    return best"),
    codeChoice("choose.006", "choose", 3, "リスト words の各要素を大文字にした新しいリストを作るコードはどれか。",
        ["upper_words = [w.upper() for w in words]", "upper_words = words.upper()", "upper_words = [upper(w) for w in words]", "upper_words = for w in words: w.upper()"], 0,
        "文字列のメソッド upper() を、リスト内包表記で 1 つずつ呼びます。リスト自体に upper() はありません。"),
    codeChoice("choose.007", "choose", 4, "次の関数は空のリストを渡すとエラーになる。空のときは 0 を返すように直したコードはどれか。",
        ["def average(nums):\n    if not nums:\n        return 0\n    return sum(nums) / len(nums)",
            "def average(nums):\n    return sum(nums) / len(nums) or 0",
            "def average(nums):\n    try:\n        return sum(nums) / len(nums)\n    except KeyError:\n        return 0",
            "def average(nums):\n    if nums == None:\n        return 0\n    return sum(nums) / len(nums)"], 0,
        "空のリストは not nums で True になります。2 つ目は割り算の時点でエラー、3 つ目は捕まえる例外が違い（ZeroDivisionError）、4 つ目は [] と None が別物なので防げません。",
        "def average(nums):\n    return sum(nums) / len(nums)"),
    codeChoice("choose.008", "choose", 4, "ファイル data.txt の各行を、行末の改行を取り除いて表示するコードはどれか。",
        ['with open("data.txt") as f:\n    for line in f:\n        print(line.strip())',
            'with open("data.txt") as f:\n    print(f.strip())',
            'f = open("data.txt")\nfor line in f:\n    print(line)',
            'with open("data.txt", "w") as f:\n    for line in f:\n        print(line.strip())'], 0,
        "with で開くと自動で閉じます。strip() で行末の改行を除きます。\"w\" は書き込みモードで、開いた時点で中身が消えてしまいます。"),

    // ── コードを書く（入門）──
    code("write.001", "write", 1,
        "関数 is_even(n) を作りなさい。n が偶数なら True、奇数なら False を返す。",
        "def is_even(n):\n    # ここに書く\n    pass\n",
        [
            { name: "is_even(4) is True", code: "assert is_even(4) is True" },
            { name: "is_even(7) is False", code: "assert is_even(7) is False" },
            { name: "is_even(0) is True", code: "assert is_even(0) is True" }
        ],
        "def is_even(n):\n    return n % 2 == 0\n",
        "% は割り算の余り。2 で割った余りが 0 なら偶数です。比較の結果はそのまま True / False になります。"),
    code("write.002", "write", 2,
        "関数 greet(name) を作りなさい。\"Hello, 名前!\" という文字列を返す。例：greet(\"Ken\") → \"Hello, Ken!\"",
        "def greet(name):\n    # ここに書く\n    pass\n",
        [
            { name: "greet(\"Ken\") == \"Hello, Ken!\"", code: "assert greet(\"Ken\") == \"Hello, Ken!\"" },
            { name: "greet(\"花子\") == \"Hello, 花子!\"", code: "assert greet(\"花子\") == \"Hello, 花子!\"" }
        ],
        "def greet(name):\n    return f\"Hello, {name}!\"\n",
        "f 文字列を使うと読みやすく書けます。print ではなく return で返すのがポイントです。"),
    code("write.003", "write", 2,
        "関数 my_max(nums) を作りなさい。max() を使わずに、リストの最大値を返す。空のリストのときは None を返す。",
        "def my_max(nums):\n    # ここに書く\n    pass\n",
        [
            { name: "my_max([3, 9, 2]) == 9", code: "assert my_max([3, 9, 2]) == 9" },
            { name: "全部マイナスでも正しい", code: "assert my_max([-5, -2, -8]) == -2" },
            { name: "空なら None", code: "assert my_max([]) is None" }
        ],
        "def my_max(nums):\n    if not nums:\n        return None\n    best = nums[0]\n    for n in nums:\n        if n > best:\n            best = n\n    return best\n",
        "最初の要素を仮の最大値にして、より大きいものが来たら入れ替えます。"),
    code("write.004", "write", 3,
        "関数 count_vowels(text) を作りなさい。文字列に含まれる母音（a, e, i, o, u。大文字も含む）の数を返す。",
        "def count_vowels(text):\n    # ここに書く\n    pass\n",
        [
            { name: "\"hello\" → 2", code: "assert count_vowels(\"hello\") == 2" },
            { name: "大文字も数える", code: "assert count_vowels(\"AEIOU\") == 5" },
            { name: "母音なし → 0", code: "assert count_vowels(\"xyz\") == 0" }
        ],
        "def count_vowels(text):\n    count = 0\n    for ch in text.lower():\n        if ch in \"aeiou\":\n            count += 1\n    return count\n",
        "lower() で小文字にそろえてから、in で母音かどうかを調べます。"),

    // ── テスト ──
    choice("testing.004", "testing", 2, "次のテストが確かめていることはどれか。",
        ["add(2, 3) の結果が 5 であること", "add という関数が存在しないこと", "2 と 3 が等しいこと", "add が必ずエラーになること"], 0,
        "assert 条件 は、条件が True なら何もせず、False ならテスト失敗（AssertionError）になります。",
        "def test_add():\n    assert add(2, 3) == 5"),
    code("testing.005", "testing", 3,
        "関数 add(a, b) をテストする関数 test_add() を書きなさい。assert を使い、正しい add では通り、間違った add（引き算や掛け算になっているもの）では失敗するようにする。",
        "def add(a, b):\n    return a + b\n\n\ndef test_add():\n    # assert を使って add を確かめる\n    pass\n",
        [
            { name: "正しい add ではテストが通る", code: "test_add()" },
            { name: "引き算になった add を見つけられる", code: "g = test_add.__globals__\noriginal = g[\"add\"]\ng[\"add\"] = lambda a, b: a - b\ntry:\n    test_add()\n    caught = False\nexcept AssertionError:\n    caught = True\nfinally:\n    g[\"add\"] = original\nassert caught, \"引き算の add でもテストが通ってしまいます\"" },
            { name: "掛け算になった add を見つけられる", code: "g = test_add.__globals__\noriginal = g[\"add\"]\ng[\"add\"] = lambda a, b: a * b\ntry:\n    test_add()\n    caught = False\nexcept AssertionError:\n    caught = True\nfinally:\n    g[\"add\"] = original\nassert caught, \"掛け算の add でもテストが通ってしまいます（add(2, 2) は掛け算でも 4 になります）\"" }
        ],
        "def add(a, b):\n    return a + b\n\n\ndef test_add():\n    assert add(2, 3) == 5\n    assert add(-1, 1) == 0\n",
        "良いテストは「間違った実装を見つけられる」テストです。add(2, 2) == 4 だけだと掛け算の間違いを見逃します。")
];

export default {
    id: "python",
    name: "Python",
    short: "Py",
    icon: "🐍",
    color: "#059669",
    description: "基礎知識 → コードを読む → 選ぶ → 書く → eval（評価）を作る、の順に段階的に進む。",
    allowCode: true,
    defaultDailyQuota: 10,
    defaultGoal: { title: "自分でコードを書き、eval（評価）を作れるようになる", presetId: "py-eval" },
    goalPresets: [
        { id: "py-eval", title: "自分でコードを書き、eval（評価）を作れるようになる", hasDeadline: false },
        { id: "py-cert", title: "Python 3 エンジニア認定基礎試験に合格する", hasDeadline: true }
    ],
    lockStages: true,
    topics: [
        { id: "python.basics", name: "基本文法・型", weight: 3, types: ["choice", "cloze", "free"] },
        { id: "python.control", name: "制御構文", weight: 3, types: ["choice", "cloze", "free"] },
        { id: "python.datastruct", name: "データ構造", weight: 3, types: ["choice", "cloze", "free"] },
        { id: "python.functions", name: "関数とクラス", weight: 3, types: ["choice", "cloze", "free"] },
        { id: "python.read", name: "コードを読む", weight: 3, types: ["choice", "cloze"],
            aiHint: "数行〜10 行程度の Python コードを code に示し、実行結果（print の出力）を 4 択で選ばせる問題" },
        { id: "python.choose", name: "コードを選ぶ", weight: 3, types: ["choice"],
            aiHint: "やりたいことを文章で示し、それを正しく実現するコードを 4 択から選ばせる問題（選択肢はコード）。または、バグのあるコードを code に示し、正しい直し方を選ばせる問題" },
        { id: "python.write", name: "コードを書く", weight: 3, types: ["code"],
            aiHint: "短い関数を 1 つ書かせる問題。初学者向けに、仕様を具体例つきで明確に書く" },
        { id: "python.testing", name: "テスト", weight: 2, types: ["choice", "cloze", "free", "code"] },
        { id: "python.eval", name: "eval（評価）を作る", weight: 3, types: ["choice", "code", "free"] }
    ],
    stages: [
        { id: "python.s1", title: "基礎知識（文法・制御構文・データ構造・関数）",
            topics: ["python.basics", "python.control", "python.datastruct", "python.functions"] },
        { id: "python.s2", title: "コードを読む", topics: ["python.read"] },
        { id: "python.s3", title: "コードを選ぶ", topics: ["python.choose"] },
        { id: "python.s4", title: "コードを書く・テストする", topics: ["python.write", "python.testing"] },
        { id: "python.s5", title: "eval（評価）を作る", topics: ["python.eval"] }
    ],
    resources: [
        { title: "Python チュートリアル（公式・日本語）", url: "https://docs.python.org/ja/3/tutorial/", note: "最初に通読したい公式ドキュメント" },
        { title: "paiza ラーニング / AtCoder", url: "https://atcoder.jp/", note: "コードを書く練習量を増やす" }
    ],
    questions
};
