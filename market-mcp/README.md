# market-mcp（自作の相場分析 MCP サーバー）

ゴールド・日経225・ビットコイン/USD・ドル円の過去データを取得し、
**パフォーマンス分析・季節性（アノマリー）・テクニカル状況・簡易バックテスト**を
Claude Code / Codex から日本語で依頼できるようにする MCP サーバーです。

- TradingView のアカウントは使いません（無料プランのままで問題ありません）
- データ取得元: Yahoo Finance（yfinance・非公式・個人利用向け）→ 失敗時は FRED（米セントルイス連銀の公式データ）に自動切替
- 外部への通信は上記 2 か所への HTTPS の読み取りのみ。ファイル書き込み・シェル実行・ポート開放はしません

## 対応銘柄

| 指定名（別名） | 内容 | Yahoo | FRED |
|---|---|---|---|
| `GOLD`（金, XAUUSD） | COMEX 金先物・期近つなぎ | GC=F | なし |
| `NIKKEI225`（日経, N225） | 日経平均株価 | ^N225 | NIKKEI225 |
| `BTCUSD`（BTC, ビットコイン） | ビットコイン/米ドル | BTC-USD | CBBTCUSD |
| `USDJPY`（ドル円） | 米ドル/円 | JPY=X | DEXJPUS |

上記以外も Yahoo のティッカー（例 `^GSPC`, `EURUSD=X`, `7203.T`）を直接指定できます。

## ツール一覧

| ツール | できること |
|---|---|
| `list_instruments` | 対応銘柄と別名の一覧 |
| `get_price_history` | OHLCV（日足・週足・月足、日中足 1h/30m/15m/5m） |
| `get_performance` | 累積/年率リターン、ボラティリティ、シャープ、最大DD、年別・月別リターン表 |
| `get_seasonality` | 月別・曜日別の平均リターンと勝率 |
| `get_technical_snapshot` | SMA20/50/200、RSI14、ATR14、52週高安、騰落率 |
| `compare_assets` | 複数銘柄の比較と相関係数 |
| `list_strategies` / `run_backtest` | SMAクロス・RSI逆張り・ブレイクアウトの検証と買い持ち比較 |

## インストール

1. [uv](https://docs.astral.sh/uv/) をインストール（Python の実行管理ツール）
   - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
2. このフォルダで依存関係を入れる: `uv sync`
3. 動作確認（任意）: `uv run --extra dev pytest`

## Claude Code に登録

```bash
claude mcp add market -- uv --directory /絶対パス/market-mcp run market-mcp
```

Claude Code で `/mcp` を開き、`market` が connected になっていれば完了です。

## Codex に登録

`~/.codex/config.toml` に追記:

```toml
[mcp_servers.market]
command = "uv"
args = ["--directory", "/絶対パス/market-mcp", "run", "market-mcp"]
```

（Windows はパスを `"C:\\Users\\あなた\\market-mcp"` のように書きます）

## 使い方の例（日本語でそのまま頼めます）

- 「ゴールドの過去10年のパフォーマンスを、年別リターンの表にして」
- 「日経225の月別アノマリーを15年分で調べて、勝率が高い月を教えて」
- 「BTC とゴールドと日経とドル円の、この1年の比較と相関を表にして」
- 「ドル円で SMA 20/50 クロスを5年分バックテストして、買い持ちと比べて」

## FRED の API キー（任意）

キーなしでも FRED の公開 CSV から取得できます。安定性を上げたい場合は
[FRED の無料 API キー](https://fred.stlouisfed.org/docs/api/api_key.html) を取得し、
環境変数 `FRED_API_KEY` に設定してください（Claude Code なら `claude mcp add market -e FRED_API_KEY=xxxx -- ...`）。
キーは `.env` やコードに書かず、コミットしないでください。

## 注意

- 分析結果は情報提供のみを目的としており、投資助言ではありません。過去の成績は将来を保証しません。
- Yahoo Finance のデータは個人利用の範囲で使ってください。再配布はしないでください。
