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
  private readonly SNAPSHOT_CAPACITY = 300; // 5 minutes of 1-second snapshots
  private readonly PRICE_BINS = 50; // Number of price levels to aggregate

  getBuffer(coin: string): RingBuffer<OrderBookSnapshot> {
    if (!this.snapshots.has(coin)) {
      this.snapshots.set(coin, new RingBuffer(this.SNAPSHOT_CAPACITY));
    }
    return this.snapshots.get(coin)!;
  }

  addSnapshot(coin: string, snapshot: OrderBookSnapshot): void {
    this.getBuffer(coin).push(snapshot);
  }

  getSnapshots(coin: string): OrderBookSnapshot[] {
    return this.getBuffer(coin).getAll();
  }

  generateHeatmapData(coin: string): HeatmapData[][] {
    const snapshots = this.getSnapshots(coin);
    if (snapshots.length === 0) return [];

    // Find price range across all snapshots
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const snapshot of snapshots) {
      for (const bid of snapshot.bids) {
        minPrice = Math.min(minPrice, bid.price);
        maxPrice = Math.max(maxPrice, bid.price);
      }
      for (const ask of snapshot.asks) {
        minPrice = Math.min(minPrice, ask.price);
        maxPrice = Math.max(maxPrice, ask.price);
      }
    }

    if (minPrice === Infinity) return [];

    const priceRange = maxPrice - minPrice;
    const binSize = priceRange / this.PRICE_BINS;

    // Create heatmap grid
    const heatmap: HeatmapData[][] = [];

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
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
        });
      }

      heatmap.push(column);
    }

    return heatmap;
  }

  detectLargeOrders(coin: string, threshold: number = 2): { price: number; size: number; side: 'bid' | 'ask'; timestamp: number }[] {
    const snapshots = this.getSnapshots(coin);
    if (snapshots.length === 0) return [];

    // Calculate average order size
    let totalSize = 0;
    let orderCount = 0;

    for (const snapshot of snapshots) {
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

    // Find large orders
    const largeOrders: { price: number; size: number; side: 'bid' | 'ask'; timestamp: number }[] = [];

    for (const snapshot of snapshots) {
      for (const bid of snapshot.bids) {
        if (bid.size >= largeOrderThreshold) {
          largeOrders.push({
            price: bid.price,
            size: bid.size,
            side: 'bid',
            timestamp: snapshot.timestamp,
          });
        }
      }
      for (const ask of snapshot.asks) {
        if (ask.size >= largeOrderThreshold) {
          largeOrders.push({
            price: ask.price,
            size: ask.size,
            side: 'ask',
            timestamp: snapshot.timestamp,
          });
        }
      }
    }

    return largeOrders.slice(-20); // Return last 20 large orders
  }

  clear(coin: string): void {
    this.getBuffer(coin).clear();
  }
}

export const heatmapStorage = new HeatmapStorage();
export type { OrderBookSnapshot, HeatmapData };
