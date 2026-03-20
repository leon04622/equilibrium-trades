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
  // Always-current price ref so event handlers never use a stale value
  const currentPriceRef = useRef(currentPrice);
  useEffect(() => { currentPriceRef.current = currentPrice; }, [currentPrice]);

  const [dragging, setDragging] = useState(false);
  const [dragPrice, setDragPrice] = useState(0);
  // Y% of cursor inside the container (0=top, 100=bottom) for visual line tracking
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

  // Ghost prices when no real order exists
  const ghostTpPrice = position && !activeTpPrice
    ? isLong ? entry * 1.02 : entry * 0.98
    : null;
  const ghostSlPrice = position && !activeSlPrice
    ? isLong ? entry * 0.98 : entry * 1.02
    : null;

  // ── NARROW visual range: only real/ghost prices so all lines are visible and
  // correctly spaced relative to each other regardless of chart zoom level.
  // Does NOT try to match TradingView's Y-axis (impossible with a cross-origin iframe).
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

  // Displayed prices: drag overrides when actively dragging that target
  const displayTpPrice = dragging && dragTarget === "tp" ? dragPrice : (activeTpPrice ?? ghostTpPrice);
  const displaySlPrice = dragging && dragTarget === "sl" ? dragPrice : (activeSlPrice ?? ghostSlPrice);

  // ── DELTA-BASED drag — works at any chart zoom level ────────────────────
  // Instead of mapping Y-position to absolute price (breaks when TradingView is
  // zoomed in), we move relative to the drag start price.
  // Up = higher price, down = lower price.
  // Sensitivity: 0.0001 of currentPrice per pixel → 100px ≈ 1% price change.
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

      // Update cursor Y for visual line tracking
      if (container) {
        const rect = container.getBoundingClientRect();
        const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setDragCursorY(yPct);
      }

      // Delta-based price: moving up increases price, down decreases
      const { startY, startPrice } = dragRef.current;
      const deltaY = e.clientY - startY; // positive = down = lower price
      const sensitivity = currentPriceRef.current * 0.0002; // price per pixel
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

  // ── Line definitions ────────────────────────────────────────────
  interface LineConfig {
    key: string;
    price: number;
    visualY: number; // 0–100% from top
    label: string;
    sublabel?: string;
    lineColor: string;
    pillBg: string;
    dashed: boolean;
    ghost: boolean;
    draggable: boolean;
    draggableAs?: DragTarget;
    canCancel: boolean;
    cancelType?: DragTarget;
  }

  const lines: LineConfig[] = [];

  // Take Profit
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
        : `TP ${isLong ? ">" : "<"} ${fmt(displayTpPrice)}`,
      sublabel: isGhost ? undefined : fmtPnl(calcPnl(displayTpPrice)),
      lineColor: isDraggingThis ? "#22c55e" : "hsl(var(--bullish))",
      pillBg: "bg-bullish",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      draggableAs: "tp",
      canCancel: !!activeTpPrice && !isDraggingThis,
      cancelType: "tp",
    });
  }

  // Entry
  {
    const y = toY(entry);
    lines.push({
      key: "entry",
      price: entry,
      visualY: y,
      label: `Entry  ${fmt(entry)}`,
      sublabel: `${isLong ? "Long" : "Short"} ${fmt(size)} ${coin}`,
      lineColor: "rgba(255,255,255,0.4)",
      pillBg: "bg-muted-foreground/60",
      dashed: true,
      ghost: false,
      draggable: false,
      canCancel: false,
    });
  }

  // Stop Loss
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
        : `SL ${isLong ? "<" : ">"} ${fmt(displaySlPrice)}`,
      sublabel: isGhost ? undefined : fmtPnl(calcPnl(displaySlPrice)),
      lineColor: isDraggingThis ? "#ef4444" : "hsl(var(--bearish))",
      pillBg: "bg-bearish",
      dashed: isGhost,
      ghost: isGhost,
      draggable: true,
      draggableAs: "sl",
      canCancel: !!activeSlPrice && !isDraggingThis,
      cancelType: "sl",
    });
  }

  // Liquidation
  if (position.liquidationPrice && position.liquidationPrice > 0) {
    const y = toY(position.liquidationPrice);
    lines.push({
      key: "liq",
      price: position.liquidationPrice,
      visualY: y,
      label: `Liq.  ${fmt(position.liquidationPrice)}`,
      lineColor: "hsl(30 100% 55%)",
      pillBg: "bg-orange-500",
      dashed: true,
      ghost: false,
      draggable: false,
      canCancel: false,
    });
  }

  return (
    <>
      {/* Capture overlay — prevents iframe from stealing mouse during drag */}
      {dragging && (
        <div className="fixed inset-0 z-[999] cursor-ns-resize" style={{ pointerEvents: "all" }} />
      )}

      <div
        ref={containerRef}
        className="absolute inset-0 z-10 overflow-hidden"
        style={{ pointerEvents: "none" }}
        data-testid="chart-order-lines"
      >
        {/* Price lines */}
        {lines.map(line => {
          const y = line.visualY;
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
              {/* Horizontal line */}
              <div
                className="absolute left-0 right-0"
                style={{
                  borderTop: `${line.dashed ? "1.5px dashed" : "1.5px solid"} ${line.lineColor}`,
                  opacity: line.ghost ? 0.5 : 0.85,
                }}
              />

              {/* Center pill label */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ pointerEvents: line.draggable ? "auto" : "none" }}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[11px] font-mono font-semibold",
                    "border border-white/20 shadow-lg select-none whitespace-nowrap",
                    line.pillBg,
                    line.ghost && "opacity-60",
                    line.draggable && "cursor-ns-resize",
                  )}
                  onMouseDown={line.draggable && line.draggableAs
                    ? (e) => startDrag(e, line.draggableAs!)
                    : undefined}
                >
                  {line.draggable && <GripHorizontal className="h-3 w-3 opacity-70 flex-shrink-0" />}
                  <span>{line.label}</span>
                  {line.sublabel && <span className="opacity-75 text-[10px]">{line.sublabel}</span>}
                  {line.canCancel && (
                    <button
                      className="opacity-70 hover:opacity-100 ml-0.5"
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
                  "absolute right-0 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white rounded-l",
                  line.pillBg,
                  line.ghost ? "opacity-40" : "opacity-90",
                )}
                style={{ pointerEvents: "none" }}
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
