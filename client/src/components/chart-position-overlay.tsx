import { useState, useCallback, useRef, useEffect } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";
import { GripHorizontal } from "lucide-react";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
  chartHeight?: number;
  priceRange?: { high: number; low: number };
}

interface DraggableLine {
  id: string;
  price: number;
  label: string;
  type: "entry" | "liq" | "tp" | "sl" | "order";
  draggable: boolean;
  orderId?: number;
}

export function ChartPositionOverlay({ 
  coin, 
  currentPrice, 
  chartHeight = 400,
  priceRange 
}: ChartPositionOverlayProps) {
  const { positions, openOrders, connected, placeTPSL, cancelHLOrder } = useTrading();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    lineId: string;
    startY: number;
    startPrice: number;
    currentPrice: number;
  } | null>(null);
  
  const [pendingTP, setPendingTP] = useState<number | null>(null);
  const [pendingSL, setPendingSL] = useState<number | null>(null);

  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);

  const pricePadding = currentPrice * 0.02;
  const effectiveRange = priceRange || {
    high: currentPrice + pricePadding * 2,
    low: currentPrice - pricePadding * 2,
  };
  
  const priceSpan = effectiveRange.high - effectiveRange.low;

  const priceToY = useCallback((price: number): number => {
    const ratio = (effectiveRange.high - price) / priceSpan;
    return Math.max(0, Math.min(100, ratio * 100));
  }, [effectiveRange.high, priceSpan]);

  const formatPrice = useCallback((p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  }, []);

  const getOrderType = useCallback((order: HLOpenOrder): "tp" | "sl" | "order" => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    
    if (position) {
      if (position.side === "long") {
        return triggerPrice < position.entryPrice ? "sl" : "tp";
      } else {
        return triggerPrice > position.entryPrice ? "sl" : "tp";
      }
    }
    return "order";
  }, [position]);

  const getLineStyle = useCallback((type: DraggableLine["type"]) => {
    switch (type) {
      case "entry":
        return { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-500" };
      case "liq":
        return { bg: "bg-orange-500", border: "border-orange-500", text: "text-orange-500" };
      case "tp":
        return { bg: "bg-green-500", border: "border-green-500", text: "text-green-500" };
      case "sl":
        return { bg: "bg-red-500", border: "border-red-500", text: "text-red-500" };
      default:
        return { bg: "bg-muted", border: "border-muted", text: "text-muted-foreground" };
    }
  }, []);

  const lines: DraggableLine[] = [];

  if (position) {
    lines.push({
      id: "entry",
      price: position.entryPrice,
      label: "Entry",
      type: "entry",
      draggable: false,
    });

    if (position.liquidationPrice) {
      lines.push({
        id: "liq",
        price: position.liquidationPrice,
        label: "Liq",
        type: "liq",
        draggable: false,
      });
    }
  }

  coinOrders.forEach((order) => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    const orderType = getOrderType(order);
    
    lines.push({
      id: `order-${order.oid}`,
      price: triggerPrice,
      label: orderType === "tp" ? "Take Profit" : orderType === "sl" ? "Stop Loss" : "Order",
      type: orderType,
      draggable: true,
      orderId: order.oid,
    });
  });

  if (pendingTP !== null) {
    lines.push({
      id: "pending-tp",
      price: pendingTP,
      label: "New TP",
      type: "tp",
      draggable: true,
    });
  }

  if (pendingSL !== null) {
    lines.push({
      id: "pending-sl",
      price: pendingSL,
      label: "New SL",
      type: "sl",
      draggable: true,
    });
  }

  const handleMouseDown = useCallback((e: React.MouseEvent, line: DraggableLine) => {
    if (!line.draggable) return;
    e.preventDefault();
    e.stopPropagation();
    
    setDragState({
      lineId: line.id,
      startY: e.clientY,
      startPrice: line.price,
      currentPrice: line.price,
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const deltaY = e.clientY - dragState.startY;
    const pricePerPixel = priceSpan / rect.height;
    const newPrice = dragState.startPrice - (deltaY * pricePerPixel);
    
    setDragState(prev => prev ? { ...prev, currentPrice: newPrice } : null);
    
    if (dragState.lineId === "pending-tp") {
      setPendingTP(newPrice);
    } else if (dragState.lineId === "pending-sl") {
      setPendingSL(newPrice);
    }
  }, [dragState, priceSpan]);

  const handleMouseUp = useCallback(async () => {
    if (!dragState) return;
    
    const { lineId, currentPrice: newPrice } = dragState;
    
    if (lineId === "pending-tp" && position) {
      await placeTPSL(coin, position.size, position.side === "long", newPrice, undefined);
      setPendingTP(null);
    } else if (lineId === "pending-sl" && position) {
      await placeTPSL(coin, position.size, position.side === "long", undefined, newPrice);
      setPendingSL(null);
    } else if (lineId.startsWith("order-") && position) {
      const orderId = parseInt(lineId.replace("order-", ""));
      const line = lines.find(l => l.id === lineId);
      if (line) {
        await cancelHLOrder(coin, orderId);
        if (line.type === "tp") {
          await placeTPSL(coin, position.size, position.side === "long", newPrice, undefined);
        } else if (line.type === "sl") {
          await placeTPSL(coin, position.size, position.side === "long", undefined, newPrice);
        }
      }
    }
    
    setDragState(null);
  }, [dragState, position, coin, placeTPSL, cancelHLOrder, lines]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const addNewTPLine = useCallback(() => {
    if (!position) return;
    const defaultTP = position.side === "long" 
      ? currentPrice * 1.02
      : currentPrice * 0.98;
    setPendingTP(defaultTP);
  }, [position, currentPrice]);

  const addNewSLLine = useCallback(() => {
    if (!position) return;
    const defaultSL = position.side === "long"
      ? currentPrice * 0.98
      : currentPrice * 1.02;
    setPendingSL(defaultSL);
  }, [position, currentPrice]);

  const hasTPOrder = coinOrders.some(o => getOrderType(o) === "tp");
  const hasSLOrder = coinOrders.some(o => getOrderType(o) === "sl");

  if (!connected) return null;
  if (!position && coinOrders.length === 0 && pendingTP === null && pendingSL === null) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-20 overflow-hidden"
      style={{ pointerEvents: dragState ? "auto" : "none" }}
      data-testid="chart-position-overlay"
    >
      {position && !hasTPOrder && pendingTP === null && (
        <button
          onClick={addNewTPLine}
          className="absolute right-2 top-2 z-30 bg-green-500/80 hover:bg-green-500 text-white text-xs px-2 py-1 rounded pointer-events-auto"
          data-testid="add-tp-line-btn"
        >
          + Add TP Line
        </button>
      )}
      
      {position && !hasSLOrder && pendingSL === null && (
        <button
          onClick={addNewSLLine}
          className="absolute right-2 top-10 z-30 bg-red-500/80 hover:bg-red-500 text-white text-xs px-2 py-1 rounded pointer-events-auto"
          data-testid="add-sl-line-btn"
        >
          + Add SL Line
        </button>
      )}

      {lines.map((line) => {
        const displayPrice = dragState?.lineId === line.id 
          ? dragState.currentPrice 
          : line.price;
        const yPosition = priceToY(displayPrice);
        const style = getLineStyle(line.type);
        const isDragging = dragState?.lineId === line.id;

        return (
          <div
            key={line.id}
            className={cn(
              "absolute left-0 right-0 flex items-center transition-none",
              isDragging && "z-50"
            )}
            style={{ 
              top: `${yPosition}%`,
              transform: "translateY(-50%)",
            }}
          >
            <div 
              className={cn(
                "flex-1 h-0 border-t-2 border-dashed",
                style.border,
                isDragging && "border-solid"
              )} 
            />
            
            <div 
              className={cn(
                "flex items-center gap-1 text-white text-xs px-2 py-1 rounded-l font-mono whitespace-nowrap",
                style.bg,
                line.draggable && "cursor-ns-resize pointer-events-auto",
                isDragging && "ring-2 ring-white"
              )}
              onMouseDown={(e) => handleMouseDown(e, line)}
              data-testid={`line-${line.type}-${line.id}`}
            >
              {line.draggable && (
                <GripHorizontal className="w-3 h-3 opacity-70" />
              )}
              <span>{line.label}</span>
              <span className="font-bold">{formatPrice(displayPrice)}</span>
            </div>
          </div>
        );
      })}

      {dragState && (
        <div className="fixed inset-0 cursor-ns-resize z-40" />
      )}
    </div>
  );
}
