import pandas as pd
import pytest

from market_mcp import analytics, backtest, symbols
from market_mcp.data import _close_only_frame, resolve_range
from conftest import make_ohlcv


def test_performance_known_values():
    idx = pd.date_range("2021-01-01", periods=5, freq="D")
    close = pd.Series([100, 110, 99, 120, 108], index=idx, dtype=float)
    p = analytics.performance(close, ppy=252)
    assert p["total_return_pct"] == 8.0
    # 110 -> 99 で -10%
    assert p["max_drawdown_pct"] == -10.0
    assert p["max_drawdown_peak"] == "2021-01-02" and p["max_drawdown_trough"] == "2021-01-03"
    assert p["max_drawdown_recovered"] == "2021-01-04"


def test_calendar_and_seasonality_shapes():
    df = make_ohlcv(n=600)
    cal = analytics.calendar_returns(df["close"])
    assert set(cal["yearly_return_pct"]) == {"2020", "2021", "2022"}
    s = analytics.seasonality(df["close"])
    assert len(s["by_month"]) == 12
    assert {w["weekday"] for w in s["by_weekday"]} == {"月", "火", "水", "木", "金"}


def test_rsi_bounds_and_trend():
    up = pd.Series(range(1, 60), dtype=float)
    assert analytics.rsi(up).iloc[-1] == 100.0
    df = make_ohlcv()
    r = analytics.rsi(df["close"]).dropna()
    assert r.between(0, 100).all()


def test_backtest_no_lookahead_and_buy_hold_match():
    df = make_ohlcv(n=400)
    res = backtest.run(df, "buy_and_hold", fee_bps=0)
    assert res["strategy_metrics"]["total_return_pct"] == res["buy_and_hold_metrics"]["total_return_pct"]
    assert res["trade_stats"]["trades"] == 1

    # 先読み確認: 未来のデータを変えても過去のポジションは変わらない
    pos_a = backtest.positions(df, "sma_cross", {"fast": 5, "slow": 20})
    df2 = df.copy()
    df2.iloc[-50:, df2.columns.get_loc("close")] *= 3
    pos_b = backtest.positions(df2, "sma_cross", {"fast": 5, "slow": 20})
    assert pos_a.iloc[:-50].equals(pos_b.iloc[:-50])


@pytest.mark.parametrize("strategy", ["sma_cross", "rsi_reversion", "breakout"])
def test_backtest_strategies_run(strategy):
    res = backtest.run(make_ohlcv(n=700, seed=3), strategy)
    ts = res["trade_stats"]
    assert ts["trades"] >= 1
    assert 0 <= ts["exposure_pct"] <= 100
    for t in res["recent_trades"]:
        assert t["entry"] <= t["exit"]


def test_trade_returns_match_prices():
    idx = pd.date_range("2022-01-03", periods=6, freq="B")
    close = pd.Series([10, 11, 12, 13, 14, 15], index=idx, dtype=float)
    pos = pd.Series([0, 1, 1, 0, 0, 1], index=idx, dtype=float)
    trades = backtest._trades(close, pos, fee_bps=0)
    assert trades[0]["entry"] == "2022-01-03" and trades[0]["exit"] == "2022-01-05"
    assert trades[0]["return_pct"] == 20.0
    assert trades[1]["still_open"] is True


def test_invalid_params():
    df = make_ohlcv(n=100)
    with pytest.raises(ValueError):
        backtest.run(df, "sma_cross", {"fast": 50, "slow": 10})
    with pytest.raises(ValueError):
        backtest.run(df, "unknown")


def test_symbols_and_ranges():
    assert symbols.resolve("ドル円").key == "USDJPY"
    assert symbols.resolve("xauusd").key == "GOLD"
    assert symbols.resolve("日経225").yahoo == "^N225"
    assert symbols.resolve("^GSPC").yahoo == "^GSPC"
    with pytest.raises(ValueError):
        symbols.resolve("rm -rf /; echo")
    with pytest.raises(ValueError):
        resolve_range("7y", None, None)
    s, e = resolve_range(None, "2020-01-01", "2020-12-31")
    assert str(s) == "2020-01-01" and str(e) == "2020-12-31"


def test_fred_frame_handles_missing_dots():
    s = pd.Series({"2024-01-01": ".", "2024-01-02": "141.2", "2024-01-03": "142.0"})
    df = _close_only_frame(s, pd.Timestamp("2023-12-01").date(), None)
    assert list(df["close"]) == [141.2, 142.0]
    assert (df["high"] == df["close"]).all()
