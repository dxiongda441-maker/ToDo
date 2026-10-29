// Builds dev/preview.html: the claude.ai page source (site.html) wrapped in a normal
// HTML skeleton, with a fake `window.claude` that serves dev/sample-data.json.
// Usage: node portfolio/dev/build-preview.mjs  → open portfolio/dev/preview.html in a browser.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const site = readFileSync(join(dir, "..", "site.html"), "utf8");
const data = JSON.parse(readFileSync(join(dir, "sample-data.json"), "utf8"));

// In-memory stand-in for the artifact `db` capability (only what site.html uses).
const mock = `
(function () {
  var store = { tx: {}, posts: {}, settings: {} };
  var data = ${JSON.stringify(data)};
  data.tx.forEach(function (d) { store.tx[d.id] = Object.assign({}, d); delete store.tx[d.id].id; });
  data.posts.forEach(function (d) { store.posts[d.id] = Object.assign({}, d); delete store.posts[d.id].id; });
  Object.keys(data.settings).forEach(function (k) { store.settings[k] = data.settings[k]; });
  var listeners = [];
  function notify() { listeners.forEach(function (l) { l(); }); }
  function snap(id, body) { return { id: id, exists: !!body, data: function () { return body; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function cmp(a, op, b) { return op === ">=" ? a >= b : op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : op === "==" ? a === b : true; }
  function query(name, filters, order, lim) {
    function run() {
      var col = store[name] || {};
      var ids = Object.keys(col).filter(function (id) { return filters.every(function (f) { return cmp(col[id][f[0]], f[1], f[2]); }); });
      if (order) ids.sort(function (x, y) { var a = col[x][order[0]], b = col[y][order[0]]; var r = a < b ? -1 : a > b ? 1 : 0; return order[1] === "desc" ? -r : r; });
      ids = ids.slice(0, lim || 1000);
      var docs = ids.map(function (id) { return snap(id, col[id]); });
      return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    return {
      where: function (f, op, v) { return query(name, filters.concat([[f, op, v]]), order, lim); },
      orderBy: function (f, d) { return query(name, filters, [f, d || "asc"], lim); },
      limit: function (n) { return query(name, filters, order, n); },
      get: function () { return Promise.resolve(run()); },
      onSnapshot: function (next) { var l = function () { next(run()); }; listeners.push(l); setTimeout(l, 10); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; },
      doc: function (id) { return docRef(name, id || ("local" + Date.now() + Math.random().toString(36).slice(2, 6))); }
    };
  }
  function docRef(name, id) {
    return {
      id: id, path: name + "/" + id,
      get: function () { return Promise.resolve(snap(id, (store[name] || {})[id])); },
      set: function (d) { (store[name] = store[name] || {})[id] = Object.assign({}, d); notify(); return Promise.resolve(); },
      update: function (d) { var c = (store[name] || {})[id]; if (!c) return Promise.reject({ code: "invalid_argument" }); Object.assign(c, d); notify(); return Promise.resolve(); },
      delete: function () { if (store[name]) delete store[name][id]; notify(); return Promise.resolve(); },
      onSnapshot: function (next) { var l = function () { next(snap(id, (store[name] || {})[id])); }; listeners.push(l); setTimeout(l, 10); return function () {}; }
    };
  }
  var db = {
    collection: function (name) { return query(name, [], null, 0); },
    doc: function (path) { var p = path.split("/"); return docRef(p[0], p[1]); }
  };
  window.claude = { use: function (n) { return Promise.resolve(n === "db" ? db : null); } };
})();
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script>${mock}</script></head><body>
<div style="background:#a8710f;color:#fff;padding:6px 12px;font:12px sans-serif">ローカルプレビュー：表示しているのは架空のサンプルデータです（保存はブラウザを閉じると消えます）</div>
${site}
</body></html>`;

writeFileSync(join(dir, "preview.html"), html);
console.log("wrote", join(dir, "preview.html"));
