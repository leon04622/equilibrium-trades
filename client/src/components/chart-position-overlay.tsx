import { useState, useRef, useCallback, useEffect } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { GripHorizontal } from "lucide-react";
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

const VISIBLE_RANGE_PCT = 0.06; // ±6% visible range on chart

export function ChartPositionOverlay({ coin, currentPrice }: ChartPositionOverlayProps) {
  const { positions, openOrders, connected, placeTPSL } = useTrading();
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

  const tpPrice = tpOrders.length > 0
    ? parseFloat(tpOrders[0].triggerPx || tpOrders[0].limitPx)
    : null;
  const slPrice = slOrders.length > 0
    ? parseFloat(slOrders[0].triggerPx || slOrders[0].limitPx)
    : null;

  // Local drag prices
  const [dragTpPrice, setDragTpPrice] = useState<number | null>(null);
  const [dragSlPrice, setDragSlPrice] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const displayTp = dragTpPrice ?? tpPrice;
  const displaySl = dragSlPrice ?? slPrice;

  // Price scale: map price → Y%, where lower = higher price (chart convention)
  const getVisibleMinMax = useCallback(() => {
    const ref = position?.entryPrice ?? currentPrice;
    const range = ref * VISIBLE_RANGE_PCT;
    let min = ref - range;
    let max = ref + range;

    // Expand range to include SL/TP prices
    const prices = [displayTp, displaySl, position?.liquidationPrice].filter(Boolean) as number[];
    for (const p of prices) {
      if (p < min) min = p - range * 0.3;
      if (p > max) max = p + range * 0.3;
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

  // Dragging handlers
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

    // Determine what was dragged vs what stays the same
    const newTp = type === "tp" ? dragTpPrice : null;
    const newSl = type === "sl" ? dragSlPrice : null;

    // Check for minimum meaningful movement (>0.05% change) to avoid accidental submissions
    const MIN_MOVE_PCT = 0.0005;
    const tpMoved = newTp !== null && tpPrice !== null
      ? Math.abs(newTp - tpPrice) / tpPrice > MIN_MOVE_PCT
      : newTp !== null && tpPrice === null; // Setting a new TP
    const slMoved = newSl !== null && slPrice !== null
      ? Math.abs(newSl - slPrice) / slPrice > MIN_MOVE_PCT
      : newSl !== null && slPrice === null; // Setting a new SL

    if (!tpMoved && !slMoved) {
      // No meaningful change — cancel the drag silently
      setDragTpPrice(null);
      setDragSlPrice(null);
      return;
    }

    // Build final prices: use dragged value for the changed line, existing for the other
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

  if (!connected) return null;
  if (!position && coinOrders.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10 select-none"
      data-testid="chart-position-overlay"
    >
      <PriceLine
        label="Entry"
        price={position?.entryPrice ?? 0}
        color="blue"
        containerRef={containerRef}
        priceToY={priceToY}
        formatPrice={formatPrice}
        draggable={false}
        visible={!!position}
      />

      {position?.liquidationPrice && position.liquidationPrice > 0 && (
        <PriceLine
          label="Liq"
          price={position.liquidationPrice}
          color="orange"
          containerRef={containerRef}
          priceToY={priceToY}
          formatPrice={formatPrice}
          draggable={false}
          visible
        />
      )}

      {displayTp !== null && (
        <PriceLine
          label="TP"
          price={displayTp}
          color="green"
          containerRef={containerRef}
          priceToY={priceToY}
          formatPrice={formatPrice}
          draggable={!!position}
          onDragStart={(e) => startDrag(e, "tp")}
          visible
          isDragging={isDragging && dragRef.current?.type === "tp"}
        />
      )}

      {displaySl !== null && (
        <PriceLine
          label="SL"
          price={displaySl}
          color="red"
          containerRef={containerRef}
          priceToY={priceToY}
          formatPrice={formatPrice}
          draggable={!!position}
          onDragStart={(e) => startDrag(e, "sl")}
          visible
          isDragging={isDragging && dragRef.current?.type === "sl"}
        />
      )}

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

interface PriceLineProps {
  label: string;
  price: number;
  color: "blue" | "green" | "red" | "orange";
  containerRef: React.RefObject<HTMLDivElement>;
  priceToY: (price: number, height: number) => number;
  formatPrice: (p: number) => string;
  draggable: boolean;
  onDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  visible: boolean;
  isDragging?: boolean;
}

const colorMap = {
  blue: {
    line: "border-blue-400",
    bg: "bg-blue-400",
    text: "text-blue-400",
    label: "text-white bg-blue-500",
  },
  green: {
    line: "border-green-400",
    bg: "bg-green-400",
    text: "text-green-400",
    label: "text-white bg-green-600",
  },
  red: {
    line: "border-red-400",
    bg: "bg-red-400",
    text: "text-red-400",
    label: "text-white bg-red-600",
  },
  orange: {
    line: "border-orange-400",
    bg: "bg-orange-400",
    text: "text-orange-400",
    label: "text-white bg-orange-500",
  },
};

function PriceLine({
  label, price, color, containerRef, priceToY, formatPrice,
  draggable, onDragStart, visible, isDragging
}: PriceLineProps) {
  const [height, setHeight] = useState(400);
  const colors = colorMap[color];

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => setHeight(containerRef.current?.clientHeight ?? 400);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [containerRef]);

  if (!visible || price <= 0) return null;

  const yPct = (priceToY(price, height) / height) * 100;
  // Clamp line to visible area with some padding
  if (yPct < 2 || yPct > 98) return null;

  const isDashed = color === "green" || color === "red";

  return (
    <div
      className="absolute left-0 right-0"
      style={{ top: `${yPct}%`, transform: "translateY(-50%)" }}
    >
      {/* Line */}
      <div
        className={cn(
          "absolute left-0 right-0 h-0 border-t",
          isDashed ? "border-dashed" : "border-solid",
          colors.line,
          isDragging ? "opacity-100" : "opacity-70"
        )}
      />

      {/* Price label on right side */}
      <div className="absolute right-0 flex items-center gap-1 pointer-events-none">
        <div className={cn(
          "flex items-center gap-1 rounded-l-md px-2 py-0.5 text-[10px] font-mono font-semibold",
          colors.label
        )}>
          <span>{label}</span>
          <span>{formatPrice(price)}</span>
        </div>
      </div>

      {/* Drag handle - left side, only for TP/SL */}
      {draggable && (
        <div
          className={cn(
            "absolute left-2 flex items-center justify-center w-6 h-5 rounded cursor-ns-resize pointer-events-auto z-20",
            colors.bg, "opacity-80 hover:opacity-100",
            isDragging && "opacity-100 scale-110"
          )}
          style={{ transform: "translateY(-50%)", top: "50%" }}
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          data-testid={`drag-handle-${label.toLowerCase()}`}
        >
          <GripHorizontal className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  );
}
