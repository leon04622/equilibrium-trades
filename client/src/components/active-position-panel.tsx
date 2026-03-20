import { useState, useCallback } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, X, Check, Plus, Minus } from "lucide-react";

interface ActivePositionPanelProps {
  coin: string;
  currentPrice: number;
}

type EditMode = "none" | "tp" | "sl";

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

export function ActivePositionPanel({ coin, currentPrice }: ActivePositionPanelProps) {
  const { positions, openOrders, placeTPSL, cancelHLOrder } = useTrading();
  const { toast } = useToast();

  // All hooks must be declared before any conditional returns
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [tpInput, setTpInput] = useState("");
  const [slInput, setSlInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const startEdit = useCallback((mode: EditMode) => {
    setEditMode(mode);
    if (mode === "tp") setTpInput(tpPrice ? fmt(tpPrice) : "");
    if (mode === "sl") setSlInput(slPrice ? fmt(slPrice) : "");
  }, [tpPrice, slPrice]);

  const cancelEdit = useCallback(() => {
    setEditMode("none");
    setTpInput("");
    setSlInput("");
  }, []);

  const submitTPSL = useCallback(async () => {
    if (!position) return;
    setIsSubmitting(true);
    try {
      const newTp = editMode === "tp" && tpInput ? parseFloat(tpInput) : tpPrice ?? 0;
      const newSl = editMode === "sl" && slInput ? parseFloat(slInput) : slPrice ?? 0;

      const result = await placeTPSL(
        position.coin,
        position.size,
        position.side === "long",
        newTp > 0 ? newTp : undefined,
        newSl > 0 ? newSl : undefined,
      );

      if (result.success) {
        toast({
          title: editMode === "tp" ? "Take Profit Set" : "Stop Loss Set",
          description: `At $${fmt(editMode === "tp" ? newTp : newSl)}`,
        });
        cancelEdit();
      } else {
        toast({ title: "Failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [position, editMode, tpInput, slInput, tpPrice, slPrice, placeTPSL, toast, cancelEdit]);

  const handleCancelOrder = useCallback(async (type: "tp" | "sl") => {
    const order = type === "tp" ? tpOrder : slOrder;
    if (!order) return;
    const result = await cancelHLOrder(coin, order.oid);
    toast(result.success
      ? { title: `${type === "tp" ? "Take Profit" : "Stop Loss"} Cancelled` }
      : { title: "Cancel Failed", description: result.error, variant: "destructive" });
  }, [tpOrder, slOrder, coin, cancelHLOrder, toast]);

  // Early return after all hooks
  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;

  const calcPnl = (price: number) =>
    isLong ? size * (price - entry) : size * (entry - price);

  const rr = tpPrice && slPrice
    ? Math.abs(calcPnl(tpPrice)) / Math.abs(calcPnl(slPrice))
    : null;

  const pctPrice = (pct: number) => entry * (1 + pct / 100);
  const quickTpOptions = isLong ? [1, 2, 3, 5, 10] : [-1, -2, -3, -5, -10];
  const quickSlOptions = isLong ? [-1, -2, -3, -5, -10] : [1, 2, 3, 5, 10];

  const nudgeInput = (mode: "tp" | "sl", direction: 1 | -1) => {
    const current = mode === "tp" ? tpInput : slInput;
    const val = parseFloat(current);
    if (isNaN(val)) return;
    const step = val > 1000 ? 10 : val > 100 ? 1 : val > 10 ? 0.1 : 0.01;
    const next = val + direction * step;
    if (mode === "tp") setTpInput(fmt(next));
    else setSlInput(fmt(next));
  };

  const unrealizedPnl = position.unrealizedPnl ?? calcPnl(currentPrice);
  const pnlPositive = unrealizedPnl >= 0;

  return (
    <div className="border rounded-lg overflow-hidden bg-card" data-testid="active-position-panel">
      {/* Position Header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b",
        isLong ? "bg-bullish/10" : "bg-bearish/10"
      )}>
        <div className="flex items-center gap-2">
          {isLong
            ? <TrendingUp className="h-4 w-4 text-bullish" />
            : <TrendingDown className="h-4 w-4 text-bearish" />
          }
          <span className={cn("text-sm font-semibold", isLong ? "text-bullish" : "text-bearish")}>
            {isLong ? "Long" : "Short"} {coin}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {fmtSize(size)}
          </span>
        </div>
        <div className={cn(
          "text-sm font-mono font-semibold",
          pnlPositive ? "text-bullish" : "text-bearish"
        )} data-testid="position-unrealized-pnl">
          {fmtPnl(unrealizedPnl)}
        </div>
      </div>

      {/* Entry / Liquidation */}
      <div className="grid grid-cols-2 gap-0 border-b divide-x">
        <div className="px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entry</p>
          <p className="text-xs font-mono font-semibold">${fmt(entry)}</p>
        </div>
        {position.liquidationPrice && position.liquidationPrice > 0 ? (
          <div className="px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Liquidation</p>
            <p className="text-xs font-mono font-semibold text-destructive">${fmt(position.liquidationPrice)}</p>
          </div>
        ) : (
          <div className="px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mark Price</p>
            <p className="text-xs font-mono font-semibold">${fmt(currentPrice)}</p>
          </div>
        )}
      </div>

      {/* TP / SL rows */}
      <div className="divide-y">
        <OrderLevelRow
          label="Take Profit"
          color="green"
          price={tpPrice}
          entry={entry}
          size={size}
          isLong={isLong}
          isEditing={editMode === "tp"}
          inputValue={tpInput}
          onInputChange={setTpInput}
          onNudge={(d) => nudgeInput("tp", d)}
          quickOptions={quickTpOptions.map(pct => ({ label: `${pct > 0 ? "+" : ""}${pct}%`, price: pctPrice(pct) }))}
          onQuickSet={(price) => { setTpInput(fmt(price)); setEditMode("tp"); }}
          onStartEdit={() => startEdit("tp")}
          onConfirm={submitTPSL}
          onCancelEdit={cancelEdit}
          onCancelOrder={() => handleCancelOrder("tp")}
          isSubmitting={isSubmitting}
        />
        <OrderLevelRow
          label="Stop Loss"
          color="red"
          price={slPrice}
          entry={entry}
          size={size}
          isLong={isLong}
          isEditing={editMode === "sl"}
          inputValue={slInput}
          onInputChange={setSlInput}
          onNudge={(d) => nudgeInput("sl", d)}
          quickOptions={quickSlOptions.map(pct => ({ label: `${pct > 0 ? "+" : ""}${pct}%`, price: pctPrice(pct) }))}
          onQuickSet={(price) => { setSlInput(fmt(price)); setEditMode("sl"); }}
          onStartEdit={() => startEdit("sl")}
          onConfirm={submitTPSL}
          onCancelEdit={cancelEdit}
          onCancelOrder={() => handleCancelOrder("sl")}
          isSubmitting={isSubmitting}
        />
      </div>

      {/* R:R ratio */}
      {rr !== null && (
        <div className="px-3 py-2 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>Risk : Reward</span>
          <span className={cn(
            "font-mono font-semibold",
            rr >= 2 ? "text-bullish" : rr >= 1 ? "text-foreground" : "text-bearish"
          )}>
            1 : {rr.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: one TP or SL row ─────────────────────────────────────────

interface OrderLevelRowProps {
  label: string;
  color: "green" | "red";
  price: number | null;
  entry: number;
  size: number;
  isLong: boolean;
  isEditing: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onNudge: (dir: 1 | -1) => void;
  quickOptions: { label: string; price: number }[];
  onQuickSet: (price: number) => void;
  onStartEdit: () => void;
  onConfirm: () => void;
  onCancelEdit: () => void;
  onCancelOrder: () => void;
  isSubmitting: boolean;
}

function OrderLevelRow({
  label, color, price, entry, size, isLong,
  isEditing, inputValue, onInputChange, onNudge, quickOptions,
  onQuickSet, onStartEdit, onConfirm, onCancelEdit, onCancelOrder,
  isSubmitting
}: OrderLevelRowProps) {
  const calcPnl = (p: number) => isLong ? size * (p - entry) : size * (entry - p);
  const pnlAtPrice = price ? calcPnl(price) : null;
  const pnlAtInput = inputValue && !isNaN(parseFloat(inputValue)) ? calcPnl(parseFloat(inputValue)) : null;

  const colorCls = {
    green: { text: "text-bullish", border: "border-bullish/40" },
    red:   { text: "text-bearish", border: "border-bearish/40" },
  }[color];

  const confirmBg = color === "green"
    ? "bg-bullish hover:bg-bullish/90 text-white"
    : "bg-bearish hover:bg-bearish/90 text-white";

  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", colorCls.text)}>
            {label}
          </span>
          {price !== null ? (
            <span className="text-xs font-mono font-semibold">${fmt(price)}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Not set</span>
          )}
          {pnlAtPrice !== null && (
            <span className={cn(
              "text-[10px] font-mono px-1 rounded",
              pnlAtPrice >= 0 ? "text-bullish bg-bullish/10" : "text-bearish bg-bearish/10"
            )}>
              {fmtPnl(pnlAtPrice)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <>
              <button
                onClick={onStartEdit}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors hover:bg-muted",
                  colorCls.border, colorCls.text
                )}
                data-testid={`edit-${label.toLowerCase().replace(" ", "-")}`}
              >
                {price !== null ? "Edit" : "Set"}
              </button>
              {price !== null && (
                <button
                  onClick={onCancelOrder}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
                  data-testid={`cancel-${label.toLowerCase().replace(" ", "-")}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onConfirm}
                disabled={isSubmitting || !inputValue}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-medium transition-colors",
                  confirmBg,
                  (isSubmitting || !inputValue) && "opacity-50 cursor-not-allowed"
                )}
                data-testid={`confirm-${label.toLowerCase().replace(" ", "-")}`}
              >
                <Check className="h-3 w-3 inline mr-0.5" />
                Place
              </button>
              <button
                onClick={onCancelEdit}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick-set % buttons */}
      <div className="flex flex-wrap gap-1">
        {quickOptions.map(opt => {
          const isActive = inputValue && Math.abs(parseFloat(inputValue) - opt.price) < 0.01;
          return (
            <button
              key={opt.label}
              onClick={() => onQuickSet(opt.price)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-mono transition-colors",
                isActive
                  ? cn(colorCls.border, colorCls.text)
                  : "text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground"
              )}
              data-testid={`quick-${label.toLowerCase().replace(" ", "-")}-${opt.label}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Price input (only when editing) */}
      {isEditing && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNudge(-1)}
            className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
          >
            <Minus className="h-3 w-3" />
          </button>
          <Input
            type="number"
            value={inputValue}
            onChange={e => onInputChange(e.target.value)}
            placeholder="Enter price..."
            className="h-7 text-xs font-mono flex-1"
            autoFocus
            data-testid={`input-${label.toLowerCase().replace(" ", "-")}-price`}
            onKeyDown={e => { if (e.key === "Enter") onConfirm(); if (e.key === "Escape") onCancelEdit(); }}
          />
          <button
            onClick={() => onNudge(1)}
            className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Live P&L preview while typing */}
      {isEditing && pnlAtInput !== null && (
        <p className={cn(
          "text-[10px] font-mono",
          pnlAtInput >= 0 ? "text-bullish" : "text-bearish"
        )}>
          Expected: {fmtPnl(pnlAtInput)}
        </p>
      )}
    </div>
  );
}
