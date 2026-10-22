// Python。目標：自分でコードを書き、eval（評価）を作れるようになる。
// コード問題はブラウザ内の Python（Pyodide）でテストを実行して自動採点する。
// 選択問題の出力は tests/content.test.js で実際に Python を実行して検証している（verify フラグ）。

import { bank } from "./helpers.js";

const { choice, cloze, free, code } = bank("python");

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
    code("control.005", "control", 2,
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
    code("datastruct.007", "datastruct", 2,
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
    choice("functions.002", "functions", 4, "次のコードの出力はどれか。", ["[2]", "[1, 2]", "[[1], [2]]", "エラー"], 1,
        "既定値の [] は関数を定義したときに 1 回だけ作られ、呼び出しの間で共有されます。既定値には None を使い、関数の中でリストを作るのが定石です。",
        "def add(item, box=[]):\n    box.append(item)\n    return box\n\nadd(1)\nprint(add(2))"),
    code("functions.003", "functions", 2,
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

    // ── 標準ライブラリ・内包表記 ──
    choice("stdlib.001", "stdlib", 2, "次のコードの出力はどれか。", ["[0, 2, 4]", "[2, 4, 6]", "[0, 1, 2]", "[0, 2, 4, 6]"], 0,
        "リスト内包表記。range(3) の各要素を 2 倍しています。", "print([x * 2 for x in range(3)])"),
    choice("stdlib.002", "stdlib", 3, "次のコードの出力はどれか。", ["[3, 6, 9]", "[0, 3, 6, 9]", "[0, 3, 6]", "[1, 4, 7]"], 1,
        "0 も 3 で割り切れる（余り 0）ので含まれます。", "print([x for x in range(10) if x % 3 == 0])"),
    choice("stdlib.003", "stdlib", 3, "次のコードの出力はどれか。", ["[('a', 3)]", "[('b', 1)]", "{'a': 3}", "[('n', 2)]"], 0,
        "Counter は要素の出現回数を数え、most_common(1) で最も多いものを返します。",
        'from collections import Counter\nprint(Counter("banana").most_common(1))'),
    code("stdlib.004", "stdlib", 3,
        "関数 squares_of_evens(nums) を作りなさい。リストの中の偶数だけを 2 乗したリストを、元の順番で返す（リスト内包表記を使ってみよう）。",
        "def squares_of_evens(nums):\n    # ここに書く\n    pass\n",
        [
            { name: "[1, 2, 3, 4] → [4, 16]", code: "assert squares_of_evens([1, 2, 3, 4]) == [4, 16]" },
            { name: "[] → []", code: "assert squares_of_evens([]) == []" },
            { name: "負の偶数も対象", code: "assert squares_of_evens([-2, 5]) == [4]" }
        ],
        "def squares_of_evens(nums):\n    return [n * n for n in nums if n % 2 == 0]\n",
        "[式 for 変数 in リスト if 条件] の形です。"),

    // ── 例外・ファイル ──
    choice("errors.001", "errors", 2, "次のコードを実行したときに発生する例外はどれか。",
        ["TypeError", "ValueError", "KeyError", "SyntaxError"], 1,
        "型は正しい（文字列）が、値が整数として解釈できないので ValueError です。", 'int("abc")'),
    choice("errors.002", "errors", 2, "次のコードを実行したときに発生する例外はどれか。",
        ["IndexError", "ValueError", "KeyError", "NameError"], 2,
        "辞書に存在しないキーを [] で取り出すと KeyError です。", 'd = {"a": 1}\nd["b"]'),
    code("errors.003", "errors", 3,
        "関数 safe_divide(a, b) を作りなさい。a / b を返すが、b が 0 のときは例外を出さずに None を返す（try / except を使ってみよう）。",
        "def safe_divide(a, b):\n    # ここに書く\n    pass\n",
        [
            { name: "safe_divide(6, 3) == 2", code: "assert safe_divide(6, 3) == 2" },
            { name: "safe_divide(1, 0) is None", code: "assert safe_divide(1, 0) is None" }
        ],
        "def safe_divide(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None\n",
        "except には捕まえたい例外の種類を具体的に書くのが良い習慣です。"),
    cloze("errors.004", "errors", 2, "ファイルを確実に閉じるために、{0} open(\"a.txt\") as f: のように書く。", [["with"]],
        "with ブロックを抜けると、例外が起きても自動でファイルが閉じられます。"),

    // ── クラス ──
    choice("oop.001", "oop", 2, "クラスの __init__ メソッドの役割として正しいものはどれか。",
        ["インスタンスが作られるときに初期化を行う", "インスタンスを削除する", "クラスを文字列に変換する", "クラスをコピーする"], 0,
        "obj = MyClass(...) のときに自動で呼ばれ、self.属性 = 値 のように初期値を設定します。"),
    choice("oop.002", "oop", 3, "次のコードの出力はどれか。", ["wan", "wanwan", "sound2", "エラー"], 1,
        "self.sound はクラス変数 sound を参照し、それを 2 回繰り返しています。",
        'class Dog:\n    sound = "wan"\n\n    def speak(self):\n        return self.sound * 2\n\nprint(Dog().speak())'),
    code("oop.003", "oop", 3,
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
        'print(eval("2 + 3 * 4"))')
];

export default {
    id: "python",
    name: "Python",
    short: "Py",
    icon: "🐍",
    color: "#059669",
    description: "自分でコードを書き、テストと eval（評価）を作れるようになるまで。",
    allowCode: true,
    defaultDailyQuota: 10,
    defaultGoal: { title: "自分でコードを書き、eval（評価）を作れるようになる", presetId: "py-eval" },
    goalPresets: [
        { id: "py-eval", title: "自分でコードを書き、eval（評価）を作れるようになる", hasDeadline: false },
        { id: "py-cert", title: "Python 3 エンジニア認定基礎試験に合格する", hasDeadline: true }
    ],
    topics: [
        { id: "python.basics", name: "基本文法・型", weight: 3 },
        { id: "python.control", name: "制御構文", weight: 3 },
        { id: "python.datastruct", name: "データ構造", weight: 3 },
        { id: "python.functions", name: "関数", weight: 3 },
        { id: "python.stdlib", name: "内包表記・標準ライブラリ", weight: 2 },
        { id: "python.errors", name: "例外・ファイル", weight: 2 },
        { id: "python.oop", name: "クラス", weight: 2 },
        { id: "python.testing", name: "テスト", weight: 2 },
        { id: "python.eval", name: "eval（評価）を作る", weight: 3 }
    ],
    stages: [
        { id: "python.s1", title: "基本文法と制御構文", topics: ["python.basics", "python.control"] },
        { id: "python.s2", title: "データ構造", topics: ["python.datastruct"] },
        { id: "python.s3", title: "関数と標準ライブラリ", topics: ["python.functions", "python.stdlib"] },
        { id: "python.s4", title: "例外とクラス", topics: ["python.errors", "python.oop"] },
        { id: "python.s5", title: "テストを書く", topics: ["python.testing"] },
        { id: "python.s6", title: "eval（評価）を自作する", topics: ["python.eval"] }
    ],
    resources: [
        { title: "Python チュートリアル（公式・日本語）", url: "https://docs.python.org/ja/3/tutorial/", note: "最初に通読したい公式ドキュメント" },
        { title: "paiza ラーニング / AtCoder", url: "https://atcoder.jp/", note: "コードを書く練習量を増やす" }
    ],
    questions
};
