import WebSocket, { WebSocketServer } from "ws";
import type { Server } from "http";
import { heatmapStorage, type OrderBookSnapshot } from "./heatmap-storage";
import { getOrderBook } from "./hyperliquid";

const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";

interface HeatmapClient {
  ws: WebSocket;
  coin: string;
}

class HeatmapWebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<HeatmapClient> = new Set();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeCoins: Set<string> = new Set();

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws/heatmap" });

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("Heatmap client connected");

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "subscribe" && message.coin) {
            this.subscribeClient(ws, message.coin);
          } else if (message.type === "unsubscribe") {
            this.unsubscribeClient(ws);
          }
        } catch (e) {
          console.error("Invalid message:", e);
        }
      });

      ws.on("close", () => {
        this.unsubscribeClient(ws);
        console.log("Heatmap client disconnected");
      });

      ws.on("error", (err) => {
        console.error("WebSocket error:", err);
        this.unsubscribeClient(ws);
      });
    });
  }

  private subscribeClient(ws: WebSocket, coin: string): void {
    // Remove from any existing subscription
    this.unsubscribeClient(ws);

    // Add client
    const client: HeatmapClient = { ws, coin };
    this.clients.add(client);
    this.activeCoins.add(coin);

    // Start polling if not already active for this coin
    if (!this.pollingIntervals.has(coin)) {
      this.startPolling(coin);
    }

    // Send initial data
    this.sendHeatmapData(client);
  }

  private unsubscribeClient(ws: WebSocket): void {
    Array.from(this.clients).forEach((client) => {
      if (client.ws === ws) {
        this.clients.delete(client);
      }
    });

    // Check if we should stop polling for any coins
    this.cleanupInactiveCoins();
  }

  private cleanupInactiveCoins(): void {
    const activeCoins = new Set<string>();
    Array.from(this.clients).forEach((client) => {
      activeCoins.add(client.coin);
    });

    Array.from(this.pollingIntervals.keys()).forEach((coin) => {
      if (!activeCoins.has(coin)) {
        const interval = this.pollingIntervals.get(coin);
        if (interval) clearInterval(interval);
        this.pollingIntervals.delete(coin);
        this.activeCoins.delete(coin);
      }
    });
  }

  private startPolling(coin: string): void {
    // Poll order book every second for heatmap
    const interval = setInterval(async () => {
      try {
        const orderBook = await getOrderBook(coin);
        if (orderBook && orderBook.levels) {
          const snapshot: OrderBookSnapshot = {
            timestamp: Date.now(),
            bids: orderBook.levels[0]?.map((l: any) => ({
              price: parseFloat(l.px),
              size: parseFloat(l.sz),
            })) || [],
            asks: orderBook.levels[1]?.map((l: any) => ({
              price: parseFloat(l.px),
              size: parseFloat(l.sz),
            })) || [],
          };

          heatmapStorage.addSnapshot(coin, snapshot);

          // Broadcast to all clients subscribed to this coin
          Array.from(this.clients).forEach((client) => {
            if (client.coin === coin) {
              this.sendHeatmapData(client);
            }
          });
        }
      } catch (error) {
        console.error(`Error polling order book for ${coin}:`, error);
      }
    }, 1000);

    this.pollingIntervals.set(coin, interval);
  }

  private sendHeatmapData(client: HeatmapClient): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    const heatmapData = heatmapStorage.generateHeatmapData(client.coin);
    const largeOrders = heatmapStorage.detectLargeOrders(client.coin);
    const snapshots = heatmapStorage.getSnapshots(client.coin);
    const latestSnapshot = snapshots[snapshots.length - 1];

    client.ws.send(JSON.stringify({
      type: "heatmap",
      coin: client.coin,
      data: {
        heatmap: heatmapData,
        largeOrders,
        currentPrice: latestSnapshot ? this.getMidPrice(latestSnapshot) : 0,
        timestamp: Date.now(),
      },
    }));
  }

  private getMidPrice(snapshot: OrderBookSnapshot): number {
    const bestBid = snapshot.bids[0]?.price || 0;
    const bestAsk = snapshot.asks[0]?.price || 0;
    return (bestBid + bestAsk) / 2;
  }

  broadcast(coin: string, data: any): void {
    Array.from(this.clients).forEach((client) => {
      if (client.coin === coin && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    });
  }

  shutdown(): void {
    Array.from(this.pollingIntervals.values()).forEach((interval) => {
      clearInterval(interval);
    });
    this.pollingIntervals.clear();

    if (this.wss) {
      this.wss.close();
    }
  }
}

export const heatmapWSManager = new HeatmapWebSocketManager();
