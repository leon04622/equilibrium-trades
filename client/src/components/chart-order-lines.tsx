import { useState, useMemo, useCallback, useEffect } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
}

async function fetch24hRange(coin: string): Promise<{ high: number; low: number } | null> {
  try {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin, interval: "1h", startTime: dayAgo, endTime: now },
      }),
    });
    if (!res.ok) return null;
    const candles: Array<{ h: string; l: string }> = await res.json();
    if (!candles || candles.length === 0) return null;
    const high = Math.max(...candles.map(c => parseFloat(c.h)));
    const low = Math.min(...candles.map(c => parseFloat(c.l)));
    if (!isFinite(high) || !isFinite(low) || high <= low) return null;
    return { high, low };
  } catch {
    return null;
  }
}

function fmt(p: number): string {
  if (!p || p === 0) return "0";
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

  const [chartRange, setChartRange] = useState<{ high: number; low: number } | null>(null);

  useEffect(() => {
    setChartRange(null);
    let cancelled = false;
    async function load() {
      const range = await fetch24hRange(coin);
      if (!cancelled) setChartRange(range);
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coin]);

  const position = useMemo(() => positions.find(p => p.coin === coin), [positions, coin]);

  const getOrderType = useCallback((order: any): "tp" | "sl" | "other" => {
    if (!position) return "other";
    if (order.orderType === "take_profit") return "tp";
    if (order.orderType === "stop_loss") return "sl";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    if (!triggerPrice || isNaN(triggerPrice)) return "other";
    return position.side === "long"
      ? triggerPrice > currentPrice ? "tp" : "sl"
      : triggerPrice < currentPrice ? "tp" : "sl";
  }, [position, currentPrice]);

  const coinOrders = useMemo(() => openOrders.filter(o => o.coin === coin), [openOrders, coin]);
  const tpOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "tp"), [coinOrders, getOrderType]);
  const slOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "sl"), [coinOrders, getOrderType]);

  const activeTpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const activeSlPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  const isLong = position?.side === "long";
  const entry = position?.entryPrice ?? 0;

  const toY = useMemo(() => {
    const mustFit = [
      currentPrice,
      position?.entryPrice,
      activeTpPrice,
      activeSlPrice,
      position?.liquidationPrice,
    ].filter((p): p is number => typeof p === "number" && p > 0);

    let rMin: number, rMax: number;

    if (chartRange) {
      const span = chartRange.high - chartRange.low;
      const pad = span * 0.12;
      rMin = chartRange.low - pad;
      rMax = chartRange.high + pad;
      for (const p of mustFit) {
        if (p < rMin) rMin = p - span * 0.05;
        if (p > rMax) rMax = p + span * 0.05;
      }
    } else {
      const minP = Math.min(...mustFit);
      const maxP = Math.max(...mustFit);
      const span = maxP - minP || currentPrice * 0.04;
      rMin = minP - span * 0.20;
      rMax = maxP + span * 0.20;
    }

    return (price: number) => ((rMax - price) / (rMax - rMin)) * 100;
  }, [currentPrice, position, activeTpPrice, activeSlPrice, chartRange]);

  const handleCancel = useCallback(async (type: "tp" | "sl") => {
    const order = type === "tp" ? tpOrder : slOrder;
    if (!order) return;
    const result = await cancelHLOrder(coin, order.oid);
    toast(result.success
      ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} cancelled` }
      : { title: "Cancel failed", description: result.error, variant: "destructive" });
  }, [tpOrder, slOrder, coin, cancelHLOrder, toast]);

  if (!position) return null;

  const size = position.size;
  const calcPnl = (p: number) => isLong ? size * (p - entry) : size * (entry - p);

  interface LineConfig {
    key: string;
    price: number;
    label: string;
    pnlLabel?: string;
    sizeLabel?: string;
    lineColor: string;
    pillBg: string;
    textColor: string;
    dashed: boolean;
    canCancel: boolean;
    cancelType?: "tp" | "sl";
  }

  const lines: LineConfig[] = [];

  if (activeTpPrice && activeTpPrice > 0) {
    lines.push({
      key: "tp",
      price: activeTpPrice,
      label: `TP  ${fmt(activeTpPrice)}`,
      pnlLabel: fmtPnl(calcPnl(activeTpPrice)),
      sizeLabel: fmt(size),
      lineColor: "#22c55e",
      pillBg: "bg-[#22c55e]/20",
      textColor: "text-[#22c55e]",
      dashed: false,
      canCancel: true,
      cancelType: "tp",
    });
  }

  if (entry > 0) {
    lines.push({
      key: "entry",
      price: entry,
      label: `Entry  ${fmt(entry)}`,
      pnlLabel: `PNL ${fmtPnl(calcPnl(currentPrice))}`,
      sizeLabel: fmt(size),
      lineColor: "rgba(255,255,255,0.45)",
      pillBg: "bg-white/10",
      textColor: "text-white/80",
      dashed: true,
      canCancel: false,
    });
  }

  if (activeSlPrice && activeSlPrice > 0) {
    lines.push({
      key: "sl",
      price: activeSlPrice,
      label: `SL  ${fmt(activeSlPrice)}`,
      pnlLabel: fmtPnl(calcPnl(activeSlPrice)),
      sizeLabel: fmt(size),
      lineColor: "#ef4444",
      pillBg: "bg-[#ef4444]/20",
      textColor: "text-[#ef4444]",
      dashed: false,
      canCancel: true,
      cancelType: "sl",
    });
  }

  if (position.liquidationPrice && position.liquidationPrice > 0) {
    lines.push({
      key: "liq",
      price: position.liquidationPrice,
      label: `Liq  ${fmt(position.liquidationPrice)}`,
      lineColor: "#f97316",
      pillBg: "bg-orange-500/20",
      textColor: "text-orange-400",
      dashed: true,
      canCancel: false,
    });
  }

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden"
      style={{ pointerEvents: "none" }}
      data-testid="chart-order-lines"
    >
      {lines.map(line => {
        const y = toY(line.price);
        if (y < -10 || y > 110) return null;

        return (
          <div
            key={line.key}
            className="absolute left-0 right-0"
            style={{
              top: `${y}%`,
              transform: "translateY(-50%)",
            }}
          >
            {/* Horizontal line */}
            <div
              className="absolute left-0 right-0"
              style={{
                borderTop: `${line.dashed ? "1.5px dashed" : "1.5px solid"} ${line.lineColor}`,
                opacity: 0.85,
              }}
            />

            {/* Left label pill */}
            <div
              className="absolute left-2"
              style={{ transform: "translateY(-50%)", pointerEvents: "auto", zIndex: 30 }}
            >
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-[3px] rounded text-[11px] font-mono font-semibold",
                  "border border-white/15 shadow-lg select-none whitespace-nowrap backdrop-blur-sm",
                  line.pillBg,
                  line.textColor,
                )}
              >
                <span>{line.label}</span>
                {line.sizeLabel && (
                  <span className="opacity-55 text-[10px]">{line.sizeLabel}</span>
                )}
                {line.canCancel && (
                  <button
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    onClick={() => line.cancelType && handleCancel(line.cancelType)}
                    data-testid={`cancel-${line.key}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* PNL badge centred */}
            {line.pnlLabel && (
              <div
                className="absolute"
                style={{
                  left: "50%",
                  transform: "translateX(-50%) translateY(-50%)",
                  pointerEvents: "none",
                  zIndex: 20,
                }}
              >
                <div
                  className={cn(
                    "flex items-center px-2 py-[3px] rounded text-[10px] font-mono",
                    "border border-white/10 shadow backdrop-blur-sm whitespace-nowrap",
                    line.pillBg,
                    line.textColor,
                    "opacity-70",
                  )}
                >
                  {line.pnlLabel}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
