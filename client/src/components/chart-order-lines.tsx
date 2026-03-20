import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
}

function fmt(p: number): string {
  if (!p || p === 0) return "0";
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtSize(s: number): string {
  if (s < 0.001) return s.toFixed(6);
  if (s < 1) return s.toFixed(4);
  return s.toFixed(3);
}

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, cancelHLOrder } = useTrading();
  const { toast } = useToast();
  const [containerHeight, setContainerHeight] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const position = useMemo(() => positions.find(p => p.coin === coin), [positions, coin]);

  const getOrderType = useCallback((order: any): "tp" | "sl" | "other" => {
    if (!position) return "other";
    const ot = (order.orderType || "").toLowerCase();
    if (ot.includes("take profit") || ot === "take_profit") return "tp";
    if (ot.includes("stop") || ot === "stop_loss") return "sl";
    const trigPx = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    if (!trigPx || isNaN(trigPx)) return "other";
    return position.side === "long"
      ? trigPx > (position.entryPrice || currentPrice) ? "tp" : "sl"
      : trigPx < (position.entryPrice || currentPrice) ? "tp" : "sl";
  }, [position, currentPrice]);

  const coinOrders = useMemo(() => openOrders.filter(o => o.coin === coin), [openOrders, coin]);
  const tpOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "tp"), [coinOrders, getOrderType]);
  const slOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "sl"), [coinOrders, getOrderType]);

  const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  const handleCancel = useCallback(async (type: "tp" | "sl") => {
    const order = type === "tp" ? tpOrder : slOrder;
    if (!order) return;
    const result = await cancelHLOrder(coin, order.oid);
    toast(result.success
      ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} cancelled` }
      : { title: "Cancel failed", description: result.error, variant: "destructive" });
  }, [tpOrder, slOrder, coin, cancelHLOrder, toast]);

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const unrealizedPnl = position.unrealizedPnl ?? (isLong ? size * (currentPrice - entry) : size * (entry - currentPrice));
  const pnlPositive = unrealizedPnl >= 0;
  const liqPrice = position.liquidationPrice;

  // Build price scale that fits all key levels
  const priceLevels: number[] = [currentPrice, entry].filter(p => p > 0);
  if (tpPrice) priceLevels.push(tpPrice);
  if (slPrice) priceLevels.push(slPrice);
  if (liqPrice && liqPrice > 0) priceLevels.push(liqPrice);

  const rawMin = Math.min(...priceLevels);
  const rawMax = Math.max(...priceLevels);
  const span = rawMax - rawMin || currentPrice * 0.06;
  const pad = span * 0.25;
  const rMin = rawMin - pad;
  const rMax = rawMax + pad;

  const toYPct = (price: number): number => ((rMax - price) / (rMax - rMin)) * 100;

  interface LineConfig {
    key: string;
    price: number;
    color: string;          // tailwind / hex
    lineColor: string;      // for border-color inline style
    dashed: boolean;
    label: string;
    pnlLabel?: string;
    sizeLabel: string;
    canCancel: boolean;
    cancelType?: "tp" | "sl";
    labelSide?: "left" | "center";
  }

  const lines: LineConfig[] = [];

  if (tpPrice && tpPrice > 0) {
    lines.push({
      key: "tp",
      price: tpPrice,
      color: "text-[#22c55e]",
      lineColor: "#22c55e",
      dashed: true,
      label: `TP Price ${isLong ? ">" : "<"} ${fmt(tpPrice)}`,
      sizeLabel: fmtSize(size),
      canCancel: true,
      cancelType: "tp",
      labelSide: "center",
    });
  }

  lines.push({
    key: "entry",
    price: entry,
    color: "text-blue-400",
    lineColor: "#60a5fa",
    dashed: true,
    label: `Entry ${fmt(entry)}`,
    pnlLabel: `PNL ${fmtPnl(unrealizedPnl)}`,
    sizeLabel: fmtSize(size),
    canCancel: false,
    labelSide: "left",
  });

  if (slPrice && slPrice > 0) {
    lines.push({
      key: "sl",
      price: slPrice,
      color: "text-[#ef4444]",
      lineColor: "#ef4444",
      dashed: true,
      label: `SL Price ${isLong ? "<" : ">"} ${fmt(slPrice)}`,
      sizeLabel: fmtSize(size),
      canCancel: true,
      cancelType: "sl",
      labelSide: "center",
    });
  }

  if (liqPrice && liqPrice > 0) {
    lines.push({
      key: "liq",
      price: liqPrice,
      color: "text-orange-400",
      lineColor: "#f97316",
      dashed: true,
      label: `Liq. Price`,
      sizeLabel: "",
      canCancel: false,
      labelSide: "left",
    });
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 overflow-hidden"
      style={{ pointerEvents: "none", height: containerHeight || undefined }}
      data-testid="chart-order-lines"
    >
      {lines.map(line => {
        const yPct = toYPct(line.price);
        if (yPct < -8 || yPct > 108) return null;

        return (
          <div
            key={line.key}
            className="absolute left-0 right-0"
            style={{ top: `${yPct}%`, transform: "translateY(-50%)" }}
          >
            {/* Full-width dashed line */}
            <div
              className="absolute left-0 right-0 h-0"
              style={{
                borderTop: `1px dashed ${line.lineColor}`,
                opacity: 0.7,
              }}
            />

            {/* Label – centered for TP/SL, left for Entry/Liq */}
            {line.labelSide === "center" ? (
              <div
                className="absolute"
                style={{
                  left: "50%",
                  transform: "translateX(-50%) translateY(-50%)",
                  pointerEvents: "auto",
                  zIndex: 30,
                }}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono font-semibold",
                    "bg-[#1a1f2e] border border-white/15 shadow-lg select-none whitespace-nowrap",
                    line.color,
                  )}
                >
                  <span>{line.label}</span>
                  <span className="opacity-50">{line.sizeLabel}</span>
                  {line.canCancel && (
                    <button
                      className="opacity-60 hover:opacity-100 transition-opacity ml-0.5"
                      onClick={() => line.cancelType && handleCancel(line.cancelType!)}
                      data-testid={`cancel-${line.key}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Left-side label for Entry and Liq */
              <div
                className="absolute left-2"
                style={{ transform: "translateY(-50%)", pointerEvents: "auto", zIndex: 30 }}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono font-semibold",
                    "bg-[#1a1f2e] border border-white/15 shadow-lg select-none whitespace-nowrap",
                    line.color,
                  )}
                >
                  {line.pnlLabel ? (
                    <>
                      <span className={cn(
                        "text-[10px] font-semibold",
                        pnlPositive ? "text-[#22c55e]" : "text-[#ef4444]"
                      )}>
                        {line.pnlLabel}
                      </span>
                      <span className="opacity-50">{line.sizeLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{line.label}</span>
                      {line.sizeLabel && <span className="opacity-50">{line.sizeLabel}</span>}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
