/**
 * STABLE TP/SL IMPLEMENTATION — DO NOT MODIFY WITHOUT FULL TESTING
 *
 * Hyperliquid-style overlay for TP/SL drag, tags, entry/PnL/liq. Canvas lines: `pattern-chart.tsx`.
 * @see ../chart-tpsl/stable-contract.ts
 *
 * TP/SL interaction layer over lightweight-charts v5.
 * Horizontal rules use series.createPriceLine() on the candlestick series (pattern-chart);
 * this overlay provides drag bands, right-side tags (HL-style), and uses coordinateToPrice /
 * priceToCoordinate for pixel-accurate mapping — no linear price↔Y approximation when the chart API is available.
 */
import "../chart-tpsl/stable-contract";
import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, Pencil, Check } from "lucide-react";
import { ghostTpslPrices, selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import {
  clampTpslDragPrice,
  computeTrailingCallbackRateDecimal,
  slLineColor,
  snapOrderPrice,
} from "@/lib/trailing-stop-orchestrator";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
  visiblePriceRange?: { min: number; max: number } | null;
  coordinateToPrice?: (clientY: number) => number | null;
  /** Candlestick series priceToCoordinate — positions overlay rows to match canvas lines. */
  priceToCoordinate?: (price: number) => number | null;
  /** When true, TP/SL horizontal lines are drawn on canvas; overlay only handles drag + tags. */
  nativeTpslLines?: boolean;
  /** When true, TP/SL + ghosts are drawn elsewhere (e.g. Apex Sovereign SVG); keep entry / liq only. */
  tpslRenderedExternally?: boolean;
  /** When true, entry line + PnL are drawn in Apex Sovereign; keep liq + overlay hit targets only. */
  entryRenderedExternally?: boolean;
  /** When true, liquidation rule is native on the candle series (Apex); skip duplicate liq row. */
  liqRenderedExternally?: boolean;
  /** Live-update native IPriceLine while dragging. */
  onTpslDragVisual?: (kind: "tp" | "sl", price: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * Called synchronously before drag state clears so native lines can stay at the committed price
   * until `openOrders` catches up (avoids snap-back to stale server SL/TP).
   */
  onTpslPendingCommit?: (kind: "tp" | "sl", price: number) => void;
  /** Clear optimistic line if placeTPSL fails. */
  onTpslPendingClear?: (kind: "tp" | "sl") => void;
}

function fmt(p: number): string {
  if (!p || p === 0) return "0";
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

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

const HL_TP = "#0ecb81";
const HL_SL = "#f6465d";
const HL_GUTTER_PX = 72;
const HL_TAG_BG = "rgba(19, 23, 34, 0.96)";
/** Tall grab zone so clicks hit the overlay (root is pointer-events: none; gaps fall through to the chart). */
const TPSL_DRAG_BAND_HALF_PX = 56;
/** Extra half-height for SL only — line often sits near chart/volume edge where the row was culled or hard to hit. */
const SL_DRAG_BAND_EXTRA_HALF_PX = 24;
/**
 * Dev-only SL drag trace. Enable with: localStorage.setItem("debug_sl_drag","1") then reload.
 * (mousemove throttled to avoid console spam.)
 */
function slDragDebugEnabled(): boolean {
  try {
    return import.meta.env.DEV && localStorage.getItem("debug_sl_drag") === "1";
  } catch {
    return false;
  }
}

/** Dev: `localStorage.setItem("isolate_sl_drag","1")` — SL drag end skips placeTPSL (prove UI-only). */
function isolateSlDrag(): boolean {
  try {
    return localStorage.getItem("isolate_sl_drag") === "1";
  } catch {
    return false;
  }
}

type LineLayout =
  | { mode: "px"; y: number }
  | { mode: "pct"; pct: number };

function layoutForPrice(
  price: number,
  priceToCoordinate: ((p: number) => number | null) | undefined,
  effMin: number,
  effMax: number,
): LineLayout {
  if (priceToCoordinate) {
    const y = priceToCoordinate(price);
    if (y !== null && Number.isFinite(y)) return { mode: "px", y };
  }
  const span = effMax - effMin || 1;
  return { mode: "pct", pct: ((effMax - price) / span) * 100 };
}

export function ChartOrderLines({
  coin,
  currentPrice,
  visiblePriceRange,
  coordinateToPrice,
  priceToCoordinate,
  nativeTpslLines = false,
  tpslRenderedExternally = false,
  entryRenderedExternally = false,
  liqRenderedExternally = false,
  onTpslDragVisual,
  onDraggingChange,
  onTpslPendingCommit,
  onTpslPendingClear,
}: ChartOrderLinesProps) {
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

  const position = useMemo(() => positions.find((p) => p.coin === coin), [positions, coin]);

  const { tpOrder, slOrder, tpPrice, slPrice } = useMemo(() => {
    return selectTpSlOrders(coin, position, openOrders);
  }, [coin, position, openOrders]);

  const positionRef = useRef(position);
  positionRef.current = position;
  const coordinateToPriceRef = useRef(coordinateToPrice);
  coordinateToPriceRef.current = coordinateToPrice;
  const activePointerElementRef = useRef<HTMLElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
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
  const onTpslDragVisualRef = useRef(onTpslDragVisual);
  onTpslDragVisualRef.current = onTpslDragVisual;

  const dragPriceRef = useRef<number | null>(null);
  const draggingRef = useRef<null | "tp" | "sl">(null);
  draggingRef.current = dragging;
  const dragStartPriceRef = useRef<number | null>(null);
  const dragFromGhostRef = useRef(false);

  useEffect(() => {
    onDraggingChange?.(!!dragging);
  }, [dragging, onDraggingChange]);

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

    let lastSlMoveLogMs = 0;

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
      const kind = draggingRef.current;
      if (!coordFn || !pos || !kind) return;
      const raw = coordFn(clientY);
      if (raw === null || raw <= 0) return;
      const snapped = snapOrderPrice(raw, refPx);
      const mark = pos.markPrice || refPx;
      const clamped = clampTpslDragPrice(
        kind,
        snapped,
        pos.side === "long",
        pos.entryPrice,
        mark,
        refPx,
      );
      dragPriceRef.current = clamped;
      setDragPrice(clamped);
      onTpslDragVisualRef.current?.(kind, clamped);

      if (slDragDebugEnabled() && kind === "sl") {
        const t = Date.now();
        if (t - lastSlMoveLogMs > 150) {
          lastSlMoveLogMs = t;
          console.debug("[chart SL drag] move → price", clamped);
        }
      }
    };

    const onMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!draggingRef.current) return;
      if (!coordinateToPriceRef.current) return;
      if ("preventDefault" in e && e.cancelable) e.preventDefault();
      const y = readY(e);
      if (y === null) return;
      applyDragFromY(y);
    };

    const onUp = async (e: MouseEvent | TouchEvent | PointerEvent) => {
      const endedKind = draggingRef.current;
      const y = readY(e);
      const pos = positionsRef.current.find((p) => p.coin === coinRef.current);
      const refPx = currentPriceRef.current;
      const coordFn = coordinateToPriceRef.current;
      // Release pointer capture, if set
      if (activePointerElementRef.current && activePointerIdRef.current !== null) {
        try {
          activePointerElementRef.current.releasePointerCapture(activePointerIdRef.current);
        } catch {
          /* ignore */
        }
        activePointerElementRef.current = null;
        activePointerIdRef.current = null;
      }

      let raw = dragPriceRef.current;
      if (raw === null && coordFn && y !== null) {
        const r = coordFn(y);
        if (r !== null && r > 0) raw = snapOrderPrice(r, refPx);
      }
      const finalDragging = draggingRef.current;
      let finalPrice =
        raw !== null && raw > 0 && pos && finalDragging
          ? clampTpslDragPrice(
              finalDragging,
              raw,
              pos.side === "long",
              pos.entryPrice,
              pos.markPrice || refPx,
              refPx,
            )
          : null;

      if (!finalDragging || finalPrice === null || finalPrice <= 0 || !pos) {
        dragPriceRef.current = null;
        setDragging(null);
        setDragPrice(null);
        console.debug("[TP/SL] onUp aborted", { finalDragging, finalPrice, pos });
        return;
      }

      const fromGhost = dragFromGhostRef.current;
      const startP = dragStartPriceRef.current;
      if (!fromGhost && startP != null) {
        const a = snapOrderPrice(startP, refPx);
        const b = snapOrderPrice(finalPrice, refPx);
        if (a === b) {
          dragPriceRef.current = null;
          dragFromGhostRef.current = false;
          dragStartPriceRef.current = null;
          setDragging(null);
          setDragPrice(null);
          return;
        }
      }

      // Hold native line at dropped price before clearing drag — effect otherwise rebuilds from stale openOrders.
      onTpslPendingCommit?.(finalDragging, finalPrice);

      dragPriceRef.current = null;
      dragFromGhostRef.current = false;
      dragStartPriceRef.current = null;
      setDragging(null);
      setDragPrice(null);

      if (slDragDebugEnabled() && endedKind === "sl") {
        console.debug("[chart SL drag] end", finalPrice ?? "(cancelled)");
      }

      console.debug("[TP/SL] onUp", { kind: finalDragging, finalPrice, pos });

      const isLong = pos.side === "long";
      const tp = finalDragging === "tp" ? finalPrice : (tpPriceRef.current ?? undefined);
      const sl = finalDragging === "sl" ? finalPrice : (slPriceRef.current ?? undefined);
      const markAtDrop = pos.markPrice || refPx;
      const slCb =
        finalDragging === "sl"
          ? computeTrailingCallbackRateDecimal(isLong, markAtDrop, finalPrice)
          : null;

      if (isolateSlDrag() && finalDragging === "sl") {
        toast({
          title: "SL isolate mode",
          description: "placeTPSL skipped (remove localStorage isolate_sl_drag to sync)",
        });
        return;
      }

      const result = await placeTPSL(
        coinRef.current,
        pos.size,
        isLong,
        tp,
        sl,
        pos.entryPrice,
        slCb != null ? { slTrailingCallbackRate: slCb } : undefined,
      );
      if (result.success) {
        toast({
          title: finalDragging === "tp" ? "Take Profit set" : "Stop Loss set",
          description: fmtUsdLabel(finalDragging === "tp" ? "TP" : "SL", finalPrice),
        });
      } else {
        onTpslPendingClear?.(finalDragging);
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

  const handleCancel = useCallback(
    async (type: "tp" | "sl") => {
      const order = type === "tp" ? tpOrder : slOrder;
      if (!order) return;
      const result = await cancelHLOrder(coin, order.oid);
      toast(
        result.success
          ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} cancelled` }
          : { title: "Cancel failed", description: result.error, variant: "destructive" },
      );
    },
    [tpOrder, slOrder, coin, cancelHLOrder, toast],
  );

  const startEdit = useCallback(
    (type: "tp" | "sl") => {
      const price = type === "tp" ? tpPrice : slPrice;
      setEditInput(price ? fmt(price) : "");
      setEditMode(type);
    },
    [tpPrice, slPrice],
  );

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
    const newPrice = clampTpslDragPrice(
      editMode,
      parsed,
      position.side === "long",
      position.entryPrice,
      mark,
      currentPrice,
    );
    setIsSubmitting(true);
    try {
      const isLong = position.side === "long";
      const tp = editMode === "tp" ? newPrice : (tpPrice ?? undefined);
      const sl = editMode === "sl" ? newPrice : (slPrice ?? undefined);
      const markAtEdit = mark;
      const slCb =
        editMode === "sl"
          ? computeTrailingCallbackRateDecimal(isLong, markAtEdit, newPrice)
          : null;
      const result = await placeTPSL(
        coin,
        position.size,
        isLong,
        tp,
        sl,
        position.entryPrice,
        slCb != null ? { slTrailingCallbackRate: slCb } : undefined,
      );
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
  }, [editMode, editInput, position, coin, tpPrice, slPrice, placeTPSL, toast, currentPrice]);

  const beginTpslDrag = useCallback(
    (e: React.PointerEvent, line: { price: number; isGhost?: boolean; editType?: "tp" | "sl" }) => {
      console.debug("[TP/SL] beginTpslDrag", { kind: line.editType, price: line.price, isGhost: line.isGhost, target: (e.target as HTMLElement).tagName });
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if ((e.target as HTMLElement).closest("[data-tpsl-chip]")) return;
      e.preventDefault();
      e.stopPropagation();

      // Capture pointer to keep drag alive even if pointer momentarily leaves the drag region.
      if (e.currentTarget.setPointerCapture) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerElementRef.current = e.currentTarget as HTMLElement;
          activePointerIdRef.current = e.pointerId;
        } catch {
          // Ignore pointer capture failures in unsupported browsers.
        }
      }

      dragStartPriceRef.current = line.price;
      dragFromGhostRef.current = !!line.isGhost;
      dragPriceRef.current = line.price;
      setDragPrice(line.price);
      setDragging(line.editType!);
      onDraggingChange?.(true);
      onTpslDragVisual?.(line.editType!, line.price);
      if (slDragDebugEnabled() && line.editType === "sl") {
        console.debug("[chart SL drag] start", line.price);
      }
    },
    [onTpslDragVisual, onDraggingChange],
  );

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const unrealizedPnl =
    position.unrealizedPnl ?? (isLong ? size * (currentPrice - entry) : size * (entry - currentPrice));
  const pnlPositive = unrealizedPnl >= 0;
  const liqPrice = position.liquidationPrice;

  const markPx = position.markPrice || currentPrice || entry;
  const { ghostTp, ghostSl } = ghostTpslPrices(entry, markPx, isLong, tpPrice != null, slPrice != null);

  const priceLevels: number[] = [currentPrice, entry].filter((p) => p > 0);
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
  const effMin = visiblePriceRange?.min ?? rMin;
  const effMax = visiblePriceRange?.max ?? rMax;

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
    /** Canvas draws the rule; overlay only hit-target + tag. */
    canvasLine?: boolean;
  }

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

  if (ghostTp && ghostTp > 0) {
    lines.push({
      key: "ghost-tp",
      price: ghostTp,
      color: "text-[#0ecb81]/90",
      lineColor: "rgba(14, 203, 129, 0.45)",
      dashed: true,
      label: "TP",
      sizeLabel: fmtSize(size),
      canCancel: false,
      canEdit: true,
      editType: "tp",
      labelSide: "right",
      isGhost: true,
      rowZ: 40,
      canvasLine: nativeTpslLines,
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
      canvasLine: nativeTpslLines,
    });
  }

  if (ghostSl && ghostSl > 0) {
    lines.push({
      key: "ghost-sl",
      price: dragging === "sl" && dragPrice != null ? dragPrice : ghostSl,
      color: "text-[#f6465d]/90",
      lineColor: "rgba(246, 70, 93, 0.45)",
      dashed: true,
      label: "SL",
      sizeLabel: fmtSize(size),
      canCancel: false,
      canEdit: true,
      editType: "sl",
      labelSide: "right",
      isGhost: true,
      rowZ: 44,
      canvasLine: nativeTpslLines,
    });
  }

  if (slPrice && slPrice > 0) {
    lines.push({
      key: "sl",
      price: dragging === "sl" && dragPrice != null ? dragPrice : slPrice,
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
      rowZ: 46,
      canvasLine: nativeTpslLines,
    });
  }

  const lineRows = lines.filter((l) => {
    if (tpslRenderedExternally && ["tp", "sl", "ghost-tp", "ghost-sl"].includes(l.key)) return false;
    if (entryRenderedExternally && l.key === "entry") return false;
    if (liqRenderedExternally && l.key === "liq") return false;
    return true;
  });

  const rowStyleFromLayout = (layout: LineLayout, bandHalfPx: number): CSSProperties => {
    if (layout.mode === "px") {
      return { top: layout.y - bandHalfPx, height: bandHalfPx * 2 };
    }
    return { top: `calc(${layout.pct}% - ${bandHalfPx}px)`, height: bandHalfPx * 2 };
  };

  const centerStyleFromLayout = (layout: LineLayout): CSSProperties => {
    if (layout.mode === "px") {
      return { top: layout.y, transform: "translateY(-50%)" };
    }
    return { top: `${layout.pct}%`, transform: "translateY(-50%)" };
  };

  const showHtmlDragPreview =
    dragging && dragPrice !== null && !nativeTpslLines;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[17] overflow-hidden"
      style={{ pointerEvents: "none", height: containerHeight || undefined }}
      data-testid="chart-order-lines"
    >
      {showHtmlDragPreview &&
        (() => {
          const layout = layoutForPrice(dragPrice!, priceToCoordinate, effMin, effMax);
          if (layout.mode === "pct" && (layout.pct < -8 || layout.pct > 108)) return null;
          if (layout.mode === "px" && (layout.y < -20 || layout.y > containerHeight + 20)) return null;
          const previewColor =
            dragging === "tp"
              ? HL_TP
              : slLineColor(isLong, entry, dragPrice!);
          const s = centerStyleFromLayout(layout);
          return (
            <div className="absolute inset-x-0 pointer-events-none" style={{ ...s, zIndex: 50 }}>
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
                <span
                  className="text-[10px] font-semibold leading-tight truncate w-full text-right"
                  style={{ color: previewColor }}
                >
                  {fmtUsdLabel(dragging === "tp" ? "TP" : "SL", dragPrice!)}
                </span>
              </div>
            </div>
          );
        })()}

      {lineRows.map((line) => {
        const layout = layoutForPrice(line.price, priceToCoordinate, effMin, effMax);
        const isSlInteractive = line.editType === "sl";
        // SL often sits just off-chart (long: below / short: above). Culling the row removed all hit targets.
        if (layout.mode === "pct") {
          if (isSlInteractive) {
            if (layout.pct < -30 || layout.pct > 130) return null;
          } else if (layout.pct < -8 || layout.pct > 108) {
            return null;
          }
        } else if (layout.mode === "px") {
          if (isSlInteractive) {
            const m = 280;
            if (layout.y < -m || layout.y > containerHeight + m) return null;
          } else if (layout.y < -40 || layout.y > containerHeight + 40) {
            return null;
          }
        }

        const isEditing = editMode === line.editType;
        const isTpSl = line.editType === "tp" || line.editType === "sl";
        const useDragBand = isTpSl && !!coordinateToPrice;

        const z = line.rowZ ?? (useDragBand ? 32 : 16);
        const tpslHot = useDragBand && (line.editType === "tp" || line.editType === "sl");
        const tpslActive = tpslHot && dragging === line.editType;

        const bandHalfPx = !useDragBand
          ? 22
          : isSlInteractive
            ? TPSL_DRAG_BAND_HALF_PX + SL_DRAG_BAND_EXTRA_HALF_PX
            : TPSL_DRAG_BAND_HALF_PX;

        const bandStyle = rowStyleFromLayout(layout, bandHalfPx);
        const centerStyle = centerStyleFromLayout(layout);
        const outerStyle: CSSProperties = useDragBand
          ? { ...bandStyle, zIndex: z }
          : { position: "absolute", left: 0, right: 0, ...centerStyle, zIndex: z };

        return (
          <div
            key={line.key}
            className={cn("absolute left-0 right-0", tpslHot && "group/tpsl")}
            style={outerStyle}
          >
            {!line.canvasLine && (
              <div
                className={cn(
                  "absolute left-0 pointer-events-none top-1/2 -translate-y-1/2",
                  tpslActive ? "opacity-100" : "opacity-[0.78] group-hover/tpsl:opacity-100",
                )}
                style={
                  useDragBand
                    ? line.dashed
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
                          boxShadow:
                            line.isGhost ? undefined : tpslActive
                              ? `0 0 8px ${line.lineColor}55`
                              : `0 0 5px ${line.lineColor}2a`,
                        }
                    : line.dashed
                      ? {
                          left: 0,
                          right: 0,
                          height: 0,
                          borderTopWidth: 1,
                          borderTopStyle: "dashed",
                          borderTopColor: line.lineColor,
                          opacity: line.isGhost ? 0.5 : 0.72,
                        }
                      : {
                          left: 0,
                          right: 0,
                          height: "1px",
                          backgroundColor: line.lineColor,
                          opacity: line.isGhost ? 0.55 : 0.9,
                        }
                }
              />
            )}

            {line.canvasLine && tpslActive && (
              <div
                className="absolute left-0 pointer-events-none top-1/2 -translate-y-1/2 rounded-sm"
                style={{
                  right: HL_GUTTER_PX,
                  height: 40,
                  marginTop: -20,
                  background: `linear-gradient(180deg, ${line.lineColor}12 0%, ${line.lineColor}22 50%, ${line.lineColor}12 100%)`,
                }}
              />
            )}

            {useDragBand && !line.canvasLine && (
              <div
                className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  right: HL_GUTTER_PX - 3,
                  width: 6,
                  height: 6,
                  backgroundColor: line.lineColor,
                  opacity: line.isGhost ? 0.65 : 1,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                }}
              />
            )}

            {useDragBand && line.canvasLine && (
              <div
                className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  right: HL_GUTTER_PX - 3,
                  width: 6,
                  height: 6,
                  backgroundColor: line.lineColor,
                  opacity: line.isGhost ? 0.65 : 1,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                }}
              />
            )}

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
                  ...centerStyle,
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
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className={cn(
                        "w-full min-w-0 bg-transparent text-[11px] font-mono font-semibold outline-none tabular-nums px-0.5",
                        line.color,
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
                      tpslHot && !tpslActive && "opacity-90 group-hover/tpsl:opacity-100",
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
                      <span className={cn("text-[10px] font-semibold leading-tight truncate w-full text-right", line.color)}>
                        {fmtUsdLabel(line.label as "TP" | "SL", dragging === line.editType && dragPrice != null ? dragPrice : line.price)}
                      </span>
                      {line.isGhost ? (
                        <span className="text-[7px] leading-tight text-white/30 normal-case text-right w-full">
                          drag to place
                        </span>
                      ) : (
                        <span className="text-[8px] text-white/35 font-normal truncate text-right w-full">{line.sizeLabel}</span>
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
              <div
                className="absolute left-2"
                style={{ ...centerStyle, pointerEvents: "auto", zIndex: 30 }}
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
                      <span
                        className={cn("text-[10px] font-semibold", pnlPositive ? "text-[#22c55e]" : "text-[#ef4444]")}
                      >
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
