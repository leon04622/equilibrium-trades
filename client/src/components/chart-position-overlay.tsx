import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

interface ChartPositionOverlayProps {
  coin: string;
  currentPrice: number;
}

export function ChartPositionOverlay({ coin, currentPrice }: ChartPositionOverlayProps) {
  const { positions, openOrders, connected } = useTrading();

  const position = positions.find(p => p.coin === coin);

  if (!connected) return null;
  if (!position) return null;

  const coinOrders = openOrders.filter(o => o.coin === coin);

  const getOrderType = (order: HLOpenOrder): "tp" | "sl" | "order" => {
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    return position.side === "long"
      ? triggerPrice < position.entryPrice ? "sl" : "tp"
      : triggerPrice > position.entryPrice ? "sl" : "tp";
  };

  const tpOrders = coinOrders.filter(o => getOrderType(o) === "tp");
  const slOrders = coinOrders.filter(o => getOrderType(o) === "sl");

  const tpPrice = tpOrders.length > 0
    ? parseFloat(tpOrders[0].triggerPx || tpOrders[0].limitPx)
    : null;
  const slPrice = slOrders.length > 0
    ? parseFloat(slOrders[0].triggerPx || slOrders[0].limitPx)
    : null;

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  return (
    <div
      className="absolute top-2 right-2 z-10 pointer-events-none select-none"
      data-testid="chart-position-overlay"
    >
      <div className="bg-background/90 backdrop-blur-sm border border-border/60 rounded-md px-2 py-1.5 text-[10px] font-mono space-y-0.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-semibold uppercase text-[9px] px-1 rounded",
            position.side === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          )}>
            {position.side}
          </span>
          <span className="text-muted-foreground">{position.size} @ {formatPrice(position.entryPrice)}</span>
        </div>
        {tpPrice && (
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-semibold">TP</span>
            <span className="text-muted-foreground">{formatPrice(tpPrice)}</span>
          </div>
        )}
        {slPrice && (
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-semibold">SL</span>
            <span className="text-muted-foreground">{formatPrice(slPrice)}</span>
          </div>
        )}
        {position.liquidationPrice && position.liquidationPrice > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-orange-400 font-semibold">Liq</span>
            <span className="text-muted-foreground">{formatPrice(position.liquidationPrice)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
