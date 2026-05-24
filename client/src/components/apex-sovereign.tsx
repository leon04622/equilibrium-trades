/**
 * Apex Sovereign — Order Layer Orchestrator (TP/SL)
 *
 * Native `createPriceLine` rules (TP/SL dashed, entry solid + PnL title, liq orange + LIQ)
 * stay pinned to the price scale. SVG is pointer-events: none except narrow TP/SL strips
 * and right tags so the chart can pan. Drag uses priceToCoordinate / coordinateToPrice.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { LineStyle, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import {
  batchSyncOrdersToExchange,
  syncOrderToExchange,
  type TpslModifyOrderSpec,
} from "@/lib/hyperliquid-client";
import { ghostTpslPrices, selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import {
  advanceTrailingRatchet,
  clampTpslDragPrice,
  computeTrailingCallbackRateDecimal,
  createTrailingSession,
  distanceToTriggerPercent,
  slLineColor,
  snapOrderPrice,
  tickSize,
  type TrailingStopSession,
} from "@/lib/trailing-stop-orchestrator";

const HL_TP = "#0ecb81";
const HL_SL = "#f6465d";
const HL_ENTRY = "#22d3ee";
const HL_LIQ = "#ff8900";
const HL_GUTTER = 72;
/** Vertical hit band (px) for TP/SL line drag — narrow so chart panning works elsewhere. */
const TPSL_STRIP_HALF_PX = 14;
/** Min vertical movement before TP/SL drag activates (avoids accidental moves while panning). */
const DRAG_ACTIVATE_PX = 10;
/** Horizontal movement beyond this ratio vs vertical cancels drag (pan intent). */
const DRAG_PAN_ABORT_RATIO = 1.35;
const TAG_BG = "rgba(19, 23, 34, 0.96)";
/** Cap drag-time coordinate→price visual updates (~10/s matches HL refill guidance). */
const DRAG_VISUAL_MIN_MS = 100;
export type TpslSide = "tp" | "sl";

interface QueuedSdkModify {
  spec: TpslModifyOrderSpec;
  kind: TpslSide;
  revertPrice: number;
}

/** Wire your signed transaction / builder flow here; called once after pointerup with the final clamped price. */
export function placeholderModifyOrder(_newPrice: number, _side: TpslSide): void {
  void _newPrice;
  void _side;
}

