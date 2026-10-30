const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png"
};

function serveDirectory(root) {
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => {
        server.listen(0, "127.0.0.1", () => {
            resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
        });
    });
}

// Opens the app in a fresh browser context. `storage` seeds localStorage
// before the app reads it; dialogs are accepted and recorded; page errors are
// collected so graders can fail on them.
function createAppDriver(browser, baseUrl) {
    return {
        baseUrl,
        async open({ storage } = {}) {
            const context = await browser.newContext({ locale: "ja-JP" });
            context.setDefaultTimeout(5000);
            const page = await context.newPage();
            const dialogs = [];
            const errors = [];
            page.on("dialog", dialog => {
                dialogs.push({ type: dialog.type(), message: dialog.message() });
                dialog.accept().catch(() => {});
            });
            page.on("pageerror", error => errors.push(String(error)));
            await page.goto(`${baseUrl}/index.html`);
            if (storage) {
                await page.evaluate(entries => {
                    localStorage.clear();
                    for (const [key, value] of Object.entries(entries)) {
                        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
                    }
                }, storage);
                await page.reload();
            }
            return {
                page,
                dialogs,
                errors,
                readStorage: key => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), key),
                visibleTaskTexts: () => page.locator("#task-list .task-item .task-text").allTextContents(),
                close: () => context.close()
            };
        }
    };
}

module.exports = { serveDirectory, createAppDriver };
