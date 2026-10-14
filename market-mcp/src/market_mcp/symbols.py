"""対象銘柄の定義と別名の解決。

各銘柄について、データ取得元ごとのティッカーを持つ。
- yahoo: yfinance 経由の Yahoo Finance（OHLCV・日中足あり。非公式 API）
- fred : 米セントルイス連銀 FRED（公式・無料。終値のみ・日足のみ）
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Instrument:
    key: str
    name: str
    yahoo: str | None
    fred: str | None
    note: str


INSTRUMENTS: dict[str, Instrument] = {
    "GOLD": Instrument(
        key="GOLD",
        name="ゴールド（COMEX 金先物・期近つなぎ, USD/oz）",
        yahoo="GC=F",
        fred=None,  # FRED の LBMA 金価格は 2022 年に提供終了
        note="先物の期近つなぎ足のため、限月交代時に小さな段差が出ることがある。",
    ),
    "NIKKEI225": Instrument(
        key="NIKKEI225",
        name="日経平均株価（日経225）",
        yahoo="^N225",
        fred="NIKKEI225",
        note="FRED は終値のみ。日中足が必要なら yahoo を使う。",
    ),
    "BTCUSD": Instrument(
        key="BTCUSD",
        name="ビットコイン / 米ドル",
        yahoo="BTC-USD",
        fred="CBBTCUSD",  # Coinbase Bitcoin（日次）
        note="24時間365日取引のため、年率換算は暦日ベースで自動調整する。",
    ),
    "USDJPY": Instrument(
        key="USDJPY",
        name="米ドル / 円",
        yahoo="JPY=X",
        fred="DEXJPUS",  # 1ドルあたりの円（NY 正午レート）
        note="値は 1 ドルあたりの円。上昇＝円安ドル高。",
    ),
}

ALIASES: dict[str, str] = {
    "GOLD": "GOLD", "XAUUSD": "GOLD", "XAU": "GOLD", "GC": "GOLD", "金": "GOLD", "ゴールド": "GOLD",
    "NIKKEI225": "NIKKEI225", "NIKKEI": "NIKKEI225", "N225": "NIKKEI225", "NI225": "NIKKEI225",
    "日経": "NIKKEI225", "日経225": "NIKKEI225", "日経平均": "NIKKEI225",
    "BTCUSD": "BTCUSD", "BTC": "BTCUSD", "BITCOIN": "BTCUSD", "BTCUSDT": "BTCUSD", "ビットコイン": "BTCUSD",
    "USDJPY": "USDJPY", "USD/JPY": "USDJPY", "ドル円": "USDJPY", "JPY": "USDJPY",
}

# 定義外のティッカーを Yahoo にそのまま渡すときに許す文字（例: ^GSPC, EURUSD=X, 7203.T）
_RAW_TICKER = re.compile(r"^[A-Za-z0-9^=.\-]{1,20}$")


def resolve(symbol: str) -> Instrument:
    """別名や生ティッカーを Instrument に解決する。"""
    if not symbol or not symbol.strip():
        raise ValueError("symbol が空です。GOLD / NIKKEI225 / BTCUSD / USDJPY のいずれかを指定してください。")
    s = symbol.strip()
    key = ALIASES.get(s.upper().replace(" ", "")) or ALIASES.get(s)
    if key:
        return INSTRUMENTS[key]
    if _RAW_TICKER.match(s):
        return Instrument(key=s.upper(), name=f"Yahoo ティッカー {s}", yahoo=s, fred=None,
                          note="定義外の銘柄。Yahoo Finance から取得する。")
    raise ValueError(f"不明な銘柄です: {symbol!r}")
