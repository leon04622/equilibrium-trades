import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildHeatmapFromSnapshots,
  detectLargeRestingOrders,
  snapshotFromLevels,
  type HeatmapCell,
  type HeatmapGridMeta,
  type HeatmapTrade,
  type OrderBookSnapshot,
} from "@shared/heatmap-grid";

const HL_WS = "wss://api.hyperliquid.xyz/ws";
const MAX_SNAPSHOTS = 300;
const POLL_MS = 800;

type UseBookmapFeedOptions = {
  coin: string;
  rangePct: number;
  paused?: boolean;
  enabled?: boolean;
};

export function useBookmapFeed({
  coin,
  rangePct,
  paused = false,
  enabled = true,
}: UseBookmapFeedOptions) {
  const [connected, setConnected] = useState(false);
  const [heatmap, setHeatmap] = useState<HeatmapCell[][]>([]);
  const [meta, setMeta] = useState<HeatmapGridMeta | null>(null);
  const [largeOrders, setLargeOrders] = useState<HeatmapTrade[]>([]);
  const [recentTrades, setRecentTrades] = useState<HeatmapTrade[]>([]);
  const [midPrice, setMidPrice] = useState(0);
  const [feedSource, setFeedSource] = useState<"hyperliquid" | "rest" | "idle">("idle");

  const snapshotsRef = useRef<OrderBookSnapshot[]>([]);
  const tradesRef = useRef<HeatmapTrade[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const hlLiveRef = useRef(false);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rebuild = useCallback(() => {
    const snaps = snapshotsRef.current;
    const { heatmap: grid, meta: gridMeta } = buildHeatmapFromSnapshots(snaps, rangePct);
    setHeatmap(grid);
    setMeta(gridMeta);
    setMidPrice(gridMeta?.midPrice ?? 0);
    setLargeOrders(detectLargeRestingOrders(snaps));
    setRecentTrades(tradesRef.current.slice(-80));
  }, [rangePct]);

  const scheduleRebuild = useCallback(() => {
    if (rebuildTimerRef.current) return;
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      rebuild();
    }, 120);
  }, [rebuild]);

  const pushSnapshot = useCallback(
    (snapshot: OrderBookSnapshot) => {
      const arr = snapshotsRef.current;
      arr.push(snapshot);
      if (arr.length > MAX_SNAPSHOTS) {
        snapshotsRef.current = arr.slice(-MAX_SNAPSHOTS);
      }
      scheduleRebuild();
    },
    [scheduleRebuild],
  );

  const pushTrade = useCallback(
    (trade: HeatmapTrade) => {
      tradesRef.current.push(trade);
      if (tradesRef.current.length > 200) {
        tradesRef.current = tradesRef.current.slice(-200);
      }
      scheduleRebuild();
    },
    [scheduleRebuild],
  );

  // Direct Hyperliquid WebSocket (works without our server /ws proxy)
  useEffect(() => {
    if (!enabled || paused) return;

    snapshotsRef.current = [];
    tradesRef.current = [];
    setHeatmap([]);
    setMeta(null);
    setFeedSource("idle");

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(HL_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        hlLiveRef.current = true;
        setConnected(true);
        setFeedSource("hyperliquid");
        ws.send(
          JSON.stringify({
            method: "subscribe",
            subscription: { type: "l2Book", coin, nLevels: 50 },
          }),
        );
        ws.send(
          JSON.stringify({
            method: "subscribe",
            subscription: { type: "trades", coin },
          }),
        );
      };

      ws.onmessage = (event) => {
        if (cancelled || paused) return;
        try {
          const msg = JSON.parse(event.data as string);
          const channel = msg.channel as string | undefined;
          const data = msg.data;

          if (channel === "l2Book" && data?.levels) {
            const snap = snapshotFromLevels(data.levels as unknown[][]);
            if (snap) pushSnapshot(snap);
            return;
          }

          if (channel === "trades") {
            const list = Array.isArray(data) ? data : [data];
            for (const t of list) {
              const px = parseFloat(t.px || "0");
              const sz = parseFloat(t.sz || "0");
              if (px <= 0 || sz <= 0) continue;
              const sideRaw = String(t.side || "").toUpperCase();
              const side: HeatmapTrade["side"] =
                sideRaw === "B" || sideRaw === "BID" || sideRaw === "BUY" ? "bid" : "ask";
              pushTrade({
                price: px,
                size: sz,
                side,
                timestamp: typeof t.time === "number" ? t.time : Date.now(),
              });
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        hlLiveRef.current = false;
        setConnected(false);
        setFeedSource("idle");
        reconnectTimer = setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (rebuildTimerRef.current) {
        clearTimeout(rebuildTimerRef.current);
        rebuildTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [coin, enabled, paused, pushSnapshot, pushTrade]);

  // REST fallback — keeps heatmap alive if HL WS is blocked
  useEffect(() => {
    if (!enabled || paused) return;

    let active = true;
    const poll = async () => {
      if (!active) return;
      if (hlLiveRef.current && snapshotsRef.current.length > 8) return;

      try {
        const res = await fetch(`/api/hyperliquid/orderbook/${coin}`);
        if (!res.ok) return;
        const body = await res.json();
        const snap = snapshotFromLevels(body.levels as unknown[][]);
        if (snap) {
          pushSnapshot(snap);
          if (!hlLiveRef.current) setFeedSource("rest");
          setConnected(true);
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [coin, enabled, paused, pushSnapshot]);

  useEffect(() => {
    rebuild();
  }, [rangePct, rebuild]);

  return {
    connected,
    feedSource,
    heatmap,
    meta,
    largeOrders,
    recentTrades,
    midPrice,
  };
}
