import WebSocket, { WebSocketServer } from "ws";
import type { Server } from "http";
import {
  heatmapStorage,
  type HeatmapGridMeta,
  type HeatmapTrade,
  type OrderBookSnapshot,
} from "./heatmap-storage";
import { getOrderBook } from "./hyperliquid";

const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";
const BROADCAST_MS = 250;
const FALLBACK_POLL_MS = 2000;

interface HeatmapClient {
  ws: WebSocket;
  coin: string;
  rangePct: number;
}

function parseLevels(levels: unknown): OrderBookSnapshot["bids"] {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((l: { px?: string; sz?: string }) => ({
      price: parseFloat(l.px || "0"),
      size: parseFloat(l.sz || "0"),
    }))
    .filter((l) => l.price > 0 && l.size > 0);
}

function snapshotFromLevels(levels: unknown[][]): OrderBookSnapshot | null {
  if (!levels || levels.length < 2) return null;
  const bids = parseLevels(levels[0]);
  const asks = parseLevels(levels[1]);
  if (bids.length === 0 && asks.length === 0) return null;
  return { timestamp: Date.now(), bids, asks };
}

class HyperliquidHeatmapFeed {
  private ws: WebSocket | null = null;
  private coin: string | null = null;
  private refCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private lastBroadcast = 0;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onUpdate: () => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
  }

  addRef(coin: string): void {
    if (this.coin !== coin) {
      this.disconnect();
      this.coin = coin;
      heatmapStorage.clear(coin);
      this.refCount = 0;
      this.connect(coin);
      this.startFallback(coin);
    }
    this.refCount++;
  }

  removeRef(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.disconnect();
    }
  }

  private connect(coin: string): void {
    this.disconnectWsOnly();
    this.ws = new WebSocket(HYPERLIQUID_WS_URL);

    this.ws.on("open", () => {
      this.ws?.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "l2Book", coin, nLevels: 50 },
        }),
      );
      this.ws?.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "trades", coin },
        }),
      );
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(coin, msg);
      } catch {
        /* ignore malformed */
      }
    });

    this.ws.on("close", () => this.scheduleReconnect(coin));
    this.ws.on("error", () => this.scheduleReconnect(coin));
  }

  private scheduleReconnect(coin: string): void {
    if (this.refCount === 0 || this.coin !== coin) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.refCount > 0 && this.coin === coin) {
        this.connect(coin);
      }
    }, 3000);
  }

  private handleMessage(coin: string, msg: Record<string, unknown>): void {
    const channel = msg.channel as string | undefined;
    const data = msg.data as Record<string, unknown> | undefined;
    if (!data) return;

    if (channel === "l2Book") {
      const bookCoin = (data.coin as string) || coin;
      if (bookCoin !== coin) return;
      const levels = data.levels as unknown[][] | undefined;
      const snapshot = snapshotFromLevels(levels || []);
      if (snapshot) {
        heatmapStorage.addSnapshot(coin, snapshot);
        this.markDirty();
      }
      return;
    }

    if (channel === "trades") {
      const trades = Array.isArray(data) ? data : [data];
      for (const t of trades) {
        const tradeCoin = (t.coin as string) || coin;
        if (tradeCoin !== coin) continue;
        const px = parseFloat((t.px as string) || "0");
        const sz = parseFloat((t.sz as string) || "0");
        if (px <= 0 || sz <= 0) continue;
        const sideRaw = String(t.side || "").toUpperCase();
        const side: HeatmapTrade["side"] =
          sideRaw === "B" || sideRaw === "BID" || sideRaw === "BUY" ? "bid" : "ask";
        const ts = typeof t.time === "number" ? t.time : Date.now();
        heatmapStorage.addTrade(coin, { price: px, size: sz, side, timestamp: ts });
      }
      this.markDirty();
    }
  }

  private markDirty(): void {
    this.dirty = true;
    const now = Date.now();
    const elapsed = now - this.lastBroadcast;
    if (elapsed >= BROADCAST_MS) {
      this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, BROADCAST_MS - elapsed);
    }
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.lastBroadcast = Date.now();
    this.onUpdate();
  }

  private startFallback(coin: string): void {
    if (this.fallbackInterval) return;
    this.fallbackInterval = setInterval(async () => {
      if (this.refCount === 0 || this.coin !== coin) return;
      try {
        const orderBook = await getOrderBook(coin);
        if (orderBook?.levels) {
          const snapshot = snapshotFromLevels(orderBook.levels);
          if (snapshot) {
            heatmapStorage.addSnapshot(coin, snapshot);
            this.markDirty();
          }
        }
      } catch (error) {
        console.error(`Heatmap fallback poll error for ${coin}:`, error);
      }
    }, FALLBACK_POLL_MS);
  }

  private disconnectWsOnly(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private disconnect(): void {
    this.disconnectWsOnly();
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    this.coin = null;
  }
}

class HeatmapWebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<HeatmapClient> = new Set();
  private feed = new HyperliquidHeatmapFeed(() => this.broadcastActiveCoins());

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws/heatmap" });

    this.wss.on("connection", (ws: WebSocket) => {
      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "subscribe" && message.coin) {
            const rangePct =
              typeof message.rangePct === "number" ? message.rangePct : 0.012;
            this.subscribeClient(ws, message.coin, rangePct);
          } else if (message.type === "config" && typeof message.rangePct === "number") {
            this.updateClientRange(ws, message.rangePct);
          } else if (message.type === "unsubscribe") {
            this.unsubscribeClient(ws);
          }
        } catch (e) {
          console.error("Invalid heatmap message:", e);
        }
      });

      ws.on("close", () => this.unsubscribeClient(ws));
      ws.on("error", () => this.unsubscribeClient(ws));
    });
  }

  private subscribeClient(ws: WebSocket, coin: string, rangePct: number): void {
    this.unsubscribeClient(ws);

    const client: HeatmapClient = {
      ws,
      coin,
      rangePct: Math.max(0.003, Math.min(0.05, rangePct)),
    };
    this.clients.add(client);
    this.syncFeed();

    this.sendHeatmapData(client);
  }

  private updateClientRange(ws: WebSocket, rangePct: number): void {
    for (const client of this.clients) {
      if (client.ws === ws) {
        client.rangePct = Math.max(0.003, Math.min(0.05, rangePct));
        this.sendHeatmapData(client);
        break;
      }
    }
  }

  private unsubscribeClient(ws: WebSocket): void {
    for (const client of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(client);
      }
    }
    this.syncFeed();
  }

  private syncFeed(): void {
    const coins = new Set<string>();
    for (const client of this.clients) {
      coins.add(client.coin);
    }
    if (coins.size === 0) {
      this.feed.removeRef();
      return;
    }
    const [activeCoin] = coins;
    if (activeCoin) {
      this.feed.addRef(activeCoin);
    }
  }

  private broadcastActiveCoins(): void {
    for (const client of this.clients) {
      this.sendHeatmapData(client);
    }
  }

  private sendHeatmapData(client: HeatmapClient): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    const { heatmap, meta } = heatmapStorage.generateHeatmapData(
      client.coin,
      client.rangePct,
    );
    const largeOrders = heatmapStorage.detectLargeOrders(client.coin);
    const recentTrades = heatmapStorage.getRecentTrades(client.coin);

    client.ws.send(
      JSON.stringify({
        type: "heatmap",
        coin: client.coin,
        data: {
          heatmap,
          meta,
          largeOrders,
          recentTrades,
          currentPrice: meta?.midPrice ?? 0,
          timestamp: Date.now(),
        },
      }),
    );
  }

  broadcast(coin: string, data: unknown): void {
    for (const client of this.clients) {
      if (client.coin === coin && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    }
  }

  shutdown(): void {
    this.feed.removeRef();
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const heatmapWSManager = new HeatmapWebSocketManager();
