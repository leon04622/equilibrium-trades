import { useState, useCallback, useRef, useEffect } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
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

  const pricePadding = currentPrice * 0.03;
  const effectiveRange = {
    high: currentPrice + pricePadding,
    low: currentPrice - pricePadding,
  };
  
  const priceSpan = effectiveRange.high - effectiveRange.low;

  const priceToY = useCallback((price: number): number => {
    const ratio = (effectiveRange.high - price) / priceSpan;
    return Math.max(5, Math.min(95, ratio * 100));
  }, [effectiveRange.high, priceSpan]);

  const formatPrice = useCallback((p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
        return { bg: "bg-blue-600", border: "border-blue-500" };
      case "liq":
        return { bg: "bg-orange-600", border: "border-orange-500" };
      case "tp":
        return { bg: "bg-green-600", border: "border-green-500" };
      case "sl":
        return { bg: "bg-red-600", border: "border-red-500" };
      default:
        return { bg: "bg-gray-600", border: "border-gray-500" };
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

    if (position.liquidationPrice && position.liquidationPrice > 0) {
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
      label: orderType === "tp" ? "TP" : orderType === "sl" ? "SL" : "Order",
      type: orderType,
      draggable: true,
      orderId: order.oid,
    });
  });

  if (pendingTP !== null) {
    lines.push({
      id: "pending-tp",
      price: pendingTP,
      label: "TP",
      type: "tp",
      draggable: true,
    });
  }

  if (pendingSL !== null) {
    lines.push({
      id: "pending-sl",
      price: pendingSL,
      label: "SL",
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
      className="absolute inset-0 z-10 overflow-hidden pointer-events-none"
      data-testid="chart-position-overlay"
    >
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
              "absolute left-0 flex items-center transition-none",
              isDragging && "z-50"
            )}
            style={{ 
              top: `${yPosition}%`,
              transform: "translateY(-50%)",
              width: "120px",
            }}
          >
            <div 
              className={cn(
                "flex items-center gap-1 text-white text-[10px] px-1.5 py-0.5 rounded-r font-mono whitespace-nowrap",
                style.bg,
                line.draggable && "cursor-ns-resize pointer-events-auto",
                isDragging && "ring-1 ring-white"
              )}
              onMouseDown={(e) => handleMouseDown(e, line)}
              data-testid={`line-${line.type}-${line.id}`}
            >
              <span className="font-semibold">{line.label}</span>
              <span>{formatPrice(displayPrice)}</span>
            </div>
          </div>
        );
      })}

      {position && (!hasTPOrder && pendingTP === null || !hasSLOrder && pendingSL === null) && (
        <div className="absolute left-2 bottom-2 flex gap-1 pointer-events-auto z-30">
          {!hasTPOrder && pendingTP === null && (
            <button
              onClick={addNewTPLine}
              className="bg-green-600/90 hover:bg-green-600 text-white text-[10px] px-2 py-1 rounded"
              data-testid="add-tp-line-btn"
            >
              +TP
            </button>
          )}
          {!hasSLOrder && pendingSL === null && (
            <button
              onClick={addNewSLLine}
              className="bg-red-600/90 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded"
              data-testid="add-sl-line-btn"
            >
              +SL
            </button>
          )}
        </div>
      )}

      {dragState && (
        <div className="fixed inset-0 cursor-ns-resize z-40 pointer-events-auto" />
      )}
    </div>
  );
}
