import { useState, useRef, useCallback, useEffect } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
}

interface DragState {
  type: "tp" | "sl";
  lockedMin: number;
  lockedMax: number;
}

const VISIBLE_RANGE_PCT = 0.08;

function calcPnl(size: number, entryPrice: number, targetPrice: number, isLong: boolean): number {
  return isLong ? size * (targetPrice - entryPrice) : size * (entryPrice - targetPrice);
}

function formatPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function formatSize(s: number): string {
  if (s < 0.001) return s.toFixed(6);
  if (s < 1) return s.toFixed(4);
  return s.toFixed(2);
}

export function ChartPositionOverlay({ coin, currentPrice }: ChartPositionOverlayProps) {
  const { positions, openOrders, connected, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);
  const isLong = position?.side === "long";

  const getOrderType = (order: HLOpenOrder): "tp" | "sl" | "order" => {
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    if (position) {
      const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
      return position.side === "long"
        ? triggerPrice < position.entryPrice ? "sl" : "tp"
        : triggerPrice > position.entryPrice ? "sl" : "tp";
    }
    return "order";
  };

  const tpOrders = coinOrders.filter(o => getOrderType(o) === "tp");
  const slOrders = coinOrders.filter(o => getOrderType(o) === "sl");

  const tpPrice = tpOrders.length > 0 ? parseFloat(tpOrders[0].triggerPx || tpOrders[0].limitPx) : null;
  const slPrice = slOrders.length > 0 ? parseFloat(slOrders[0].triggerPx || slOrders[0].limitPx) : null;
  const tpOid = tpOrders.length > 0 ? tpOrders[0].oid : null;
  const slOid = slOrders.length > 0 ? slOrders[0].oid : null;

  // Ghost prices — default position for "Add TP/SL" placeholders
  const ghostTpPrice = position ? (isLong ? position.entryPrice * 1.02 : position.entryPrice * 0.98) : null;
  const ghostSlPrice = position ? (isLong ? position.entryPrice * 0.98 : position.entryPrice * 1.02) : null;

  const [dragTpPrice, setDragTpPrice] = useState<number | null>(null);
  const [dragSlPrice, setDragSlPrice] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Effective display prices (drag > real > ghost)
  const displayTp = dragTpPrice ?? tpPrice ?? ghostTpPrice;
  const displaySl = dragSlPrice ?? slPrice ?? ghostSlPrice;

  // Ghost state: no real order and not currently dragging to set one
  const isGhostTp = !tpPrice && !(isDragging && dragRef.current?.type === "tp");
  const isGhostSl = !slPrice && !(isDragging && dragRef.current?.type === "sl");

  // ── Price scale (LOCKED during drag to prevent feedback loop) ──────────────
  // We compute min/max from the REAL (non-drag) prices so the scale is stable.
  const getBaseMinMax = useCallback(() => {
    const ref = position?.entryPrice ?? currentPrice;
    const range = ref * VISIBLE_RANGE_PCT;
    let min = ref - range;
    let max = ref + range;
    // Only use committed prices (not the drag prices) for scale
    const prices = [tpPrice ?? ghostTpPrice, slPrice ?? ghostSlPrice, position?.liquidationPrice]
      .filter(Boolean) as number[];
    for (const p of prices) {
      if (p < min) min = p - range * 0.2;
      if (p > max) max = p + range * 0.2;
    }
    return { min, max };
  }, [currentPrice, position, tpPrice, slPrice, ghostTpPrice, ghostSlPrice]);

  const priceToY = useCallback((price: number, height: number, locked?: { min: number; max: number }): number => {
    const { min, max } = locked ?? getBaseMinMax();
    return ((max - price) / (max - min)) * height;
  }, [getBaseMinMax]);

  const yToPrice = useCallback((y: number, height: number, locked: { min: number; max: number }): number => {
    const { min, max } = locked;
    return max - (y / height) * (max - min);
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent, type: "tp" | "sl") => {
    e.preventDefault();
    e.stopPropagation();
    // Lock scale NOW before anything changes
    const locked = getBaseMinMax();
    dragRef.current = { type, lockedMin: locked.min, lockedMax: locked.max };
    // Initialize drag price from current display price
    if (type === "tp") setDragTpPrice(tpPrice ?? ghostTpPrice ?? currentPrice);
    else setDragSlPrice(slPrice ?? ghostSlPrice ?? currentPrice);
    setIsDragging(true);
  }, [getBaseMinMax, tpPrice, slPrice, ghostTpPrice, ghostSlPrice, currentPrice]);

  const onMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const height = containerRef.current.clientHeight;
    const rect = containerRef.current.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const relY = Math.max(0, Math.min(height, clientY - rect.top));
    // Use LOCKED scale — never changes during drag
    const locked = { min: dragRef.current.lockedMin, max: dragRef.current.lockedMax };
    const newPrice = yToPrice(relY, height, locked);
    if (dragRef.current.type === "tp") {
      setDragTpPrice(Math.max(newPrice, currentPrice * 0.01));
    } else {
      setDragSlPrice(Math.max(newPrice, currentPrice * 0.01));
    }
  }, [yToPrice, currentPrice]);

  const onMouseUp = useCallback(async () => {
    if (!dragRef.current || !position) {
      dragRef.current = null;
      setIsDragging(false);
      setDragTpPrice(null);
      setDragSlPrice(null);
      return;
    }
    const type = dragRef.current.type;
    dragRef.current = null;
    setIsDragging(false);

    const draggedTp = dragTpPrice;
    const draggedSl = dragSlPrice;

    const MIN_MOVE_PCT = 0.0003;
    const tpMoved = type === "tp" && draggedTp !== null && (
      tpPrice === null || Math.abs(draggedTp - tpPrice) / tpPrice > MIN_MOVE_PCT
    );
    const slMoved = type === "sl" && draggedSl !== null && (
      slPrice === null || Math.abs(draggedSl - slPrice) / slPrice > MIN_MOVE_PCT
    );

    if (!tpMoved && !slMoved) {
      setDragTpPrice(null);
      setDragSlPrice(null);
      return;
    }

    const finalTp = type === "tp" ? (draggedTp ?? tpPrice ?? 0) : (tpPrice ?? 0);
    const finalSl = type === "sl" ? (draggedSl ?? slPrice ?? 0) : (slPrice ?? 0);

    try {
      const result = await placeTPSL(
        position.coin,
        position.size,
        position.side === "long",
        finalTp > 0 ? finalTp : undefined,
        finalSl > 0 ? finalSl : undefined,
        position.entryPrice,
      );
      if (result.success) {
        toast({
          title: `${type === "tp" ? "Take Profit" : "Stop Loss"} ${(type === "tp" ? tpPrice : slPrice) === null ? "Added" : "Updated"}`,
          description: `Set to $${formatPrice(type === "tp" ? finalTp : finalSl)}`,
        });
      } else {
        toast({ title: "Failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setDragTpPrice(null);
      setDragSlPrice(null);
    }
  }, [position, dragTpPrice, dragSlPrice, tpPrice, slPrice, placeTPSL, toast]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onMouseMove, { passive: false });
      window.addEventListener("touchend", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("touchmove", onMouseMove);
        window.removeEventListener("touchend", onMouseUp);
      };
    }
  }, [isDragging, onMouseMove, onMouseUp]);

  // Reset drag prices only when real orders change and NOT dragging
  useEffect(() => {
    if (!isDragging) {
      setDragTpPrice(null);
      setDragSlPrice(null);
    }
  }, [tpPrice, slPrice, isDragging]);

  const handleCancelTP = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tpOid || !position) return;
    const result = await cancelHLOrder(coin, tpOid);
    toast(result.success ? { title: "Take Profit Cancelled" } : { title: "Cancel Failed", description: result.error, variant: "destructive" });
  }, [tpOid, coin, position, cancelHLOrder, toast]);

  const handleCancelSL = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!slOid || !position) return;
    const result = await cancelHLOrder(coin, slOid);
    toast(result.success ? { title: "Stop Loss Cancelled" } : { title: "Cancel Failed", description: result.error, variant: "destructive" });
  }, [slOid, coin, position, cancelHLOrder, toast]);

  if (!connected) return null;
  if (!position && coinOrders.length === 0) return null;

  // P&L shown only on confirmed (non-ghost) lines
  const tpPnl = displayTp && position && !isGhostTp
    ? calcPnl(position.size, position.entryPrice, displayTp, isLong!)
    : null;
  const slPnl = displaySl && position && !isGhostSl
    ? calcPnl(position.size, position.entryPrice, displaySl, isLong!)
    : null;

  // During drag show P&L for the dragged line too
  const dragTpPnl = isDragging && dragRef.current?.type === "tp" && dragTpPrice && position
    ? calcPnl(position.size, position.entryPrice, dragTpPrice, isLong!) : null;
  const dragSlPnl = isDragging && dragRef.current?.type === "sl" && dragSlPrice && position
    ? calcPnl(position.size, position.entryPrice, dragSlPrice, isLong!) : null;

  const tpActiveDragging = isDragging && dragRef.current?.type === "tp";
  const slActiveDragging = isDragging && dragRef.current?.type === "sl";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10 select-none"
      data-testid="chart-position-overlay"
    >
      {/* Entry line */}
      {position && position.entryPrice > 0 && (
        <HLPriceLine
          label={`Entry: $${formatPrice(position.entryPrice)}`}
          subLabel={position.unrealizedPnl !== undefined
            ? `PNL ${position.unrealizedPnl >= 0 ? "+" : ""}$${Math.abs(position.unrealizedPnl).toFixed(2)}`
            : undefined}
          size={formatSize(position.size)}
          price={position.entryPrice}
          color="blue"
          lineStyle="solid"
          draggable={false}
          containerRef={containerRef}
          priceToY={(p, h) => priceToY(p, h)}
        />
      )}

      {/* Liquidation line */}
      {position?.liquidationPrice && position.liquidationPrice > 0 && (
        <HLPriceLine
          label="Liq. Price"
          size={formatSize(position.size)}
          price={position.liquidationPrice}
          color="orange"
          lineStyle="dashed"
          draggable={false}
          containerRef={containerRef}
          priceToY={(p, h) => priceToY(p, h)}
        />
      )}

      {/* Take Profit line (ghost or real) */}
      {displayTp !== null && (
        <HLPriceLine
          label={isGhostTp && !tpActiveDragging
            ? `Add TP ${isLong ? ">" : "<"} ${formatPrice(displayTp)}`
            : `TP Price ${isLong ? ">" : "<"} ${formatPrice(displayTp)}`}
          pnlLabel={tpActiveDragging ? (dragTpPnl !== null ? formatPnl(dragTpPnl) : undefined) : (tpPnl !== null ? formatPnl(tpPnl) : undefined)}
          pnlPositive={(tpActiveDragging ? dragTpPnl : tpPnl) !== null ? (tpActiveDragging ? dragTpPnl! : tpPnl!) >= 0 : undefined}
          size={position && !isGhostTp ? formatSize(position.size) : ""}
          price={displayTp}
          color="green"
          lineStyle="dashed"
          draggable={!!position}
          ghost={isGhostTp && !tpActiveDragging}
          isDragging={tpActiveDragging}
          onDragStart={(e) => startDrag(e, "tp")}
          onCancel={tpOid ? handleCancelTP : undefined}
          containerRef={containerRef}
          priceToY={(p, h) => tpActiveDragging && dragRef.current
            ? priceToY(p, h, { min: dragRef.current.lockedMin, max: dragRef.current.lockedMax })
            : priceToY(p, h)}
        />
      )}

      {/* Stop Loss line (ghost or real) */}
      {displaySl !== null && (
        <HLPriceLine
          label={isGhostSl && !slActiveDragging
            ? `Add SL ${isLong ? "<" : ">"} ${formatPrice(displaySl)}`
            : `SL Price ${isLong ? "<" : ">"} ${formatPrice(displaySl)}`}
          pnlLabel={slActiveDragging ? (dragSlPnl !== null ? formatPnl(dragSlPnl) : undefined) : (slPnl !== null ? formatPnl(slPnl) : undefined)}
          pnlPositive={(slActiveDragging ? dragSlPnl : slPnl) !== null ? (slActiveDragging ? dragSlPnl! : slPnl!) >= 0 : undefined}
          size={position && !isGhostSl ? formatSize(position.size) : ""}
          price={displaySl}
          color="red"
          lineStyle="dashed"
          draggable={!!position}
          ghost={isGhostSl && !slActiveDragging}
          isDragging={slActiveDragging}
          onDragStart={(e) => startDrag(e, "sl")}
          onCancel={slOid ? handleCancelSL : undefined}
          containerRef={containerRef}
          priceToY={(p, h) => slActiveDragging && dragRef.current
            ? priceToY(p, h, { min: dragRef.current.lockedMin, max: dragRef.current.lockedMax })
            : priceToY(p, h)}
        />
      )}

      {/* Pending orders badge (no position) */}
      {!position && coinOrders.length > 0 && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <div className="bg-background/80 backdrop-blur-sm border border-border/50 rounded-md px-2 py-1 text-[10px] text-muted-foreground">
            {coinOrders.length} pending order{coinOrders.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HLPriceLine ─────────────────────────────────────────────────────────────

interface HLPriceLineProps {
  label: string;
  subLabel?: string;
  pnlLabel?: string;
  pnlPositive?: boolean;
  size: string;
  price: number;
  color: "blue" | "green" | "red" | "orange";
  lineStyle: "solid" | "dashed";
  draggable: boolean;
  ghost?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  onCancel?: (e: React.MouseEvent) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  priceToY: (price: number, height: number) => number;
}

const hlColors = {
  blue:   { line: "#3b82f6", border: "border-blue-500",   bg: "bg-blue-500/10",   text: "text-blue-400",   badge: "bg-blue-500 text-white" },
  green:  { line: "#22c55e", border: "border-green-500",  bg: "bg-green-500/10",  text: "text-green-400",  badge: "bg-green-600 text-white" },
  red:    { line: "#ef4444", border: "border-red-500",    bg: "bg-red-500/10",    text: "text-red-400",    badge: "bg-red-600 text-white" },
  orange: { line: "#f97316", border: "border-orange-500", bg: "bg-orange-500/10", text: "text-orange-400", badge: "bg-orange-500 text-white" },
};

function HLPriceLine({
  label, subLabel, pnlLabel, pnlPositive, size, price, color, lineStyle,
  draggable, ghost, isDragging, onDragStart, onCancel, containerRef, priceToY
}: HLPriceLineProps) {
  const [height, setHeight] = useState(400);
  const c = hlColors[color];

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => setHeight(containerRef.current?.clientHeight ?? 400);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [containerRef]);

  if (price <= 0) return null;

  const yPct = (priceToY(price, height) / height) * 100;
  if (yPct < 1 || yPct > 99) return null;

  const lineOpacity = isDragging ? 1 : ghost ? 0.3 : 0.8;
  const groupOpacity = isDragging ? 1 : ghost ? 0.5 : 0.95;

  return (
    <div
      className="absolute left-0 right-0"
      style={{ top: `${yPct}%`, transform: "translateY(-50%)" }}
    >
      {/* Horizontal line */}
      <div
        className="absolute left-0 right-0 h-0"
        style={{
          borderTop: `1.5px ${lineStyle === "dashed" || ghost ? "dashed" : "solid"} ${c.line}`,
          opacity: lineOpacity,
        }}
      />

      {/* Center label group */}
      <div
        className="absolute left-1/2 flex items-center gap-1 pointer-events-auto"
        style={{ transform: "translateX(-50%)", opacity: groupOpacity }}
      >
        {/* Drag handle */}
        {draggable && (
          <div
            className={cn(
              "flex items-center justify-center w-5 h-6 rounded cursor-ns-resize z-20 border",
              c.bg, c.border,
              ghost && "border-dashed opacity-70"
            )}
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            data-testid={`drag-handle-${color}`}
            title={ghost ? "Drag to set" : "Drag to move"}
          >
            <GripVertical className={cn("h-3 w-3", c.text)} />
          </div>
        )}

        {/* Main label */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border",
            c.bg, c.border, c.text,
            draggable && "cursor-ns-resize",
            ghost && "border-dashed"
          )}
          onMouseDown={draggable ? onDragStart : undefined}
          onTouchStart={draggable ? onDragStart : undefined}
        >
          {subLabel && (
            <>
              <span>{subLabel}</span>
              <span className="opacity-40">|</span>
            </>
          )}
          <span>{label}</span>
        </div>

        {/* Expected P&L badge */}
        {pnlLabel && (
          <div className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border",
            pnlPositive
              ? "bg-green-500/15 border-green-500/40 text-green-400"
              : "bg-red-500/15 border-red-500/40 text-red-400"
          )}>
            {pnlLabel}
          </div>
        )}

        {/* Size badge */}
        {size && (
          <div className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-medium", c.badge)}>
            {size}
          </div>
        )}

        {/* Cancel X button */}
        {onCancel && !ghost && (
          <button
            onClick={onCancel}
            className={cn(
              "flex items-center justify-center w-5 h-5 rounded border pointer-events-auto",
              c.bg, c.border, c.text,
              "hover:opacity-100 opacity-80"
            )}
            data-testid={`cancel-${color}-order`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}

        {/* Ghost hint */}
        {ghost && (
          <span className={cn("text-[9px] font-mono italic", c.text, "opacity-60")}>
            drag to set
          </span>
        )}
      </div>

      {/* Right-side price tick */}
      <div
        className="absolute right-0 flex items-center pointer-events-none"
        style={{ opacity: ghost ? 0.35 : 0.85 }}
      >
        <div className={cn("px-1.5 py-0.5 text-[10px] font-mono rounded-l-sm", c.badge)}>
          {price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>
  );
}
