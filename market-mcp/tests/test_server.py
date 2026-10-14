import asyncio
import os
import sys

import pytest

from market_mcp import server


def test_tools_end_to_end(offline):
    assert server.get_price_history("金", max_rows=5)["rows_returned"] == 5
    perf = server.get_performance("NIKKEI225", period="2y")
    assert perf["symbol"] == "NIKKEI225" and "monthly_return_pct" in perf["calendar"]
    assert len(server.get_seasonality("BTC")["by_month"]) == 12
    assert "rsi14" in server.get_technical_snapshot("USDJPY")
    cmp = server.compare_assets(period="1y")
    assert {r["symbol"] for r in cmp["comparison"]} == {"GOLD", "NIKKEI225", "BTCUSD", "USDJPY"}
    assert "correlation" in cmp
    bt = server.run_backtest("GOLD", "rsi_reversion", period="3y")
    assert bt["strategy"] == "rsi_reversion"


def test_auto_falls_back_to_fred(monkeypatch):
    from market_mcp import data
    from conftest import make_ohlcv

    def fake(src, ticker, start, end, interval):
        if src == "yahoo":
            raise ConnectionError("blocked")
        return make_ohlcv()

    monkeypatch.setattr(data, "_cached", fake)
    out = server.get_performance("USDJPY", period="1y")
    assert "FRED" in out["data_source"]
    with pytest.raises(data.DataError):
        server.get_performance("GOLD", period="1y")  # GOLD は FRED 非対応


def test_stdio_handshake_lists_tools():
    """実際に MCP クライアントとして接続し、ツール一覧を取得できるか。"""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(command=sys.executable, args=["-m", "market_mcp.server"],
                                   env={**os.environ})

    async def go():
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as s:
                await s.initialize()
                tools = await s.list_tools()
                res = await s.call_tool("list_strategies", {})
                return {t.name for t in tools.tools}, res

    names, res = asyncio.run(go())
    assert {"get_price_history", "get_performance", "get_seasonality", "get_technical_snapshot",
            "compare_assets", "run_backtest", "list_instruments", "list_strategies"} <= names
    assert not res.isError
