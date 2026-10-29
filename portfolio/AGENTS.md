# Instructions for coding agents (Codex など)

This folder holds the source of a private personal-finance site that runs as a claude.ai Artifact.

- `site.html` is the page body as published to claude.ai: no `<!doctype>`, `<html>`, `<head>` or `<body>` tags; `<title>` and `<style>` sit at the top. Keep that shape.
- The page reaches its data only through `window.claude.use("db")` (collections `tx`, `posts`, `settings`). Do not add `fetch` calls to other hosts: the claude.ai frame blocks them.
- External scripts may load only from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, unpkg.com, cdn.tailwindcss.com or code.jquery.com, pinned to an exact version. Stylesheets only from Google Fonts.
- Colors are tokens on `:root` with dark-mode overrides; keep new colors in that system.
- Preview: `node portfolio/dev/build-preview.mjs`, then open `portfolio/dev/preview.html`. It uses fake data from `dev/sample-data.json`.
- Never commit real financial records, loan details, card or account numbers, balances, or people's names. This repository is public. Sample data must stay obviously fake.
- Changes reach the live page only when a Claude session republishes `site.html`; say so in your summary when you change it.
