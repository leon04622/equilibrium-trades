/**
 * Pattern scanner defaults — independent of Mongo/Postgres.
 * Used when Hyperliquid universe fetch is empty and for consistent fallbacks.
 */
import { getAllTickers } from "./hyperliquid";

/** Default institutional scan: top perps by 24h notional + gold proxy (PAXG on HL; not OANDA XAU). */
export const PATTERN_SCAN_TOP_VOLUME_COUNT = 50;

/**
 * Top `maxCoins` perps by `dayNtlVlm`, ensuring **PAXG** is included when listed (gold exposure on Hyperliquid).
 */
export async function buildTopVolumePatternScanCoins(maxCoins = PATTERN_SCAN_TOP_VOLUME_COUNT): Promise<string[]> {
  const tickers = await getAllTickers();
  if (!tickers.length) return getDefaultPatternScanTickerList();

  const sorted = [...tickers].sort(
    (a, b) => parseFloat(b.dayNtlVlm || "0") - parseFloat(a.dayNtlVlm || "0"),
  );

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of sorted) {
    if (out.length >= maxCoins) break;
    const c = String(t.coin || "").trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }

  const hasPaxg = tickers.some((x) => x.coin === "PAXG");
  if (hasPaxg && !seen.has("PAXG")) {
    if (out.length >= maxCoins) out.pop();
    out.push("PAXG");
  }

  return out.length ? out : getDefaultPatternScanTickerList();
}

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
