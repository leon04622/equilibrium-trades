import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, GripHorizontal } from "lucide-react";

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
  return `${sign}$${abs.toFixed(2)}`;
}

type DragTarget = "tp" | "sl";

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    target: DragTarget;
    startY: number;
    startPrice: number;
  } | null>(null);

  const [dragging, setDragging] = useState(false);
  const [dragPrice, setDragPrice] = useState(0);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const position = useMemo(() => positions.find(p => p.coin === coin), [positions, coin]);

  const getOrderType = useCallback((order: any): "tp" | "sl" | "other" => {
    if (!position) return "other";
    if (order.orderType === "stop_loss") return "sl";
    if (order.orderType === "take_profit") return "tp";
    const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
    return position.side === "long"
      ? triggerPrice > position.entryPrice ? "tp" : "sl"
      : triggerPrice < position.entryPrice ? "tp" : "sl";
  }, [position]);

  const coinOrders = useMemo(() => openOrders.filter(o => o.coin === coin), [openOrders, coin]);
  const tpOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "tp"), [coinOrders, getOrderType]);
  const slOrder = useMemo(() => coinOrders.find(o => getOrderType(o) === "sl"), [coinOrders, getOrderType]);

  const activeTpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const activeSlPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

  // Ghost prices when no order exists yet (±2% from entry)
  const ghostTpPrice = position && !activeTpPrice
    ? position.side === "long"
      ? position.entryPrice * 1.02
      : position.entryPrice * 0.98
    : null;
  const ghostSlPrice = position && !activeSlPrice
    ? position.side === "long"
      ? position.entryPrice * 0.98
      : position.entryPrice * 1.02
    : null;

  // The displayed prices (drag overrides active/ghost)
  const displayTpPrice = dragging && dragTarget === "tp" ? dragPrice : (activeTpPrice ?? ghostTpPrice);
  const displaySlPrice = dragging && dragTarget === "sl" ? dragPrice : (activeSlPrice ?? ghostSlPrice);

  // Auto-compute visible range to include all relevant prices
  const { rangeMin, rangeMax, toY, toPrice } = useMemo(() => {
    const allPrices = [
      currentPrice,
      position?.entryPrice,
      displayTpPrice,
      displaySlPrice,
      position?.liquidationPrice,
    ].filter((p): p is number => typeof p === "number" && p > 0);

    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const span = maxP - minP || currentPrice * 0.04;
    const pad = span * 0.35;
    const rangeMin = minP - pad;
    const rangeMax = maxP + pad;

    const toY = (price: number) => ((rangeMax - price) / (rangeMax - rangeMin)) * 100;
    const toPrice = (yPct: number) => rangeMax - yPct * (rangeMax - rangeMin) / 100;

    return { rangeMin, rangeMax, toY, toPrice };
  }, [currentPrice, position, displayTpPrice, displaySlPrice]);

  // ── Drag logic ──────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const startPrice = toPrice(yPct);

    dragRef.current = { target, startY: e.clientY, startPrice };
    setDragTarget(target);
    setDragPrice(startPrice);
    setDragging(true);
  }, [toPrice]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !dragRef.current) return;
      const rect = container.getBoundingClientRect();
      const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      setDragPrice(toPrice(yPct));
    };

    const onUp = async () => {
      if (!position || !dragRef.current) {
        setDragging(false);
        setDragTarget(null);
        return;
      }
      const target = dragRef.current.target;
      const finalPrice = dragPrice;
      dragRef.current = null;
      setDragging(false);
      setDragTarget(null);
      setIsPlacing(true);

      const currentTp = target === "tp" ? finalPrice : (activeTpPrice ?? 0);
      const currentSl = target === "sl" ? finalPrice : (activeSlPrice ?? 0);

      const result = await placeTPSL(
        coin,
        position.size,
        position.side === "long",
        currentTp > 0 ? currentTp : undefined,
        currentSl > 0 ? currentSl : undefined,
      );

      setIsPlacing(false);
      toast(result.success
        ? { title: `${target === "tp" ? "Take Profit" : "Stop Loss"} set at ${fmt(finalPrice)}` }
        : { title: "Failed to set order", description: result.error, variant: "destructive" });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, dragPrice, position, activeTpPrice, activeSlPrice, coin, placeTPSL, toast]);

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
  const calcPnl = (p: number) => isLong ? size * (p - entry) : size * (entry - p);
  const unrealizedPnl = position.unrealizedPnl;
  const pnlPositive = unrealizedPnl >= 0;

  // ── Line definitions ────────────────────────────────────────────
  interface LineConfig {
    key: DragTarget | "entry" | "liq" | "current";
    price: number;
    label: string;
    sublabel?: string;
    lineColor: string;
    pillBg: string;
    dashed: boolean;
    ghost: boolean;
    draggable: boolean;
    canCancel: boolean;
    cancelType?: DragTarget;
  }

  const lines: LineConfig[] = [];

  // Take Profit
  if (displayTpPrice && displayTpPrice > 0) {
    const isGhost = !activeTpPrice && dragTarget !== "tp";
    const isDraggingThis = dragging && dragTarget === "tp";
    lines.push({
      key: "tp",
      price: displayTpPrice,
      label: isGhost ? `Drag to set TP  ${fmt(displayTpPrice)}` : `TP ${isLong ? ">" : "<"} ${fmt(displayTpPrice)}`,
      sublabel: isGhost ? undefined : `${fmtPnl(calcPnl(displayTpPrice))}`,
      lineColor: isDraggingThis ? "#22c55e" : "hsl(var(--bullish))",
      pillBg: "bg-bullish",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      canCancel: !!activeTpPrice && !isDraggingThis,
      cancelType: "tp",
    });
  }

  // Entry
  {
    const y = toY(entry);
    if (y >= -10 && y <= 110) {
      lines.push({
        key: "entry",
        price: entry,
        label: `Entry  ${fmt(entry)}`,
        sublabel: `${isLong ? "Long" : "Short"} ${fmt(size)} ${coin}`,
        lineColor: "rgba(255,255,255,0.45)",
        pillBg: "bg-muted-foreground/70",
        dashed: true,
        ghost: false,
        draggable: false,
        canCancel: false,
      });
    }
  }

  // Stop Loss
  if (displaySlPrice && displaySlPrice > 0) {
    const isGhost = !activeSlPrice && dragTarget !== "sl";
    const isDraggingThis = dragging && dragTarget === "sl";
    lines.push({
      key: "sl",
      price: displaySlPrice,
      label: isGhost ? `Drag to set SL  ${fmt(displaySlPrice)}` : `SL ${isLong ? "<" : ">"} ${fmt(displaySlPrice)}`,
      sublabel: isGhost ? undefined : `${fmtPnl(calcPnl(displaySlPrice))}`,
      lineColor: isDraggingThis ? "#ef4444" : "hsl(var(--bearish))",
      pillBg: "bg-bearish",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      canCancel: !!activeSlPrice && !isDraggingThis,
      cancelType: "sl",
    });
  }

  // Liquidation
  if (position.liquidationPrice && position.liquidationPrice > 0) {
    const y = toY(position.liquidationPrice);
    if (y >= -10 && y <= 110) {
      lines.push({
        key: "liq",
        price: position.liquidationPrice,
        label: `Liq.  ${fmt(position.liquidationPrice)}`,
        lineColor: "hsl(30 100% 55%)",
        pillBg: "bg-orange-500",
        dashed: true,
        ghost: false,
        draggable: false,
        canCancel: false,
      });
    }
  }

  return (
    <>
      {/* Drag capture overlay — blocks iframe from stealing pointer events during drag */}
      {dragging && (
        <div
          className="fixed inset-0 z-50 cursor-ns-resize"
          style={{ pointerEvents: "all" }}
        />
      )}

      <div
        ref={containerRef}
        className="absolute inset-0 z-10 overflow-hidden"
        style={{ pointerEvents: "none" }}
        data-testid="chart-order-lines"
      >
        {/* Lines */}
        {lines.map(line => {
          const y = toY(line.price);
          if (y < -15 || y > 115) return null;

          return (
            <div
              key={line.key}
              className="absolute left-0 right-0"
              style={{
                top: `${y}%`,
                transform: "translateY(-50%)",
                zIndex: line.draggable ? 20 : 10,
                pointerEvents: "none",
              }}
            >
              {/* The line itself */}
              <div
                className="absolute left-0 right-0"
                style={{
                  borderTop: `${line.dashed ? "1.5px dashed" : "1.5px solid"} ${line.lineColor}`,
                  opacity: line.ghost ? 0.5 : 0.8,
                }}
              />

              {/* Center label pill */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ pointerEvents: line.draggable ? "auto" : "none" }}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[11px] font-mono font-semibold",
                    "border border-white/20 shadow-lg select-none",
                    line.pillBg,
                    line.ghost && "opacity-60",
                    line.draggable && "cursor-ns-resize",
                  )}
                  onMouseDown={line.draggable
                    ? (e) => startDrag(e, line.key as DragTarget)
                    : undefined}
                >
                  {line.draggable && (
                    <GripHorizontal className="h-3 w-3 opacity-70 flex-shrink-0" />
                  )}
                  <span>{line.label}</span>
                  {line.sublabel && (
                    <span className="opacity-75 text-[10px]">{line.sublabel}</span>
                  )}
                  {line.canCancel && (
                    <button
                      className="opacity-70 hover:opacity-100 transition-opacity ml-0.5"
                      style={{ pointerEvents: "auto" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => line.cancelType && handleCancel(line.cancelType)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right-edge price tag */}
              <div
                className={cn(
                  "absolute right-0 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white rounded-l pointer-events-none",
                  line.pillBg,
                  line.ghost && "opacity-40",
                )}
              >
                {fmt(line.price)}
              </div>
            </div>
          );
        })}

        {/* Current price line */}
        {(() => {
          const y = toY(currentPrice);
          if (y < -15 || y > 115) return null;
          return (
            <div
              className="absolute left-0 right-0"
              style={{ top: `${y}%`, transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <div
                className="absolute left-0 right-0"
                style={{ borderTop: "1px dashed rgba(255,255,255,0.25)" }}
              />
              <div className="absolute right-0 bg-foreground/80 text-background px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-l">
                {fmt(currentPrice)}
              </div>
            </div>
          );
        })()}

        {/* P&L badge */}
        <div className="absolute top-2 left-2" style={{ pointerEvents: "none" }}>
          <div className={cn(
            "text-[11px] font-mono font-semibold px-2 py-0.5 rounded border",
            pnlPositive
              ? "bg-bullish/20 border-bullish/40 text-bullish"
              : "bg-bearish/20 border-bearish/40 text-bearish"
          )}>
            PNL {fmtPnl(unrealizedPnl)}
          </div>
        </div>

        {/* Placing indicator */}
        {isPlacing && (
          <div className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border">
            Placing…
          </div>
        )}
      </div>
    </>
  );
}
