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

// Get all available trading pairs
export async function getAvailableCoins(): Promise<HyperliquidMeta> {
  try {
    const response = await fetch(HYPERLIQUID_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta" }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching Hyperliquid meta:", error);
    // Return default coins if API fails
    return {
      universe: [
        { name: "BTC", szDecimals: 5, maxLeverage: 50 },
        { name: "ETH", szDecimals: 4, maxLeverage: 50 },
        { name: "SOL", szDecimals: 2, maxLeverage: 20 },
        { name: "DOGE", szDecimals: 0, maxLeverage: 20 },
        { name: "AVAX", szDecimals: 2, maxLeverage: 20 },
        { name: "LINK", szDecimals: 2, maxLeverage: 20 },
        { name: "ARB", szDecimals: 1, maxLeverage: 20 },
        { name: "SUI", szDecimals: 1, maxLeverage: 20 },
        { name: "OP", szDecimals: 1, maxLeverage: 20 },
        { name: "WIF", szDecimals: 0, maxLeverage: 10 },
      ],
    };
  }
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
    // Return fallback data with estimated prices
    const fallbackCoins = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ARB", "SUI", "OP", "WIF"];
    const fallbackPrices: Record<string, number> = {
      BTC: 92000, ETH: 3200, SOL: 180, DOGE: 0.32, AVAX: 35, LINK: 22, ARB: 1.8, SUI: 4.5, OP: 2.1, WIF: 2.5
    };
    
    return fallbackCoins.map(coin => ({
      coin,
      markPx: String(fallbackPrices[coin] || 0),
      midPx: String(fallbackPrices[coin] || 0),
      prevDayPx: String((fallbackPrices[coin] || 0) * 0.995),
      dayNtlVlm: "0",
      premium: "0",
      openInterest: "0",
      funding: "0",
      maxLeverage: coin === "BTC" || coin === "ETH" ? 50 : 20,
      szDecimals: coin === "BTC" ? 5 : coin === "ETH" ? 4 : 2,
    }));
  }
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
const SPOT_MIN_VOL = 50_000;

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

// Get candle data for charting
export async function getCandles(
  coin: string,
  interval: string,
  startTime?: number,
  endTime?: number
): Promise<HyperliquidCandle[]> {
  try {
    const end = endTime || Date.now();
    
    // Calculate appropriate time range based on interval
    // Need enough candles to display patterns (at least 100-200 candles)
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
    
    // Get 400 candles so the 200 SMA has enough history to draw a full line
    const candleCount = 400;
    const msPerCandle = intervalMs[interval] || 60 * 1000;
    const defaultRange = msPerCandle * candleCount;
    const start = startTime || end - defaultRange;
    
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
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching candles:", error);
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
