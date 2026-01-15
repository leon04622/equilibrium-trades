import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
}

export function ChartPositionOverlay({ 
  coin, 
  currentPrice,
}: ChartPositionOverlayProps) {
  const { positions, openOrders, connected } = useTrading();

  const position = positions.find(p => p.coin === coin);
  const coinOrders = openOrders.filter(o => o.coin === coin);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const getOrderType = (order: HLOpenOrder): "tp" | "sl" | "order" => {
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
  };

  if (!connected) return null;
  if (!position && coinOrders.length === 0) return null;

  const tpOrders = coinOrders.filter(o => getOrderType(o) === "tp");
  const slOrders = coinOrders.filter(o => getOrderType(o) === "sl");

  return (
    <div 
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
      data-testid="chart-position-overlay"
    >
      <div className="flex flex-col gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-2 border border-border/50 min-w-[140px]">
        {position && (
          <>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-blue-400 font-medium">Entry</span>
              <span className="font-mono text-foreground">{formatPrice(position.entryPrice)}</span>
            </div>
            
            {position.liquidationPrice > 0 && (
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-orange-400 font-medium">Liq</span>
                <span className="font-mono text-foreground">{formatPrice(position.liquidationPrice)}</span>
              </div>
            )}
          </>
        )}
        
        {tpOrders.map((order, i) => {
          const price = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
          return (
            <div key={order.oid} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-green-400 font-medium">TP{tpOrders.length > 1 ? ` ${i+1}` : ''}</span>
              <span className="font-mono text-foreground">{formatPrice(price)}</span>
            </div>
          );
        })}
        
        {slOrders.map((order, i) => {
          const price = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
          return (
            <div key={order.oid} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-red-400 font-medium">SL{slOrders.length > 1 ? ` ${i+1}` : ''}</span>
              <span className="font-mono text-foreground">{formatPrice(price)}</span>
            </div>
          );
        })}
        
        {!position && coinOrders.length > 0 && (
          <div className="text-[10px] text-muted-foreground text-center">
            {coinOrders.length} pending order{coinOrders.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
