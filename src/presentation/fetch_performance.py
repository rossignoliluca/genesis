"""
Fetch asset performance data via yfinance (handles Yahoo rate limiting internally).
Called from TypeScript pipeline via child_process.
Outputs JSON to stdout.
"""
import json
import sys
from datetime import datetime, timedelta

try:
    import yfinance as yf
except ImportError:
    print(json.dumps({"error": "yfinance not installed"}))
    sys.exit(1)

TICKERS = {
    "S&P 500": "^GSPC",
    "Nasdaq 100": "^NDX",
    "Dow Jones": "^DJI",
    "STOXX 600": "^STOXX",
    "FTSE MIB": "FTSEMIB.MI",
    "US 10Y": "^TNX",
    "US 2Y": "^IRX",
    "German 10Y": "DE10Y.F",
    "EUR/USD": "EURUSD=X",
    "USD/CHF": "CHF=X",
    "Gold": "GC=F",
    "Oil WTI": "CL=F",
    "Bitcoin": "BTC-USD",
    "VIX": "^VIX",
}

def fmt_price(val, asset):
    """Format price based on asset type."""
    if "10Y" in asset or "2Y" in asset:
        return f"{val:.2f}%"
    if "EUR" in asset or "CHF" in asset:
        return f"{val:.4f}"
    if val >= 1000:
        return f"{val:,.2f}"
    return f"{val:.2f}"

def main():
    results = {}
    now = datetime.now()
    year_start = datetime(now.year, 1, 1)

    for asset, ticker in TICKERS.items():
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="6mo")
            if hist.empty or len(hist) < 5:
                continue

            closes = hist["Close"].dropna().values
            dates = hist.index

            current = float(closes[-1])
            one_week_ago = float(closes[max(0, len(closes) - 6)])
            one_month_ago = float(closes[max(0, len(closes) - 22)])

            # YTD base
            ytd_base = float(closes[0])
            for i, d in enumerate(dates):
                if d.tz_localize(None) >= year_start:
                    ytd_base = float(closes[i])
                    break

            chg_1w = ((current - one_week_ago) / one_week_ago) * 100
            chg_mtd = ((current - one_month_ago) / one_month_ago) * 100
            chg_ytd = ((current - ytd_base) / ytd_base) * 100

            fmt = lambda v: f"+{v:.1f}%" if v >= 0 else f"{v:.1f}%"

            if asset == "VIX":
                signal = "bullish" if chg_1w < -5 else ("bearish" if chg_1w > 10 else "neutral")
            else:
                signal = "bullish" if chg_1w > 1 else ("bearish" if chg_1w < -1 else "neutral")

            results[asset] = {
                "name": asset,
                "level": fmt_price(current, asset),
                "change1w": fmt(chg_1w),
                "changeMtd": fmt(chg_mtd),
                "changeYtd": fmt(chg_ytd),
                "signal": signal,
                "commentary": "",
            }
        except Exception as e:
            sys.stderr.write(f"[yfinance] {asset}: {e}\n")

    print(json.dumps(results))

if __name__ == "__main__":
    main()
