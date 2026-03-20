import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${abs.toFixed(2)}`;
}

type DragTarget = "tp" | "sl";

interface DragState {
  target: DragTarget;
  startY: number;
  startPrice: number;
}

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const currentPriceRef = useRef(currentPrice);
  useEffect(() => { currentPriceRef.current = currentPrice; }, [currentPrice]);

  const [dragging, setDragging] = useState(false);
  const [dragPrice, setDragPrice] = useState(0);
  const [dragCursorY, setDragCursorY] = useState(50);
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

  const isLong = position?.side === "long";
  const entry = position?.entryPrice ?? 0;

  const ghostTpPrice = position && !activeTpPrice
    ? isLong ? entry * 1.02 : entry * 0.98
    : null;
  const ghostSlPrice = position && !activeSlPrice
    ? isLong ? entry * 0.98 : entry * 1.02
    : null;

  const { toY } = useMemo(() => {
    const allPrices = [
      currentPrice,
      position?.entryPrice,
      activeTpPrice ?? ghostTpPrice,
      activeSlPrice ?? ghostSlPrice,
      position?.liquidationPrice,
    ].filter((p): p is number => typeof p === "number" && p > 0);

    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const span = maxP - minP || currentPrice * 0.04;
    const pad = span * 0.40;
    const rMin = minP - pad;
    const rMax = maxP + pad;

    return { toY: (price: number) => ((rMax - price) / (rMax - rMin)) * 100 };
  }, [currentPrice, position, activeTpPrice, activeSlPrice, ghostTpPrice, ghostSlPrice]);

  const displayTpPrice = dragging && dragTarget === "tp" ? dragPrice : (activeTpPrice ?? ghostTpPrice);
  const displaySlPrice = dragging && dragTarget === "sl" ? dragPrice : (activeSlPrice ?? ghostSlPrice);

  const startDrag = useCallback((e: React.MouseEvent, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const startPrice = target === "tp"
      ? (activeTpPrice ?? ghostTpPrice ?? currentPrice * 1.02)
      : (activeSlPrice ?? ghostSlPrice ?? currentPrice * 0.98);

    const rect = container.getBoundingClientRect();
    const startCursorY = ((e.clientY - rect.top) / rect.height) * 100;

    dragRef.current = { target, startY: e.clientY, startPrice };
    setDragTarget(target);
    setDragPrice(startPrice);
    setDragCursorY(Math.max(0, Math.min(100, startCursorY)));
    setDragging(true);
  }, [activeTpPrice, ghostTpPrice, activeSlPrice, ghostSlPrice, currentPrice]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const container = containerRef.current;

      if (container) {
        const rect = container.getBoundingClientRect();
        const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setDragCursorY(yPct);
      }

      const { startY, startPrice } = dragRef.current;
      const deltaY = e.clientY - startY;
      const sensitivity = currentPriceRef.current * 0.0002;
      const newPrice = Math.max(1, startPrice - deltaY * sensitivity);
      setDragPrice(newPrice);
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

  const size = position.size;
  const calcPnl = (p: number) => isLong ? size * (p - entry) : size * (entry - p);

  interface LineConfig {
    key: string;
    price: number;
    visualY: number;
    label: string;
    pnlLabel?: string;
    sizeLabel?: string;
    lineColor: string;
    pillBg: string;
    textColor: string;
    dashed: boolean;
    ghost: boolean;
    draggable: boolean;
    draggableAs?: DragTarget;
    canCancel: boolean;
    cancelType?: DragTarget;
  }

  const lines: LineConfig[] = [];

  if (displayTpPrice && displayTpPrice > 0) {
    const isDraggingThis = dragging && dragTarget === "tp";
    const isGhost = !activeTpPrice && !isDraggingThis;
    const visualY = isDraggingThis ? dragCursorY : toY(displayTpPrice);

    lines.push({
      key: "tp",
      price: displayTpPrice,
      visualY,
      label: isGhost
        ? `Drag to set TP  ${fmt(displayTpPrice)}`
        : `TP Price ${isLong ? ">" : "<"} ${fmt(displayTpPrice)}`,
      pnlLabel: isGhost ? undefined : fmtPnl(calcPnl(displayTpPrice)),
      sizeLabel: isGhost ? undefined : fmt(size),
      lineColor: isDraggingThis ? "#22c55e" : "#22c55e",
      pillBg: "bg-[#22c55e]/20",
      textColor: "text-[#22c55e]",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      draggableAs: "tp",
      canCancel: !!activeTpPrice && !isDraggingThis,
      cancelType: "tp",
    });
  }

  {
    const y = toY(entry);
    const pnlAtCurrent = calcPnl(currentPrice);
    lines.push({
      key: "entry",
      price: entry,
      visualY: y,
      label: `Entry  ${fmt(entry)}`,
      pnlLabel: `PNL ${fmtPnl(pnlAtCurrent)}`,
      sizeLabel: fmt(size),
      lineColor: "rgba(255,255,255,0.45)",
      pillBg: "bg-white/10",
      textColor: "text-white/80",
      dashed: true,
      ghost: false,
      draggable: false,
      canCancel: false,
    });
  }

  if (displaySlPrice && displaySlPrice > 0) {
    const isDraggingThis = dragging && dragTarget === "sl";
    const isGhost = !activeSlPrice && !isDraggingThis;
    const visualY = isDraggingThis ? dragCursorY : toY(displaySlPrice);

    lines.push({
      key: "sl",
      price: displaySlPrice,
      visualY,
      label: isGhost
        ? `Drag to set SL  ${fmt(displaySlPrice)}`
        : `SL Price ${isLong ? "<" : ">"} ${fmt(displaySlPrice)}`,
      pnlLabel: isGhost ? undefined : fmtPnl(calcPnl(displaySlPrice)),
      sizeLabel: isGhost ? undefined : fmt(size),
      lineColor: isDraggingThis ? "#ef4444" : "#ef4444",
      pillBg: "bg-[#ef4444]/20",
      textColor: "text-[#ef4444]",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      draggableAs: "sl",
      canCancel: !!activeSlPrice && !isDraggingThis,
      cancelType: "sl",
    });
  }

  if (position.liquidationPrice && position.liquidationPrice > 0) {
    const y = toY(position.liquidationPrice);
    lines.push({
      key: "liq",
      price: position.liquidationPrice,
      visualY: y,
      label: `Liq. Price  ${fmt(position.liquidationPrice)}`,
      lineColor: "#f97316",
      pillBg: "bg-orange-500/20",
      textColor: "text-orange-400",
      dashed: true,
      ghost: false,
      draggable: false,
      canCancel: false,
    });
  }

  return (
    <>
      {dragging && (
        <div className="fixed inset-0 z-[999] cursor-ns-resize" style={{ pointerEvents: "all" }} />
      )}

      <div
        ref={containerRef}
        className="absolute inset-0 z-10 overflow-hidden"
        style={{ pointerEvents: "none" }}
        data-testid="chart-order-lines"
      >
        {lines.map(line => {
          const y = line.visualY;
          if (y < -15 || y > 115) return null;

          const isDraggingThis = dragging && dragTarget === line.draggableAs;

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
              {/* Full-width draggable hit area (12px tall) */}
              {line.draggable && line.draggableAs && (
                <div
                  className="absolute left-0 right-0 cursor-ns-resize"
                  style={{
                    height: "24px",
                    top: "-12px",
                    pointerEvents: "auto",
                    zIndex: 25,
                  }}
                  onMouseDown={(e) => startDrag(e, line.draggableAs!)}
                  data-testid={`drag-line-${line.key}`}
                />
              )}

              {/* Horizontal line */}
              <div
                className="absolute left-0 right-0"
                style={{
                  borderTop: `${line.dashed ? "1.5px dashed" : "1.5px solid"} ${line.lineColor}`,
                  opacity: line.ghost ? 0.45 : isDraggingThis ? 1 : 0.85,
                }}
              />

              {/* Left-anchored label pill — Hyperliquid style */}
              <div
                className="absolute left-2"
                style={{
                  transform: "translateY(-50%)",
                  pointerEvents: line.draggable ? "auto" : "none",
                  zIndex: 30,
                }}
                onMouseDown={line.draggable && line.draggableAs
                  ? (e) => startDrag(e, line.draggableAs!)
                  : undefined}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-[3px] rounded text-[11px] font-mono font-semibold",
                    "border border-white/15 shadow-lg select-none whitespace-nowrap backdrop-blur-sm",
                    line.pillBg,
                    line.textColor,
                    line.ghost && "opacity-60",
                    line.draggable && "cursor-ns-resize",
                  )}
                >
                  <span>{line.label}</span>
                  {line.sizeLabel && (
                    <span className="opacity-60 text-[10px]">{line.sizeLabel}</span>
                  )}
                  {line.canCancel && (
                    <button
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      style={{ pointerEvents: "auto" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => line.cancelType && handleCancel(line.cancelType)}
                      data-testid={`cancel-${line.key}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* PNL label — positioned slightly right of center */}
              {line.pnlLabel && !line.ghost && (
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
                      "flex items-center gap-1.5 px-2 py-[3px] rounded text-[10px] font-mono",
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

              {/* Right-edge price tag */}
              <div
                className={cn(
                  "absolute right-0 px-1.5 py-[3px] text-[10px] font-mono font-semibold rounded-l",
                  "border-l border-t border-b border-white/15",
                  line.ghost ? "opacity-35" : "opacity-90",
                )}
                style={{
                  pointerEvents: "none",
                  background: line.lineColor,
                  color: "#fff",
                  zIndex: 20,
                }}
              >
                {fmt(line.price)}
              </div>
            </div>
          );
        })}

        {/* Current price marker */}
        {(() => {
          const y = toY(currentPrice);
          if (y < -15 || y > 115) return null;
          return (
            <div
              className="absolute left-0 right-0"
              style={{ top: `${y}%`, transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <div className="absolute left-0 right-0" style={{ borderTop: "1px dashed rgba(255,255,255,0.2)" }} />
              <div className="absolute right-0 bg-foreground/80 text-background px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-l">
                {fmt(currentPrice)}
              </div>
            </div>
          );
        })()}

        {isPlacing && (
          <div
            className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border"
            style={{ pointerEvents: "none" }}
          >
            Placing…
          </div>
        )}
      </div>
    </>
  );
}
