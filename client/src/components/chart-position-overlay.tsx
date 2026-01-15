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

  const allPrices: number[] = [];
  if (currentPrice > 0) allPrices.push(currentPrice);
  if (position) {
    allPrices.push(position.entryPrice);
    if (position.liquidationPrice) allPrices.push(position.liquidationPrice);
  }
  coinOrders.forEach(order => {
    const price = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    if (price > 0) allPrices.push(price);
  });

  if (allPrices.length === 0) return null;

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.15 || maxPrice * 0.02;
  const rangeMin = minPrice - padding;
  const rangeMax = maxPrice + padding;
  const range = rangeMax - rangeMin;

  const getYPercent = (price: number) => {
    if (range === 0) return 50;
    return ((rangeMax - price) / range) * 100;
  };

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const getOrderInfo = (order: HLOpenOrder) => {
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    
    if (order.orderType === "stop_loss") {
      return { type: "SL", color: "bg-bearish", textColor: "text-bearish", borderColor: "border-bearish" };
    }
    if (order.orderType === "take_profit") {
      return { type: "TP", color: "bg-bullish", textColor: "text-bullish", borderColor: "border-bullish" };
    }
    
    if (position) {
      if (position.side === "long") {
        if (triggerPrice < position.entryPrice) {
          return { type: "SL", color: "bg-bearish", textColor: "text-bearish", borderColor: "border-bearish" };
        } else {
          return { type: "TP", color: "bg-bullish", textColor: "text-bullish", borderColor: "border-bullish" };
        }
      } else {
        if (triggerPrice > position.entryPrice) {
          return { type: "SL", color: "bg-bearish", textColor: "text-bearish", borderColor: "border-bearish" };
        } else {
          return { type: "TP", color: "bg-bullish", textColor: "text-bullish", borderColor: "border-bullish" };
        }
      }
    }
    
    return { type: "Order", color: "bg-muted", textColor: "text-muted-foreground", borderColor: "border-muted" };
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-20 pointer-events-none z-10" data-testid="chart-position-overlay">
      {position && (
        <>
          <div
            className="absolute right-0 left-0 flex items-center"
            style={{ top: `${getYPercent(position.entryPrice)}%` }}
          >
            <div className="flex-1 border-t-2 border-dashed border-blue-500" />
            <div className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-mono">
              Entry {formatPrice(position.entryPrice)}
            </div>
          </div>

          {position.liquidationPrice && (
            <div
              className="absolute right-0 left-0 flex items-center"
              style={{ top: `${getYPercent(position.liquidationPrice)}%` }}
            >
              <div className="flex-1 border-t-2 border-dotted border-orange-500" />
              <div className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-mono">
                Liq {formatPrice(position.liquidationPrice)}
              </div>
            </div>
          )}
        </>
      )}

      {coinOrders.map((order, i) => {
        const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
        const info = getOrderInfo(order);
        
        return (
          <div
            key={order.oid || i}
            className="absolute right-0 left-0 flex items-center"
            style={{ top: `${getYPercent(triggerPrice)}%` }}
          >
            <div className={cn("flex-1 border-t-2 border-dashed", info.borderColor)} />
            <div className={cn(
              "text-white text-[10px] px-1.5 py-0.5 rounded-sm font-mono",
              info.color
            )}>
              {info.type} {formatPrice(triggerPrice)}
            </div>
          </div>
        );
      })}

      {currentPrice > 0 && (
        <div
          className="absolute right-0 left-0 flex items-center"
          style={{ top: `${getYPercent(currentPrice)}%` }}
        >
          <div className="flex-1 border-t border-foreground/50" />
          <div className="bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded-sm font-mono">
            {formatPrice(currentPrice)}
          </div>
        </div>
      )}
    </div>
  );
}
