import { useTrading, type Position } from "@/lib/trading-context";
import { cn } from "@/lib/utils";
import { Target, Shield, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface PriceLevelsOverlayProps {
  coin: string;
  className?: string;
}

export function PriceLevelsOverlay({ coin, className }: PriceLevelsOverlayProps) {
  const { positions, openOrders, currentPrices } = useTrading();
  
  const currentPrice = currentPrices[coin] || 0;
  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);
  
  if (!position && coinOrders.length === 0) {
    return null;
  }
  
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };
  
  const getPriceDistance = (price: number) => {
    if (!currentPrice) return 0;
    return ((price - currentPrice) / currentPrice) * 100;
  };
  
  const levels: Array<{
    type: "entry" | "sl" | "tp" | "liquidation" | "current";
    price: number;
    label: string;
    icon: typeof Target;
    color: string;
    bgColor: string;
  }> = [];
  
  if (currentPrice) {
    levels.push({
      type: "current",
      price: currentPrice,
      label: "Current",
      icon: DollarSign,
      color: "text-foreground",
      bgColor: "bg-muted",
    });
  }
  
  if (position) {
    levels.push({
      type: "entry",
      price: position.entryPrice,
      label: "Entry",
      icon: position.side === "long" ? TrendingUp : TrendingDown,
      color: position.side === "long" ? "text-bullish" : "text-bearish",
      bgColor: position.side === "long" ? "bg-bullish/10" : "bg-bearish/10",
    });
    
    if (position.liquidationPrice) {
      levels.push({
        type: "liquidation",
        price: position.liquidationPrice,
        label: "Liquidation",
        icon: Shield,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
      });
    }
  }
  
  coinOrders.forEach(order => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    
    // Use orderType from API if available
    let isStopLoss = false;
    if (order.orderType === "stop_loss") {
      isStopLoss = true;
    } else if (order.orderType === "take_profit") {
      isStopLoss = false;
    } else if (order.triggerPx && position) {
      // Classify based on trigger price vs entry price
      if (position.side === "long") {
        isStopLoss = triggerPrice < position.entryPrice;
      } else {
        isStopLoss = triggerPrice > position.entryPrice;
      }
    } else if (order.triggerPx) {
      // No position - classify by order side and trigger direction
      const isBuy = order.side === "B" || order.side === "buy";
      const limitPrice = parseFloat(order.limitPx);
      isStopLoss = isBuy ? triggerPrice > limitPrice : triggerPrice < limitPrice;
    }
    
    levels.push({
      type: isStopLoss ? "sl" : "tp",
      price: triggerPrice,
      label: isStopLoss ? "Stop Loss" : "Take Profit",
      icon: isStopLoss ? Shield : Target,
      color: isStopLoss ? "text-bearish" : "text-bullish",
      bgColor: isStopLoss ? "bg-bearish/10" : "bg-bullish/10",
    });
  });
  
  levels.sort((a, b) => b.price - a.price);
  
  const minPrice = Math.min(...levels.map(l => l.price));
  const maxPrice = Math.max(...levels.map(l => l.price));
  const priceRange = maxPrice - minPrice || 1;
  
  const getVerticalPosition = (price: number) => {
    return ((maxPrice - price) / priceRange) * 100;
  };
  
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Price Levels
      </div>
      
      <div className="relative h-48 border rounded-md bg-card/50 overflow-hidden">
        {levels.map((level, idx) => {
          const position = getVerticalPosition(level.price);
          const Icon = level.icon;
          const distance = getPriceDistance(level.price);
          
          return (
            <div
              key={`${level.type}-${level.price}-${idx}`}
              className={cn(
                "absolute left-0 right-0 flex items-center gap-2 px-2 py-1 transition-all",
                level.type === "current" && "z-10"
              )}
              style={{ top: `${Math.max(0, Math.min(88, position))}%` }}
            >
              <div className={cn("h-px flex-1", level.bgColor.replace("/10", ""))} />
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
                level.bgColor,
                level.color
              )}>
                <Icon className="h-3 w-3" />
                <span>${formatPrice(level.price)}</span>
                {level.type !== "current" && distance !== 0 && (
                  <span className="opacity-70">
                    ({distance > 0 ? "+" : ""}{distance.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="flex flex-wrap gap-2 mt-2">
        {position && (
          <div className="text-[10px] text-muted-foreground">
            <span className={position.side === "long" ? "text-bullish" : "text-bearish"}>
              {position.side.toUpperCase()}
            </span>
            {" "}{position.size.toFixed(4)} {coin}
          </div>
        )}
        {coinOrders.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {coinOrders.length} open order{coinOrders.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
