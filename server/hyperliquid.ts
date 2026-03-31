// Hyperliquid API Integration for real-time market data
// Using Hyperliquid's public API endpoints

const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info";
let cachedPerpUniverseCoins: string[] = [];
let cachedAllTickers: HyperliquidTicker[] = [];
let cachedSpotScannerCoinIds: string[] = [];

export interface HyperliquidMeta {
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated?: boolean;
  }[];
}

export interface HyperliquidTicker {
  coin: string;
  displayName?: string;
  baseName?: string;
  isSpot?: boolean;
  markPx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  openInterest: string;
  funding: string;
  maxLeverage: number;
  szDecimals: number;
  onlyIsolated?: boolean;
}

export interface OrderBookLevel {
  price: string;
  size: string;
  numOrders: number;
}

export interface HyperliquidOrderBook {
  coin: string;
  levels: [OrderBookLevel[], OrderBookLevel[]]; // [bids, asks]
}

export interface HyperliquidCandle {
  t: number; // timestamp
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
  v: string; // volume
}

export interface RecentTrade {
  coin: string;
  side: "A" | "B"; // A = sell, B = buy
  px: string;
  sz: string;
  time: number;
  hash: string;
}

/** Intervals accepted by Hyperliquid `candleSnapshot` (must match UI + scanners). */
export const HYPERLIQUID_CANDLE_INTERVALS = [
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d",
] as const;

export type HyperliquidCandleInterval = (typeof HYPERLIQUID_CANDLE_INTERVALS)[number];

// Get all available trading pairs (perps universe) — never fabricate markets
export async function getAvailableCoins(): Promise<HyperliquidMeta> {
  const response = await fetch(HYPERLIQUID_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });

  if (!response.ok) {
    console.error("Error fetching Hyperliquid meta:", response.status);
    return { universe: [] };
  }

  return await response.json();
}

/** All perp coin symbols from Hyperliquid meta (e.g. BTC, ETH, …). */
export async function getPerpUniverseCoinNames(): Promise<string[]> {
  const meta = await getAvailableCoins();
  const direct = (meta.universe || []).map((u) => u.name).filter(Boolean);
  if (direct.length > 0) {
    cachedPerpUniverseCoins = direct;
    return direct;
  }

  const fromTickers = (await getAllTickers()).map((t) => t.coin).filter(Boolean);
  if (fromTickers.length > 0) {
    cachedPerpUniverseCoins = fromTickers;
    return fromTickers;
  }

  return cachedPerpUniverseCoins;
}

// Get all ticker data for all coins with proper 24h stats
export async function getAllTickers(): Promise<HyperliquidTicker[]> {
  try {
    // Fetch current mids and meta info
    const [midsResponse, metaResponse] = await Promise.all([
      fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      }),
      fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      }),
    ]);
    
    if (!midsResponse.ok || !metaResponse.ok) {
      throw new Error("Failed to fetch ticker data");
    }
    
    const mids = await midsResponse.json();
    const metaAndAssetCtxs = await metaResponse.json();
    
    // metaAndAssetCtxs is an array: [meta, assetCtxs]
    const meta = metaAndAssetCtxs[0];
    const assetCtxs = metaAndAssetCtxs[1] || [];
    
    // Combine into ticker format with 24h change and market metadata
    const tickers = meta.universe.map((coin: any, index: number) => {
      const currentPrice = parseFloat(mids[coin.name] || "0");
      const assetCtx = assetCtxs[index] || {};
      
      const perpLabel = PERP_LABELS[coin.name];
      return {
        coin: coin.name,
        displayName: perpLabel ? `${coin.name}-USDC (${perpLabel.split(" ")[0]})` : undefined,
        isSpot: false,
        markPx: mids[coin.name] || "0",
        midPx: mids[coin.name] || "0",
        prevDayPx: assetCtx.prevDayPx || String(currentPrice),
        dayNtlVlm: assetCtx.dayNtlVlm || "0",
        premium: assetCtx.premium || "0",
        openInterest: assetCtx.openInterest || "0",
        funding: assetCtx.funding || "0",
        maxLeverage: coin.maxLeverage || 50,
        szDecimals: coin.szDecimals ?? 3,
        onlyIsolated: coin.onlyIsolated || false,
      };
    });
    cachedAllTickers = tickers;
    return tickers;
  } catch (error) {
    console.error("Error fetching tickers:", error);
    // Prefer last good market universe over collapsing to a tiny hardcoded list.
    return cachedAllTickers;
  }
}

/**
 * Exchange-wide 24h notional volume (sum of perp `dayNtlVlm`) and approximate total OI in USD.
 * Hyperliquid does not expose a public “volume only from users on builder X” aggregate; use sovereign DB counts for your cohort.
 */
