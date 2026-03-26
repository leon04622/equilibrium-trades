/**
 * TP/SL interaction layer over lightweight-charts v5.
 * Horizontal rules use series.createPriceLine() on the candlestick series (pattern-chart);
 * this overlay provides drag bands, right-side tags (HL-style), and uses coordinateToPrice /
 * priceToCoordinate for pixel-accurate mapping — no linear price↔Y approximation when the chart API is available.
 */
import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, Check } from "lucide-react";
import { ghostTpslPrices, selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
  visiblePriceRange?: { min: number; max: number } | null;
  coordinateToPrice?: (clientY: number) => number | null;
  /** Candlestick series priceToCoordinate — positions overlay rows to match canvas lines. */
  priceToCoordinate?: (price: number) => number | null;
  /** When true, TP/SL horizontal lines are drawn on canvas; overlay only handles drag + tags. */
  nativeTpslLines?: boolean;
  /** Live-update native IPriceLine while dragging. */
  onTpslDragVisual?: (kind: "tp" | "sl", price: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * Client Y of the candlestick pane top (getBoundingClientRect().top).
   * Must match coordinateToPrice / priceToCoordinate so hit-testing aligns with line positions.
   */
  tpslPaneClientTop?: () => number | null;
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
/** Right gutter wide enough for HL-style segmented TP/SL boxes (caption + size + X). */
const HL_GUTTER_PX = 168;
/** Pick nearest TP/SL line to pointer (px). Fixes overlap when TP/SL bands stack. */
const HIT_THRESHOLD_PX = 16;
/** Vertical half-height of each TP/SL row (wider grab = easier drag). */
const BAND_HALF_PX = 28;
const HL_TAG_BG = "rgba(19, 23, 34, 0.96)";

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

function clampTpslDragPrice(
  kind: "tp" | "sl",
  price: number,
  isLong: boolean,
  entry: number,
  mark: number,
  refPrice: number,
  visMin: number | null,
  visMax: number | null,
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

/** During drag: smooth follow without tick snapping (snap on release only). */
function clampTpslDragLive(
  kind: "tp" | "sl",
  price: number,
  isLong: boolean,
  entry: number,
  mark: number,
  refPrice: number,
  visMin: number | null,
  visMax: number | null,
): number {
  let p = price;
  if (!Number.isFinite(p) || p <= 0) return p;
  const tick = tickSize(refPrice || entry || mark);
  const eps = Math.max(tick * 1e-8, 1e-12 * Math.max(refPrice, 1));
  const mk = mark > 0 ? mark : refPrice;

  if (kind === "tp" && entry > 0) {
    if (isLong) p = Math.max(p, entry + eps);
    else p = Math.min(p, entry - eps);
  } else if (kind === "sl" && mk > 0) {
    if (isLong) p = Math.min(p, mk - eps);
    else p = Math.max(p, mk + eps);
  }

  if (visMin != null && visMax != null && visMax > visMin) {
    p = Math.min(visMax, Math.max(visMin, p));
  }
  return p;
}

/** Hyperliquid-style caption: TP Price > 75482, SL Price < 71000, etc. */
function hlTpslPriceCaption(kind: "tp" | "sl", price: number, isLong: boolean): string {
  const n = fmt(price);
  if (kind === "tp") {
    return isLong ? `TP Price > ${n}` : `TP Price < ${n}`;
  }
  return isLong ? `SL Price < ${n}` : `SL Price > ${n}`;
}

/** HL reference: light blue-gray caption cell, blue text, faint red outline on caption, black size, light-blue close. */
function hlTpSlBoxStyles(_kind: "tp" | "sl"): {
  captionBg: string;
  captionText: string;
  captionBorder: string;
  closeBg: string;
  closeIcon: string;
} {
  return {
    captionBg: "rgba(206, 222, 235, 0.96)",
    captionText: "#2f5f9e",
    captionBorder: "rgba(139, 94, 94, 0.45)",
    closeBg: "rgba(125, 156, 187, 0.95)",
    closeIcon: "#1e4a7a",
  };
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
  onTpslDragVisual,
  onDraggingChange,
  tpslPaneClientTop,
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

  const ghostPack = useMemo(() => {
    if (!position) return { ghostTp: null as number | null, ghostSl: null as number | null };
    const markPx = position.markPrice || currentPrice || position.entryPrice;
    return ghostTpslPrices(
      position.entryPrice,
      markPx,
      position.side === "long",
      tpPrice != null,
      slPrice != null,
    );
  }, [position, currentPrice, tpPrice, slPrice]);
  const { ghostTp, ghostSl } = ghostPack;

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
  const onTpslDragVisualRef = useRef(onTpslDragVisual);
  onTpslDragVisualRef.current = onTpslDragVisual;
  const priceToCoordinateRef = useRef(priceToCoordinate);
  priceToCoordinateRef.current = priceToCoordinate;
  const tpslHitStateRef = useRef({
    tpPrice: null as number | null,
    slPrice: null as number | null,
    ghostTp: null as number | null,
    ghostSl: null as number | null,
  });
  tpslHitStateRef.current = { tpPrice, slPrice, ghostTp, ghostSl };
  const dragRafRef = useRef<number | null>(null);

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
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
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

    const flushDragUi = () => {
      dragRafRef.current = null;
      const v = dragPriceRef.current;
      if (v != null) setDragPrice(v);
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
      const mark = pos.markPrice || refPx;
      const vmin = vr?.min ?? null;
      const vmax = vr?.max ?? null;
      const clamped = clampTpslDragLive(kind, raw, pos.side === "long", pos.entryPrice, mark, refPx, vmin, vmax);
      dragPriceRef.current = clamped;
      onTpslDragVisualRef.current?.(kind, clamped);
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(flushDragUi);
      }
    };

    const onMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!coordinateToPriceRef.current) return;
      if ("preventDefault" in e && e.cancelable) e.preventDefault();
      const y = readY(e);
      if (y === null) return;
      applyDragFromY(y);
    };

    const onUp = async (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const y = readY(e);
      const pos = positionsRef.current.find((p) => p.coin === coinRef.current);
      const refPx = currentPriceRef.current;
      const coordFn = coordinateToPriceRef.current;
      const vr = visibleRangeRef.current;

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
              vr?.min ?? null,
              vr?.max ?? null,
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
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
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
      vmax,
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

  const beginTpslDrag = useCallback(
    (e: React.PointerEvent, line: { price: number; isGhost?: boolean; editType?: "tp" | "sl" }) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if ((e.target as HTMLElement).closest("[data-tpsl-chip]")) return;
      e.preventDefault();
      e.stopPropagation();
      dragStartPriceRef.current = line.price;
      dragFromGhostRef.current = !!line.isGhost;
      dragPriceRef.current = line.price;
      setDragPrice(line.price);
      setDragging(line.editType!);
      onTpslDragVisual?.(line.editType!, line.price);
    },
    [onTpslDragVisual],
  );

  /** One hit layer + nearest-line pick — fixes SL blocked by overlapping TP row. */
  const onUnifiedTpslPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if ((e.target as HTMLElement).closest("[data-tpsl-chip], [data-tpsl-elevated]")) return;
      if (!positionRef.current) return;
      const pc = priceToCoordinateRef.current;
      const el = containerRef.current;
      if (!pc || !el || !coordinateToPriceRef.current) return;
      const paneTop = tpslPaneClientTop?.() ?? el.getBoundingClientRect().top;
      if (paneTop == null || !Number.isFinite(paneTop)) return;
      const yRel = e.clientY - paneTop;
      const { tpPrice: tpp, slPrice: slp, ghostTp: gt, ghostSl: gs } = tpslHitStateRef.current;
      type Hit = { editType: "tp" | "sl"; price: number; isGhost: boolean };
      const cands: Hit[] = [];
      if (tpp != null && tpp > 0) cands.push({ editType: "tp", price: tpp, isGhost: false });
      else if (gt != null && gt > 0) cands.push({ editType: "tp", price: gt, isGhost: true });
      if (slp != null && slp > 0) cands.push({ editType: "sl", price: slp, isGhost: false });
      else if (gs != null && gs > 0) cands.push({ editType: "sl", price: gs, isGhost: true });
      if (cands.length === 0) return;
      let best: Hit | null = null;
      let bestD = 1e9;
      for (const c of cands) {
        const ly = pc(c.price);
        if (ly == null || !Number.isFinite(ly)) continue;
        const d = Math.abs(yRel - ly);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (!best || bestD > HIT_THRESHOLD_PX) return;
      e.preventDefault();
      e.stopPropagation();
      beginTpslDrag(e, {
        price: best.price,
        editType: best.editType,
        isGhost: best.isGhost,
      });
    },
    [beginTpslDrag, tpslPaneClientTop],
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
    rowZ: 130,
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
      rowZ: 128,
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
      price: ghostSl,
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
      rowZ: 40,
      canvasLine: nativeTpslLines,
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
      canvasLine: nativeTpslLines,
    });
  }

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
      className="absolute inset-0 z-[15] overflow-hidden"
      style={{ pointerEvents: "none", height: containerHeight || undefined }}
      data-testid="chart-order-lines"
    >
      {coordinateToPrice && priceToCoordinate && (
        <div
          className="absolute inset-0 touch-none"
          style={{
            right: HL_GUTTER_PX,
            zIndex: 40,
            pointerEvents: "auto",
          }}
          onPointerDown={onUnifiedTpslPointerDown}
          data-testid="chart-tpsl-hit-layer"
        />
      )}
      {showHtmlDragPreview &&
        (() => {
          const layout = layoutForPrice(dragPrice!, priceToCoordinate, effMin, effMax);
          if (layout.mode === "pct" && (layout.pct < -8 || layout.pct > 108)) return null;
          if (layout.mode === "px" && (layout.y < -20 || layout.y > containerHeight + 20)) return null;
          const previewColor = dragging === "tp" ? HL_TP : HL_SL;
          const pStyles = hlTpSlBoxStyles(dragging);
          const s = centerStyleFromLayout(layout);
          const bracketH = 28;
          return (
            <div className="absolute inset-x-0 pointer-events-none" style={{ ...s, zIndex: 50 }}>
              <div
                className="absolute left-0 box-border pointer-events-none"
                style={{
                  right: HL_GUTTER_PX,
                  top: "50%",
                  height: bracketH,
                  marginTop: -bracketH / 2,
                  borderTop: "1px dashed rgba(236, 72, 153, 0.75)",
                  borderBottom: "1px dashed rgba(236, 72, 153, 0.75)",
                }}
              />
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
                className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-row items-stretch overflow-hidden rounded-[2px] border border-black/50 shadow-lg ring-1 ring-white/20"
                style={{ width: HL_GUTTER_PX, minHeight: 34, background: `linear-gradient(135deg, ${pStyles.captionBg}dd 0%, ${pStyles.captionBg}cc 100%)`, boxShadow: `0 0 16px ${previewColor}45, 0 4px 12px rgba(0,0,0,0.6), inset 0 0 8px ${previewColor}15` }}
              >
                <div
                  className="flex flex-col justify-center pl-2 pr-2 py-1.5 min-w-0 flex-1 box-border"
                  style={{
                    background: "transparent",
                    color: pStyles.captionText,
                  }}
                >
                  <span className="text-[11px] font-mono font-bold leading-tight truncate">
                    {hlTpslPriceCaption(dragging, dragPrice!, isLong)}
                  </span>
                </div>
                <div className="flex items-center justify-center px-2.5 bg-[#0a0a0a] text-white shrink-0 border-l border-white/15 min-h-[34px]">
                  <span className="text-[10px] font-mono font-semibold tabular-nums">{fmtSize(size)}</span>
                </div>
              </div>
            </div>
          );
        })()}

      {lines.map((line) => {
        const displayPrice =
          (line.editType === "tp" || line.editType === "sl") && dragging === line.editType && dragPrice !== null
            ? dragPrice
            : line.price;
        const layout = layoutForPrice(displayPrice, priceToCoordinate, effMin, effMax);
        if (layout.mode === "pct" && (layout.pct < -8 || layout.pct > 108)) return null;
        if (layout.mode === "px" && (layout.y < -40 || layout.y > containerHeight + 40)) return null;

        const isEditing = editMode === line.editType;
        const isTpSl = line.editType === "tp" || line.editType === "sl";
        const useDragBand = isTpSl && !!coordinateToPrice;

        const z = line.rowZ ?? (useDragBand ? 32 : 16);
        const tpslHot = useDragBand && (line.editType === "tp" || line.editType === "sl");
        const tpslActive = tpslHot && dragging === line.editType;

        const bandStyle = rowStyleFromLayout(layout, BAND_HALF_PX);
        const centerStyle = centerStyleFromLayout(layout);
        const hlSeg =
          line.editType === "tp" || line.editType === "sl" ? hlTpSlBoxStyles(line.editType) : null;
        const showTpslCloseCol = hlSeg && !isEditing && line.canCancel;
        const outerStyle: CSSProperties = useDragBand
          ? { ...bandStyle, zIndex: z, pointerEvents: "none" }
          : { position: "absolute", left: 0, right: 0, ...centerStyle, zIndex: z };

        const tpslBracketZ = Math.max(0, (line.rowZ ?? z) - 2);

        return (
          <div
            key={line.key}
            className={cn("absolute left-0 right-0", tpslHot && "group/tpsl")}
            style={outerStyle}
          >
            {hlSeg && !isEditing && (
              <div
                className="pointer-events-none box-border"
                style={{
                  position: "absolute",
                  left: 0,
                  right: HL_GUTTER_PX,
                  height: 28,
                  zIndex: tpslBracketZ,
                  ...(layout.mode === "px"
                    ? { top: layout.y, transform: "translateY(-50%)" }
                    : { top: `${layout.pct}%`, transform: "translateY(-50%)" }),
                  borderTop: "1px dashed rgba(236, 72, 153, 0.72)",
                  borderBottom: "1px dashed rgba(236, 72, 153, 0.72)",
                }}
              />
            )}
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

            {line.labelSide === "right" ? (
              <div
                className="absolute right-0 flex flex-col items-stretch justify-center"
                data-tpsl-elevated
                style={{
                  ...centerStyle,
                  width: HL_GUTTER_PX,
                  minWidth: HL_GUTTER_PX,
                  pointerEvents: "auto",
                  zIndex: 120,
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
                ) : hlSeg ? (
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex flex-row items-stretch select-none touch-none overflow-hidden rounded-[2px]",
                      "border border-black/50 shadow-lg ring-1 ring-white/20 backdrop-blur-md",
                      line.isGhost && "border-dashed border-white/30 opacity-[0.95]",
                      tpslHot && !tpslActive && "opacity-[0.99]",
                      tpslActive && "ring-[1.5px]",
                    )}
                    style={{
                      minHeight: 34,
                      cursor: tpslActive ? "grabbing" : "ns-resize",
                      touchAction: "none",
                      boxShadow: tpslActive
                        ? `0 0 16px ${line.lineColor}45, 0 4px 12px rgba(0,0,0,0.6), inset 0 0 8px ${line.lineColor}15`
                        : `0 4px 12px rgba(0,0,0,0.5), inset 0 0 1px ${line.lineColor}10`,
                      background: `linear-gradient(135deg, ${hlSeg.captionBg}dd 0%, ${hlSeg.captionBg}cc 100%)`,
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
                    <div
                      className="flex flex-col justify-center pl-2 pr-2 py-1.5 min-w-0 flex-1 box-border"
                      style={{
                        background: "transparent",
                        color: hlSeg.captionText,
                      }}
                    >
                      <span className="text-[11px] font-mono font-bold leading-tight tracking-tight truncate">
                        {hlTpslPriceCaption(line.editType!, displayPrice, isLong)}
                      </span>
                      {line.isGhost && (
                        <span className="text-[8px] leading-tight opacity-60 normal-case mt-1 font-sans">
                          drag to set
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center px-2.5 shrink-0 border-l border-white/15 min-h-[34px]" style={{ background: `${hlSeg.captionBg}66` }}>
                      <span className="text-[10px] font-mono font-semibold tabular-nums leading-none" style={{ color: hlSeg.captionText }}>
                        {fmtSize(size)}
                      </span>
                    </div>
                    {showTpslCloseCol && (
                      <button
                        type="button"
                        data-tpsl-chip
                        className="shrink-0 flex items-center justify-center w-8 min-h-[34px] border-l border-white/15 hover:brightness-125 cursor-pointer p-0 transition-all"
                        style={{ background: hlSeg.closeBg, color: hlSeg.closeIcon }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(line.cancelType!);
                        }}
                        data-testid={`cancel-${line.key}`}
                        title="Cancel order"
                      >
                        <X className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ) : null}
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
