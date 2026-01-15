import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
}

export function ChartPositionOverlay({ coin, currentPrice }: ChartPositionOverlayProps) {
  const { positions, openOrders, connected } = useTrading();

  if (!connected) return null;

  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);

  if (!position && coinOrders.length === 0) return null;

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const getOrderInfo = (order: HLOpenOrder) => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    
    if (order.orderType === "stop_loss") {
      return { type: "SL", color: "bg-red-500", borderColor: "border-red-500", label: "Stop Loss" };
    }
    if (order.orderType === "take_profit") {
      return { type: "TP", color: "bg-green-500", borderColor: "border-green-500", label: "Take Profit" };
    }
    
    if (position) {
      if (position.side === "long") {
        if (triggerPrice < position.entryPrice) {
          return { type: "SL", color: "bg-red-500", borderColor: "border-red-500", label: "Stop Loss" };
        } else {
          return { type: "TP", color: "bg-green-500", borderColor: "border-green-500", label: "Take Profit" };
        }
      } else {
        if (triggerPrice > position.entryPrice) {
          return { type: "SL", color: "bg-red-500", borderColor: "border-red-500", label: "Stop Loss" };
        } else {
          return { type: "TP", color: "bg-green-500", borderColor: "border-green-500", label: "Take Profit" };
        }
      }
    }
    
    return { type: "Order", color: "bg-muted", borderColor: "border-muted", label: "Order" };
  };

  const lines: Array<{
    price: number;
    label: string;
    color: string;
    borderColor: string;
    style: "solid" | "dashed" | "dotted";
  }> = [];

  if (position) {
    lines.push({
      price: position.entryPrice,
      label: `Entry ${formatPrice(position.entryPrice)}`,
      color: "bg-blue-500",
      borderColor: "border-blue-500",
      style: "dashed",
    });

    if (position.liquidationPrice) {
      lines.push({
        price: position.liquidationPrice,
        label: `Liq ${formatPrice(position.liquidationPrice)}`,
        color: "bg-orange-500",
        borderColor: "border-orange-500",
        style: "dotted",
      });
    }
  }

  coinOrders.forEach(order => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    const info = getOrderInfo(order);
    
    lines.push({
      price: triggerPrice,
      label: `${info.label} ${formatPrice(triggerPrice)}`,
      color: info.color,
      borderColor: info.borderColor,
      style: "dashed",
    });
  });

  if (lines.length === 0) return null;

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      data-testid="chart-position-overlay"
    >
      {lines.map((line, i) => (
        <div
          key={`${line.label}-${i}`}
          className="absolute left-0 right-0 flex items-center"
          style={{ 
            top: `${50 - (i - lines.length / 2) * 8}%`,
          }}
        >
          <div 
            className={cn(
              "flex-1 h-0",
              line.style === "solid" && "border-t",
              line.style === "dashed" && "border-t-2 border-dashed",
              line.style === "dotted" && "border-t-2 border-dotted",
              line.borderColor
            )} 
          />
          <div className={cn(
            "text-white text-[10px] px-2 py-0.5 rounded font-mono whitespace-nowrap",
            line.color
          )}>
            {line.label}
          </div>
        </div>
      ))}
    </div>
  );
}