export async function getPerpExchangeAggregates(): Promise<{
  totalDayNotionalVolumeUsd: number;
  totalOpenInterestUsd: number;
  perpCoinCount: number;
}> {
  const tickers = await getAllTickers();
  let totalDayNotionalVolumeUsd = 0;
  let totalOpenInterestUsd = 0;
  for (const t of tickers) {
    totalDayNotionalVolumeUsd += parseFloat(t.dayNtlVlm || "0");
    const mark = parseFloat(t.markPx || t.midPx || "0");
    const oiSz = parseFloat(t.openInterest || "0");
    if (mark > 0 && oiSz > 0) {
      totalOpenInterestUsd += oiSz * mark;
    }
  }
  return {
    totalDayNotionalVolumeUsd,
    totalOpenInterestUsd,
    perpCoinCount: tickers.length,
  };
}

// Known labels for PERP coins
const PERP_LABELS: Record<string, string> = {
  "PAXG": "Gold (PAXG)",
};

// Known real-world asset labels for spot markets
const SPOT_ASSET_LABELS: Record<string, string> = {
  "SLV": "Silver",
  "XAUT0": "Gold (XAUT)",
  "MSFT": "Microsoft",
  "AMZN": "Amazon",
  "QQQ": "QQQ ETF",
  "AAPL": "Apple",
  "GOOGL": "Google",
  "TSLA": "Tesla",
  "NVDA": "NVIDIA",
  "SPY": "S&P 500 ETF",
  "PURR": "PURR",
  "HFUN": "HFUN",
  "WOW": "WOW",
  "USOL": "Synthetic SOL",
  "VORTX": "Synthetic BTC",
  "MMOVE": "Synthetic ETH",
  "ANZ": "ANZ",
};

// Minimum daily volume in USD for a spot market to be included
// Kept low so all legitimately active assets appear in the selector
const SPOT_MIN_VOL = 1_000;

/** Human-readable spot pair label (same rules as ticker list) for `@index` API ids. */
function spotPairDisplayName(pair: any, tokens: any[]): string {
  const baseToken = tokens[pair.tokens?.[0]] as any;
  const quoteToken = tokens[pair.tokens?.[1]] as any;
  const baseName: string = baseToken?.name || "";
  const quoteName: string = quoteToken?.name || "USDC";
  const rawName: string =
    pair.name && !pair.name.startsWith("@") ? pair.name.replace("/", "-") : `${baseName}-${quoteName}`;
  const label = SPOT_ASSET_LABELS[baseName];
  return label ? `${rawName} (${label})` : rawName;
}

let spotAtIndexDisplayCache: { at: number; map: Record<string, string> } | null = null;
const SPOT_AT_INDEX_DISPLAY_TTL_MS = 120_000;

/**
 * Map Hyperliquid spot API ids (`@0`, `@1`, …) to display names for scanners and headers.
 * Cached briefly to avoid extra round-trips on every pattern poll.
 */
export async function getSpotAtIndexDisplayMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (spotAtIndexDisplayCache && now - spotAtIndexDisplayCache.at < SPOT_AT_INDEX_DISPLAY_TTL_MS) {
    return spotAtIndexDisplayCache.map;
  }
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const [spotMeta] = await response.json();
    const tokens: any[] = spotMeta.tokens || [];
    const universe = (spotMeta.universe || []) as any[];
    const map: Record<string, string> = {};
    for (let i = 0; i < universe.length; i++) {
      const pair = universe[i];
      const label = spotPairDisplayName(pair, tokens);
      map[`@${i}`] = label;
      // HL `pair.name` is often `@<assetId>` and can differ from the universe index (e.g. index 250 → name `@266`).
      // Register both so any code path resolving by either id gets a label.
      const rawName = typeof pair?.name === "string" ? pair.name.trim() : "";
      if (rawName.startsWith("@") && /^@\d+$/.test(rawName)) {
        map[rawName] = label;
      }
    }
    spotAtIndexDisplayCache = { at: now, map };
    return map;
  } catch (e) {
    console.error("Error building spot @index display map:", e);
    return spotAtIndexDisplayCache?.map ?? {};
  }
}

// Fetch spot market tickers and return them with @index coin identifiers
export async function getSpotTickers(): Promise<HyperliquidTicker[]> {
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const [spotMeta, spotCtxs] = await response.json();
    const tokens: any[] = spotMeta.tokens || [];

    return (spotMeta.universe as any[])
      .map((pair: any, index: number) => {
        const ctx = spotCtxs[index] || {};
        const vol = parseFloat(ctx.dayNtlVlm || "0");
        const px = parseFloat(ctx.markPx || "0");
        if (vol < SPOT_MIN_VOL || px === 0) return null;

        const baseToken = tokens[pair.tokens?.[0]] as any;
        const baseName: string = baseToken?.name || "";
        const displayName = spotPairDisplayName(pair, tokens);

        return {
          coin: `@${index}`,
          displayName,
          baseName,
          isSpot: true,
          markPx: ctx.markPx || "0",
          midPx: ctx.midPx || ctx.markPx || "0",
          prevDayPx: ctx.prevDayPx || ctx.markPx || "0",
          dayNtlVlm: ctx.dayNtlVlm || "0",
          premium: "0",
          openInterest: ctx.circulatingSupply || "0",
          funding: "0",
          maxLeverage: 1,
          szDecimals: baseToken?.szDecimals ?? 2,
          onlyIsolated: false,
        } as HyperliquidTicker;
      })
      .filter((t): t is HyperliquidTicker => t !== null);
  } catch (error) {
    console.error("Error fetching spot tickers:", error);
    return [];
  }
}

