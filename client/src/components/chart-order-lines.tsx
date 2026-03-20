import { useState, useMemo, useCallback } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, ChevronUp, ChevronDown } from "lucide-react";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
}

const RANGE_OPTIONS = [1, 2, 3, 5, 8, 12, 20];

function fmt(p: number): string {
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${abs.toFixed(2)}`;
}

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  // Visible range half-width as a % of currentPrice — user can tune this to match TradingView zoom
  const [rangeIdx, setRangeIdx] = useState(2); // default ±3%
  const rangePct = RANGE_OPTIONS[rangeIdx];

  const position = positions.find(p => p.coin === coin);

  const getOrderType = useCallback((order: HLOpenOrder): "tp" | "sl" | "other" => {
    if (!position) return "other";
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    return position.side === "long"
      ? triggerPrice < position.entryPrice ? "sl" : "tp"
      : triggerPrice > position.entryPrice ? "sl" : "tp";
  }, [position]);

  const coinOrders = openOrders.filter(o => o.coin === coin);
  const tpOrder = coinOrders.find(o => getOrderType(o) === "tp");
  const slOrder = coinOrders.find(o => getOrderType(o) === "sl");
  const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  const handleCancelOrder = useCallback(async (type: "tp" | "sl") => {
    const order = type === "tp" ? tpOrder : slOrder;
    if (!order) return;
    const result = await cancelHLOrder(coin, order.oid);
    toast(result.success
      ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} Cancelled` }
      : { title: "Cancel Failed", description: result.error, variant: "destructive" });
  }, [tpOrder, slOrder, coin, cancelHLOrder, toast]);

  // Compute visible range centred on currentPrice
  const { rangeMin, rangeMax, toY } = useMemo(() => {
    const half = currentPrice * (rangePct / 100);
    const rangeMin = currentPrice - half;
    const rangeMax = currentPrice + half;
    const toY = (price: number) => ((rangeMax - price) / (rangeMax - rangeMin)) * 100;
    return { rangeMin, rangeMax, toY };
  }, [currentPrice, rangePct]);

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const calcPnl = (p: number) => isLong ? size * (p - entry) : size * (entry - p);
  const unrealizedPnl = position.unrealizedPnl ?? calcPnl(currentPrice);
  const pnlPositive = unrealizedPnl >= 0;

  // Only render a line if its price is within the visible range (with 20% buffer)
  const buffer = (rangeMax - rangeMin) * 1.2;
  const inRange = (p: number) => p >= rangeMin - buffer && p <= rangeMax + buffer;

  const lines: Array<{
    key: string;
    price: number;
    label: string;
    sublabel?: string;
    color: string;        // tailwind text color
    lineColor: string;    // hex / hsl for border
    bgColor: string;      // tailwind bg for label pill
    dashed?: boolean;
    canCancel?: boolean;
    cancelType?: "tp" | "sl";
  }> = [];

  if (tpPrice !== null && inRange(tpPrice)) {
    lines.push({
      key: "tp",
      price: tpPrice,
      label: `TP ${isLong ? ">" : "<"} ${fmt(tpPrice)}`,
      sublabel: `${fmt(size)} ${coin}  ${fmtPnl(calcPnl(tpPrice))}`,
      color: "text-bullish",
      lineColor: "hsl(var(--bullish))",
      bgColor: "bg-bullish",
      canCancel: true,
      cancelType: "tp",
    });
  }

  if (inRange(entry)) {
    lines.push({
      key: "entry",
      price: entry,
      label: `Entry  ${fmt(entry)}`,
      sublabel: `${isLong ? "Long" : "Short"} ${fmt(size)} ${coin}`,
      color: "text-foreground",
      lineColor: "hsl(var(--foreground) / 0.6)",
      bgColor: "bg-muted",
      dashed: true,
    });
  }

  if (slPrice !== null && inRange(slPrice)) {
    lines.push({
      key: "sl",
      price: slPrice,
      label: `SL ${isLong ? "<" : ">"} ${fmt(slPrice)}`,
      sublabel: `${fmt(size)} ${coin}  ${fmtPnl(calcPnl(slPrice))}`,
      color: "text-bearish",
      lineColor: "hsl(var(--bearish))",
      bgColor: "bg-bearish",
      canCancel: true,
      cancelType: "sl",
    });
  }

  if (position.liquidationPrice && position.liquidationPrice > 0 && inRange(position.liquidationPrice)) {
    lines.push({
      key: "liq",
      price: position.liquidationPrice,
      label: `Liq. Price  ${fmt(position.liquidationPrice)}`,
      color: "text-orange-400",
      lineColor: "hsl(30 100% 60%)",
      bgColor: "bg-orange-500",
      dashed: true,
    });
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      data-testid="chart-order-lines"
    >
      {/* Price lines */}
      {lines.map(line => {
        const y = toY(line.price);
        if (y < -20 || y > 120) return null;
        return (
          <div
            key={line.key}
            className="absolute left-0 right-0 flex items-center"
            style={{ top: `${y}%`, transform: "translateY(-50%)" }}
          >
            {/* Full-width line */}
            <div
              className="absolute left-0 right-0"
              style={{
                borderTop: `1px ${line.dashed ? "dashed" : "solid"} ${line.lineColor}`,
                opacity: 0.75,
              }}
            />

            {/* Center label (Hyperliquid style) */}
            <div className="relative z-10 mx-auto flex items-center gap-1 pointer-events-auto">
              <div className={cn(
                "flex items-center gap-2 px-2 py-0.5 rounded text-white text-[11px] font-mono font-semibold shadow-sm border border-white/10",
                line.bgColor
              )}>
                <span>{line.label}</span>
                {line.sublabel && (
                  <span className="opacity-75 text-[10px]">{line.sublabel}</span>
                )}
                {line.canCancel && (
                  <button
                    className="opacity-70 hover:opacity-100 transition-opacity ml-0.5"
                    onClick={() => line.cancelType && handleCancelOrder(line.cancelType)}
                    data-testid={`cancel-line-${line.key}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Right-side price tag (like Hyperliquid's Y-axis highlight) */}
            <div
              className={cn(
                "absolute right-0 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white rounded-l",
                line.bgColor
              )}
              style={{ opacity: 0.9 }}
            >
              {fmt(line.price)}
            </div>
          </div>
        );
      })}

      {/* Current price line */}
      {(() => {
        const y = toY(currentPrice);
        return (
          <div
            className="absolute left-0 right-0 flex items-center"
            style={{ top: `${y}%`, transform: "translateY(-50%)" }}
          >
            <div
              className="absolute left-0 right-0"
              style={{ borderTop: "1px dashed hsl(var(--muted-foreground) / 0.35)" }}
            />
            <div className="absolute right-0 bg-muted-foreground text-background px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-l">
              {fmt(currentPrice)}
            </div>
          </div>
        );
      })()}

      {/* P&L badge — top-left of chart */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
        <div className={cn(
          "text-[11px] font-mono font-semibold px-2 py-0.5 rounded border",
          pnlPositive
            ? "bg-bullish/20 border-bullish/40 text-bullish"
            : "bg-bearish/20 border-bearish/40 text-bearish"
        )}>
          PNL: {fmtPnl(unrealizedPnl)}
        </div>
      </div>

      {/* Zoom calibration control — bottom-right */}
      <div className="absolute bottom-8 right-2 flex flex-col items-center gap-0.5 pointer-events-auto">
        <button
          onClick={() => setRangeIdx(i => Math.max(0, i - 1))}
          className="w-5 h-5 rounded bg-background/70 border border-border hover:bg-muted flex items-center justify-center"
          title="Zoom in (narrow range)"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <div className="text-[9px] font-mono text-muted-foreground bg-background/70 border border-border rounded px-1">
          ±{rangePct}%
        </div>
        <button
          onClick={() => setRangeIdx(i => Math.min(RANGE_OPTIONS.length - 1, i + 1))}
          className="w-5 h-5 rounded bg-background/70 border border-border hover:bg-muted flex items-center justify-center"
          title="Zoom out (wider range)"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
