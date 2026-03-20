import { useMemo } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

interface ChartPriceRibbonProps {
  coin: string;
  currentPrice: number;
}

function fmt(p: number): string {
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export function ChartPriceRibbon({ coin, currentPrice }: ChartPriceRibbonProps) {
  const { positions, openOrders } = useTrading();

  const position = positions.find(p => p.coin === coin);

  const getOrderType = (order: HLOpenOrder): "tp" | "sl" | "other" => {
    if (!position) return "other";
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    return position.side === "long"
      ? triggerPrice < position.entryPrice ? "sl" : "tp"
      : triggerPrice > position.entryPrice ? "sl" : "tp";
  };

  const coinOrders = openOrders.filter(o => o.coin === coin);
  const tpOrder = coinOrders.find(o => getOrderType(o) === "tp");
  const slOrder = coinOrders.find(o => getOrderType(o) === "sl");
  const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  const levels = useMemo(() => {
    if (!position) return null;

    const entry = position.entryPrice;
    const prices = [entry, currentPrice];
    if (tpPrice) prices.push(tpPrice);
    if (slPrice) prices.push(slPrice);

    // Pad the visible range by 15% on each side
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const pad = (rawMax - rawMin) * 0.3 || rawMin * 0.05;
    const rangeMin = rawMin - pad;
    const rangeMax = rawMax + pad;
    const range = rangeMax - rangeMin;

    // Converts price → CSS top% (high price = low top%)
    const toY = (price: number) =>
      ((rangeMax - price) / range) * 100;

    return { entry, tpPrice, slPrice, currentPrice, toY, rangeMin, rangeMax, isLong: position.side === "long" };
  }, [position, tpPrice, slPrice, currentPrice]);

  if (!levels) return null;

  const { entry, toY, isLong } = levels;
  const entryY = toY(entry);
  const currentY = toY(levels.currentPrice);
  const tpY = levels.tpPrice !== null ? toY(levels.tpPrice) : null;
  const slY = levels.slPrice !== null ? toY(levels.slPrice) : null;

  // Filled range bar between SL and TP (or entry if no orders)
  const topFill = tpY !== null ? tpY : entryY;
  const bottomFill = slY !== null ? slY : entryY;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[72px] pointer-events-none z-10 flex"
      data-testid="chart-price-ribbon"
    >
      {/* Thin vertical track */}
      <div className="relative w-full h-full">

        {/* Range fill between TP and SL */}
        {tpY !== null && slY !== null && (
          <div
            className="absolute left-1 right-1 opacity-15"
            style={{
              top: `${topFill}%`,
              height: `${bottomFill - topFill}%`,
              background: isLong
                ? "linear-gradient(to bottom, hsl(var(--bullish)), hsl(var(--bearish)))"
                : "linear-gradient(to bottom, hsl(var(--bearish)), hsl(var(--bullish)))",
            }}
          />
        )}

        {/* TP line */}
        {tpY !== null && (
          <PriceLine
            y={tpY}
            price={levels.tpPrice!}
            label="TP"
            colorClass="text-bullish border-bullish bg-bullish/10"
            lineColor="hsl(var(--bullish))"
          />
        )}

        {/* SL line */}
        {slY !== null && (
          <PriceLine
            y={slY}
            price={levels.slPrice!}
            label="SL"
            colorClass="text-bearish border-bearish bg-bearish/10"
            lineColor="hsl(var(--bearish))"
          />
        )}

        {/* Entry line */}
        <PriceLine
          y={entryY}
          price={entry}
          label="Entry"
          colorClass="text-foreground border-border bg-background/80"
          lineColor="hsl(var(--foreground))"
          dashed
        />

        {/* Current price marker */}
        <div
          className="absolute left-0 right-0 flex items-center"
          style={{ top: `${currentY}%`, transform: "translateY(-50%)" }}
        >
          <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
          <div className="bg-muted-foreground/20 border border-muted-foreground/40 rounded text-[9px] font-mono px-1 py-0.5 text-muted-foreground whitespace-nowrap">
            {fmt(levels.currentPrice)}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PriceLineProps {
  y: number;
  price: number;
  label: string;
  colorClass: string;
  lineColor: string;
  dashed?: boolean;
}

function PriceLine({ y, price, label, colorClass, lineColor, dashed }: PriceLineProps) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center"
      style={{ top: `${y}%`, transform: "translateY(-50%)" }}
    >
      <div
        className="flex-1"
        style={{
          borderTop: `1px ${dashed ? "dashed" : "solid"} ${lineColor}`,
          opacity: dashed ? 0.5 : 0.85,
        }}
      />
      <div className={cn(
        "flex flex-col items-end border rounded-sm px-1 py-0 text-right whitespace-nowrap",
        colorClass
      )}>
        <span className="text-[8px] font-semibold uppercase leading-tight opacity-80">{label}</span>
        <span className="text-[9px] font-mono leading-tight">{fmt(price)}</span>
      </div>
    </div>
  );
}