/**
 * All Hyperliquid spot `@index` ids that have a usable mark/mid price.
 * Used for the pattern scanner universe (full market coverage). The trading ticker list still uses
 * {@link getSpotTickers} with a volume floor so the UI stays uncluttered.
 */
export async function getSpotScannerCoinIds(): Promise<string[]> {
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const [spotMeta, spotCtxs] = await response.json();
    const universe = (spotMeta.universe || []) as unknown[];
    const out: string[] = [];
    for (let i = 0; i < universe.length; i++) {
      const ctx = (spotCtxs[i] || {}) as { markPx?: string; midPx?: string };
      const px = parseFloat(ctx.markPx || ctx.midPx || "0");
      if (px > 0) out.push(`@${i}`);
    }
    cachedSpotScannerCoinIds = out;
    return out;
  } catch (error) {
    console.error("Error fetching spot scanner coin ids:", error);
    return cachedSpotScannerCoinIds;
  }
}

// Get order book for a specific coin
export async function getOrderBook(coin: string): Promise<HyperliquidOrderBook | null> {
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      coin,
      levels: data.levels || [[], []],
    };
  } catch (error) {
    console.error("Error fetching order book:", error);
    return null;
  }
}

// In-memory candle cache: key → { data, expiresAt }
const candleCache = new Map<string, { data: HyperliquidCandle[]; expiresAt: number }>();

// Short TTLs so charts stay aligned with Hyperliquid (still avoids hammering the API).
// Set HL_DISABLE_CANDLE_CACHE=1 to always hit the network for default range requests.
const CANDLE_CACHE_TTL: Record<string, number> = {
  "1m":  2_500,
  "3m":  3_000,
  "5m":  4_000,
  "15m": 5_000,
  "30m": 6_000,
  "1h":  8_000,
  "2h":  10_000,
  "4h":  12_000,
  "1d":  15_000,
};

// Get candle data for charting
export async function getCandles(
  coin: string,
  interval: string,
  startTime?: number,
  endTime?: number,
  limit: number = 500
): Promise<HyperliquidCandle[]> {
  try {
    const end = endTime || Date.now();

    // Calculate appropriate time range based on interval (must match Hyperliquid bar duration)
    const intervalMs: Record<string, number> = {
      "1m": 60 * 1000,
      "3m": 3 * 60 * 1000,
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "2h": 2 * 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };

    const candleCount = limit;
    const msPerCandle = intervalMs[interval] || 60 * 1000;
    const defaultRange = msPerCandle * candleCount;
    const start = startTime || end - defaultRange;

    const cacheDisabled = process.env.HL_DISABLE_CANDLE_CACHE === "1";
    // Include limit in key so 200 vs 500 candle requests don’t share the wrong slice.
    const cacheKey = `${coin}:${interval}:${candleCount}`;
    if (!cacheDisabled && !startTime && !endTime) {
      const cached = candleCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return [...cached.data].sort((a, b) => a.t - b.t);
      }
    }
    
    const fetchSnapshot = async (): Promise<HyperliquidCandle[]> => {
      const response = await fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: { coin, interval, startTime: start, endTime: end },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const raw: HyperliquidCandle[] = await response.json();
      return [...raw].sort((a, b) => a.t - b.t);
    };

    let data = await fetchSnapshot();

    // Hyperliquid occasionally returns an empty snapshot on a cold edge request even though
    // a near-immediate retry succeeds. Retry once here so charts do not show "No data"
    // until the user manually refreshes the page.
    if (data.length === 0 && !startTime && !endTime) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const retryData = await fetchSnapshot();
      if (retryData.length > 0) data = retryData;
    }

    if (data.length === 0 && !cacheDisabled && !startTime && !endTime) {
      const stale = candleCache.get(cacheKey);
      if (stale?.data?.length) {
        return [...stale.data].sort((a, b) => a.t - b.t);
      }
    }

    if (!cacheDisabled && !startTime && !endTime && data.length > 0) {
      const baseTtl = CANDLE_CACHE_TTL[interval] || 4_000;
      const bonus = Math.min(300_000, Math.max(0, parseInt(process.env.HL_CANDLE_CACHE_BONUS_MS || "0", 10) || 0));
      const ttl = Math.min(300_000, baseTtl + bonus);
      candleCache.set(cacheKey, { data, expiresAt: Date.now() + ttl });
    }

    return data;
  } catch (error) {
    console.error("Error fetching candles:", error);
    // Return stale cache if available rather than empty array
    const cached = candleCache.get(`${coin}:${interval}:${limit}`);
    if (cached) return cached.data;
    return [];
  }
}

// Get recent trades
export async function getRecentTrades(coin: string): Promise<RecentTrade[]> {
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recentTrades", coin }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching recent trades:", error);
    return [];
  }
}
