"""価格データの取得。

戻り値は常に DatetimeIndex（タイムゾーンなし）と open/high/low/close/volume 列を持つ DataFrame。
外部へのアクセスは Yahoo Finance（yfinance）と FRED への HTTPS GET のみ。
"""

from __future__ import annotations

import io
import os
import time
from datetime import date, datetime, timedelta

import pandas as pd
import requests

from .symbols import Instrument

COLUMNS = ["open", "high", "low", "close", "volume"]

PERIOD_DAYS = {
    "1mo": 31, "3mo": 92, "6mo": 183, "1y": 366, "2y": 731, "3y": 1096,
    "5y": 1827, "10y": 3653, "20y": 7305,
}
DAILY_INTERVALS = {"1d", "1wk", "1mo"}
INTRADAY_INTERVALS = {"5m", "15m", "30m", "1h"}
# Yahoo が日中足を返す最大の遡り日数（これを超えると空になる）
INTRADAY_MAX_DAYS = {"5m": 59, "15m": 59, "30m": 59, "1h": 729}

_CACHE_TTL_S = 15 * 60
_cache: dict[tuple, tuple[float, pd.DataFrame]] = {}

FRED_API = "https://api.stlouisfed.org/fred/series/observations"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
_HTTP_TIMEOUT_S = 20


class DataError(RuntimeError):
    pass


def resolve_range(period: str | None, start: str | None, end: str | None) -> tuple[date, date | None]:
    """period（例: 1y, 5y, ytd, max）または start/end（YYYY-MM-DD）から取得期間を決める。"""
    end_d = _parse_date(end) if end else None
    if start:
        return _parse_date(start), end_d
    p = (period or "1y").lower()
    anchor = end_d or date.today()
    if p == "max":
        return date(1950, 1, 1), end_d
    if p == "ytd":
        return date(anchor.year, 1, 1), end_d
    if p not in PERIOD_DAYS:
        raise ValueError(f"period は {sorted(PERIOD_DAYS) + ['ytd', 'max']} のいずれかで指定してください: {period!r}")
    return anchor - timedelta(days=PERIOD_DAYS[p]), end_d


def _parse_date(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError as e:
        raise ValueError(f"日付は YYYY-MM-DD 形式で指定してください: {s!r}") from e


def get_history(inst: Instrument, start: date, end: date | None = None,
                interval: str = "1d", source: str = "auto") -> tuple[pd.DataFrame, str]:
    """価格履歴と、実際に使ったデータソース名を返す。"""
    if interval not in DAILY_INTERVALS | INTRADAY_INTERVALS:
        raise ValueError(f"interval は {sorted(DAILY_INTERVALS | INTRADAY_INTERVALS)} のいずれかです: {interval!r}")
    if source not in {"auto", "yahoo", "fred"}:
        raise ValueError("source は auto / yahoo / fred のいずれかです。")
    if interval in INTRADAY_INTERVALS:
        limit = INTRADAY_MAX_DAYS[interval]
        start = max(start, date.today() - timedelta(days=limit))
        if source == "fred":
            raise ValueError("FRED は日足のみです。日中足は source='yahoo' を使ってください。")
        source = "yahoo"

    order = {"auto": ["yahoo", "fred"], "yahoo": ["yahoo"], "fred": ["fred"]}[source]
    errors = []
    for src in order:
        ticker = getattr(inst, src)
        if not ticker:
            errors.append(f"{src}: この銘柄は未対応")
            continue
        try:
            df = _cached(src, ticker, start, end, interval)
        except Exception as e:  # ネットワーク・取得元の一時障害など
            errors.append(f"{src}: {e}")
            continue
        if not df.empty:
            if interval in {"1wk", "1mo"} and src == "fred":
                df = _resample(df, interval)
            return df, src
        errors.append(f"{src}: データが空")
    raise DataError(f"{inst.key} のデータを取得できませんでした（" + " / ".join(errors) + "）")


def _cached(src: str, ticker: str, start: date, end: date | None, interval: str) -> pd.DataFrame:
    key = (src, ticker, start, end, interval if src == "yahoo" else "1d")
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    df = _fetch_yahoo(ticker, start, end, interval) if src == "yahoo" else _fetch_fred(ticker, start, end)
    _cache[key] = (time.time(), df)
    return df


def _fetch_yahoo(ticker: str, start: date, end: date | None, interval: str) -> pd.DataFrame:
    import yfinance as yf  # 起動を軽くするため遅延 import

    end_excl = (end + timedelta(days=1)) if end else None
    raw = yf.Ticker(ticker).history(start=start.isoformat(),
                                    end=end_excl.isoformat() if end_excl else None,
                                    interval=interval, auto_adjust=False)
    if raw is None or raw.empty:
        return pd.DataFrame(columns=COLUMNS)
    df = raw.rename(columns=str.lower)
    df = df[[c for c in COLUMNS if c in df.columns]].copy()
    idx = pd.DatetimeIndex(df.index)
    if idx.tz is not None:
        idx = idx.tz_convert("Asia/Tokyo").tz_localize(None) if interval in INTRADAY_INTERVALS else idx.tz_localize(None)
    df.index = idx if interval in INTRADAY_INTERVALS else idx.normalize()
    return _clean(df)


def _fetch_fred(series: str, start: date, end: date | None) -> pd.DataFrame:
    api_key = os.environ.get("FRED_API_KEY")
    if api_key:
        params = {"series_id": series, "api_key": api_key, "file_type": "json",
                  "observation_start": start.isoformat()}
        if end:
            params["observation_end"] = end.isoformat()
        r = requests.get(FRED_API, params=params, timeout=_HTTP_TIMEOUT_S)
        r.raise_for_status()
        obs = r.json().get("observations", [])
        s = pd.Series({o["date"]: o["value"] for o in obs}, dtype="object")
    else:
        r = requests.get(FRED_CSV, params={"id": series}, timeout=_HTTP_TIMEOUT_S)
        r.raise_for_status()
        csv = pd.read_csv(io.StringIO(r.text))
        s = pd.Series(csv.iloc[:, 1].values, index=csv.iloc[:, 0].values)
    return _close_only_frame(s, start, end)


def _close_only_frame(s: pd.Series, start: date, end: date | None) -> pd.DataFrame:
    """FRED のような終値だけの系列を OHLCV 形式にそろえる（open=high=low=close）。"""
    close = pd.to_numeric(s.replace(".", None), errors="coerce")
    close.index = pd.to_datetime(close.index)
    close = close.dropna().sort_index()
    close = close[close.index >= pd.Timestamp(start)]
    if end:
        close = close[close.index <= pd.Timestamp(end)]
    df = pd.DataFrame({"open": close, "high": close, "low": close, "close": close, "volume": float("nan")})
    return _clean(df)


def _resample(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    rule = {"1wk": "W-FRI", "1mo": "ME"}[interval]
    out = df.resample(rule).agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
    return _clean(out)


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    for c in COLUMNS:
        if c not in df.columns:
            df[c] = float("nan")
    df = df[COLUMNS].astype(float)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df.dropna(subset=["close"])
