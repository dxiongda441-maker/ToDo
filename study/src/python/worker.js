// Python 実行用の Web Worker。Pyodide（ブラウザで動く Python）を初回だけ読み込む。
// 無限ループしても画面が固まらないよう、メインスレッドとは別で動かす。

/* global importScripts, loadPyodide */
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let ready = null;

async function init() {
    importScripts(`${PYODIDE_URL}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    const harness = await (await fetch(new URL("./harness.py", self.location.href))).text();
    pyodide.runPython(harness);
    return pyodide;
}

self.onmessage = async event => {
    const { id, code, tests } = event.data;
    try {
        ready ||= init();
        const pyodide = await ready;
        const runJson = pyodide.globals.get("run_json");
        const output = runJson(JSON.stringify({ code, tests }));
        runJson.destroy();
        self.postMessage({ id, result: JSON.parse(output) });
    } catch (error) {
        ready = null;
        self.postMessage({ id, loadError: String(error && error.message ? error.message : error) });
    }
};
