import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTrading } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X, Pencil, Check } from "lucide-react";

interface ChartOrderLinesProps {
  coin: string;
  currentPrice: number;
  visiblePriceRange?: { min: number; max: number } | null;
  coordinateToPrice?: (clientY: number) => number | null;
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

export function ChartOrderLines({ coin, currentPrice, visiblePriceRange, coordinateToPrice }: ChartOrderLinesProps) {
  const { positions, openOrders, cancelHLOrder, placeTPSL } = useTrading();
  const { toast } = useToast();
  const [containerHeight, setContainerHeight] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState<null | "tp" | "sl">(null);
  const [editInput, setEditInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<null | "tp" | "sl">(null);
  const [dragPrice, setDragPrice] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editMode]);

  // Drag-to-update: track mouse while dragging a TP or SL line.
  // Uses a ref for the live price so we don't re-subscribe on every mousemove.
  const dragPriceRef = useRef<number | null>(null);
  const draggingRef = useRef<null | "tp" | "sl">(null);
  draggingRef.current = dragging;

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (!coordinateToPrice) return;
      const price = coordinateToPrice(e.clientY);
      if (price !== null && price > 0) {
        dragPriceRef.current = price;
        setDragPrice(price);
      }
    };

    const onUp = async (e: MouseEvent) => {
      const finalDragging = draggingRef.current;
      const finalPrice = dragPriceRef.current ?? (coordinateToPrice ? coordinateToPrice(e.clientY) : null);
      dragPriceRef.current = null;
      setDragging(null);
      setDragPrice(null);

      if (!finalDragging || finalPrice === null || finalPrice <= 0) return;

      // Re-read from trading context via closure; positions/tpPrice/slPrice are stable refs here
      const pos = positions.find(p => p.coin === coin);
      if (!pos) return;

      const isLong = pos.side === "long";
      const tp = finalDragging === "tp" ? finalPrice : (tpPrice ?? undefined);
      const sl = finalDragging === "sl" ? finalPrice : (slPrice ?? undefined);

      const result = await placeTPSL(coin, isLong, tp, sl, pos.entryPrice);
      if (result.success) {
        toast({ title: `${finalDragging === "tp" ? "Take Profit" : "Stop Loss"} updated` });
      } else {
        toast({ title: "Update failed", description: result.error, variant: "destructive" });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, coordinateToPrice, coin, placeTPSL, toast, positions, tpPrice, slPrice]);

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

  const startEdit = useCallback((type: "tp" | "sl") => {
    const price = type === "tp" ? tpPrice : slPrice;
    setEditInput(price ? fmt(price) : "");
    setEditMode(type);
  }, [tpPrice, slPrice]);

  const cancelEdit = useCallback(() => {
    setEditMode(null);
    setEditInput("");
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editMode || !position) return;
    const newPrice = parseFloat(editInput);
    if (isNaN(newPrice) || newPrice <= 0) {
      toast({ title: "Invalid price", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const isLong = position.side === "long";
      const tp = editMode === "tp" ? newPrice : (tpPrice ?? undefined);
      const sl = editMode === "sl" ? newPrice : (slPrice ?? undefined);
      const result = await placeTPSL(coin, isLong, tp, sl, position.entryPrice);
      if (result.success) {
        toast({ title: `${editMode === "tp" ? "Take Profit" : "Stop Loss"} updated` });
        setEditMode(null);
        setEditInput("");
      } else {
        toast({ title: "Update failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [editMode, editInput, position, coin, tpPrice, slPrice, placeTPSL, toast]);

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const unrealizedPnl = position.unrealizedPnl ?? (isLong ? size * (currentPrice - entry) : size * (entry - currentPrice));
  const pnlPositive = unrealizedPnl >= 0;
  const liqPrice = position.liquidationPrice;

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

  // Use the chart's actual visible price range when available for pixel-perfect alignment
  const effMin = visiblePriceRange?.min ?? rMin;
  const effMax = visiblePriceRange?.max ?? rMax;

  const toYPct = (price: number): number => ((effMax - price) / (effMax - effMin)) * 100;

  interface LineConfig {
    key: string;
    price: number;
    lineColor: string;
    color: string;
    dashed: boolean;
    label: string;
    pnlLabel?: string;
    sizeLabel: string;
    canCancel: boolean;
    canEdit: boolean;
    cancelType?: "tp" | "sl";
    editType?: "tp" | "sl";
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
      label: `TP ${fmt(tpPrice)}`,
      sizeLabel: fmtSize(size),
      canCancel: true,
      canEdit: true,
      cancelType: "tp",
      editType: "tp",
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
    canEdit: false,
    labelSide: "left",
  });

  if (slPrice && slPrice > 0) {
    lines.push({
      key: "sl",
      price: slPrice,
      color: "text-[#ef4444]",
      lineColor: "#ef4444",
      dashed: true,
      label: `SL ${fmt(slPrice)}`,
      sizeLabel: fmtSize(size),
      canCancel: true,
      canEdit: true,
      cancelType: "sl",
      editType: "sl",
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
      label: `Liq. ${fmt(liqPrice)}`,
      sizeLabel: "",
      canCancel: false,
      canEdit: false,
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
      {/* Drag preview line while dragging */}
      {dragging && dragPrice !== null && (() => {
        const yPct = toYPct(dragPrice);
        if (yPct < 0 || yPct > 100) return null;
        const previewColor = dragging === "tp" ? "#22c55e" : "#ef4444";
        return (
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${yPct}%`, transform: "translateY(-50%)", zIndex: 40 }}
          >
            <div className="absolute left-0 right-0 h-0" style={{ borderTop: `1px dashed ${previewColor}`, opacity: 0.9 }} />
            <div className="absolute right-16 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
              style={{ background: previewColor, color: "#fff", transform: "translateY(-50%)" }}>
              {fmt(dragPrice)}
            </div>
          </div>
        );
      })()}

      {lines.map(line => {
        const yPct = toYPct(line.price);
        if (yPct < -8 || yPct > 108) return null;
        const isEditing = editMode === line.editType;

        return (
          <div
            key={line.key}
            className="absolute left-0 right-0"
            style={{ top: `${yPct}%`, transform: "translateY(-50%)" }}
          >
            {/* Full-width dashed line */}
            <div
              className="absolute left-0 right-0 h-0"
              style={{ borderTop: `1px dashed ${line.lineColor}`, opacity: 0.7 }}
            />

            {/* Drag handle strip for TP and SL — invisible but interactive */}
            {(line.editType === "tp" || line.editType === "sl") && coordinateToPrice && (
              <div
                className="absolute left-0 right-0"
                style={{ height: 14, top: -7, cursor: "ns-resize", pointerEvents: "auto", zIndex: 25 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  dragPriceRef.current = null;
                  setDragging(line.editType!);
                }}
                data-testid={`drag-handle-${line.key}`}
              />
            )}

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
                {isEditing ? (
                  /* Inline edit mode */
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#1a1f2e] border border-white/25 shadow-lg">
                    <input
                      ref={inputRef}
                      type="number"
                      value={editInput}
                      onChange={e => setEditInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className={cn(
                        "w-24 bg-transparent text-[11px] font-mono font-semibold outline-none",
                        line.color
                      )}
                      disabled={isSubmitting}
                      data-testid={`edit-input-${line.key}`}
                    />
                    <button
                      onClick={confirmEdit}
                      disabled={isSubmitting}
                      className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-40"
                      data-testid={`confirm-edit-${line.key}`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`cancel-edit-${line.key}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  /* Normal display mode */
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold",
                      "bg-[#1a1f2e] border border-white/15 shadow-lg select-none whitespace-nowrap",
                      line.color,
                    )}
                  >
                    <span>{line.label}</span>
                    <span className="opacity-50">{line.sizeLabel}</span>
                    {line.canEdit && (
                      <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        onClick={() => startEdit(line.editType!)}
                        data-testid={`edit-${line.key}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {line.canCancel && (
                      <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        onClick={() => handleCancel(line.cancelType!)}
                        data-testid={`cancel-${line.key}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
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
