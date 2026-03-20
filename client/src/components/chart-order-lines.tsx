import { useMemo } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { useCallback } from "react";

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

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  const position = useMemo(() => positions.find(p => p.coin === coin), [positions, coin]);

  const getOrderType = useCallback((order: any): "tp" | "sl" | "other" => {
    if (!position) return "other";
    if (order.orderType === "take_profit" || order.orderType === "Take Profit Market") return "tp";
    if (order.orderType === "stop_loss" || order.orderType === "Stop Market") return "sl";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    if (!triggerPrice || isNaN(triggerPrice)) return "other";
    return position.side === "long"
      ? triggerPrice > currentPrice ? "tp" : "sl"
      : triggerPrice < currentPrice ? "tp" : "sl";
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

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden pointer-events-none"
      data-testid="chart-order-lines"
    >
      {/* ── Top bar: Take Profit ──────────────────────────────────── */}
      {tpPrice && tpPrice > 0 && (
        <div className="absolute top-2 left-2 pointer-events-auto" data-testid="tp-badge">
          <div className="flex items-center gap-1.5 bg-[#22c55e]/15 border border-[#22c55e]/40 rounded px-2.5 py-1 shadow-lg backdrop-blur-sm">
            <span className="text-[11px] font-mono font-semibold text-[#22c55e]">
              TP  ${fmt(tpPrice)}
            </span>
            <span className="text-[10px] font-mono text-[#22c55e]/60">
              {fmt(size)}
            </span>
            {tpOrder && (
              <button
                className="text-[#22c55e]/60 hover:text-[#22c55e] transition-colors ml-0.5"
                onClick={() => handleCancel("tp")}
                data-testid="cancel-tp"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Middle left: Entry + PNL ──────────────────────────────── */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" data-testid="entry-badge">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 bg-white/8 border border-white/15 rounded px-2.5 py-1 shadow backdrop-blur-sm">
            {isLong
              ? <TrendingUp className="h-3 w-3 text-white/60" />
              : <TrendingDown className="h-3 w-3 text-white/60" />
            }
            <span className="text-[11px] font-mono font-semibold text-white/80">
              Entry  ${fmt(entry)}
            </span>
            <span className="text-[10px] font-mono text-white/50">{fmt(size)}</span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-0.5 shadow backdrop-blur-sm border",
            pnlPositive
              ? "bg-[#22c55e]/10 border-[#22c55e]/25 text-[#22c55e]"
              : "bg-[#ef4444]/10 border-[#ef4444]/25 text-[#ef4444]"
          )}>
            <span className="text-[10px] font-mono font-semibold">
              PNL {fmtPnl(unrealizedPnl)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom bar: Stop Loss ─────────────────────────────────── */}
      {slPrice && slPrice > 0 && (
        <div className="absolute bottom-2 left-2 pointer-events-auto" data-testid="sl-badge">
          <div className="flex items-center gap-1.5 bg-[#ef4444]/15 border border-[#ef4444]/40 rounded px-2.5 py-1 shadow-lg backdrop-blur-sm">
            <span className="text-[11px] font-mono font-semibold text-[#ef4444]">
              SL  ${fmt(slPrice)}
            </span>
            <span className="text-[10px] font-mono text-[#ef4444]/60">
              {fmt(size)}
            </span>
            {slOrder && (
              <button
                className="text-[#ef4444]/60 hover:text-[#ef4444] transition-colors ml-0.5"
                onClick={() => handleCancel("sl")}
                data-testid="cancel-sl"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Top-right: Liq price warning ─────────────────────────── */}
      {position.liquidationPrice && position.liquidationPrice > 0 && (
        <div className="absolute top-2 right-2 pointer-events-none" data-testid="liq-badge">
          <div className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 rounded px-2.5 py-1 shadow backdrop-blur-sm">
            <span className="text-[11px] font-mono font-semibold text-orange-400">
              Liq  ${fmt(position.liquidationPrice)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
