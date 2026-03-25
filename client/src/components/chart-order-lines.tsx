/**
 * Interactive TP/SL overlay aligned to lightweight-charts v5 via candlestick series coordinateToPrice.
 * Native createPriceLine() is not used for TP/SL — those lines sit on the canvas and intercept pointer events,
 * which breaks drag. Entry/Liq remain as canvas price lines in pattern-chart.tsx.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, Pencil, Check } from "lucide-react";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
  visiblePriceRange?: { min: number; max: number } | null;
  coordinateToPrice?: (clientY: number) => number | null;
  /** Notifies parent so the chart can disable pan/zoom while dragging TP/SL (Hyperliquid-like). */
  onDraggingChange?: (dragging: boolean) => void;
}

function fmt(p: number): string {
  if (!p || p === 0) return "0";
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

/** Label text like Hyperliquid: "TP: $12,345.6" */
function fmtUsdLabel(prefix: "TP" | "SL", p: number): string {
  return `${prefix}: $${fmt(p)}`;
}

function fmtSize(s: number): string {
  if (s < 0.001) return s.toFixed(6);
  if (s < 1) return s.toFixed(4);
  return s.toFixed(3);
}

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Line colors aligned with Hyperliquid / TradingView perp chart (green TP, red SL). */
const HL_TP = "#0ecb81";
const HL_SL = "#f6465d";
const HL_TP_DIM = "rgba(14, 203, 129, 0.45)";
const HL_SL_DIM = "rgba(246, 70, 93, 0.45)";

/** Right strip for labels — matches ~lightweight-charts price scale so lines read like TV/HL. */
const HL_GUTTER_PX = 72;

/** TV-style panel behind order tags (Hyperliquid dark chart UI). */
const HL_TAG_BG = "rgba(19, 23, 34, 0.96)";

/** Snap to sensible price increments (Hyperliquid-style tick by magnitude). */
function snapOrderPrice(price: number, refPrice: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  const r = refPrice > 0 ? refPrice : price;
  const tick =
    r >= 50_000 ? 1 :
    r >= 10_000 ? 0.5 :
    r >= 1_000 ? 0.1 :
    r >= 100 ? 0.01 :
    r >= 10 ? 0.001 :
    r >= 1 ? 0.0001 :
    r >= 0.1 ? 0.00001 :
    0.0000001;
  const rounded = Math.round(price / tick) * tick;
  const dec = Math.min(8, Math.max(0, Math.ceil(-Math.log10(tick))));
  return parseFloat(rounded.toFixed(dec));
}

function tickSize(refPrice: number): number {
  const r = refPrice > 0 ? refPrice : 1;
  if (r >= 50_000) return 1;
  if (r >= 10_000) return 0.5;
  if (r >= 1_000) return 0.1;
  if (r >= 100) return 0.01;
  if (r >= 10) return 0.001;
  if (r >= 1) return 0.0001;
  if (r >= 0.1) return 0.00001;
  return 0.0000001;
}

/** Keep dragged TP/SL inside visible scale + valid side of entry / mark (HL rules). */
function clampTpslDragPrice(
  kind: "tp" | "sl",
  price: number,
  isLong: boolean,
  entry: number,
  mark: number,
  refPrice: number,
  visMin: number | null,
  visMax: number | null
): number {
  let p = snapOrderPrice(price, refPrice);
  const tick = tickSize(refPrice || entry || mark);
  const mk = mark > 0 ? mark : refPrice;

  if (kind === "tp" && entry > 0) {
    if (isLong) {
      const minTp = snapOrderPrice(entry + tick, refPrice);
      p = Math.max(p, minTp);
    } else {
      const maxTp = snapOrderPrice(entry - tick, refPrice);
      p = Math.min(p, maxTp);
    }
  } else if (kind === "sl" && mk > 0) {
    if (isLong) {
      const maxSl = snapOrderPrice(mk - tick, refPrice);
      p = Math.min(p, maxSl);
      if (p >= mk) p = maxSl;
    } else {
      const minSl = snapOrderPrice(mk + tick, refPrice);
      p = Math.max(p, minSl);
      if (p <= mk) p = minSl;
    }
  }

  if (visMin != null && visMax != null && visMax > visMin) {
    p = Math.min(visMax, Math.max(visMin, p));
    p = snapOrderPrice(p, refPrice);
  }

  return p;
}

export function ChartOrderLines({ coin, currentPrice, visiblePriceRange, coordinateToPrice, onDraggingChange }: ChartOrderLinesProps) {
  const { positions, openOrders, cancelHLOrder, placeTPSL } = useTrading();
  const { toast } = useToast();
  const [containerHeight, setContainerHeight] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState<null | "tp" | "sl">(null);
  const [editInput, setEditInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<null | "tp" | "sl">(null);
  const [dragPrice, setDragPrice] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editMode]);

  const position = useMemo(() => positions.find(p => p.coin === coin), [positions, coin]);

  const getOrderType = useCallback((order: any): "tp" | "sl" | "other" => {
    if (!position) return "other";
    const ot = (order.orderType || "").toLowerCase();
    if (ot.includes("take profit") || ot === "take_profit") return "tp";
    if (ot.includes("stop") || ot === "stop_loss") return "sl";
    const trigPx = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    if (!trigPx || isNaN(trigPx)) return "other";
    return position.side === "long"
      ? trigPx > (position.entryPrice || currentPrice) ? "tp" : "sl"
      : trigPx < (position.entryPrice || currentPrice) ? "tp" : "sl";
  }, [position, currentPrice]);

  const coinOrders = useMemo(() => openOrders.filter(o => o.coin === coin), [openOrders, coin]);
  const tpOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "tp"), [coinOrders, getOrderType]);
  const slOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "sl"), [coinOrders, getOrderType]);

  const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  const positionRef = useRef(position);
  positionRef.current = position;
  const coordinateToPriceRef = useRef(coordinateToPrice);
  coordinateToPriceRef.current = coordinateToPrice;
  const visibleRangeRef = useRef(visiblePriceRange);
  visibleRangeRef.current = visiblePriceRange;
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;
  const coinRef = useRef(coin);
  coinRef.current = coin;
  const tpPriceRef = useRef(tpPrice);
  tpPriceRef.current = tpPrice;
  const slPriceRef = useRef(slPrice);
  slPriceRef.current = slPrice;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  // Drag-to-update: track mouse while dragging a TP or SL line.
  // Uses a ref for the live price so we don't re-subscribe on every mousemove.
  const dragPriceRef = useRef<number | null>(null);
  const draggingRef = useRef<null | "tp" | "sl">(null);
  draggingRef.current = dragging;
  /** Price when drag started (skip API if unchanged — HL-style no-op release). */
  const dragStartPriceRef = useRef<number | null>(null);
  const dragFromGhostRef = useRef(false);
  const dragRafRef = useRef<number | null>(null);
  const pendingClientYRef = useRef<number | null>(null);

  useEffect(() => {
    onDraggingChange?.(!!dragging);
  }, [dragging, onDraggingChange]);

  // Block wheel zoom on the page while dragging so lightweight-charts does not fight the drag.
  useEffect(() => {
    if (!dragging) return;
    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    document.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", blockWheel, { capture: true });
  }, [dragging]);

  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingClientYRef.current = null;
      dragPriceRef.current = null;
      dragStartPriceRef.current = null;
      dragFromGhostRef.current = false;
      setDragging(null);
      setDragPrice(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  useEffect(() => {
    if (!dragging) return;

    const readY = (e: MouseEvent | TouchEvent | PointerEvent): number | null => {
      if ("clientY" in e && typeof (e as PointerEvent).clientY === "number") {
        return (e as PointerEvent).clientY;
      }
      if ("touches" in e && e.touches.length > 0) return e.touches[0].clientY;
      if ("changedTouches" in e && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
      return (e as MouseEvent).clientY;
    };

    const applyDragFromY = (clientY: number) => {
      const coordFn = coordinateToPriceRef.current;
      const pos = positionRef.current;
      const refPx = currentPriceRef.current;
      const vr = visibleRangeRef.current;
      const kind = draggingRef.current;
      if (!coordFn || !pos || !kind) return;
      const raw = coordFn(clientY);
      if (raw === null || raw <= 0) return;
      const snapped = snapOrderPrice(raw, refPx);
      const mark = pos.markPrice || refPx;
      const vmin = vr?.min ?? null;
      const vmax = vr?.max ?? null;
      const clamped = clampTpslDragPrice(
        kind,
        snapped,
        pos.side === "long",
        pos.entryPrice,
        mark,
        refPx,
        vmin,
        vmax
      );
      dragPriceRef.current = clamped;
      setDragPrice(clamped);
    };

    const flushDragFrame = () => {
      dragRafRef.current = null;
      const y = pendingClientYRef.current;
      if (y === null) return;
      applyDragFromY(y);
    };

    const onMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!coordinateToPriceRef.current) return;
      if ("preventDefault" in e && e.cancelable) e.preventDefault();
      const y = readY(e);
      if (y === null) return;
      pendingClientYRef.current = y;
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(flushDragFrame);
      }
    };

    const onUp = async (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingClientYRef.current = null;

      const finalDragging = draggingRef.current;
      const y = readY(e);
      const pos = positionsRef.current.find(p => p.coin === coinRef.current);
      const refPx = currentPriceRef.current;
      const coordFn = coordinateToPriceRef.current;
      const vr = visibleRangeRef.current;

      let raw = dragPriceRef.current;
      if (raw === null && coordFn && y !== null) {
        const r = coordFn(y);
        if (r !== null && r > 0) {
          raw = snapOrderPrice(r, refPx);
        }
      }
      let finalPrice =
        raw !== null && raw > 0 && pos && finalDragging
          ? clampTpslDragPrice(
              finalDragging,
              raw,
              pos.side === "long",
              pos.entryPrice,
              pos.markPrice || refPx,
              refPx,
              vr?.min ?? null,
              vr?.max ?? null
            )
          : null;

      dragPriceRef.current = null;
      setDragging(null);
      setDragPrice(null);

      if (!finalDragging || finalPrice === null || finalPrice <= 0 || !pos) return;

      const fromGhost = dragFromGhostRef.current;
      dragFromGhostRef.current = false;
      const startP = dragStartPriceRef.current;
      dragStartPriceRef.current = null;
      if (!fromGhost && startP != null) {
        const a = snapOrderPrice(startP, refPx);
        const b = snapOrderPrice(finalPrice, refPx);
        if (a === b) return;
      }

      const isLong = pos.side === "long";
      const tp = finalDragging === "tp" ? finalPrice : (tpPriceRef.current ?? undefined);
      const sl = finalDragging === "sl" ? finalPrice : (slPriceRef.current ?? undefined);

      const result = await placeTPSL(coinRef.current, pos.size, isLong, tp, sl, pos.entryPrice);
      if (result.success) {
        toast({
          title: finalDragging === "tp" ? "Take Profit set" : "Stop Loss set",
          description: fmtUsdLabel(finalDragging === "tp" ? "TP" : "SL", finalPrice),
        });
      } else {
        toast({ title: "Update failed", description: result.error, variant: "destructive" });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    return () => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
      pendingClientYRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  }, [dragging, placeTPSL, toast]);

  const handleCancel = useCallback(async (type: "tp" | "sl") => {
    const order = type === "tp" ? tpOrder : slOrder;
    if (!order) return;
    const result = await cancelHLOrder(coin, order.oid);
    toast(result.success
      ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} cancelled` }
      : { title: "Cancel failed", description: result.error, variant: "destructive" });
  }, [tpOrder, slOrder, coin, cancelHLOrder, toast]);

  const startEdit = useCallback((type: "tp" | "sl") => {
    const price = type === "tp" ? tpPrice : slPrice;
    setEditInput(price ? fmt(price) : "");
    setEditMode(type);
  }, [tpPrice, slPrice]);

  const cancelEdit = useCallback(() => {
    setEditMode(null);
    setEditInput("");
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editMode || !position) return;
    const parsed = parseFloat(editInput);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Invalid price", variant: "destructive" });
      return;
    }
    const mark = position.markPrice || currentPrice;
    const vmin = visiblePriceRange?.min ?? null;
    const vmax = visiblePriceRange?.max ?? null;
    const newPrice = clampTpslDragPrice(
      editMode,
      parsed,
      position.side === "long",
      position.entryPrice,
      mark,
      currentPrice,
      vmin,
      vmax
    );
    setIsSubmitting(true);
    try {
      const isLong = position.side === "long";
      const tp = editMode === "tp" ? newPrice : (tpPrice ?? undefined);
      const sl = editMode === "sl" ? newPrice : (slPrice ?? undefined);
      const result = await placeTPSL(coin, position.size, isLong, tp, sl, position.entryPrice);
      if (result.success) {
        toast({ title: `${editMode === "tp" ? "Take Profit" : "Stop Loss"} updated` });
        setEditMode(null);
        setEditInput("");
      } else {
        toast({ title: "Update failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [editMode, editInput, position, coin, tpPrice, slPrice, placeTPSL, toast, currentPrice, visiblePriceRange]);

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const unrealizedPnl = position.unrealizedPnl ?? (isLong ? size * (currentPrice - entry) : size * (entry - currentPrice));
  const pnlPositive = unrealizedPnl >= 0;
  const liqPrice = position.liquidationPrice;

  // Hyperliquid-style “ghost” lines when TP/SL not set yet — drag to place.
  const markPx = position.markPrice || currentPrice || entry;
  let ghostTp: number | null = null;
  let ghostSl: number | null = null;
  if (!tpPrice) {
    ghostTp = isLong ? entry * 1.012 : entry * 0.988;
  }
  if (!slPrice) {
    if (isLong) {
      ghostSl = Math.min(entry * 0.988, markPx * 0.992);
      if (ghostSl >= markPx) ghostSl = markPx * 0.99;
    } else {
      ghostSl = Math.max(entry * 1.012, markPx * 1.008);
      if (ghostSl <= markPx) ghostSl = markPx * 1.01;
    }
  }

  const priceLevels: number[] = [currentPrice, entry].filter(p => p > 0);
  if (tpPrice) priceLevels.push(tpPrice);
  if (slPrice) priceLevels.push(slPrice);
  if (ghostTp) priceLevels.push(ghostTp);
  if (ghostSl) priceLevels.push(ghostSl);
  if (liqPrice && liqPrice > 0) priceLevels.push(liqPrice);

  const rawMin = Math.min(...priceLevels);
  const rawMax = Math.max(...priceLevels);
  const span = rawMax - rawMin || currentPrice * 0.06;
  const pad = span * 0.25;
  const rMin = rawMin - pad;
  const rMax = rawMax + pad;

  // Use the chart's actual visible price range when available for pixel-perfect alignment
  const effMin = visiblePriceRange?.min ?? rMin;
  const effMax = visiblePriceRange?.max ?? rMax;

  const toYPct = (price: number): number => ((effMax - price) / (effMax - effMin)) * 100;

  interface LineConfig {
    key: string;
    price: number;
    lineColor: string;
    color: string;
    dashed: boolean;
    label: string;
    pnlLabel?: string;
    sizeLabel: string;
    canCancel: boolean;
    canEdit: boolean;
    cancelType?: "tp" | "sl";
    editType?: "tp" | "sl";
    labelSide?: "left" | "right";
    isGhost?: boolean;
    rowZ?: number;
  }

  const beginTpslDrag = useCallback((e: React.PointerEvent, line: LineConfig) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("[data-tpsl-chip]")) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartPriceRef.current = line.price;
    dragFromGhostRef.current = !!line.isGhost;
    dragPriceRef.current = line.price;
    setDragPrice(line.price);
    setDragging(line.editType!);
  }, []);

  const lines: LineConfig[] = [];

  lines.push({
    key: "entry",
    price: entry,
    color: "text-blue-400",
    lineColor: "#60a5fa",
    dashed: true,
    label: `Entry ${fmt(entry)}`,
    pnlLabel: `PNL ${fmtPnl(unrealizedPnl)}`,
    sizeLabel: fmtSize(size),
    canCancel: false,
    canEdit: false,
    labelSide: "left",
    rowZ: 14,
  });

  if (liqPrice && liqPrice > 0) {
    lines.push({
      key: "liq",
      price: liqPrice,
      color: "text-orange-400",
      lineColor: "#f97316",
      dashed: true,
      label: `Liq. ${fmt(liqPrice)}`,
      sizeLabel: "",
      canCancel: false,
      canEdit: false,
      labelSide: "left",
      rowZ: 12,
    });
  }

  // TP/SL after entry/liq so they stack above; labels on the right like Hyperliquid + TradingView order lines.
  if (ghostTp && ghostTp > 0) {
    lines.push({
      key: "ghost-tp",
      price: ghostTp,
      color: "text-[#0ecb81]/90",
      lineColor: HL_TP_DIM,
      dashed: true,
      label: "TP",
      sizeLabel: fmtSize(size),
      canCancel: false,
      canEdit: true,
      editType: "tp",
      labelSide: "right",
      isGhost: true,
      rowZ: 40,
    });
  }

  if (tpPrice && tpPrice > 0) {
    lines.push({
      key: "tp",
      price: tpPrice,
      color: "text-[#0ecb81]",
      lineColor: HL_TP,
      dashed: false,
      label: "TP",
      sizeLabel: fmtSize(size),
      canCancel: true,
      canEdit: true,
      cancelType: "tp",
      editType: "tp",
      labelSide: "right",
      rowZ: 42,
    });
  }

  if (ghostSl && ghostSl > 0) {
    lines.push({
      key: "ghost-sl",
      price: ghostSl,
      color: "text-[#f6465d]/90",
      lineColor: HL_SL_DIM,
      dashed: true,
      label: "SL",
      sizeLabel: fmtSize(size),
      canCancel: false,
      canEdit: true,
      editType: "sl",
      labelSide: "right",
      isGhost: true,
      rowZ: 40,
    });
  }

  if (slPrice && slPrice > 0) {
    lines.push({
      key: "sl",
      price: slPrice,
      color: "text-[#f6465d]",
      lineColor: HL_SL,
      dashed: false,
      label: "SL",
      sizeLabel: fmtSize(size),
      canCancel: true,
      canEdit: true,
      cancelType: "sl",
      editType: "sl",
      labelSide: "right",
      rowZ: 42,
    });
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[15] overflow-hidden"
      style={{ pointerEvents: "none", height: containerHeight || undefined }}
      data-testid="chart-order-lines"
    >
      {/* Drag preview line while dragging */}
      {dragging && dragPrice !== null && (() => {
        const yPct = toYPct(dragPrice);
        if (yPct < 0 || yPct > 100) return null;
        const previewColor = dragging === "tp" ? HL_TP : HL_SL;
        return (
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{ top: `${yPct}%`, transform: "translateY(-50%)", zIndex: 50 }}
          >
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-px"
              style={{
                right: HL_GUTTER_PX,
                backgroundColor: previewColor,
                opacity: 0.95,
                boxShadow: `0 0 6px ${previewColor}33`,
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                right: HL_GUTTER_PX - 3,
                width: 6,
                height: 6,
                backgroundColor: previewColor,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
              }}
            />
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-end px-1 py-0.5 font-mono tabular-nums border-y border-r border-white/[0.08] rounded-r-sm rounded-l-none"
              style={{
                width: HL_GUTTER_PX,
                minHeight: 22,
                background: HL_TAG_BG,
                borderLeft: `2px solid ${previewColor}`,
              }}
            >
              <span className="text-[10px] font-semibold leading-tight truncate w-full text-right" style={{ color: previewColor }}>
                {fmtUsdLabel(dragging === "tp" ? "TP" : "SL", dragPrice)}
              </span>
            </div>
          </div>
        );
      })()}

      {lines.map(line => {
        const yPct = toYPct(line.price);
        if (yPct < -8 || yPct > 108) return null;
        const isEditing = editMode === line.editType;
        const isTpSl = line.editType === "tp" || line.editType === "sl";
        const useDragBand = isTpSl && !!coordinateToPrice;

        const z = line.rowZ ?? (useDragBand ? 32 : 16);
        const tpslHot = useDragBand && (line.editType === "tp" || line.editType === "sl");
        const tpslActive = tpslHot && dragging === line.editType;
        return (
          <div
            key={line.key}
            className={cn("absolute left-0 right-0", tpslHot && "group/tpsl")}
            style={
              useDragBand
                ? { top: `calc(${yPct}% - 22px)`, height: 44, zIndex: z }
                : { top: `${yPct}%`, transform: "translateY(-50%)", zIndex: z }
            }
          >
            {/* Price line: TP/SL stop before right gutter (TV/HL); entry/liq span full width. */}
            {useDragBand ? (
              <div
                className={cn(
                  "absolute left-0 pointer-events-none top-1/2 -translate-y-1/2 transition-all duration-100",
                  tpslActive ? "opacity-100" : "opacity-[0.78] group-hover/tpsl:opacity-100",
                )}
                style={
                  line.dashed
                    ? {
                        right: HL_GUTTER_PX,
                        height: 0,
                        borderTopWidth: tpslActive ? 2 : 1,
                        borderTopStyle: "dashed",
                        borderTopColor: line.lineColor,
                        opacity: line.isGhost ? (tpslActive ? 0.75 : 0.55) : undefined,
                        filter: tpslActive ? `drop-shadow(0 0 4px ${line.lineColor})` : undefined,
                      }
                    : {
                        right: HL_GUTTER_PX,
                        height: tpslActive ? 2 : 1,
                        backgroundColor: line.lineColor,
                        opacity: line.isGhost ? (tpslActive ? 0.85 : 0.6) : tpslActive ? 1 : 0.92,
                        boxShadow: line.isGhost ? undefined : tpslActive ? `0 0 8px ${line.lineColor}55` : `0 0 5px ${line.lineColor}2a`,
                      }
                }
              />
            ) : (
              <div
                className={cn(
                  "absolute left-0 right-0 pointer-events-none top-1/2 -translate-y-1/2",
                  line.dashed ? "h-0 border-t" : "h-px"
                )}
                style={
                  line.dashed
                    ? {
                        borderTopWidth: 1,
                        borderTopStyle: "dashed",
                        borderTopColor: line.lineColor,
                        opacity: line.isGhost ? 0.5 : 0.72,
                      }
                    : {
                        backgroundColor: line.lineColor,
                        opacity: line.isGhost ? 0.55 : 0.9,
                      }
                }
              />
            )}

            {useDragBand && (
              <div
                className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  right: HL_GUTTER_PX - 3,
                  width: 6,
                  height: 6,
                  backgroundColor: line.dashed ? line.lineColor : line.lineColor,
                  opacity: line.isGhost ? 0.65 : 1,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                }}
              />
            )}

            {/* Chart-area strip; right tag also starts drag (Hyperliquid-style). */}
            {useDragBand && (
              <div
                className="absolute left-0 top-0 bottom-0 touch-none"
                style={{
                  right: HL_GUTTER_PX,
                  cursor: tpslActive ? "grabbing" : "ns-resize",
                  pointerEvents: "auto",
                  touchAction: "none",
                  zIndex: z + 2,
                }}
                title="Drag to move · double-click tag to edit · Esc to cancel"
                onPointerDown={(e) => beginTpslDrag(e, line)}
                data-testid={`drag-handle-${line.key}`}
              />
            )}

            {line.labelSide === "right" ? (
              <div
                className="absolute right-0 flex flex-col items-stretch justify-center"
                style={{
                  top: useDragBand ? "50%" : undefined,
                  transform: "translateY(-50%)",
                  width: HL_GUTTER_PX,
                  pointerEvents: "auto",
                  zIndex: z + 4,
                }}
              >
                {isEditing ? (
                  <div
                    className="flex flex-col gap-1 p-1 border border-white/20 rounded-sm shadow-lg"
                    style={{ background: HL_TAG_BG }}
                  >
                    <input
                      ref={inputRef}
                      type="number"
                      value={editInput}
                      onChange={e => setEditInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className={cn(
                        "w-full min-w-0 bg-transparent text-[11px] font-mono font-semibold outline-none tabular-nums px-0.5",
                        line.color
                      )}
                      disabled={isSubmitting}
                      data-testid={`edit-input-${line.key}`}
                    />
                    <div className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={confirmEdit}
                        disabled={isSubmitting}
                        className="text-[#0ecb81] hover:opacity-90 p-0.5 disabled:opacity-40"
                        data-testid={`confirm-edit-${line.key}`}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-white/50 hover:text-white/80 p-0.5"
                        data-testid={`cancel-edit-${line.key}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex items-center justify-between gap-0.5 pl-1 pr-0.5 py-0.5 font-mono tabular-nums select-none touch-none",
                      "border-y border-r border-white/[0.08] rounded-r-sm rounded-l-none",
                      line.isGhost && "border-dashed",
                    )}
                    style={{
                      minHeight: 22,
                      background: HL_TAG_BG,
                      borderLeft: `2px solid ${line.lineColor}`,
                      borderLeftStyle: line.isGhost ? "dashed" : "solid",
                      cursor: tpslActive ? "grabbing" : "ns-resize",
                      touchAction: "none",
                      boxShadow: tpslActive ? `0 0 10px ${line.lineColor}33` : undefined,
                    }}
                    title="Drag · double-click to edit price"
                    onPointerDown={(e) => beginTpslDrag(e, line)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!line.isGhost && line.canEdit) startEdit(line.editType!);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !line.isGhost && line.canEdit) startEdit(line.editType!);
                    }}
                  >
                    <div className="flex flex-col items-end leading-tight min-w-0 flex-1 overflow-hidden">
                      <span
                        className={cn("text-[10px] font-semibold leading-tight truncate w-full text-right", line.color)}
                      >
                        {fmtUsdLabel(line.label as "TP" | "SL", line.price)}
                      </span>
                      {line.isGhost ? (
                        <span className="text-[7px] leading-tight text-white/30 normal-case text-right w-full">
                          drag to place
                        </span>
                      ) : (
                        <span className="text-[8px] text-white/35 font-normal truncate text-right w-full">
                          {line.sizeLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-center shrink-0 gap-0">
                      {line.canEdit && !line.isGhost && (
                        <button
                          type="button"
                          data-tpsl-chip
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0 text-white/55 hover:text-white/90 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(line.editType!);
                          }}
                          data-testid={`edit-${line.key}`}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {line.canCancel && (
                        <button
                          type="button"
                          data-tpsl-chip
                          className="opacity-70 hover:opacity-100 p-0 text-white/55 hover:text-red-400/90 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(line.cancelType!);
                          }}
                          data-testid={`cancel-${line.key}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Left-side label for Entry and Liq */
              <div
                className="absolute left-2"
                style={{ transform: "translateY(-50%)", pointerEvents: "auto", zIndex: 30 }}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono font-semibold",
                    "bg-[#1a1f2e] border border-white/15 shadow-lg select-none whitespace-nowrap",
                    line.color,
                  )}
                >
                  {line.pnlLabel ? (
                    <>
                      <span className={cn(
                        "text-[10px] font-semibold",
                        pnlPositive ? "text-[#22c55e]" : "text-[#ef4444]"
                      )}>
                        {line.pnlLabel}
                      </span>
                      <span className="opacity-50">{line.sizeLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{line.label}</span>
                      {line.sizeLabel && <span className="opacity-50">{line.sizeLabel}</span>}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
