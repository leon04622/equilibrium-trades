interface OrderBookSnapshot {
  timestamp: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

interface HeatmapData {
  priceLevel: number;
  time: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
}

export interface HeatmapGridMeta {
  midPrice: number;
  minPrice: number;
  maxPrice: number;
  binSize: number;
  priceBins: number;
}

export interface HeatmapTrade {
  price: number;
  size: number;
  side: "bid" | "ask";
  timestamp: number;
}

class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private size: number = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  getAll(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }
}

class HeatmapStorage {
  private snapshots: Map<string, RingBuffer<OrderBookSnapshot>> = new Map();
  private trades: Map<string, RingBuffer<HeatmapTrade>> = new Map();
  private readonly SNAPSHOT_CAPACITY = 300;
  private readonly TRADE_CAPACITY = 200;
  private readonly PRICE_BINS = 60;

  getBuffer(coin: string): RingBuffer<OrderBookSnapshot> {
    if (!this.snapshots.has(coin)) {
      this.snapshots.set(coin, new RingBuffer(this.SNAPSHOT_CAPACITY));
    }
    return this.snapshots.get(coin)!;
  }

  getTradeBuffer(coin: string): RingBuffer<HeatmapTrade> {
    if (!this.trades.has(coin)) {
      this.trades.set(coin, new RingBuffer(this.TRADE_CAPACITY));
    }
    return this.trades.get(coin)!;
  }

  addSnapshot(coin: string, snapshot: OrderBookSnapshot): void {
    this.getBuffer(coin).push(snapshot);
  }

  addTrade(coin: string, trade: HeatmapTrade): void {
    this.getTradeBuffer(coin).push(trade);
  }

  getSnapshots(coin: string): OrderBookSnapshot[] {
    return this.getBuffer(coin).getAll();
  }

  getRecentTrades(coin: string, limit = 80): HeatmapTrade[] {
    const all = this.getTradeBuffer(coin).getAll();
    return all.slice(-limit);
  }

  private getMidPrice(snapshot: OrderBookSnapshot): number {
    const bestBid = snapshot.bids[0]?.price || 0;
    const bestAsk = snapshot.asks[0]?.price || 0;
    if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
    return bestBid || bestAsk || 0;
  }

  /** Fixed price grid anchored to latest mid — Bookmap-style stable Y axis. */
  generateHeatmapData(
    coin: string,
    rangePct: number = 0.012,
  ): { heatmap: HeatmapData[][]; meta: HeatmapGridMeta | null } {
    const snapshots = this.getSnapshots(coin);
    if (snapshots.length === 0) return { heatmap: [], meta: null };

    const latest = snapshots[snapshots.length - 1];
    const midPrice = this.getMidPrice(latest);
    if (midPrice <= 0) return { heatmap: [], meta: null };

    const clampedRange = Math.max(0.003, Math.min(0.05, rangePct));
    const minPrice = midPrice * (1 - clampedRange);
    const maxPrice = midPrice * (1 + clampedRange);
    const binSize = (maxPrice - minPrice) / this.PRICE_BINS;

    const meta: HeatmapGridMeta = {
      midPrice,
      minPrice,
      maxPrice,
      binSize,
      priceBins: this.PRICE_BINS,
    };

    const heatmap: HeatmapData[][] = [];

    for (const snapshot of snapshots) {
      const column: HeatmapData[] = [];

      for (let bin = 0; bin < this.PRICE_BINS; bin++) {
        const binMin = minPrice + bin * binSize;
        const binMax = binMin + binSize;
        const binMid = (binMin + binMax) / 2;

        let bidVolume = 0;
        let askVolume = 0;

        for (const bid of snapshot.bids) {
          if (bid.price >= binMin && bid.price < binMax) {
            bidVolume += bid.size;
          }
        }

        for (const ask of snapshot.asks) {
          if (ask.price >= binMin && ask.price < binMax) {
            askVolume += ask.size;
          }
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

  detectLargeOrders(
    coin: string,
    threshold: number = 2.5,
  ): { price: number; size: number; side: "bid" | "ask"; timestamp: number }[] {
    const snapshots = this.getSnapshots(coin);
    if (snapshots.length === 0) return [];

    let totalSize = 0;
    let orderCount = 0;

    for (const snapshot of snapshots.slice(-30)) {
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
    const largeOrderThreshold = avgSize * threshold;
    const largeOrders: { price: number; size: number; side: "bid" | "ask"; timestamp: number }[] = [];

    const recent = snapshots.slice(-60);
    for (const snapshot of recent) {
      for (const bid of snapshot.bids) {
        if (bid.size >= largeOrderThreshold) {
          largeOrders.push({
            price: bid.price,
            size: bid.size,
            side: "bid",
            timestamp: snapshot.timestamp,
          });
        }
      }
      for (const ask of snapshot.asks) {
        if (ask.size >= largeOrderThreshold) {
          largeOrders.push({
            price: ask.price,
            size: ask.size,
            side: "ask",
            timestamp: snapshot.timestamp,
          });
        }
      }
    }

    return largeOrders.slice(-30);
  }

  clear(coin: string): void {
    this.getBuffer(coin).clear();
    this.getTradeBuffer(coin).clear();
  }
}

export const heatmapStorage = new HeatmapStorage();
export type { OrderBookSnapshot, HeatmapData };
