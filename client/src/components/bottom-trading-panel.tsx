import { useState, useEffect, useRef, useCallback } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { computeTrailingCallbackRateDecimal } from "@/lib/trailing-stop-orchestrator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { calcTpslPnlUsd, describeTpslPnlUsd } from "@/lib/tpsl-pnl";
import { X, Pencil, ChevronUp, ChevronDown, Share2 } from "lucide-react";
import {
  SharePositionDialog,
  positionToShareSnapshot,
} from "@/components/share-position-dialog";
import type { SharePositionSnapshot } from "@/lib/share-position-types";
import type { Position } from "@/lib/trading-context";

interface BottomTradingPanelProps {
  coin?: string;
  onCoinChange?: (coin: string) => void;
}

type TabType = "positions" | "orders" | "tpsl" | "trades" | "history";
type FilterMode = "all" | "current";

interface TPSLDialogState {
  open: boolean;
  coin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  currentTP?: number;
  currentSL?: number;
}

export function BottomTradingPanel({ coin, onCoinChange }: BottomTradingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("positions");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const { positions, openOrders, cancelHLOrder, placeTPSL, connected, currentPrices, closePosition, isClosingPosition } = useTrading();
  const { toast } = useToast();
  const [tpslDialog, setTpslDialog] = useState<TPSLDialogState>({
    open: false,
    coin: "",
    side: "long",
    size: 0,
    entryPrice: 0,
    markPrice: 0,
  });
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePosition, setSharePosition] = useState<SharePositionSnapshot | null>(null);
  /** Blocks accidental Market-close when TP/SL dialog dismiss steals the click (Radix unmount before mouseup). */
  const suppressPositionCloseRef = useRef(false);

  const closeTpslDialog = useCallback(() => {
    suppressPositionCloseRef.current = true;
    setTpslDialog((prev) => ({ ...prev, open: false }));
    window.setTimeout(() => {
      suppressPositionCloseRef.current = false;
    }, 400);
  }, []);

  // Debug: log all positions whenever they change
  useEffect(() => {
    if (positions.length > 0) {
      const positionLog = positions.map(p => ({ coin: p.coin, side: p.side, size: p.size, pnl: p.unrealizedPnl }));
      console.log("[positions] all open:", JSON.stringify(positionLog));
    }
  }, [positions]);

  const filteredPositions = (filterMode === "current" && coin)
    ? positions.filter(p => p.coin === coin)
    : positions;
  const filteredOrders = (filterMode === "current" && coin)
    ? openOrders.filter(o => o.coin === coin)
    : openOrders;

  const handleCancelOrder = async (order: HLOpenOrder) => {
    const result = await cancelHLOrder(order.coin, order.oid);
    if (result.success) {
      toast({ title: "Order Cancelled", description: `${order.coin} order cancelled` });
    } else {
      toast({ title: "Cancel Failed", description: result.error || "Failed", variant: "destructive" });
    }
  };

  const handleCancelAll = async () => {
    for (const order of filteredOrders) {
      await cancelHLOrder(order.coin, order.oid);
    }
    toast({ title: "All Orders Cancelled" });
  };

  const openShareDialog = (pos: Position) => {
    const mark = currentPrices[pos.coin] || pos.markPrice || pos.entryPrice;
    setSharePosition(positionToShareSnapshot(pos, mark));
    setShareOpen(true);
  };

  const handleClosePosition = async (pos: any) => {
    if (suppressPositionCloseRef.current) return;
    setClosingPositionId(pos.id);
    const result = await closePosition(pos.id);
    setClosingPositionId(null);
    if (result.success) {
      toast({ 
        title: "Position Closed", 
        description: `${pos.coin} ${pos.side} position closed at market` 
      });
    } else {
      toast({ 
        title: "Close Failed", 
        description: result.error || "Failed to close position", 
        variant: "destructive" 
      });
    }
  };

  const openTPSLDialog = (pos: any) => {
    const posOrders = openOrders.filter(o => o.coin === pos.coin);
    const tpOrder = posOrders.find(o => {
      if (o.orderType === "take_profit") return true;
      if (o.triggerPx && pos.side === "long" && parseFloat(o.triggerPx) > pos.entryPrice) return true;
      if (o.triggerPx && pos.side === "short" && parseFloat(o.triggerPx) < pos.entryPrice) return true;
      return false;
    });
    const slOrder = posOrders.find(o => {
      if (o.orderType === "stop_loss") return true;
      if (o.triggerPx && pos.side === "long" && parseFloat(o.triggerPx) < pos.entryPrice) return true;
      if (o.triggerPx && pos.side === "short" && parseFloat(o.triggerPx) > pos.entryPrice) return true;
      return false;
    });
    
    const markPrice = currentPrices[pos.coin] || pos.markPrice || pos.entryPrice;
    
    setTpslDialog({
      open: true,
      coin: pos.coin,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      markPrice: markPrice,
      currentTP: tpOrder ? parseFloat(tpOrder.triggerPx!) : undefined,
      currentSL: slOrder ? parseFloat(slOrder.triggerPx!) : undefined,
    });
    setTpPrice(tpOrder?.triggerPx || "");
    setSlPrice(slOrder?.triggerPx || "");
  };

  const handleSetTPSL = async () => {
    const tp = tpPrice ? parseFloat(tpPrice) : undefined;
    const sl = slPrice ? parseFloat(slPrice) : undefined;
    
    if (!tp && !sl) {
      toast({ title: "No TP/SL Set", description: "Please enter at least one price", variant: "destructive" });
      return;
    }

    const isLong = tpslDialog.side === "long";
    const entryPrice = tpslDialog.entryPrice || 0;
    const markPrice = tpslDialog.markPrice || entryPrice;
    // TP validates against entry price (profit direction must be correct).
    // SL validates against current mark price so breakeven / profit-lock stops are allowed.
    if (tp && entryPrice > 0) {
      const fmtEntry = entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 });
      if (isLong && tp <= entryPrice) {
        toast({ title: "Invalid Take Profit", description: `TP must be above entry price ($${fmtEntry}) for a Long.`, variant: "destructive" });
        return;
      }
      if (!isLong && tp >= entryPrice) {
        toast({ title: "Invalid Take Profit", description: `TP must be below entry price ($${fmtEntry}) for a Short.`, variant: "destructive" });
        return;
      }
    }
    if (sl && markPrice > 0) {
      const fmtMark = markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 });
      if (isLong && sl >= markPrice) {
        toast({ title: "Invalid Stop Loss", description: `SL must be below the current price ($${fmtMark}) — it would trigger immediately.`, variant: "destructive" });
        return;
      }
      if (!isLong && sl <= markPrice) {
        toast({ title: "Invalid Stop Loss", description: `SL must be above the current price ($${fmtMark}) — it would trigger immediately.`, variant: "destructive" });
        return;
      }
    }
    
    const slCb =
      sl && markPrice > 0 ? computeTrailingCallbackRateDecimal(isLong, markPrice, sl) : null;
    const result = await placeTPSL(
      tpslDialog.coin,
      tpslDialog.size,
      isLong,
      tp,
      sl,
      entryPrice || undefined,
      slCb != null ? { slTrailingCallbackRate: slCb } : undefined,
    );
    
    if (result.success) {
      toast({
        title: "TP/SL Orders Placed",
        description: `${tp ? `TP: ${tpPrice}` : ""}${tp && sl ? ", " : ""}${sl ? `SL: ${slPrice}` : ""} for ${tpslDialog.coin}`,
      });
      closeTpslDialog();
    } else {
      toast({
        title: "Failed to Place TP/SL",
        description: result.error || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getTPSLDisplay = (pos: any) => {
    const posOrders = openOrders.filter(o => o.coin === pos.coin && o.triggerPx);
    let tp = "--";
    let sl = "--";
    
    posOrders.forEach(o => {
      const trigger = parseFloat(o.triggerPx!);
      const isTP = o.orderType === "take_profit" ||
        (o.orderType !== "stop_loss" && (
          (pos.side === "long" && trigger > pos.entryPrice) ||
          (pos.side === "short" && trigger < pos.entryPrice)
        ));
      if (isTP) {
        tp = formatPrice(trigger);
      } else {
        sl = formatPrice(trigger);
      }
    });
    
    return { tp, sl };
  };

  const formatPrice = (p: number | string) => {
    const price = typeof p === "string" ? parseFloat(p) : p;
    if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const formatSize = (s: number | string) => {
    const size = typeof s === "string" ? parseFloat(s) : s;
    if (size >= 1) return size.toFixed(4);
    return size.toFixed(6);
  };

  const getOrderType = (order: HLOpenOrder) => {
    if (order.orderType === "stop_loss") return "Stop Loss";
    if (order.orderType === "take_profit") return "Take Profit";
    if (order.triggerPx) {
      const position = positions.find(p => p.coin === order.coin);
      if (position) {
        const triggerPrice = parseFloat(order.triggerPx);
        if (position.side === "long") {
          return triggerPrice < position.entryPrice ? "Stop Loss" : "Take Profit";
        } else {
          return triggerPrice > position.entryPrice ? "Stop Loss" : "Take Profit";
        }
      }
      return "Trigger";
    }
    return "Limit";
  };

  const tpslCount = filteredPositions.filter(pos => {
    const posOrders = openOrders.filter(o => o.coin === pos.coin && o.triggerPx);
    return posOrders.length > 0;
  }).length;

  const tabs = [
    { id: "positions" as TabType, label: "Positions", count: filteredPositions.length },
    { id: "orders" as TabType, label: "Open Orders", count: filteredOrders.length },
    { id: "tpsl" as TabType, label: "TP/SL", count: tpslCount },
    { id: "trades" as TabType, label: "Trade History", count: 0 },
    { id: "history" as TabType, label: "Order History", count: 0 },
  ];

  if (!connected) {
    return (
      <div className="border-t bg-card/50">
        <div className="flex items-center gap-1 px-2 border-b overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="px-2 md:px-3 py-1.5 md:py-2 text-[10px] md:text-xs text-muted-foreground whitespace-nowrap"
              disabled
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="h-16 md:h-24 flex items-center justify-center text-[10px] md:text-xs text-muted-foreground">
          Connect wallet to view positions and orders
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-t bg-card/50" data-testid="bottom-trading-panel">
        {/* Mobile: Collapsed header with expand button */}
        <div className="flex items-center justify-between border-b bg-muted/20 px-1 md:px-2">
          {/* Mobile expand/collapse toggle */}
          <button 
            className="md:hidden flex items-center gap-1 px-2 py-2 text-[10px] text-muted-foreground"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            data-testid="button-expand-panel"
          >
            {mobileExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            <span className="font-medium text-foreground">
              {filteredPositions.length > 0 ? `${filteredPositions.length} Position${filteredPositions.length > 1 ? 's' : ''}` : 'Positions'}
            </span>
          </button>
          
          <div className={cn(
            "flex items-center gap-0.5 md:gap-1 overflow-x-auto",
            !mobileExpanded && "hidden md:flex"
          )}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-medium transition-colors relative whitespace-nowrap",
                  activeTab === tab.id 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`tab-${tab.id}`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                {tab.count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {tab.count}
                  </Badge>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className={cn(
            "flex items-center gap-2 shrink-0",
            !mobileExpanded && "hidden md:flex"
          )}>
            {/* All / Current pair toggle */}
            {coin && (
              <div className="flex items-center rounded overflow-hidden border border-border text-[10px]" data-testid="toggle-position-filter">
                <button
                  onClick={() => setFilterMode("all")}
                  className={cn(
                    "px-2 py-0.5 transition-colors",
                    filterMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="button-filter-all"
                >
                  All
                </button>
                <button
                  onClick={() => setFilterMode("current")}
                  className={cn(
                    "px-2 py-0.5 transition-colors",
                    filterMode === "current" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="button-filter-current"
                >
                  This Pair
                </button>
              </div>
            )}
            {activeTab === "orders" && filteredOrders.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 md:h-6 text-[10px] md:text-xs text-bearish hover:text-bearish px-1.5"
                onClick={handleCancelAll}
                data-testid="button-cancel-all"
              >
                Cancel All
              </Button>
            )}
          </div>
        </div>

        {/* Content area - collapsed on mobile by default */}
        <div className={cn(
          "overflow-auto transition-all",
          mobileExpanded ? "h-32" : "h-0 md:h-24"
        )}>
          {activeTab === "positions" && (
            <PositionsTable 
              positions={filteredPositions} 
              currentPrices={currentPrices}
              formatPrice={formatPrice} 
              formatSize={formatSize}
              getTPSLDisplay={getTPSLDisplay}
              onEditTPSL={openTPSLDialog}
              onClosePosition={handleClosePosition}
              onSharePosition={openShareDialog}
              isClosingPosition={isClosingPosition}
              closingPositionId={closingPositionId}
              onCoinChange={onCoinChange}
            />
          )}
          {activeTab === "orders" && (
            <OrdersTable 
              orders={filteredOrders} 
              formatPrice={formatPrice} 
              formatSize={formatSize}
              getOrderType={getOrderType}
              onCancel={handleCancelOrder}
            />
          )}
          {activeTab === "tpsl" && (
            <TPSLTable
              positions={filteredPositions}
              openOrders={openOrders}
              currentPrices={currentPrices}
              formatPrice={formatPrice}
              getTPSLDisplay={getTPSLDisplay}
              onEdit={openTPSLDialog}
              onCancel={handleCancelOrder}
            />
          )}
          {activeTab === "trades" && (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No trade history
            </div>
          )}
          {activeTab === "history" && (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No order history
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={tpslDialog.open}
        onOpenChange={(open) => {
          if (open) setTpslDialog((prev) => ({ ...prev, open: true }));
          else closeTpslDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-card border-border"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg">TP/SL for Position</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {/* Position summary */}
            <div className="bg-muted/40 rounded-lg px-3 py-2 grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-muted-foreground mb-0.5">Coin</div>
                <div className="font-medium">{tpslDialog.coin}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground mb-0.5">Side</div>
                <div className={cn("font-medium capitalize", tpslDialog.side === "long" ? "text-bullish" : "text-bearish")}>
                  {tpslDialog.side}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground mb-0.5">Size</div>
                <div className="font-mono font-medium">{formatSize(tpslDialog.size)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground mb-0.5">Entry</div>
                <div className="font-mono font-medium">${formatPrice(tpslDialog.entryPrice)}</div>
              </div>
            </div>

            {/* Take Profit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-bullish">
                  Take Profit {tpslDialog.side === "long" ? "↑ (above entry price)" : "↓ (below entry price)"}
                </label>
                <div className="flex gap-1">
                  {[1, 2, 5].map(pct => {
                    const mult = tpslDialog.side === "long" ? (1 + pct / 100) : (1 - pct / 100);
                    const price = (tpslDialog.entryPrice * mult).toFixed(0);
                    return (
                      <button
                        key={pct}
                        onClick={() => setTpPrice(price)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-bullish/10 text-bullish hover:bg-bullish/20"
                        data-testid={`button-tp-pct-${pct}`}
                      >
                        +{pct}%
                      </button>
                    );
                  })}
                </div>
              </div>
              <Input
                type="number"
                placeholder={tpslDialog.side === "long" ? `Above ${formatPrice(tpslDialog.entryPrice)}` : `Below ${formatPrice(tpslDialog.entryPrice)}`}
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                className="font-mono bg-muted/50"
                data-testid="input-tp-price"
              />
              {tpPrice && tpslDialog.entryPrice > 0 && (() => {
                const trigger = parseFloat(tpPrice);
                if (!Number.isFinite(trigger)) return null;
                const pct = (trigger - tpslDialog.entryPrice) / tpslDialog.entryPrice * 100;
                const isValid = tpslDialog.side === "long" ? pct > 0 : pct < 0;
                const pnl = calcTpslPnlUsd(
                  tpslDialog.side,
                  tpslDialog.size,
                  tpslDialog.entryPrice,
                  trigger,
                );
                return (
                  <div
                    className={cn(
                      "text-[10px] font-mono pl-1 space-y-0.5",
                      isValid ? "text-bullish" : "text-destructive",
                    )}
                  >
                    <div>
                      {pct > 0 ? "+" : ""}
                      {pct.toFixed(2)}% from entry
                      {!isValid &&
                        ` ⚠ must be ${tpslDialog.side === "long" ? "above" : "below"} entry`}
                    </div>
                    <div className={pnl >= 0 ? "text-bullish" : "text-bearish"}>
                      {describeTpslPnlUsd(pnl, "tp")}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Stop Loss */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-bearish">
                  Stop Loss {tpslDialog.side === "long" ? "↓ (below current price)" : "↑ (above current price)"}
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSlPrice(tpslDialog.entryPrice.toFixed(0))}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                    data-testid="button-sl-breakeven"
                    title="Set SL at your entry price (breakeven)"
                  >
                    BE
                  </button>
                  {[1, 2, 5].map(pct => {
                    const mult = tpslDialog.side === "long" ? (1 - pct / 100) : (1 + pct / 100);
                    const price = (tpslDialog.entryPrice * mult).toFixed(0);
                    return (
                      <button
                        key={pct}
                        onClick={() => setSlPrice(price)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-bearish/10 text-bearish hover:bg-bearish/20"
                        data-testid={`button-sl-pct-${pct}`}
                      >
                        +{pct}%
                      </button>
                    );
                  })}
                </div>
              </div>
              <Input
                type="number"
                placeholder={tpslDialog.side === "long" ? `Below ${formatPrice(tpslDialog.markPrice || tpslDialog.entryPrice)}` : `Above ${formatPrice(tpslDialog.markPrice || tpslDialog.entryPrice)}`}
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                className="font-mono bg-muted/50"
                data-testid="input-sl-price"
              />
              {slPrice && tpslDialog.markPrice > 0 && (() => {
                const sl = parseFloat(slPrice);
                if (!Number.isFinite(sl)) return null;
                const mark = tpslDialog.markPrice;
                const entry = tpslDialog.entryPrice;
                const isLong = tpslDialog.side === "long";
                const isValid = isLong ? sl < mark : sl > mark;
                const pctFromEntry = entry > 0 ? ((sl - entry) / entry * 100) : 0;
                const atBreakeven = entry > 0 && Math.abs(sl - entry) < 0.01 * entry;
                const lockingProfit = isLong ? (sl > entry && sl < mark) : (sl < entry && sl > mark);
                const pnl = calcTpslPnlUsd(tpslDialog.side, tpslDialog.size, entry, sl);
                const pctLabel = atBreakeven
                  ? "breakeven stop ✓"
                  : lockingProfit
                    ? `locking ${Math.abs(pctFromEntry).toFixed(2)}% profit ✓`
                    : `${pctFromEntry > 0 ? "+" : ""}${pctFromEntry.toFixed(2)}% from entry`;
                return (
                  <div
                    className={cn(
                      "text-[10px] font-mono pl-1 space-y-0.5",
                      isValid ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    <div>{isValid ? pctLabel : `⚠ must be ${isLong ? "below" : "above"} current price ($${formatPrice(mark)})`}</div>
                    <div className={pnl >= 0 ? "text-bullish" : "text-bearish"}>
                      {describeTpslPnlUsd(pnl, "sl")}
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <Button 
              onClick={handleSetTPSL} 
              className="w-full bg-primary hover:bg-primary/90"
              data-testid="button-confirm-tpsl"
            >
              Confirm TP/SL
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              TP/SL orders are reduce-only and apply to the full position size.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <SharePositionDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        position={sharePosition}
      />
    </>
  );
}

function PositionsTable({ 
  positions, 
  currentPrices,
  formatPrice, 
  formatSize,
  getTPSLDisplay,
  onEditTPSL,
  onClosePosition,
  onSharePosition,
  isClosingPosition,
  closingPositionId,
  onCoinChange,
}: { 
  positions: any[]; 
  currentPrices: Record<string, number>;
  formatPrice: (p: number) => string;
  formatSize: (s: number | string) => string;
  getTPSLDisplay: (pos: any) => { tp: string; sl: string };
  onEditTPSL: (pos: any) => void;
  onClosePosition: (pos: any) => void;
  onSharePosition: (pos: Position) => void;
  isClosingPosition: boolean;
  closingPositionId: string | null;
  onCoinChange?: (coin: string) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground" data-testid="text-no-positions">
        No open positions
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card/90 backdrop-blur">
        <tr className="text-muted-foreground border-b">
          <th className="text-left px-3 py-1.5 font-medium">Coin</th>
          <th className="text-right px-3 py-1.5 font-medium">Size</th>
          <th className="text-right px-3 py-1.5 font-medium">Position Value</th>
          <th className="text-right px-3 py-1.5 font-medium">Entry Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Mark Price</th>
          <th className="text-right px-3 py-1.5 font-medium">PNL (ROE %)</th>
          <th className="text-right px-3 py-1.5 font-medium">Liq. Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Margin</th>
          <th className="text-center px-3 py-1.5 font-medium">Close All</th>
          <th className="text-center px-3 py-1.5 font-medium">TP/SL</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos, i) => {
          const markPrice = currentPrices[pos.coin] || pos.markPrice || pos.entryPrice;
          const positionValue = pos.size * markPrice;
          const roe = pos.margin > 0 ? (pos.unrealizedPnl / pos.margin) * 100 : 0;
          const { tp, sl } = getTPSLDisplay(pos);
          
          return (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30" data-testid={`position-row-${pos.coin}`}>
              <td className="px-3 py-1.5">
                <button
                  className={cn("flex items-center gap-1 text-left", onCoinChange && "hover:text-primary cursor-pointer")}
                  onClick={() => onCoinChange?.(pos.coin)}
                  disabled={!onCoinChange}
                  data-testid={`button-switch-coin-${pos.coin}`}
                  title={onCoinChange ? `Switch chart to ${pos.coin}` : undefined}
                >
                  <span className="font-medium">{pos.coin}</span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase",
                      pos.side === "long" ? "text-bullish" : "text-bearish",
                    )}
                  >
                    {pos.side === "long" ? "Long" : "Short"}
                  </span>
                  <span className={cn("text-[10px] text-muted-foreground")}>{pos.leverage}x</span>
                </button>
              </td>
              <td className={cn("px-3 py-1.5 text-right font-mono", pos.side === "long" ? "text-bullish" : "text-bearish")}>
                {formatSize(pos.size)} {pos.coin}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {formatPrice(positionValue)} USDC
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatPrice(pos.entryPrice)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatPrice(markPrice)}</td>
              <td className={cn(
                "px-3 py-1.5 text-right font-mono",
                pos.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish",
              )}>
                <span className="inline-flex items-center justify-end gap-1.5">
                  <span>
                    {pos.unrealizedPnl >= 0 ? "+" : ""}
                    {formatPrice(pos.unrealizedPnl)} ({roe >= 0 ? "+" : ""}
                    {roe.toFixed(2)}%)
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    onClick={() => onSharePosition(pos)}
                    title="Share position"
                    aria-label={`Share ${pos.coin} position`}
                    data-testid={`button-share-position-${pos.coin}`}
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                </span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-orange-500">
                {pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : "--"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {formatPrice(pos.margin || 0)}
              </td>
              <td className="px-3 py-1.5 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-5 px-2 text-[10px] bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => onClosePosition(pos)}
                    disabled={isClosingPosition}
                    data-testid={`button-close-position-${pos.coin}`}
                  >
                    {isClosingPosition && closingPositionId === pos.id ? "Closing..." : "Market"}
                  </Button>
                </div>
              </td>
              <td className="px-3 py-1.5 text-center">
                <button
                  onClick={() => onEditTPSL(pos)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  data-testid={`button-edit-tpsl-${pos.coin}`}
                >
                  <span className="text-bullish">{tp}</span>
                  <span>/</span>
                  <span className="text-bearish">{sl}</span>
                  <Pencil className="h-3 w-3 ml-0.5" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TPSLTable({
  positions,
  openOrders,
  currentPrices,
  formatPrice,
  getTPSLDisplay,
  onEdit,
  onCancel,
}: {
  positions: any[];
  openOrders: HLOpenOrder[];
  currentPrices: Record<string, number>;
  formatPrice: (p: number | string) => string;
  getTPSLDisplay: (pos: any) => { tp: string; sl: string };
  onEdit: (pos: any) => void;
  onCancel: (order: HLOpenOrder) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        No open positions
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card/90 backdrop-blur">
        <tr className="text-muted-foreground border-b">
          <th className="text-left px-3 py-1.5 font-medium">Coin</th>
          <th className="text-left px-3 py-1.5 font-medium">Side</th>
          <th className="text-right px-3 py-1.5 font-medium">Entry</th>
          <th className="text-right px-3 py-1.5 font-medium">Mark</th>
          <th className="text-right px-3 py-1.5 font-medium">Take Profit</th>
          <th className="text-right px-3 py-1.5 font-medium">Stop Loss</th>
          <th className="text-center px-3 py-1.5 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos, i) => {
          const markPrice = currentPrices[pos.coin] || pos.markPrice || pos.entryPrice;
          const { tp, sl } = getTPSLDisplay(pos);
          const posOrders = openOrders.filter(o => o.coin === pos.coin && o.triggerPx);
          const tpOrder = posOrders.find(o => {
            if (o.orderType === "take_profit") return true;
            const trigger = parseFloat(o.triggerPx!);
            return pos.side === "long" ? trigger > pos.entryPrice : trigger < pos.entryPrice;
          });
          const slOrder = posOrders.find(o => {
            if (o.orderType === "stop_loss") return true;
            const trigger = parseFloat(o.triggerPx!);
            return pos.side === "long" ? trigger < pos.entryPrice : trigger > pos.entryPrice;
          });

          return (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30" data-testid={`tpsl-row-${pos.coin}`}>
              <td className="px-3 py-1.5 font-medium">{pos.coin}</td>
              <td className={cn("px-3 py-1.5 capitalize font-medium", pos.side === "long" ? "text-bullish" : "text-bearish")}>
                {pos.side}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatPrice(pos.entryPrice)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatPrice(markPrice)}</td>
              <td className="px-3 py-1.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  <span className={cn("font-mono", tp !== "--" ? "text-bullish" : "text-muted-foreground")}>
                    {tp}
                  </span>
                  {tpOrder && (
                    <button
                      onClick={() => onCancel(tpOrder)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`cancel-tp-${pos.coin}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  <span className={cn("font-mono", sl !== "--" ? "text-bearish" : "text-muted-foreground")}>
                    {sl}
                  </span>
                  {slOrder && (
                    <button
                      onClick={() => onCancel(slOrder)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`cancel-sl-${pos.coin}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5 text-center">
                <button
                  onClick={() => onEdit(pos)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-[10px] transition-colors"
                  data-testid={`edit-tpsl-${pos.coin}`}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OrdersTable({ 
  orders, 
  formatPrice,
  formatSize,
  getOrderType,
  onCancel
}: { 
  orders: HLOpenOrder[];
  formatPrice: (p: number | string) => string;
  formatSize: (s: number | string) => string;
  getOrderType: (order: HLOpenOrder) => string;
  onCancel: (order: HLOpenOrder) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground" data-testid="text-no-orders">
        No open orders
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card/90 backdrop-blur">
        <tr className="text-muted-foreground border-b">
          <th className="text-left px-3 py-1.5 font-medium">Coin</th>
          <th className="text-left px-3 py-1.5 font-medium">Type</th>
          <th className="text-right px-3 py-1.5 font-medium">Size</th>
          <th className="text-right px-3 py-1.5 font-medium">Trigger Price</th>
          <th className="text-center px-3 py-1.5 font-medium">Cancel</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order, i) => {
          const orderType = getOrderType(order);
          const isBuy = order.side === "B" || order.side === "buy";
          const isStopLoss = orderType === "Stop Loss";
          const isTakeProfit = orderType === "Take Profit";
          const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
          
          return (
            <tr key={order.oid || i} className="border-b border-border/50 hover:bg-muted/30" data-testid={`order-row-${order.oid}`}>
              <td className="px-3 py-1.5">
                <span className="font-medium">{order.coin}</span>
                <span className={cn("ml-1.5 text-[10px]", isBuy ? "text-bullish" : "text-bearish")}>
                  {isBuy ? "Buy" : "Sell"}
                </span>
              </td>
              <td className="px-3 py-1.5">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    isStopLoss && "border-red-500/50 text-red-500 bg-red-500/10",
                    isTakeProfit && "border-green-500/50 text-green-500 bg-green-500/10",
                    !isStopLoss && !isTakeProfit && "border-blue-500/50 text-blue-500 bg-blue-500/10"
                  )}
                >
                  {isStopLoss ? "STOP LOSS" : isTakeProfit ? "TAKE PROFIT" : orderType.toUpperCase()}
                </Badge>
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatSize(order.sz)}</td>
              <td className="px-3 py-1.5 text-right font-mono font-medium">
                {formatPrice(triggerPrice)}
              </td>
              <td className="px-3 py-1.5 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-red-500 border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
                  onClick={() => onCancel(order)}
                  data-testid={`button-cancel-order-${order.oid}`}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
