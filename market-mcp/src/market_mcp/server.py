"""MCP サーバー本体。Claude Code / Codex から stdio で起動される。

ツールは「関数を書いて @mcp.tool() を付けるだけ」で公開される。
関数の docstring と引数の型が、そのまま AI へのツール説明になる。
"""

from __future__ import annotations

from typing import Literal

from mcp.server.fastmcp import FastMCP

from . import analytics, backtest
from .data import get_history, resolve_range
from .symbols import INSTRUMENTS, resolve

mcp = FastMCP("market-mcp")

Source = Literal["auto", "yahoo", "fred"]
Interval = Literal["1d", "1wk", "1mo", "1h", "30m", "15m", "5m"]
SOURCE_NOTE = {
    "yahoo": "Yahoo Finance（yfinance 経由・非公式 API・個人利用の範囲で）",
    "fred": "FRED, Federal Reserve Bank of St. Louis（https://fred.stlouisfed.org/）",
}


def _load(symbol: str, period: str | None, start: str | None, end: str | None,
          interval: str = "1d", source: str = "auto"):
    inst = resolve(symbol)
    s, e = resolve_range(period, start, end)
    df, used = get_history(inst, s, e, interval=interval, source=source)
    meta = {"symbol": inst.key, "name": inst.name, "interval": interval,
            "data_source": SOURCE_NOTE[used], "instrument_note": inst.note}
    return inst, df, meta


@mcp.tool()
def list_instruments() -> dict:
    """対応している銘柄（ゴールド・日経225・BTCUSD・ドル円）と別名、データ取得元の一覧を返す。

    定義外の銘柄も Yahoo のティッカー（例: ^GSPC, EURUSD=X, 7203.T）を直接指定すれば取得できる。
    """
    return {
        "instruments": [{"symbol": i.key, "name": i.name, "yahoo_ticker": i.yahoo, "fred_series": i.fred,
                         "note": i.note} for i in INSTRUMENTS.values()],
        "aliases_example": ["金", "XAUUSD", "日経", "N225", "BTC", "ビットコイン", "ドル円"],
        "periods": ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y", "20y", "ytd", "max"],
    }


@mcp.tool()
def get_price_history(symbol: str, period: str = "3mo", interval: Interval = "1d",
                      start: str | None = None, end: str | None = None,
                      source: Source = "auto", max_rows: int = 30) -> dict:
    """価格の履歴（始値・高値・安値・終値・出来高）を取得する。

    Args:
        symbol: GOLD / NIKKEI225 / BTCUSD / USDJPY（別名や Yahoo ティッカーも可）
        period: 1mo〜20y, ytd, max。start を指定した場合は無視される
        interval: 1d/1wk/1mo、または日中足 1h/30m/15m/5m（日中足は Yahoo のみ、1h は約2年・5〜30m は約60日まで）
        start, end: YYYY-MM-DD
        source: auto（Yahoo→失敗時 FRED）/ yahoo / fred（FRED は公式データだが終値のみ）
        max_rows: 返す行数の上限（直近から）。会話を軽く保つため既定 30
    """
    _, df, meta = _load(symbol, period, start, end, interval, source)
    max_rows = max(1, min(int(max_rows), 500))
    tail = df.tail(max_rows)
    rows = [{"date": analytics._d(ts), **{k: (None if v != v else round(v, 4)) for k, v in r.items()}}
            for ts, r in tail.iterrows()]
    return {**meta, "total_rows": int(len(df)), "first_date": analytics._d(df.index[0]),
            "last_date": analytics._d(df.index[-1]), "rows_returned": len(rows), "rows": rows}


@mcp.tool()
def get_performance(symbol: str, period: str = "5y", start: str | None = None, end: str | None = None,
                    source: Source = "auto") -> dict:
    """過去のパフォーマンスを分析する：累積リターン、年率リターン(CAGR)、年率ボラティリティ、
    シャープレシオ、最大ドローダウン（いつからいつまで・回復日）、年別リターン、年×月のリターン表。
    """
    _, df, meta = _load(symbol, period, start, end, "1d", source)
    return {**meta, "performance": analytics.performance(df["close"]),
            "calendar": analytics.calendar_returns(df["close"])}


