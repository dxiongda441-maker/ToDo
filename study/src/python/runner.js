// メインスレッド側の Python 実行窓口。時間切れになったら Worker ごと作り直す。

const FIRST_RUN_TIMEOUT_MS = 60000; // 初回は Pyodide のダウンロードを含む
const RUN_TIMEOUT_MS = 8000;

let worker = null;
let warmedUp = false;
let nextId = 1;

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./worker.js", import.meta.url));
    }
    return worker;
}

function resetWorker() {
    if (worker) worker.terminate();
    worker = null;
    warmedUp = false;
}

/**
 * @returns {Promise<{ result?: object, loadError?: string, timeout?: boolean }>}
 */
export function runPython(code, tests) {
    const id = nextId++;
    const target = getWorker();
    const limit = warmedUp ? RUN_TIMEOUT_MS : FIRST_RUN_TIMEOUT_MS;

    return new Promise(resolve => {
        const timer = setTimeout(() => {
            target.removeEventListener("message", onMessage);
            resetWorker();
            resolve({ timeout: true });
        }, limit);

        function onMessage(event) {
            if (event.data.id !== id) return;
            clearTimeout(timer);
            target.removeEventListener("message", onMessage);
            if (event.data.result) warmedUp = true;
            resolve(event.data);
        }

        target.addEventListener("message", onMessage);
        target.postMessage({ id, code, tests });
    });
}
