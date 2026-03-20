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
  startY: number;
  startPrice: number;
}

const VISIBLE_RANGE_PCT = 0.08; // ±8% visible range on chart overlay

export function ChartPositionOverlay({ coin, currentPrice }: ChartPositionOverlayProps) {
  const { positions, openOrders, connected, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);

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

  const [dragTpPrice, setDragTpPrice] = useState<number | null>(null);
  const [dragSlPrice, setDragSlPrice] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const displayTp = dragTpPrice ?? tpPrice;
  const displaySl = dragSlPrice ?? slPrice;

  // Price scale helpers
  const getVisibleMinMax = useCallback(() => {
    const ref = position?.entryPrice ?? currentPrice;
    const range = ref * VISIBLE_RANGE_PCT;
    let min = ref - range;
    let max = ref + range;
    const prices = [displayTp, displaySl, position?.liquidationPrice].filter(Boolean) as number[];
    for (const p of prices) {
      if (p < min) min = p - range * 0.2;
      if (p > max) max = p + range * 0.2;
    }
    return { min, max };
  }, [currentPrice, position, displayTp, displaySl]);

  const priceToY = useCallback((price: number, height: number): number => {
    const { min, max } = getVisibleMinMax();
    return ((max - price) / (max - min)) * height;
  }, [getVisibleMinMax]);

  const yToPrice = useCallback((y: number, height: number): number => {
    const { min, max } = getVisibleMinMax();
    return max - (y / height) * (max - min);
  }, [getVisibleMinMax]);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const formatSize = (s: number) => {
    if (s < 0.001) return s.toFixed(6);
    if (s < 1) return s.toFixed(4);
    return s.toFixed(2);
  };

  // Drag handlers
  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent, type: "tp" | "sl") => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const price = type === "tp" ? (tpPrice ?? currentPrice) : (slPrice ?? currentPrice);
    dragRef.current = { type, startY: clientY, startPrice: price };
    setIsDragging(true);
  }, [tpPrice, slPrice, currentPrice]);

  const onMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const height = containerRef.current.clientHeight;
    const rect = containerRef.current.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const relY = clientY - rect.top;
    const newPrice = yToPrice(relY, height);
    if (dragRef.current.type === "tp") {
      setDragTpPrice(Math.max(newPrice, currentPrice * 0.001));
    } else {
      setDragSlPrice(Math.max(newPrice, currentPrice * 0.001));
    }
  }, [yToPrice, currentPrice]);

  const onMouseUp = useCallback(async () => {
    if (!dragRef.current || !position) {
      dragRef.current = null;
      setIsDragging(false);
      return;
    }
    const type = dragRef.current.type;
    dragRef.current = null;
    setIsDragging(false);

    const newTp = type === "tp" ? dragTpPrice : null;
    const newSl = type === "sl" ? dragSlPrice : null;

    const MIN_MOVE_PCT = 0.0005;
    const tpMoved = newTp !== null && tpPrice !== null
      ? Math.abs(newTp - tpPrice) / tpPrice > MIN_MOVE_PCT
      : newTp !== null && tpPrice === null;
    const slMoved = newSl !== null && slPrice !== null
      ? Math.abs(newSl - slPrice) / slPrice > MIN_MOVE_PCT
      : newSl !== null && slPrice === null;

    if (!tpMoved && !slMoved) {
      setDragTpPrice(null);
      setDragSlPrice(null);
      return;
    }

    const finalTp = type === "tp" ? (newTp ?? tpPrice ?? 0) : (tpPrice ?? 0);
    const finalSl = type === "sl" ? (newSl ?? slPrice ?? 0) : (slPrice ?? 0);

    try {
      const result = await placeTPSL(
        position.coin,
        position.size,
        position.side === "long",
        finalTp > 0 ? finalTp : undefined,
        finalSl > 0 ? finalSl : undefined,
      );
      if (result.success) {
        toast({
          title: `${type === "tp" ? "Take Profit" : "Stop Loss"} Updated`,
          description: `${type === "tp" ? "Take Profit" : "Stop Loss"} set to $${formatPrice(type === "tp" ? finalTp : finalSl)}`,
        });
      } else {
        toast({ title: "Update Failed", description: result.error, variant: "destructive" });
        setDragTpPrice(null);
        setDragSlPrice(null);
      }
    } catch {
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

  // Reset drag prices when real orders change (but not while actively dragging)
  useEffect(() => {
    if (!isDragging) {
      setDragTpPrice(null);
      setDragSlPrice(null);
    }
  }, [tpPrice, slPrice]);

  // Cancel a single TP or SL order
  const handleCancelTP = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tpOid || !position) return;
    const result = await cancelHLOrder(coin, tpOid);
    if (result.success) {
      toast({ title: "Take Profit Cancelled" });
    } else {
      toast({ title: "Cancel Failed", description: result.error, variant: "destructive" });
    }
  }, [tpOid, coin, position, cancelHLOrder, toast]);

  const handleCancelSL = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!slOid || !position) return;
    const result = await cancelHLOrder(coin, slOid);
    if (result.success) {
      toast({ title: "Stop Loss Cancelled" });
    } else {
      toast({ title: "Cancel Failed", description: result.error, variant: "destructive" });
    }
  }, [slOid, coin, position, cancelHLOrder, toast]);

  if (!connected) return null;
  if (!position && coinOrders.length === 0) return null;

  const isLong = position?.side === "long";

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
          subLabel={position.unrealizedPnl !== undefined ? `PNL ${position.unrealizedPnl >= 0 ? "+" : ""}$${Math.abs(position.unrealizedPnl).toFixed(2)}` : undefined}
          size={formatSize(position.size)}
          price={position.entryPrice}
          color="blue"
          lineStyle="solid"
          draggable={false}
          containerRef={containerRef}
          priceToY={priceToY}
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
          priceToY={priceToY}
        />
      )}

      {/* Take Profit line */}
      {displayTp !== null && (
        <HLPriceLine
          label={`TP Price ${isLong ? ">" : "<"} ${formatPrice(displayTp)}`}
          size={position ? formatSize(position.size) : ""}
          price={displayTp}
          color="green"
          lineStyle="dashed"
          draggable={!!position}
          isDragging={isDragging && dragRef.current?.type === "tp"}
          onDragStart={(e) => startDrag(e, "tp")}
          onCancel={tpOid ? handleCancelTP : undefined}
          containerRef={containerRef}
          priceToY={priceToY}
        />
      )}

      {/* Stop Loss line */}
      {displaySl !== null && (
        <HLPriceLine
          label={`SL Price ${isLong ? "<" : ">"} ${formatPrice(displaySl)}`}
          size={position ? formatSize(position.size) : ""}
          price={displaySl}
          color="red"
          lineStyle="dashed"
          draggable={!!position}
          isDragging={isDragging && dragRef.current?.type === "sl"}
          onDragStart={(e) => startDrag(e, "sl")}
          onCancel={slOid ? handleCancelSL : undefined}
          containerRef={containerRef}
          priceToY={priceToY}
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

// ─── HLPriceLine: matches Hyperliquid's line style ───────────────────────────

interface HLPriceLineProps {
  label: string;
  subLabel?: string;
  size: string;
  price: number;
  color: "blue" | "green" | "red" | "orange";
  lineStyle: "solid" | "dashed";
  draggable: boolean;
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
  label, subLabel, size, price, color, lineStyle, draggable,
  isDragging, onDragStart, onCancel, containerRef, priceToY
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

  return (
    <div
      className="absolute left-0 right-0"
      style={{ top: `${yPct}%`, transform: "translateY(-50%)" }}
    >
      {/* Horizontal line */}
      <div
        className="absolute left-0 right-0 h-0"
        style={{
          borderTop: `1.5px ${lineStyle === "dashed" ? "dashed" : "solid"} ${c.line}`,
          opacity: isDragging ? 1 : 0.75,
        }}
      />

      {/* Center label group — Hyperliquid style */}
      <div className="absolute left-1/2 flex items-center gap-1 pointer-events-auto"
           style={{ transform: "translateX(-50%)" }}>
        {/* Drag handle */}
        {draggable && (
          <div
            className={cn(
              "flex items-center justify-center w-5 h-6 rounded cursor-ns-resize z-20",
              c.bg, c.border, "border",
              isDragging && "opacity-100"
            )}
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            data-testid={`drag-handle-${color}`}
          >
            <GripVertical className={cn("h-3 w-3", c.text)} />
          </div>
        )}

        {/* Main label box */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border",
            c.bg, c.border, c.text,
            draggable && "cursor-ns-resize",
            isDragging && "opacity-100"
          )}
          onMouseDown={draggable ? onDragStart : undefined}
          onTouchStart={draggable ? onDragStart : undefined}
          style={{ opacity: isDragging ? 1 : 0.9 }}
        >
          {subLabel && (
            <>
              <span>{subLabel}</span>
              <span className="opacity-50">|</span>
            </>
          )}
          <span>{label}</span>
        </div>

        {/* Size badge */}
        {size && (
          <div className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-medium", c.badge)}>
            {size}
          </div>
        )}

        {/* Cancel X button */}
        {onCancel && (
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
      </div>

      {/* Right-side price tick */}
      <div className="absolute right-0 flex items-center pointer-events-none">
        <div
          className={cn("px-1.5 py-0.5 text-[10px] font-mono rounded-l-sm", c.badge)}
          style={{ opacity: 0.85 }}
        >
          {price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>
  );
}
