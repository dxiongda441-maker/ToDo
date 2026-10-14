"""パフォーマンス指標・季節性・テクニカル指標の計算（純粋な pandas 処理。通信なし）。"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

MONTHS_JA = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
WEEKDAYS_JA = ["月", "火", "水", "木", "金", "土", "日"]


def periods_per_year(index: pd.DatetimeIndex) -> float:
    """実データの本数から年あたりの足の本数を推定する（BTC=約365、株・為替=約252 など）。"""
    if len(index) < 3:
        return 252.0
    years = (index[-1] - index[0]).total_seconds() / (365.25 * 86400)
    return (len(index) - 1) / years if years > 0 else 252.0


def performance(close: pd.Series, ppy: float | None = None) -> dict:
    """終値系列から代表的なパフォーマンス指標を計算する。"""
    close = close.dropna()
    if len(close) < 2:
        raise ValueError("指標の計算には 2 本以上のデータが必要です。")
    ppy = ppy or periods_per_year(close.index)
    rets = close.pct_change().dropna()
    return _metrics_from_returns(rets, ppy, start_price=float(close.iloc[0]), end_price=float(close.iloc[-1]))


def _metrics_from_returns(rets: pd.Series, ppy: float, start_price: float | None = None,
                          end_price: float | None = None) -> dict:
    equity = (1 + rets).cumprod()
    total = float(equity.iloc[-1] - 1)
    years = len(rets) / ppy
    cagr = (1 + total) ** (1 / years) - 1 if years > 0 and total > -1 else float("nan")
    vol = float(rets.std(ddof=1) * math.sqrt(ppy)) if len(rets) > 1 else float("nan")
    mean_ann = float(rets.mean() * ppy)
    downside = rets[rets < 0]
    dd_vol = float(downside.std(ddof=1) * math.sqrt(ppy)) if len(downside) > 1 else float("nan")
    dd = drawdown(equity)
    out = {
        "start": _d(rets.index[0]), "end": _d(rets.index[-1]), "bars": int(len(rets)),
        "total_return_pct": _pct(total),
        "cagr_pct": _pct(cagr),
        "annual_volatility_pct": _pct(vol),
        "sharpe": _r(mean_ann / vol if vol and vol > 0 else float("nan")),
        "sortino": _r(mean_ann / dd_vol if dd_vol and dd_vol > 0 else float("nan")),
        "max_drawdown_pct": _pct(dd["max_drawdown"]),
        "max_drawdown_peak": dd["peak"], "max_drawdown_trough": dd["trough"],
        "max_drawdown_recovered": dd["recovered"],
        "calmar": _r(cagr / abs(dd["max_drawdown"]) if dd["max_drawdown"] < 0 else float("nan")),
        "best_bar_pct": _pct(float(rets.max())), "best_bar_date": _d(rets.idxmax()),
        "worst_bar_pct": _pct(float(rets.min())), "worst_bar_date": _d(rets.idxmin()),
        "up_bar_ratio_pct": _pct(float((rets > 0).mean())),
    }
    if start_price is not None:
        out = {"start_price": _r(start_price, 4), "end_price": _r(end_price, 4), **out}
    return out


def drawdown(equity: pd.Series) -> dict:
    peak_curve = equity.cummax()
    dd = equity / peak_curve - 1
    trough = dd.idxmin()
    peak = equity.loc[:trough].idxmax()
    after = equity.loc[trough:]
    recovered = after[after >= equity.loc[peak]]
    return {
        "max_drawdown": float(dd.min()),
        "peak": _d(peak), "trough": _d(trough),
        "recovered": _d(recovered.index[0]) if len(recovered) else None,
    }


def calendar_returns(close: pd.Series) -> dict:
    """年次リターンと、年×月のリターン表（%）を返す。"""
    close = close.dropna()
    yearly = close.resample("YE").last().pct_change()
    # 初年度は期間の最初の値を基準にする
    first_year_end = close.resample("YE").last().iloc[0]
    yearly.iloc[0] = first_year_end / close.iloc[0] - 1
    monthly = close.resample("ME").last().pct_change()
    monthly.iloc[0] = close.resample("ME").last().iloc[0] / close.iloc[0] - 1

    table = {}
    for ts, v in monthly.items():
        table.setdefault(str(ts.year), {})[MONTHS_JA[ts.month - 1]] = _pct(v)
    return {
        "yearly_return_pct": {str(ts.year): _pct(v) for ts, v in yearly.items()},
        "monthly_return_pct": table,
        "note": "最初の年・月は取得期間の初日を基準にした途中からのリターン。",
    }


def seasonality(close: pd.Series) -> dict:
    """月別・曜日別の平均リターンと勝率（上昇した割合）。"""
    close = close.dropna()
    monthly = close.resample("ME").last().pct_change().dropna()
    by_month = []
    for m in range(1, 13):
        r = monthly[monthly.index.month == m]
        if len(r):
            by_month.append({"month": MONTHS_JA[m - 1], "avg_pct": _pct(r.mean()), "median_pct": _pct(r.median()),
                             "win_rate_pct": _pct((r > 0).mean()), "samples": int(len(r))})
    daily = close.pct_change().dropna()
    by_weekday = []
    for wd in range(7):
        r = daily[daily.index.dayofweek == wd]
        if len(r) >= 5:
            by_weekday.append({"weekday": WEEKDAYS_JA[wd], "avg_pct": _pct(r.mean(), 3),
                               "win_rate_pct": _pct((r > 0).mean()), "samples": int(len(r))})
    return {"by_month": by_month, "by_weekday": by_weekday,
            "caution": "過去の平均であり、サンプル数が少ない月は偶然の影響が大きい。"}


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder 方式の RSI。"""
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.where(loss != 0, 100.0).where(gain.notna())


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def technical_snapshot(df: pd.DataFrame) -> dict:
    close = df["close"]
    last = float(close.iloc[-1])
    out: dict = {"date": _d(close.index[-1]), "close": _r(last, 4)}
    for n in (20, 50, 200):
        if len(close) >= n:
            sma = float(close.rolling(n).mean().iloc[-1])
            out[f"sma{n}"] = _r(sma, 4)
            out[f"vs_sma{n}_pct"] = _pct(last / sma - 1)
    r = rsi(close).iloc[-1]
    out["rsi14"] = _r(float(r)) if pd.notna(r) else None
    a = atr(df).iloc[-1]
    if pd.notna(a):
        out["atr14"] = _r(float(a), 4)
        out["atr14_pct_of_price"] = _pct(float(a) / last)
    window = close.iloc[-252:] if len(close) >= 252 else close
    out["high_52w"], out["low_52w"] = _r(float(window.max()), 4), _r(float(window.min()), 4)
    out["from_52w_high_pct"] = _pct(last / float(window.max()) - 1)
    out["from_52w_low_pct"] = _pct(last / float(window.min()) - 1)
    for label, n in (("1w", 5), ("1m", 21), ("3m", 63), ("1y", 252)):
        if len(close) > n:
            out[f"change_{label}_pct"] = _pct(last / float(close.iloc[-1 - n]) - 1)
    trend = []
    if "sma50" in out and "sma200" in out:
        trend.append("ゴールデンクロス状態（SMA50>SMA200）" if out["sma50"] > out["sma200"] else "デッドクロス状態（SMA50<SMA200）")
    if out.get("rsi14") is not None:
        trend.append("RSI 買われすぎ圏" if out["rsi14"] >= 70 else "RSI 売られすぎ圏" if out["rsi14"] <= 30 else "RSI 中立圏")
    out["summary"] = trend
    return out


def correlation(closes: dict[str, pd.Series]) -> dict:
    rets = pd.DataFrame({k: v.pct_change() for k, v in closes.items()}).dropna()
    corr = rets.corr()
    return {"daily_return_correlation": {a: {b: _r(float(corr.loc[a, b])) for b in corr.columns} for a in corr.index},
            "overlapping_days": int(len(rets)),
            "note": "取引日が重なる日だけで計算（BTC の週末などは除外）。"}


# ── 数値の整形 ─────────────────────────────────────────────

def _r(x: float, nd: int = 2):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), nd)


def _pct(x: float, nd: int = 2):
    return None if x is None or not math.isfinite(float(x)) else round(float(x) * 100, nd)


def _d(ts) -> str:
    ts = pd.Timestamp(ts)
    return ts.strftime("%Y-%m-%d %H:%M") if (ts.hour or ts.minute) else ts.strftime("%Y-%m-%d")
