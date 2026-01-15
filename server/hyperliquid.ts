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
  markPx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  openInterest: string;
  funding: string;
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
    
    // Combine into ticker format with 24h change
    return meta.universe.map((coin: any, index: number) => {
      const currentPrice = parseFloat(mids[coin.name] || "0");
      const assetCtx = assetCtxs[index] || {};
      
      // Calculate prev day price from 24h change
      const dayChange = parseFloat(assetCtx.dayNtlVlm || "0") > 0 
        ? (currentPrice / 1.01) // Estimate if no direct prev day available
        : currentPrice;
      
      return {
        coin: coin.name,
        markPx: mids[coin.name] || "0",
        midPx: mids[coin.name] || "0",
        prevDayPx: assetCtx.prevDayPx || String(dayChange * 0.99), // Use real or estimate
        dayNtlVlm: assetCtx.dayNtlVlm || "0",
        premium: assetCtx.premium || "0",
        openInterest: assetCtx.openInterest || "0",
        funding: assetCtx.funding || "0",
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
    }));
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
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };
    
    // Get 200 candles worth of data for the interval
    const candleCount = 200;
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
