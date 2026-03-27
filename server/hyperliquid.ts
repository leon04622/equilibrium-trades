// Hyperliquid API Integration for real-time market data
// Using Hyperliquid's public API endpoints

const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info";

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
  return (meta.universe || []).map((u) => u.name).filter(Boolean);
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
    return meta.universe.map((coin: any, index: number) => {
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
  } catch (error) {
    console.error("Error fetching tickers:", error);
    // Return empty array on failure — callers guard against empty results.
    // Returning stale hardcoded prices would corrupt live PNL calculations.
    return [];
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
        const quoteToken = tokens[pair.tokens?.[1]] as any;
        const baseName: string = baseToken?.name || "";
        const quoteName: string = quoteToken?.name || "USDC";

        // Human-readable name: prefer pair's own name, else baseName-quoteName
        const rawName: string = pair.name && !pair.name.startsWith("@")
          ? pair.name.replace("/", "-")
          : `${baseName}-${quoteName}`;

        // Override with known labels
        const label = SPOT_ASSET_LABELS[baseName];
        const displayName = label ? `${rawName} (${label})` : rawName;

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
    const data = [...raw].sort((a, b) => a.t - b.t);

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