function fmt(p: number): string {
  if (!p || p === 0) return "0";
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export interface ApexSovereignProps {
  coin: string;
  currentPrice: number;
  /** Main chart container (same element passed to createChart). */
  chartPaneRef: RefObject<HTMLDivElement | null>;
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  /** Bumps when the chart instance is recreated — teardown drag listeners and resync. */
  chartVersion: number;
  /** Throttled tick when crosshair / layout may have changed the price scale. */
  chartLayoutTick: number;
  pendingOverride: { tp: number | null; sl: number | null };
  onPendingCommit: (kind: TpslSide, price: number) => void;
  onPendingClear: (kind: TpslSide) => void;
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * Optional hook for on-chain / custom modify. If omitted, `placeTPSL` from trading context is used
   * (same behaviour as ChartOrderLines).
   */
  modifyOrder?: (newPrice: number, side: TpslSide) => void | Promise<void>;
  /**
   * When > 0, TP/SL SDK commits are held this many ms to coalesce a pair into `batchModify`.
   * When 0 (default), each mouseup submits immediately (no added latency).
   */
  tpslModifyBatchWindowMs?: number;
}

export function ApexSovereign({
  coin,
  currentPrice,
  chartPaneRef,
  candleSeriesRef,
  chartVersion,
  chartLayoutTick,
  pendingOverride,
  onPendingCommit,
  onPendingClear,
  onDraggingChange,
  modifyOrder: modifyOrderProp,
  tpslModifyBatchWindowMs = 0,
}: ApexSovereignProps) {
  const { positions, openOrders, cancelHLOrder, placeTPSL, refreshAccount } = useTrading();
  const { address: walletAddress, hyperliquidSessionReady } = useWallet();
  const { toast } = useToast();

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const dragKindRef = useRef<TpslSide | null>(null);
  const pendingDragRef = useRef<{
    kind: TpslSide;
    ghost: boolean;
    startPrice: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragActivatedRef = useRef(false);
  const dragFromGhostRef = useRef(false);
  const dragStartPriceRef = useRef<number | null>(null);
  const activePointerElRef = useRef<HTMLElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingClientYRef = useRef<number | null>(null);
  const lastDragVisualMsRef = useRef(0);
  const dragVisualThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modifyBatchBufferRef = useRef<QueuedSdkModify[]>([]);
  const modifyBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const l1PendingKindsRef = useRef<Set<TpslSide>>(new Set());

  const nativeTpRef = useRef<IPriceLine | null>(null);
  const nativeSlRef = useRef<IPriceLine | null>(null);
  const nativeEntryRef = useRef<IPriceLine | null>(null);
  const nativeLiqRef = useRef<IPriceLine | null>(null);

  const tpDiscRef = useRef<SVGCircleElement | null>(null);
  const slDiscRef = useRef<SVGCircleElement | null>(null);
  const tpBundleRef = useRef<SVGGElement | null>(null);
  const slBundleRef = useRef<SVGGElement | null>(null);
  const tpPriceTextRef = useRef<SVGTextElement | null>(null);
  const slPriceTextRef = useRef<SVGTextElement | null>(null);
  const slAccentLineRef = useRef<SVGLineElement | null>(null);
  const trailSyncRef = useRef({ lastMs: 0, lastSentPx: 0 });

  const [trailSession, setTrailSession] = useState<TrailingStopSession | null>(null);

  const position = useMemo(() => positions.find((p) => p.coin === coin), [positions, coin]);
  const { tpOrder, slOrder, tpPrice, slPrice } = useMemo(
    () => selectTpSlOrders(coin, position, openOrders),
    [coin, position, openOrders],
  );

  const tpOrderRef = useRef(tpOrder);
  const slOrderRef = useRef(slOrder);
  tpOrderRef.current = tpOrder;
  slOrderRef.current = slOrder;

  const effTp = pendingOverride.tp ?? tpPrice;
  const effSl = pendingOverride.sl ?? slPrice;
  const mergedEffSl =
    trailSession && trailSession.coin === coin ? trailSession.ratchetSl : effSl;
  const markPx = position ? position.markPrice || currentPrice || position.entryPrice : currentPrice;
  const { ghostTp, ghostSl } = position
    ? ghostTpslPrices(
        position.entryPrice,
        markPx,
        position.side === "long",
        effTp != null && effTp > 0,
        mergedEffSl != null && mergedEffSl > 0,
      )
    : { ghostTp: null as number | null, ghostSl: null as number | null };

  const priceToCoordinate = useCallback(
    (price: number): number | null => {
      try {
        const series = candleSeriesRef.current;
        if (!series) return null;
        const c = series.priceToCoordinate(price);
        if (c === null || c === undefined) return null;
        const n = Number(c);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    },
    [candleSeriesRef],
  );

  const coordinateToPrice = useCallback(
    (clientY: number): number | null => {
      try {
        const el = chartPaneRef.current;
        const series = candleSeriesRef.current;
        if (!el || !series) return null;
        const y = clientY - el.getBoundingClientRect().top;
        const raw = series.coordinateToPrice(y);
        if (raw === null || raw === undefined) return null;
        const n = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
      } catch {
        return null;
      }
    },
    [chartPaneRef, candleSeriesRef],
  );

  const positionRef = useRef(position);
  positionRef.current = position;
  const coinRef = useRef(coin);
  coinRef.current = coin;
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;
  const tpPriceRef = useRef(tpPrice);
  tpPriceRef.current = tpPrice;
  const slPriceRef = useRef(slPrice);
  slPriceRef.current = slPrice;
  const coordinateToPriceRef = useRef(coordinateToPrice);
  coordinateToPriceRef.current = coordinateToPrice;
  const priceToCoordinateRef = useRef(priceToCoordinate);
  priceToCoordinateRef.current = priceToCoordinate;
  const modifyOrderRef = useRef(modifyOrderProp);
  modifyOrderRef.current = modifyOrderProp;
  const walletAddressRef = useRef(walletAddress);
  walletAddressRef.current = walletAddress;
  const hyperliquidSessionReadyRef = useRef(hyperliquidSessionReady);
  hyperliquidSessionReadyRef.current = hyperliquidSessionReady;
  const refreshAccountRef = useRef(refreshAccount);
  refreshAccountRef.current = refreshAccount;
  const tpslModifyBatchWindowMsRef = useRef(tpslModifyBatchWindowMs);
  tpslModifyBatchWindowMsRef.current = tpslModifyBatchWindowMs;

  const effTpRef = useRef(effTp);
  const effSlRef = useRef(effSl);
  const mergedEffSlRef = useRef(mergedEffSl);
  const ghostTpRef = useRef(ghostTp);
  const ghostSlRef = useRef(ghostSl);
  effTpRef.current = effTp;
  effSlRef.current = effSl;
  mergedEffSlRef.current = mergedEffSl;
  ghostTpRef.current = ghostTp;
  ghostSlRef.current = ghostSl;

  useLayoutEffect(() => {
    setPortalEl(chartPaneRef.current);
  }, [chartPaneRef, chartVersion]);

  useEffect(() => {
    const root = chartPaneRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(root);
    const r = root.getBoundingClientRect();
    setBox({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, [chartPaneRef, chartVersion]);

  /** Native horizontal rules — pinned to the series price scale (pan/zoom). */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    nativeTpRef.current = series.createPriceLine({
      price: 0,
      color: HL_TP,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: false,
      axisLabelVisible: false,
      title: "",
    });
    nativeSlRef.current = series.createPriceLine({
      price: 0,
      color: HL_SL,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: false,
      axisLabelVisible: false,
      title: "",
    });
    nativeEntryRef.current = series.createPriceLine({
      price: 0,
      color: HL_ENTRY,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      lineVisible: false,
      axisLabelVisible: true,
      title: "",
    });
    nativeLiqRef.current = series.createPriceLine({
      price: 0,
      color: HL_LIQ,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      lineVisible: false,
      axisLabelVisible: true,
      title: "LIQ",
    });

    return () => {
      for (const r of [nativeTpRef, nativeSlRef, nativeEntryRef, nativeLiqRef]) {
        const pl = r.current;
        if (pl) {
          try {
            series.removePriceLine(pl);
          } catch {
            /* series disposed */
          }
          r.current = null;
        }
      }
    };
  }, [chartVersion, portalEl]);

  const applyLineVisual = useCallback(
    (
      kind: TpslSide,
      localY: number,
      priceForLabel: number,
      _solid: boolean,
      ghost: boolean,
      accentColor?: string,
    ) => {
      const w = box.w;
      if (w <= 0) return;
      const x2 = Math.max(0, w - HL_GUTTER);
      const baseColor = kind === "tp" ? HL_TP : HL_SL;
      const color = accentColor ?? baseColor;
      const nativePl = kind === "tp" ? nativeTpRef.current : nativeSlRef.current;
      const ghostColor = kind === "tp" ? "rgba(14, 203, 129, 0.45)" : "rgba(246, 70, 93, 0.45)";

      nativePl?.applyOptions({
        price: priceForLabel,
        lineVisible: true,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        color: ghost ? ghostColor : color,
        axisLabelVisible: false,
        title: "",
      });

      const discEl = kind === "tp" ? tpDiscRef.current : slDiscRef.current;
      const bundle = kind === "tp" ? tpBundleRef.current : slBundleRef.current;
      if (bundle) {
        bundle.setAttribute("transform", `translate(0,${localY})`);
        bundle.setAttribute("display", "");
        bundle.removeAttribute("opacity");
      }
      if (discEl) {
        discEl.setAttribute("display", "");
        discEl.setAttribute("cx", String(x2 - 3));
        discEl.setAttribute("cy", "0");
        discEl.setAttribute("fill", ghost ? ghostColor : color);
        discEl.removeAttribute("opacity");
      }
      const priceNode = kind === "tp" ? tpPriceTextRef.current : slPriceTextRef.current;
      if (priceNode) {
        if (kind === "sl" && !ghost && positionRef.current) {
          const pos = positionRef.current;
          const mk = pos.markPrice || currentPriceRef.current || pos.entryPrice;
          const pct = distanceToTriggerPercent(pos.side === "long", mk, priceForLabel);
          priceNode.textContent =
            pct != null
              ? `$${fmt(priceForLabel)} · Δ${pct.toFixed(2)}%`
              : `$${fmt(priceForLabel)}`;
        } else {
          priceNode.textContent = `$${fmt(priceForLabel)}`;
        }
      }
      if (kind === "sl" && slAccentLineRef.current && !ghost) {
        slAccentLineRef.current.setAttribute("stroke", color);
      }
    },
    [box.w],
  );

  const hideKind = useCallback((kind: TpslSide) => {
    const nativePl = kind === "tp" ? nativeTpRef.current : nativeSlRef.current;
    nativePl?.applyOptions({ lineVisible: false });
    const disc = kind === "tp" ? tpDiscRef.current : slDiscRef.current;
    const bundle = kind === "tp" ? tpBundleRef.current : slBundleRef.current;
    bundle?.setAttribute("display", "none");
    disc?.setAttribute("display", "none");
  }, []);

  const setLineL1Pending = useCallback((kind: TpslSide, pending: boolean) => {
    const nativePl = kind === "tp" ? nativeTpRef.current : nativeSlRef.current;
    const bundle = kind === "tp" ? tpBundleRef.current : slBundleRef.current;
    if (!nativePl?.options().lineVisible) return;
    const color = kind === "tp" ? HL_TP : HL_SL;
    if (pending) {
      l1PendingKindsRef.current.add(kind);
      nativePl.applyOptions({
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        color: kind === "tp" ? "rgba(14, 203, 129, 0.5)" : "rgba(246, 70, 93, 0.5)",
        axisLabelVisible: false,
      });
      bundle?.setAttribute("opacity", "0.55");
    } else {
      l1PendingKindsRef.current.delete(kind);
      nativePl.applyOptions({
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        color,
        axisLabelVisible: false,
      });
      bundle?.removeAttribute("opacity");
    }
  }, []);

  const restoreLineAfterError = useCallback(
    (kind: TpslSide, price: number) => {
      const y = priceToCoordinate(price);
      if (y === null) return;
      applyLineVisual(kind, y, price, true, false);
      setLineL1Pending(kind, false);
    },
    [applyLineVisual, priceToCoordinate, setLineL1Pending],
  );

  const executeModifyBatch = useCallback(
    async (items: QueuedSdkModify[]) => {
      if (items.length === 0) return;
      const addr = walletAddressRef.current;
      if (!addr || !hyperliquidSessionReadyRef.current) {
        for (const { kind, revertPrice } of items) {
          onPendingClear(kind);
          restoreLineAfterError(kind, revertPrice);
        }
        toast({
          title: "System Error",
          description: "Wallet or trading session not ready.",
          variant: "destructive",
        });
        return;
      }

      for (const { kind } of items) {
        setLineL1Pending(kind, true);
      }

      const specs = items.map((i) => i.spec);
      let ok = false;
      let errMsg = "";
      try {
        const res =
          specs.length >= 2
            ? await batchSyncOrdersToExchange(addr, specs)
            : await syncOrderToExchange(addr, specs[0]);
        ok = res.ok;
        errMsg = res.error || "";
      } catch (e: unknown) {
        errMsg = e instanceof Error ? e.message : String(e);
      }

      for (const { kind } of items) {
        setLineL1Pending(kind, false);
      }

      if (ok) {
        toast({
          title: specs.length >= 2 ? "TP & SL updated" : specs[0].tpsl === "tp" ? "Take Profit updated" : "Stop Loss updated",
          description: specs.map((s) => `${s.tpsl.toUpperCase()}: $${fmt(s.newPrice)}`).join(" · "),
        });
        try {
          await refreshAccountRef.current();
        } catch {
          /* ignore */
        }
        return;
      }

      const pos = positionRef.current;
      if (pos) {
        const isLong = pos.side === "long";
        const markAtDrop = pos.markPrice || currentPriceRef.current;
        let fallbackFailed = false;
        for (const { spec, kind, revertPrice } of items) {
          const tp =
            kind === "tp" ? spec.newPrice : (tpPriceRef.current ?? undefined);
          const sl =
            kind === "sl" ? spec.newPrice : (slPriceRef.current ?? undefined);
          const cbRate =
            kind === "sl"
              ? computeTrailingCallbackRateDecimal(isLong, markAtDrop, spec.newPrice)
              : null;
          const fb = await placeTPSL(
            coinRef.current,
            pos.size,
            isLong,
            tp,
            sl,
            pos.entryPrice,
            cbRate != null ? { slTrailingCallbackRate: cbRate } : undefined,
          );
          if (fb.success) {
            onPendingClear(kind);
          } else {
            fallbackFailed = true;
            restoreLineAfterError(kind, revertPrice);
          }
        }
        if (!fallbackFailed) {
          try {
            await refreshAccountRef.current();
          } catch {
            /* ignore */
          }
          toast({
            title: "TP/SL updated",
            description: items.map((i) => `${i.kind.toUpperCase()}: $${fmt(i.spec.newPrice)}`).join(" · "),
          });
          return;
        }
      }

      for (const { kind, revertPrice } of items) {
        onPendingClear(kind);
        restoreLineAfterError(kind, revertPrice);
      }
      toast({
        title: "System Error",
        description: errMsg || "Order modify rejected by the exchange.",
        variant: "destructive",
      });
    },
    [onPendingClear, restoreLineAfterError, setLineL1Pending, toast, placeTPSL],
  );

  const enqueueSdkModifyCommit = useCallback(
    (item: QueuedSdkModify) => {
      const buf = modifyBatchBufferRef.current;
      buf.push(item);
      if (buf.length >= 2) {
        if (modifyBatchTimerRef.current) {
          clearTimeout(modifyBatchTimerRef.current);
          modifyBatchTimerRef.current = null;
        }
        const batch = buf.splice(0);
        void executeModifyBatch(batch);
        return;
      }
      const windowMs = tpslModifyBatchWindowMsRef.current;
      if (!windowMs || windowMs <= 0) {
        const single = buf.splice(0);
        void executeModifyBatch(single);
        return;
      }
      if (modifyBatchTimerRef.current) {
        clearTimeout(modifyBatchTimerRef.current);
      }
      modifyBatchTimerRef.current = setTimeout(() => {
        modifyBatchTimerRef.current = null;
        const pending = modifyBatchBufferRef.current.splice(0);
        if (pending.length) void executeModifyBatch(pending);
      }, windowMs);
    },
    [executeModifyBatch],
  );

  /** Model → SVG: runs on layout ticks and data changes; skipped while dragging. */
  useLayoutEffect(() => {
    if (dragKindRef.current) return;
    if (!position || box.w <= 0) {
      hideKind("tp");
      hideKind("sl");
      return;
    }

    const refPx = currentPrice || position.entryPrice;
    const showTpReal = effTp != null && effTp > 0;
    const showSlReal = mergedEffSl != null && mergedEffSl > 0;

    if (l1PendingKindsRef.current.has("tp")) {
      /* L1 signing in flight — do not overwrite dashed / opacity from layout tick */
    } else if (showTpReal) {
      const y = priceToCoordinate(effTp!);
      if (y !== null) applyLineVisual("tp", y, effTp!, true, false);
      else hideKind("tp");
    } else if (ghostTp != null && ghostTp > 0) {
      const y = priceToCoordinate(ghostTp);
      if (y !== null) applyLineVisual("tp", y, ghostTp, false, true);
      else hideKind("tp");
    } else {
      hideKind("tp");
    }

    if (l1PendingKindsRef.current.has("sl")) {
      /* L1 signing in flight */
    } else if (showSlReal) {
      const y = priceToCoordinate(mergedEffSl!);
      const slC = slLineColor(position.side === "long", position.entryPrice, mergedEffSl!);
      if (y !== null) applyLineVisual("sl", y, mergedEffSl!, true, false, slC);
      else hideKind("sl");
    } else if (ghostSl != null && ghostSl > 0) {
      const y = priceToCoordinate(ghostSl);
      if (y !== null) applyLineVisual("sl", y, ghostSl, false, true);
      else hideKind("sl");
    } else {
      hideKind("sl");
    }
  }, [
    position,
    effTp,
    mergedEffSl,
    ghostTp,
    ghostSl,
    chartLayoutTick,
    chartVersion,
    box.w,
    box.h,
    currentPrice,
    priceToCoordinate,
    applyLineVisual,
    hideKind,
  ]);

  /** Entry + liq: native price lines; PnL in line title (updates with mark). */
  useLayoutEffect(() => {
    const entryPl = nativeEntryRef.current;
    const liqPl = nativeLiqRef.current;
    if (!position || box.w <= 0) {
      entryPl?.applyOptions({ lineVisible: false });
      liqPl?.applyOptions({ lineVisible: false });
      return;
    }
    const entry = position.entryPrice;
    const mark = currentPrice || position.markPrice || entry;
    const isLong = position.side === "long";
    const uPnl =
      position.unrealizedPnl ??
      (isLong ? position.size * (mark - entry) : position.size * (entry - mark));

    entryPl?.applyOptions({
      price: entry,
      lineVisible: true,
      lineStyle: LineStyle.Solid,
      lineWidth: 1,
      color: HL_ENTRY,
      axisLabelVisible: false,
      title: `PNL ${fmtPnl(uPnl)}`,
    });

    const liq = position.liquidationPrice;
    if (liq != null && liq > 0) {
      liqPl?.applyOptions({
        price: liq,
        lineVisible: true,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        color: HL_LIQ,
        axisLabelVisible: false,
        title: "LIQ",
      });
    } else {
      liqPl?.applyOptions({ lineVisible: false });
    }
  }, [position, box.w, currentPrice, chartLayoutTick, chartVersion]);

  useEffect(() => {
    setTrailSession(null);
    trailSyncRef.current = { lastMs: 0, lastSentPx: 0 };
  }, [coin]);

  useEffect(() => {
    if (!position) {
      setTrailSession(null);
      trailSyncRef.current = { lastMs: 0, lastSentPx: 0 };
    }
  }, [position]);

  /** Ratchet SL vs live mark (profit side only moves); throttled L1 modify keeps HL trigger aligned. */
  useEffect(() => {
    if (dragKindRef.current) return;
    setTrailSession((prev) => {
      if (!prev || prev.coin !== coin) return prev;
      const pos = positionRef.current;
      if (!pos) return prev;
      const mark = pos.markPrice || currentPriceRef.current || pos.entryPrice;
      const refPx = currentPriceRef.current || mark;
      const next = advanceTrailingRatchet(prev, mark, refPx);
      return next.ratchetSl === prev.ratchetSl ? prev : next;
    });
  }, [currentPrice, position?.markPrice, position?.entryPrice, coin]);

  useEffect(() => {
    if (dragKindRef.current) return;
    if (!trailSession || trailSession.coin !== coin || !position) return;
    const y = priceToCoordinate(trailSession.ratchetSl);
    const slC = slLineColor(position.side === "long", position.entryPrice, trailSession.ratchetSl);
    if (y !== null) applyLineVisual("sl", y, trailSession.ratchetSl, true, false, slC);

    const oid = slOrder?.oid;
    const addr = walletAddress;
    if (!oid || !addr || !hyperliquidSessionReady || !slOrder) return;

    const refPx = currentPrice || position.markPrice || position.entryPrice;
    const t = tickSize(refPx);
    if (Math.abs(trailSession.ratchetSl - trailSyncRef.current.lastSentPx) < t * 0.85) return;
    const now = Date.now();
    if (now - trailSyncRef.current.lastMs < 1700) return;
    trailSyncRef.current.lastMs = now;
    trailSyncRef.current.lastSentPx = trailSession.ratchetSl;

    const spec: TpslModifyOrderSpec = {
      coin,
      orderId: oid,
      newPrice: trailSession.ratchetSl,
      isBuy: position.side !== "long",
      size: parseFloat(String(slOrder.sz)) > 0 ? parseFloat(String(slOrder.sz)) : position.size,
      tpsl: "sl",
    };
    void (async () => {
      const res = await syncOrderToExchange(addr, spec);
      if (res.ok) {
        try {
          await refreshAccount();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [
    trailSession,
    coin,
    position,
    slOrder,
    walletAddress,
    hyperliquidSessionReady,
    priceToCoordinate,
    applyLineVisual,
    currentPrice,
    refreshAccount,
  ]);

  const flushDragFrame = useCallback(() => {
    rafRef.current = null;
    const clientY = pendingClientYRef.current;
    const kind = dragKindRef.current;
    if (clientY === null || !kind || !positionRef.current) return;
    const pane = chartPaneRef.current;
    if (!pane) return;
    const top = pane.getBoundingClientRect().top;
    let localY = clientY - top;
    localY = Math.max(0, Math.min(box.h || pane.clientHeight, localY));

    const raw = coordinateToPriceRef.current(clientY);
    if (raw === null || raw <= 0) return;
    const refPx = currentPriceRef.current;
    const pos = positionRef.current;
    const snapped = snapOrderPrice(raw, refPx);
    const mark = pos.markPrice || refPx;
    const clamped = clampTpslDragPrice(kind, snapped, pos.side === "long", pos.entryPrice, mark, refPx);

    const yFromPrice = priceToCoordinateRef.current(clamped);
    const y = yFromPrice !== null ? yFromPrice : localY;
    const accent =
      kind === "sl" ? slLineColor(pos.side === "long", pos.entryPrice, clamped) : undefined;
    applyLineVisual(kind, y, clamped, true, false, accent);
  }, [applyLineVisual, box.h, chartPaneRef]);

  const scheduleDragFrame = useCallback(() => {
    const runRaf = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushDragFrame();
      });
    };

    const now = performance.now();
    const elapsed = now - lastDragVisualMsRef.current;
    if (elapsed >= DRAG_VISUAL_MIN_MS) {
      lastDragVisualMsRef.current = now;
      if (dragVisualThrottleTimerRef.current) {
        clearTimeout(dragVisualThrottleTimerRef.current);
        dragVisualThrottleTimerRef.current = null;
      }
      runRaf();
      return;
    }
    if (dragVisualThrottleTimerRef.current) return;
    dragVisualThrottleTimerRef.current = setTimeout(() => {
      dragVisualThrottleTimerRef.current = null;
      lastDragVisualMsRef.current = performance.now();
      runRaf();
    }, DRAG_VISUAL_MIN_MS - elapsed);
  }, [flushDragFrame]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (dragVisualThrottleTimerRef.current) {
        clearTimeout(dragVisualThrottleTimerRef.current);
        dragVisualThrottleTimerRef.current = null;
      }
      if (modifyBatchTimerRef.current) {
        clearTimeout(modifyBatchTimerRef.current);
        modifyBatchTimerRef.current = null;
      }
      modifyBatchBufferRef.current = [];
    };
  }, []);

  /** Orchestrator lifecycle: chart recreation (renderKey) must reset interaction state. */
  useEffect(() => {
    dragKindRef.current = null;
    pendingDragRef.current = null;
    dragActivatedRef.current = false;
    dragFromGhostRef.current = false;
    dragStartPriceRef.current = null;
    pendingClientYRef.current = null;
    onDraggingChange?.(false);
    if (activePointerElRef.current && activePointerIdRef.current !== null) {
      try {
        activePointerElRef.current.releasePointerCapture(activePointerIdRef.current);
      } catch {
        /* ignore */
      }
    }
    activePointerElRef.current = null;
    activePointerIdRef.current = null;
    if (dragVisualThrottleTimerRef.current) {
      clearTimeout(dragVisualThrottleTimerRef.current);
      dragVisualThrottleTimerRef.current = null;
    }
    if (modifyBatchTimerRef.current) {
      clearTimeout(modifyBatchTimerRef.current);
      modifyBatchTimerRef.current = null;
    }
    modifyBatchBufferRef.current = [];
    l1PendingKindsRef.current.clear();
    setTrailSession(null);
    trailSyncRef.current = { lastMs: 0, lastSentPx: 0 };
  }, [chartVersion, onDraggingChange]);

  const beginDrag = useCallback(
    (e: React.PointerEvent, kind: TpslSide, opts: { ghost: boolean; startPrice: number }) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if ((e.target as HTMLElement).closest("[data-sovereign-chip]")) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      try {
        el.setPointerCapture(e.pointerId);
        activePointerElRef.current = el;
        activePointerIdRef.current = e.pointerId;
      } catch {
        /* ignore */
      }
      pendingDragRef.current = {
        kind,
        ghost: opts.ghost,
        startPrice: opts.startPrice,
        startX: e.clientX,
        startY: e.clientY,
      };
      dragActivatedRef.current = false;
      dragKindRef.current = null;
      dragFromGhostRef.current = opts.ghost;
      dragStartPriceRef.current = opts.startPrice;
      pendingClientYRef.current = e.clientY;

      const blockWheel = (we: WheelEvent) => {
        we.preventDefault();
      };
      document.addEventListener("wheel", blockWheel, { passive: false, capture: true });

      const releasePointer = () => {
        if (activePointerElRef.current && activePointerIdRef.current !== null) {
          try {
            activePointerElRef.current.releasePointerCapture(activePointerIdRef.current);
          } catch {
            /* ignore */
          }
        }
        activePointerElRef.current = null;
        activePointerIdRef.current = null;
      };

      const cleanupListeners = () => {
        document.removeEventListener("wheel", blockWheel, { capture: true });
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      const abortDrag = (notifyEnd: boolean) => {
        cleanupListeners();
        releasePointer();
        pendingDragRef.current = null;
        dragActivatedRef.current = false;
        dragKindRef.current = null;
        dragFromGhostRef.current = false;
        dragStartPriceRef.current = null;
        pendingClientYRef.current = null;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (dragVisualThrottleTimerRef.current) {
          clearTimeout(dragVisualThrottleTimerRef.current);
          dragVisualThrottleTimerRef.current = null;
        }
        if (notifyEnd) onDraggingChange?.(false);
      };

      const activateDrag = () => {
        const pending = pendingDragRef.current;
        if (!pending || dragActivatedRef.current) return;
        dragActivatedRef.current = true;
        pendingDragRef.current = null;
        dragKindRef.current = pending.kind;
        dragFromGhostRef.current = pending.ghost;
        dragStartPriceRef.current = pending.startPrice;
        onDraggingChange?.(true);
        flushDragFrame();
      };

      const onMove = (ev: PointerEvent) => {
        if (pendingDragRef.current && !dragActivatedRef.current) {
          const { startX, startY } = pendingDragRef.current;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * DRAG_PAN_ABORT_RATIO) {
            abortDrag(false);
            return;
          }
          if (Math.abs(dy) >= DRAG_ACTIVATE_PX && Math.abs(dy) > Math.abs(dx) * 1.15) {
            activateDrag();
          } else {
            return;
          }
        }
        if (!dragKindRef.current) return;
        pendingClientYRef.current = ev.clientY;
        scheduleDragFrame();
      };

      const onUp = async (ev: PointerEvent) => {
        cleanupListeners();
        releasePointer();

        const wasActivated = dragActivatedRef.current;
        const finalKind = dragKindRef.current;
        pendingDragRef.current = null;
        dragActivatedRef.current = false;
        dragKindRef.current = null;
        onDraggingChange?.(false);
        pendingClientYRef.current = null;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (dragVisualThrottleTimerRef.current) {
          clearTimeout(dragVisualThrottleTimerRef.current);
          dragVisualThrottleTimerRef.current = null;
        }

        if (!wasActivated || !finalKind || !positionRef.current) return;
        const pos = positionRef.current;
        const refPx = currentPriceRef.current;
        const rawY = coordinateToPriceRef.current(ev.clientY);
        if (rawY === null || rawY <= 0) return;
        const snapped = snapOrderPrice(rawY, refPx);
        const mark = pos.markPrice || refPx;
        let finalPrice = clampTpslDragPrice(
          finalKind,
          snapped,
          pos.side === "long",
          pos.entryPrice,
          mark,
          refPx,
        );

        const fromGhost = dragFromGhostRef.current;
        const startP = dragStartPriceRef.current;
        dragFromGhostRef.current = false;
        dragStartPriceRef.current = null;

        if (!fromGhost && startP != null) {
          if (snapOrderPrice(startP, refPx) === snapOrderPrice(finalPrice, refPx)) return;
        }

        const yFinal = priceToCoordinateRef.current(finalPrice);
        if (yFinal !== null) {
          applyLineVisual(finalKind, yFinal, finalPrice, true, false);
        }

        const runModify = modifyOrderRef.current;
        const hlOrder = finalKind === "tp" ? tpOrderRef.current : slOrderRef.current;
        const revertPx =
          startP != null
            ? snapOrderPrice(startP, refPx)
            : finalKind === "tp"
              ? (tpPriceRef.current ?? finalPrice)
              : (slPriceRef.current ?? finalPrice);

        try {
          if (runModify) {
            onPendingCommit(finalKind, finalPrice);
            await Promise.resolve(runModify(finalPrice, finalKind));
            return;
          }

          if (
            !fromGhost &&
            hlOrder?.oid &&
            walletAddressRef.current &&
            hyperliquidSessionReadyRef.current
          ) {
            onPendingCommit(finalKind, finalPrice);
            const spec: TpslModifyOrderSpec = {
              coin: coinRef.current,
              orderId: hlOrder.oid,
              newPrice: finalPrice,
              isBuy: pos.side !== "long",
              size:
                parseFloat(String(hlOrder.sz)) > 0 ? parseFloat(String(hlOrder.sz)) : pos.size,
              tpsl: finalKind,
            };
            enqueueSdkModifyCommit({
              spec,
              kind: finalKind,
              revertPrice: revertPx,
            });
            return;
          }

          onPendingCommit(finalKind, finalPrice);
          const isLong = pos.side === "long";
          const tp = finalKind === "tp" ? finalPrice : (tpPriceRef.current ?? undefined);
          const sl = finalKind === "sl" ? finalPrice : (slPriceRef.current ?? undefined);
          const markAtDrop = pos.markPrice || refPx;
          const cbRate =
            finalKind === "sl"
              ? computeTrailingCallbackRateDecimal(isLong, markAtDrop, finalPrice)
              : null;
          const result = await placeTPSL(
            coinRef.current,
            pos.size,
            isLong,
            tp,
            sl,
            pos.entryPrice,
            cbRate != null ? { slTrailingCallbackRate: cbRate } : undefined,
          );
          if (result.success) {
            if (finalKind === "sl" && cbRate != null) {
              const sess = createTrailingSession(
                coinRef.current,
                isLong,
                markAtDrop,
                finalPrice,
                refPx,
              );
              if (sess) {
                setTrailSession(sess);
                trailSyncRef.current = { lastMs: 0, lastSentPx: finalPrice };
              }
            } else if (finalKind === "sl") {
              setTrailSession(null);
            }
            toast({
              title: finalKind === "tp" ? "Take Profit set" : "Stop Loss set",
              description: `${finalKind === "tp" ? "TP" : "SL"}: $${fmt(finalPrice)}`,
            });
          } else {
            onPendingClear(finalKind);
            if (finalKind === "sl") setTrailSession(null);
            toast({ title: "Update failed", description: result.error, variant: "destructive" });
          }
        } catch (err) {
          onPendingClear(finalKind);
          toast({
            title: "System Error",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [
      applyLineVisual,
      enqueueSdkModifyCommit,
      flushDragFrame,
      onDraggingChange,
      onPendingCommit,
      onPendingClear,
      placeTPSL,
      scheduleDragFrame,
      toast,
    ],
  );

  /** Routes × on labels to venue exchange cancel for the bound oid. */
  const onCancel = useCallback(
    async (side: TpslSide) => {
      const order = side === "tp" ? tpOrder : slOrder;
      if (!order?.oid) return;
      const result = await cancelHLOrder(coin, order.oid);
      if (result.success && side === "sl") {
        setTrailSession(null);
        trailSyncRef.current = { lastMs: 0, lastSentPx: 0 };
      }
      toast(
        result.success
          ? { title: side === "tp" ? "Take Profit cancelled" : "Stop Loss cancelled" }
          : { title: "Cancel failed", description: result.error, variant: "destructive" },
      );
    },
    [tpOrder, slOrder, coin, cancelHLOrder, toast],
  );

  if (!portalEl || !position || box.w <= 0) return null;

  const w = box.w;
  const h = box.h;
  const x2 = Math.max(0, w - HL_GUTTER);

  const stripH = TPSL_STRIP_HALF_PX * 2;

  const overlay = (
    <svg
      width={w}
      height={h}
      className="absolute inset-0 overflow-visible"
      style={{ zIndex: 50, pointerEvents: "none" }}
      data-testid="apex-sovereign-order-layer"
    >
      {/*
        pointer-events: none on SVG root — only TP/SL bundles (strip + tag + ×) capture events
        so the chart canvas can pan/scroll on empty areas.
        Horizontal rules are native createPriceLine on the candle series.
      */}
      <g
        ref={tpBundleRef}
        display="none"
        style={{ pointerEvents: "auto" }}
        data-order-oid={tpOrder?.oid ?? ""}
        data-tpsl-kind="tp"
      >
        <rect
          x={0}
          y={-TPSL_STRIP_HALF_PX}
          width={x2}
          height={stripH}
          fill="transparent"
          style={{ cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") return;
            const price = effTp && effTp > 0 ? effTp : ghostTp && ghostTp > 0 ? ghostTp : null;
            if (price == null) return;
            beginDrag(e, "tp", { ghost: !(effTp && effTp > 0), startPrice: price });
          }}
        />
        <circle ref={tpDiscRef} r={3} display="none" style={{ pointerEvents: "none" }} />
        <rect
          x={w - HL_GUTTER}
          y={-11}
          width={HL_GUTTER}
          height={22}
          rx={2}
          fill={TAG_BG}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
        <line
          x1={w - HL_GUTTER}
          y1={-11}
          x2={w - HL_GUTTER}
          y2={11}
          stroke={HL_TP}
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />
        <rect
          x={w - HL_GUTTER}
          y={-11}
          width={HL_GUTTER - 22}
          height={22}
          fill="transparent"
          style={{ cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            const price = effTp && effTp > 0 ? effTp : ghostTp && ghostTp > 0 ? ghostTp : null;
            if (price == null) return;
            beginDrag(e, "tp", { ghost: !(effTp && effTp > 0), startPrice: price });
          }}
        />
        <text
          x={w - HL_GUTTER + 6}
          y={4}
          fill={HL_TP}
          fontSize={10}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
          style={{ pointerEvents: "none" }}
        >
          TP
        </text>
        <text
          ref={tpPriceTextRef}
          x={w - HL_GUTTER + 24}
          y={4}
          fill="#e8ecf1"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          style={{ pointerEvents: "none" }}
        />
        <foreignObject x={w - 20} y={-10} width={18} height={20} style={{ pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            {effTp && effTp > 0 && tpOrder?.oid ? (
              <button
                type="button"
                data-sovereign-chip
                title="Cancel TP"
                onClick={(ev) => {
                  ev.stopPropagation();
                  void onCancel("tp");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.55)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        </foreignObject>
      </g>

      <g
        ref={slBundleRef}
        display="none"
        style={{ pointerEvents: "auto" }}
        data-order-oid={slOrder?.oid ?? ""}
        data-tpsl-kind="sl"
      >
        <rect
          x={0}
          y={-TPSL_STRIP_HALF_PX}
          width={x2}
          height={stripH}
          fill="transparent"
          style={{ cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") return;
            const price =
              mergedEffSl && mergedEffSl > 0
                ? mergedEffSl
                : ghostSl && ghostSl > 0
                  ? ghostSl
                  : null;
            if (price == null) return;
            beginDrag(e, "sl", { ghost: !(mergedEffSl && mergedEffSl > 0), startPrice: price });
          }}
        />
        <circle ref={slDiscRef} r={3} display="none" style={{ pointerEvents: "none" }} />
        <rect
          x={w - HL_GUTTER}
          y={-11}
          width={HL_GUTTER}
          height={22}
          rx={2}
          fill={TAG_BG}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
        <line
          ref={slAccentLineRef}
          x1={w - HL_GUTTER}
          y1={-11}
          x2={w - HL_GUTTER}
          y2={11}
          stroke={HL_SL}
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />
        <rect
          x={w - HL_GUTTER}
          y={-11}
          width={HL_GUTTER - 22}
          height={22}
          fill="transparent"
          style={{ cursor: "ns-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            const price =
              mergedEffSl && mergedEffSl > 0
                ? mergedEffSl
                : ghostSl && ghostSl > 0
                  ? ghostSl
                  : null;
            if (price == null) return;
            beginDrag(e, "sl", { ghost: !(mergedEffSl && mergedEffSl > 0), startPrice: price });
          }}
        />
        <text
          x={w - HL_GUTTER + 6}
          y={4}
          fill={HL_SL}
          fontSize={10}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
          style={{ pointerEvents: "none" }}
        >
          SL
        </text>
        <text
          ref={slPriceTextRef}
          x={w - HL_GUTTER + 24}
          y={4}
          fill="#e8ecf1"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          style={{ pointerEvents: "none" }}
        />
        <foreignObject x={w - 20} y={-10} width={18} height={20} style={{ pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            {mergedEffSl && mergedEffSl > 0 && slOrder?.oid ? (
              <button
                type="button"
                data-sovereign-chip
                title="Cancel SL"
                onClick={(ev) => {
                  ev.stopPropagation();
                  void onCancel("sl");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.55)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        </foreignObject>
      </g>
    </svg>
  );

  return createPortal(overlay, portalEl);
}
