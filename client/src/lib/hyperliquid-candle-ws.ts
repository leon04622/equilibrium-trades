/** Live OHLC from Hyperliquid `candle` WebSocket — matches venue chart wicks on the forming bar. */

import { mergeCandleSnapshots, normalizeCandleTimeMs, type ChartCandle } from "@/lib/chart-candle-merge";

export type HlCandleWire = ChartCandle;

const HL_WS_URL = "wss://api.hyperliquid.xyz/ws";

/** Merge venue candle update into history (extends high/low on the active bar). */
export function mergeHlCandleIntoSeries(
  series: HlCandleWire[],
  update: HlCandleWire,
  interval: string,
): HlCandleWire[] {
  if (series.length === 0) return [update];
  return mergeCandleSnapshots(series, [update], interval);
}

type CandleListener = (candle: HlCandleWire) => void;

type Slot = {
  coin: string;
  interval: string;
  listeners: Set<CandleListener>;
};

let socket: WebSocket | null = null;
let connectPromise: Promise<WebSocket> | null = null;
const slots = new Map<string, Slot>();

function slotKey(coin: string, interval: string): string {
  return `${coin.trim().toUpperCase()}:${interval.trim()}`;
}

type HlCandleWireTagged = HlCandleWire & { coin: string; interval: string };

function wireMessage(raw: unknown): HlCandleWireTagged | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as { channel?: string; data?: unknown };
  if (msg.channel !== "candle" || !msg.data || typeof msg.data !== "object") return null;
  const d = msg.data as Record<string, unknown>;
  const t = typeof d.t === "number" ? d.t : NaN;
  const coin = typeof d.s === "string" ? d.s.trim() : "";
  const interval = typeof d.i === "string" ? d.i.trim() : "";
  if (!Number.isFinite(t) || !coin || !interval) return null;
  return {
    coin,
    interval,
    t: normalizeCandleTimeMs(t, interval),
    o: d.o as number | string,
    h: d.h as number | string,
    l: d.l as number | string,
    c: d.c as number | string,
    v: d.v as number | string,
  };
}

function subscribeOnSocket(ws: WebSocket, coin: string, interval: string): void {
  ws.send(
    JSON.stringify({
      method: "subscribe",
      subscription: { type: "candle", coin, interval },
    }),
  );
}

function refreshSubscriptions(ws: WebSocket): void {
  for (const slot of slots.values()) {
    subscribeOnSocket(ws, slot.coin, slot.interval);
  }
}

function ensureSocket(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(socket);
  }
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(HL_WS_URL);
    socket = ws;

    ws.onopen = () => {
      connectPromise = null;
      refreshSubscriptions(ws);
      resolve(ws);
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as unknown;
        const candle = wireMessage(parsed);
        if (!candle) return;
        const key = slotKey(candle.coin, candle.interval);
        const slot = slots.get(key);
        if (!slot) return;
        const { coin: _c, interval: _i, ...ohlc } = candle;
        for (const fn of slot.listeners) {
          try {
            fn(ohlc);
          } catch {
            /* ignore listener errors */
          }
        }
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onclose = () => {
      socket = null;
      connectPromise = null;
      if (slots.size > 0) {
        window.setTimeout(() => {
          void ensureSocket().catch(() => {});
        }, 1500);
      }
    };

    ws.onerror = () => {
      connectPromise = null;
      reject(new Error("Hyperliquid candle WebSocket error"));
    };
  });

  return connectPromise;
}

export function subscribeHyperliquidCandles(
  coin: string,
  interval: string,
  listener: CandleListener,
): () => void {
  const key = slotKey(coin, interval);
  let slot = slots.get(key);
  if (!slot) {
    slot = { coin: coin.trim(), interval: interval.trim(), listeners: new Set() };
    slots.set(key, slot);
  }
  slot.listeners.add(listener);

  void ensureSocket().then((ws) => {
    subscribeOnSocket(ws, slot!.coin, slot!.interval);
  }).catch(() => {});

  return () => {
    const s = slots.get(key);
    if (!s) return;
    s.listeners.delete(listener);
    if (s.listeners.size === 0) {
      slots.delete(key);
    }
    if (slots.size === 0 && socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
  };
}
