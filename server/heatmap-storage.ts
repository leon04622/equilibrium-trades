import {
  buildHeatmapFromSnapshots,
  detectLargeRestingOrders,
  type HeatmapCell,
  type HeatmapGridMeta,
  type HeatmapTrade,
  type OrderBookSnapshot,
} from "@shared/heatmap-grid";

export type HeatmapData = HeatmapCell;
export type { HeatmapGridMeta, HeatmapTrade, OrderBookSnapshot };

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

  generateHeatmapData(coin: string, rangePct: number = 0.012) {
    return buildHeatmapFromSnapshots(this.getSnapshots(coin), rangePct);
  }

  detectLargeOrders(coin: string, threshold: number = 2.5) {
    return detectLargeRestingOrders(this.getSnapshots(coin), threshold);
  }

  clear(coin: string): void {
    this.getBuffer(coin).clear();
    this.getTradeBuffer(coin).clear();
  }
}

export const heatmapStorage = new HeatmapStorage();
