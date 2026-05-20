export type OrderBookSnapshot = {
  timestamp: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
};

export type HeatmapCell = {
  priceLevel: number;
  time: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
};

export type HeatmapGridMeta = {
  midPrice: number;
  minPrice: number;
  maxPrice: number;
  binSize: number;
  priceBins: number;
};

export type HeatmapTrade = {
  price: number;
  size: number;
  side: "bid" | "ask";
  timestamp: number;
};

const PRICE_BINS = 60;

export function parseOrderBookLevels(
  levels: unknown,
): OrderBookSnapshot["bids"] {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((l: { px?: string; sz?: string }) => ({
      price: parseFloat(l.px || "0"),
      size: parseFloat(l.sz || "0"),
    }))
    .filter((l) => l.price > 0 && l.size > 0);
}

export function snapshotFromLevels(levels: unknown[][]): OrderBookSnapshot | null {
  if (!levels || levels.length < 2) return null;
  const bids = parseOrderBookLevels(levels[0]);
  const asks = parseOrderBookLevels(levels[1]);
  if (bids.length === 0 && asks.length === 0) return null;
  return { timestamp: Date.now(), bids, asks };
}

function midFromSnapshot(snapshot: OrderBookSnapshot): number {
  const bestBid = snapshot.bids[0]?.price || 0;
  const bestAsk = snapshot.asks[0]?.price || 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  return bestBid || bestAsk || 0;
}

/** Fixed price grid anchored to latest mid (Bookmap-style stable Y axis). */
export function buildHeatmapFromSnapshots(
  snapshots: OrderBookSnapshot[],
  rangePct: number = 0.012,
): { heatmap: HeatmapCell[][]; meta: HeatmapGridMeta | null } {
  if (snapshots.length === 0) return { heatmap: [], meta: null };

  const latest = snapshots[snapshots.length - 1];
  const midPrice = midFromSnapshot(latest);
  if (midPrice <= 0) return { heatmap: [], meta: null };

  const clampedRange = Math.max(0.003, Math.min(0.05, rangePct));
  const minPrice = midPrice * (1 - clampedRange);
  const maxPrice = midPrice * (1 + clampedRange);
  const binSize = (maxPrice - minPrice) / PRICE_BINS;

  const meta: HeatmapGridMeta = {
    midPrice,
    minPrice,
    maxPrice,
    binSize,
    priceBins: PRICE_BINS,
  };

  const heatmap: HeatmapCell[][] = [];

  for (const snapshot of snapshots) {
    const column: HeatmapCell[] = [];

    for (let bin = 0; bin < PRICE_BINS; bin++) {
      const binMin = minPrice + bin * binSize;
      const binMax = binMin + binSize;
      const binMid = (binMin + binMax) / 2;

      let bidVolume = 0;
      let askVolume = 0;

      for (const bid of snapshot.bids) {
        if (bid.price >= binMin && bid.price < binMax) bidVolume += bid.size;
      }
      for (const ask of snapshot.asks) {
        if (ask.price >= binMin && ask.price < binMax) askVolume += ask.size;
      }

      column.push({
        priceLevel: binMid,
        time: snapshot.timestamp,
        bidVolume,
        askVolume,
        totalVolume: bidVolume + askVolume,
      });
    }

    heatmap.push(column);
  }

  return { heatmap, meta };
}

export function detectLargeRestingOrders(
  snapshots: OrderBookSnapshot[],
  threshold = 2.5,
): HeatmapTrade[] {
  if (snapshots.length === 0) return [];

  const recent = snapshots.slice(-30);
  let totalSize = 0;
  let orderCount = 0;
  for (const snapshot of recent) {
    for (const bid of snapshot.bids) {
      totalSize += bid.size;
      orderCount++;
    }
    for (const ask of snapshot.asks) {
      totalSize += ask.size;
      orderCount++;
    }
  }

  const avgSize = orderCount > 0 ? totalSize / orderCount : 0;
  const minSize = avgSize * threshold;
  const out: HeatmapTrade[] = [];

  for (const snapshot of snapshots.slice(-60)) {
    for (const bid of snapshot.bids) {
      if (bid.size >= minSize) {
        out.push({
          price: bid.price,
          size: bid.size,
          side: "bid",
          timestamp: snapshot.timestamp,
        });
      }
    }
    for (const ask of snapshot.asks) {
      if (ask.size >= minSize) {
        out.push({
          price: ask.price,
          size: ask.size,
          side: "ask",
          timestamp: snapshot.timestamp,
        });
      }
    }
  }

  return out.slice(-30);
}
