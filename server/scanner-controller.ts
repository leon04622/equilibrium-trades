/**
 * Pattern scanner defaults — independent of Mongo/Postgres.
 * Used when Hyperliquid universe fetch is empty and for consistent fallbacks.
 */

/** HL perp symbols when universe list cannot be loaded (gold → PAXG on Hyperliquid). */
export const DEFAULT_PATTERN_SCAN_TICKERS: readonly string[] = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "AVAX",
  "LINK",
  "PAXG",
];

export function getDefaultPatternScanTickerList(): string[] {
  return [...DEFAULT_PATTERN_SCAN_TICKERS];
}

/**
 * Candles fetched per interval per coin. **Minimum 200** is required for 21/200 SMMA + Apex context;
 * lowering below 200 breaks trend-first logic — use env only to raise (e.g. 250), not shrink below 200.
 */
const parsedLimit = parseInt(process.env.PATTERN_SCAN_CANDLE_LIMIT || "200", 10);
export const PATTERN_SCAN_CANDLE_LIMIT =
  Number.isFinite(parsedLimit) && parsedLimit >= 200 ? parsedLimit : 200;