@mcp.tool()
def get_seasonality(symbol: str, period: str = "10y", source: Source = "auto") -> dict:
    """季節性（アノマリー）を調べる：月別・曜日別の平均リターンと勝率（上昇した割合）。"""
    _, df, meta = _load(symbol, period, None, None, "1d", source)
    return {**meta, "period_start": analytics._d(df.index[0]), "period_end": analytics._d(df.index[-1]),
            **analytics.seasonality(df["close"])}


@mcp.tool()
def get_technical_snapshot(symbol: str, source: Source = "auto") -> dict:
    """現在の相場状況の要約：移動平均(20/50/200)との位置、RSI14、ATR14、52週高値・安値からの距離、
    1週・1か月・3か月・1年の騰落率。
    """
    _, df, meta = _load(symbol, "2y", None, None, "1d", source)
    return {**meta, **analytics.technical_snapshot(df)}


@mcp.tool()
def compare_assets(symbols: list[str] | None = None, period: str = "1y", source: Source = "auto") -> dict:
    """複数銘柄のパフォーマンス比較と、日次リターンの相関係数。

    Args:
        symbols: 省略時は GOLD, NIKKEI225, BTCUSD, USDJPY の 4 銘柄
    """
    symbols = symbols or list(INSTRUMENTS)
    if len(symbols) > 8:
        raise ValueError("比較は 8 銘柄までにしてください。")
    table, closes, sources, failed = [], {}, {}, {}
    for sym in symbols:
        try:
            inst, df, meta = _load(sym, period, None, None, "1d", source)
        except Exception as e:  # 1 銘柄の失敗で全体を止めない
            failed[sym] = str(e)
            continue
        p = analytics.performance(df["close"])
        table.append({"symbol": inst.key, "total_return_pct": p["total_return_pct"], "cagr_pct": p["cagr_pct"],
                      "annual_volatility_pct": p["annual_volatility_pct"], "sharpe": p["sharpe"],
                      "max_drawdown_pct": p["max_drawdown_pct"]})
        closes[inst.key] = df["close"]
        sources[inst.key] = meta["data_source"]
    out = {"period": period, "comparison": table, "data_sources": sources}
    if len(closes) >= 2:
        out["correlation"] = analytics.correlation(closes)
    if failed:
        out["failed"] = failed
    return out


@mcp.tool()
def list_strategies() -> dict:
    """run_backtest で使える売買ルールとパラメータの一覧。"""
    return {"strategies": backtest.STRATEGIES}


@mcp.tool()
def run_backtest(symbol: str, strategy: str = "sma_cross", period: str = "5y",
                 params: dict | None = None, fee_bps: float = 5.0, interval: Interval = "1d",
                 start: str | None = None, end: str | None = None, source: Source = "auto") -> dict:
    """売買ルールを過去データで検証（バックテスト）し、買い持ちと比較する。

    Args:
        strategy: buy_and_hold / sma_cross / rsi_reversion / breakout（詳細は list_strategies）
        params: 例 {"fast": 10, "slow": 30}、{"period": 14, "lower": 25, "upper": 65}
        fee_bps: 片道の手数料＋スリッページ（ベーシスポイント。5 = 0.05%）
    """
    _, df, meta = _load(symbol, period, start, end, interval, source)
    if not 0 <= fee_bps <= 500:
        raise ValueError("fee_bps は 0〜500 の範囲で指定してください。")
    return {**meta, **backtest.run(df, strategy, params or {}, fee_bps)}


def main() -> None:
    mcp.run()  # stdio（ローカル専用。ネットワークにポートを開かない）


if __name__ == "__main__":
    main()
