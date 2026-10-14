import numpy as np
import pandas as pd
import pytest

from market_mcp import data


def make_ohlcv(n=800, seed=0, start="2020-01-01", freq="B", drift=0.0004, vol=0.012):
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, periods=n, freq=freq)
    close = 100 * np.exp(np.cumsum(rng.normal(drift, vol, n)))
    high = close * (1 + rng.uniform(0, 0.01, n))
    low = close * (1 - rng.uniform(0, 0.01, n))
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close, "volume": 1000.0}, index=idx)


@pytest.fixture
def offline(monkeypatch):
    """ネットワークを使わず、合成データを返すように差し替える。"""
    calls = []

    def fake(src, ticker, start, end, interval):
        calls.append((src, ticker))
        freq = "D" if ticker == "BTC-USD" else "B"
        first = pd.Timestamp.today().normalize() - pd.Timedelta(days=4000)
        df = make_ohlcv(n=4000 if freq == "D" else 2860, seed=sum(map(ord, ticker)), start=first, freq=freq)
        return df[df.index >= pd.Timestamp(start)]

    monkeypatch.setattr(data, "_cached", fake)
    return calls
