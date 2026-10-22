# コード問題の採点ハーネス。ブラウザでは Pyodide 上で、テストでは通常の python3 で動く。
# 利用者のコードを実行してから、各テスト（assert を含むコード片）を順に実行して結果を JSON で返す。

import io
import json
import sys
import traceback
from contextlib import redirect_stdout

MAX_OUTPUT = 4000


def _short_error(exc):
    lines = traceback.format_exception_only(type(exc), exc)
    return "".join(lines).strip()


def run_submission(user_code, tests):
    namespace = {"__name__": "__submission__"}
    stdout = io.StringIO()
    result = {"error": None, "stdout": "", "tests": []}

    try:
        with redirect_stdout(stdout):
            exec(compile(user_code, "<あなたのコード>", "exec"), namespace)
    except BaseException as exc:  # SyntaxError も含めて利用者に見せる
        result["error"] = _short_error(exc)
        result["stdout"] = stdout.getvalue()[:MAX_OUTPUT]
        return result

    for test in tests:
        entry = {"name": test.get("name", ""), "ok": False, "message": ""}
        try:
            with redirect_stdout(stdout):
                exec(compile(test["code"], "<テスト>", "exec"), dict(namespace))
            entry["ok"] = True
        except AssertionError as exc:
            entry["message"] = str(exc) or "期待した結果と違います"
        except BaseException as exc:
            entry["message"] = _short_error(exc)
        result["tests"].append(entry)

    result["stdout"] = stdout.getvalue()[:MAX_OUTPUT]
    return result


def run_json(payload_json):
    payload = json.loads(payload_json)
    return json.dumps(run_submission(payload["code"], payload["tests"]), ensure_ascii=False)


if __name__ == "__main__" and sys.platform != "emscripten":
    # テスト用: python3 harness.py < {"code": ..., "tests": [...]}
    # （Pyodide 上でも __name__ は "__main__" になるので、emscripten では実行しない）
    print(run_json(sys.stdin.read()))
