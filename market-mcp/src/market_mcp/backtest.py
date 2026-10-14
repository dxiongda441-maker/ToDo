"""シンプルな買いのみ（ロングオンリー）のバックテスト。

先読みを防ぐため、足 t の終値で出たシグナルは足 t+1 のリターンから反映する。
手数料・スリッページは片道 fee_bps（ベーシスポイント）で近似する。
"""

from __future__ import annotations

import pandas as pd

from .analytics import _d, _metrics_from_returns, _pct, _r, periods_per_year, rsi

STRATEGIES = {
    "buy_and_hold": "買って持ち続ける（比較の基準）",
    "sma_cross": "短期SMAが長期SMAより上なら保有（params: fast=20, slow=50）",
    "rsi_reversion": "RSIが lower 未満で買い、upper 超えで手仕舞い（params: period=14, lower=30, upper=70）",
    "breakout": "直近 lookback 本の高値更新で買い、exit_lookback 本の安値割れで手仕舞い（params: lookback=20, exit_lookback=10）",
}


def positions(df: pd.DataFrame, strategy: str, params: dict) -> pd.Series:
    """各足の終値時点で「次の足で保有するか」(1/0) を返す。"""
    close = df["close"]
    if strategy == "buy_and_hold":
        return pd.Series(1.0, index=close.index)
    if strategy == "sma_cross":
        fast, slow = int(params.get("fast", 20)), int(params.get("slow", 50))
        if not 1 <= fast < slow:
            raise ValueError("sma_cross は 1 <= fast < slow にしてください。")
        f, s = close.rolling(fast).mean(), close.rolling(slow).mean()
        return (f > s).astype(float).where(s.notna(), 0.0)
    if strategy == "rsi_reversion":
        period = int(params.get("period", 14))
        lower, upper = float(params.get("lower", 30)), float(params.get("upper", 70))
        if not 0 < lower < upper < 100:
            raise ValueError("rsi_reversion は 0 < lower < upper < 100 にしてください。")
        r = rsi(close, period)
        return _stateful(entry=r < lower, exit_=r > upper)
    if strategy == "breakout":
        lb, xlb = int(params.get("lookback", 20)), int(params.get("exit_lookback", 10))
        if lb < 2 or xlb < 2:
            raise ValueError("breakout の lookback / exit_lookback は 2 以上にしてください。")
        hi = df["high"].rolling(lb).max().shift(1)
        lo = df["low"].rolling(xlb).min().shift(1)
        return _stateful(entry=close > hi, exit_=close < lo)
    raise ValueError(f"strategy は {list(STRATEGIES)} のいずれかです: {strategy!r}")


def _stateful(entry: pd.Series, exit_: pd.Series) -> pd.Series:
    state, out = 0.0, []
    for e, x in zip(entry.fillna(False), exit_.fillna(False)):
        if state == 0 and e:
            state = 1.0
        elif state == 1 and x:
            state = 0.0
        out.append(state)
    return pd.Series(out, index=entry.index)


def run(df: pd.DataFrame, strategy: str, params: dict | None = None, fee_bps: float = 5.0,
        max_trades_listed: int = 10) -> dict:
    params = params or {}
    if len(df) < 30:
        raise ValueError("バックテストには 30 本以上のデータが必要です。期間を延ばしてください。")
    close = df["close"]
    ppy = periods_per_year(close.index)
    asset_ret = close.pct_change().fillna(0.0)
    pos = positions(df, strategy, params).shift(1).fillna(0.0)  # 次の足から反映
    cost = pos.diff().abs().fillna(pos.iloc[0]) * fee_bps / 10_000
    strat_ret = pos * asset_ret - cost

    trades = _trades(close, pos, fee_bps)
    wins = [t for t in trades if t["return_pct"] > 0]
    losses = [t for t in trades if t["return_pct"] <= 0]
    gross_win = sum(t["return_pct"] for t in wins)
    gross_loss = -sum(t["return_pct"] for t in losses)

    rets = strat_ret.iloc[1:]
    bh = asset_ret.iloc[1:]
    return {
        "strategy": strategy, "description": STRATEGIES[strategy], "params": params, "fee_bps_per_side": fee_bps,
        "strategy_metrics": _metrics_from_returns(rets, ppy),
        "buy_and_hold_metrics": _metrics_from_returns(bh, ppy),
        "trade_stats": {
            "trades": len(trades),
            "win_rate_pct": _pct(len(wins) / len(trades)) if trades else None,
            "avg_win_pct": _r(gross_win / len(wins)) if wins else None,
            "avg_loss_pct": _r(-gross_loss / len(losses)) if losses else None,
            "profit_factor": _r(gross_win / gross_loss) if gross_loss > 0 else None,
            "avg_bars_held": _r(sum(t["bars"] for t in trades) / len(trades), 1) if trades else None,
            "exposure_pct": _pct(float(pos.iloc[1:].mean())),
        },
        "recent_trades": trades[-max_trades_listed:],
        "caveats": [
            "終値ベースの簡易検証。スプレッド・スワップ・税金・約定のずれは fee_bps 以外考慮していない。",
            "パラメータを何度も調整して良い結果を探すと過剰最適化になりやすい。期間を分けて確認すること。",
            "過去の成績は将来の成績を保証しない。",
        ],
    }


def _trades(close: pd.Series, pos: pd.Series, fee_bps: float) -> list[dict]:
    """保有区間ごとの損益。pos[i]=1 は「足 i のリターンを受け取る」（シフト済み）。

    連続して 1 が続く区間 a..b を 1 トレードとし、足 a-1 の終値で買い、足 b の終値で売ったとみなす。
    """
    trades = []
    vals = pos.to_numpy()
    n = len(vals)
    i = 0
    while i < n:
        if vals[i] != 1:
            i += 1
            continue
        a = i
        while i + 1 < n and vals[i + 1] == 1:
            i += 1
        b = i
        entry_i = max(a - 1, 0)
        gross = close.iloc[b] / close.iloc[entry_i] - 1
        net = (1 + gross) * (1 - fee_bps / 10_000) ** 2 - 1
        trades.append({"entry": _d(close.index[entry_i]), "exit": _d(close.index[b]),
                       "bars": int(b - entry_i), "return_pct": _r(net * 100),
                       "still_open": b == n - 1})
        i += 1
    return trades
