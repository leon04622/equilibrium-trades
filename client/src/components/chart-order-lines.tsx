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
  // Frozen scale captured at drag-start so price↔visual always use same coords.
  // Container bounds are NOT frozen — they are read live in onMove so that
  // any layout shift (toast notification, scroll) doesn't drift the mapping.
  rMin: number;
  rMax: number;
}

export function ChartOrderLines({ coin, currentPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  // Always-present capture layer — toggled synchronously via ref (no React re-render)
  // This prevents the TradingView iframe from stealing mouse events between
  // mousedown and the next React render tick.
  const fixedCaptureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Always-current price ref so the submitted price is never stale
  const dragPriceRef = useRef(0);

  const [dragging, setDragging] = useState(false);
  const [dragPrice, setDragPrice] = useState(0);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [dragInvalid, setDragInvalid] = useState(false);
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

  // Build the visible price scale. Returns toY (price→%) and fromY (%→price).
  // This is the SINGLE source of truth for visual↔price mapping.
  const { toY, fromY, rMin, rMax } = useMemo(() => {
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

    const toY = (price: number) => ((rMax - price) / (rMax - rMin)) * 100;
    const fromY = (yPct: number) => rMax - (rMax - rMin) * (yPct / 100);

    return { toY, fromY, rMin, rMax };
  }, [currentPrice, position, activeTpPrice, activeSlPrice, ghostTpPrice, ghostSlPrice]);

  const displayTpPrice = dragging && dragTarget === "tp" ? dragPrice : (activeTpPrice ?? ghostTpPrice);
  const displaySlPrice = dragging && dragTarget === "sl" ? dragPrice : (activeSlPrice ?? ghostSlPrice);

  const startDrag = useCallback((e: React.MouseEvent, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    // ── CRITICAL: activate the capture layer SYNCHRONOUSLY before React re-renders ──
    // Without this, there is a timing gap between mousedown and the next render tick
    // during which the TradingView iframe grabs all subsequent mouse events.
    if (fixedCaptureRef.current) {
      fixedCaptureRef.current.style.pointerEvents = "all";
    }

    const startPrice = target === "tp"
      ? (activeTpPrice ?? ghostTpPrice ?? currentPrice * 1.02)
      : (activeSlPrice ?? ghostSlPrice ?? currentPrice * 0.98);

    // Only freeze the price scale — container bounds are read live in onMove
    // so layout shifts (toasts, scrolls) don't drift the price mapping.
    dragRef.current = { target, rMin, rMax };
    dragPriceRef.current = startPrice;
    setDragTarget(target);
    setDragPrice(startPrice);
    setDragInvalid(false);
    setDragging(true);
  }, [activeTpPrice, ghostTpPrice, activeSlPrice, ghostSlPrice, currentPrice, rMin, rMax]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const state = dragRef.current;
      const container = containerRef.current;
      if (!state || !container) return;

      // Read bounds live so the mapping stays accurate after any layout shift
      const rect = container.getBoundingClientRect();
      const yPct = Math.max(0, Math.min(100,
        ((e.clientY - rect.top) / rect.height) * 100
      ));

      const newPrice = Math.max(state.rMin, Math.min(state.rMax,
        state.rMax - (state.rMax - state.rMin) * (yPct / 100)
      ));

      // Validate against entry boundary — TP must be on the profit side, SL on loss side
      const invalid = state.target === "tp"
        ? (isLong ? newPrice <= entry : newPrice >= entry)
        : (isLong ? newPrice >= entry : newPrice <= entry);

      setDragInvalid(invalid);
      dragPriceRef.current = newPrice;
      setDragPrice(newPrice);
    };

    const onUp = async () => {
      // Release the capture layer immediately and synchronously
      if (fixedCaptureRef.current) {
        fixedCaptureRef.current.style.pointerEvents = "none";
      }

      const state = dragRef.current;
      if (!position || !state) {
        setDragging(false);
        setDragTarget(null);
        setDragInvalid(false);
        return;
      }
      const target = state.target;
      const finalPrice = dragPriceRef.current;
      dragRef.current = null;
      setDragging(false);
      setDragTarget(null);
      setDragInvalid(false);

      // Final validation — reject if the drop lands in the wrong zone
      const invalid = target === "tp"
        ? (isLong ? finalPrice <= entry : finalPrice >= entry)
        : (isLong ? finalPrice >= entry : finalPrice <= entry);

      if (invalid) {
        toast({
          title: "Invalid price",
          description: target === "tp"
            ? `Take Profit must be ${isLong ? "above" : "below"} entry ($${fmt(entry)})`
            : `Stop Loss must be ${isLong ? "below" : "above"} entry ($${fmt(entry)})`,
          variant: "destructive",
        });
        return;
      }

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
        ? { title: `${target === "tp" ? "Take Profit" : "Stop Loss"} set at $${fmt(finalPrice)}` }
        : { title: "Failed to set order", description: result.error, variant: "destructive" });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, position, activeTpPrice, activeSlPrice, coin, placeTPSL, toast, isLong, entry]);

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
    const visualY = toY(displayTpPrice);
    const invalid = isDraggingThis && dragInvalid;

    lines.push({
      key: "tp",
      price: displayTpPrice,
      visualY,
      label: isGhost
        ? `Drag to set TP  ${fmt(displayTpPrice)}`
        : `TP Price ${isLong ? ">" : "<"} ${fmt(displayTpPrice)}`,
      pnlLabel: isGhost ? undefined : fmtPnl(calcPnl(displayTpPrice)),
      sizeLabel: isGhost ? undefined : fmt(size),
      lineColor: invalid ? "#f97316" : "#22c55e",
      pillBg: invalid ? "bg-orange-500/20" : "bg-[#22c55e]/20",
      textColor: invalid ? "text-orange-400" : "text-[#22c55e]",
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
    const visualY = toY(displaySlPrice);
    const invalid = isDraggingThis && dragInvalid;

    lines.push({
      key: "sl",
      price: displaySlPrice,
      visualY,
      label: isGhost
        ? `Drag to set SL  ${fmt(displaySlPrice)}`
        : `SL Price ${isLong ? "<" : ">"} ${fmt(displaySlPrice)}`,
      pnlLabel: isGhost ? undefined : fmtPnl(calcPnl(displaySlPrice)),
      sizeLabel: isGhost ? undefined : fmt(size),
      lineColor: invalid ? "#f97316" : "#ef4444",
      pillBg: invalid ? "bg-orange-500/20" : "bg-[#ef4444]/20",
      textColor: invalid ? "text-orange-400" : "text-[#ef4444]",
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
      {/* Always-present capture layer — pointer events activated synchronously
          in startDrag() and deactivated in onUp() via fixedCaptureRef.
          This eliminates the React render-cycle timing gap that previously allowed
          the TradingView iframe to steal mouse events during drag. */}
      <div
        ref={fixedCaptureRef}
        className="fixed inset-0 z-[999] cursor-ns-resize"
        style={{ pointerEvents: "none" }}
      />

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
              {/* Full-width invisible hit strip — lets users grab anywhere on the line.
                  Subtle hover background provides visual affordance that the strip is draggable. */}
              {line.draggable && line.draggableAs && (
                <div
                  className="absolute left-0 right-0 cursor-ns-resize hover:bg-white/5 transition-colors"
                  style={{ height: "28px", top: "-14px", pointerEvents: "auto", zIndex: 25 }}
                  onMouseDown={(e) => startDrag(e, line.draggableAs!)}
                  title="Drag to move"
                  data-testid={`drag-line-${line.key}`}
                />
              )}

              {/* Horizontal line */}
              <div
                className="absolute left-0 right-0 transition-opacity"
                style={{
                  borderTop: `${line.dashed ? "1.5px dashed" : "2px solid"} ${line.lineColor}`,
                  opacity: line.ghost ? 0.7 : isDraggingThis ? 1 : 0.9,
                }}
              />

              {/* Left label — Hyperliquid style: type + price + size + cancel */}
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
                    line.ghost && "opacity-80",
                    line.draggable && "cursor-ns-resize",
                  )}
                >
                  <span>{line.label}</span>
                  {line.sizeLabel && (
                    <span className="opacity-55 text-[10px]">{line.sizeLabel}</span>
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

              {/* PNL badge — centred on the line */}
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

              {/* Right-edge price box */}
              <div
                className={cn(
                  "absolute right-0 px-1.5 py-[3px] text-[10px] font-mono font-semibold rounded-l",
                  "border-l border-t border-b border-white/15",
                  line.ghost ? "opacity-55" : "opacity-95",
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
