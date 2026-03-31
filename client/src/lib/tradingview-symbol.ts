/**
 * Map venue perp/spot identifiers to TradingView advanced-chart symbols.
 * Spot markets use @N ids; pass baseName from tickers when available.
 */
const TV_SPECIAL: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  XRP: "BINANCE:XRPUSDT",
  LINK: "BINANCE:LINKUSDT",
  AVAX: "BINANCE:AVAXUSDT",
  ARB: "BINANCE:ARBUSDT",
  OP: "BINANCE:OPUSDT",
  SUI: "BINANCE:SUIUSDT",
  PAXG: "BINANCE:PAXGUSDT",
  XAUT0: "TVC:GOLD",
  QQQ: "NASDAQ:QQQ",
  SPY: "AMEX:SPY",
  NVDA: "NASDAQ:NVDA",
  AAPL: "NASDAQ:AAPL",
  MSFT: "NASDAQ:MSFT",
  AMZN: "NASDAQ:AMZN",
  GOOGL: "NASDAQ:GOOGL",
  TSLA: "NASDAQ:TSLA",
  META: "NASDAQ:META",
};

export function coinToTradingViewSymbol(coin: string, baseName?: string | null): string {
  const base = (baseName || "").trim().toUpperCase();
  if (base && TV_SPECIAL[base]) return TV_SPECIAL[base];

  const c = coin.trim().toUpperCase();
  if (c.startsWith("@")) {
    if (base && /^[A-Z][A-Z0-9]{1,15}$/.test(base)) {
      return TV_SPECIAL[base] || `BINANCE:${base}USDT`;
    }
    return "BINANCE:BTCUSDT";
  }

  if (TV_SPECIAL[c]) return TV_SPECIAL[c];
  if (/^[A-Z][A-Z0-9]{1,15}$/.test(c)) {
    return `BINANCE:${c}USDT`;
  }
  return "BINANCE:BTCUSDT";
}
