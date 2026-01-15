import { useState } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { X, Pencil } from "lucide-react";

interface BottomTradingPanelProps {
  coin?: string;
}

type TabType = "positions" | "orders" | "trades" | "history";

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

export function BottomTradingPanel({ coin }: BottomTradingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("positions");
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

  const filteredPositions = coin ? positions.filter(p => p.coin === coin) : positions;
  const filteredOrders = coin ? openOrders.filter(o => o.coin === coin) : openOrders;

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

  const handleClosePosition = async (pos: any) => {
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
    
    const result = await placeTPSL(
      tpslDialog.coin,
      tpslDialog.size,
      tpslDialog.side === "long",
      tp,
      sl
    );
    
    if (result.success) {
      toast({
        title: "TP/SL Orders Placed",
        description: `${tp ? `TP: ${tpPrice}` : ""}${tp && sl ? ", " : ""}${sl ? `SL: ${slPrice}` : ""} for ${tpslDialog.coin}`,
      });
      setTpslDialog({ ...tpslDialog, open: false });
    } else {
      toast({
        title: "Failed to Place TP/SL",
        description: result.error || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getTPSLDisplay = (pos: any) => {
    const posOrders = openOrders.filter(o => o.coin === pos.coin);
    let tp = "--";
    let sl = "--";
    
    posOrders.forEach(o => {
      if (!o.triggerPx) return;
      const trigger = parseFloat(o.triggerPx);
      const isTP = o.orderType === "take_profit" || 
        (pos.side === "long" && trigger > pos.entryPrice) ||
        (pos.side === "short" && trigger < pos.entryPrice);
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

  const tabs = [
    { id: "positions" as TabType, label: "Positions", count: filteredPositions.length },
    { id: "orders" as TabType, label: "Open Orders", count: filteredOrders.length },
    { id: "trades" as TabType, label: "Trade History", count: 0 },
    { id: "history" as TabType, label: "Order History", count: 0 },
  ];

  if (!connected) {
    return (
      <div className="border-t bg-card/50">
        <div className="flex items-center gap-1 px-2 border-b">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="px-3 py-2 text-xs text-muted-foreground"
              disabled
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
          Connect wallet to view positions and orders
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-t bg-card/50" data-testid="bottom-trading-panel">
        <div className="flex items-center justify-between px-2 border-b">
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-2 text-xs font-medium transition-colors relative",
                  activeTab === tab.id 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`tab-${tab.id}`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {tab.count}
                  </Badge>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter</span>
            {activeTab === "orders" && filteredOrders.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-bearish hover:text-bearish"
                onClick={handleCancelAll}
                data-testid="button-cancel-all"
              >
                Cancel All
              </Button>
            )}
          </div>
        </div>

        <div className="h-28 overflow-auto">
          {activeTab === "positions" && (
            <PositionsTable 
              positions={filteredPositions} 
              currentPrices={currentPrices}
              formatPrice={formatPrice} 
              formatSize={formatSize}
              getTPSLDisplay={getTPSLDisplay}
              onEditTPSL={openTPSLDialog}
              onClosePosition={handleClosePosition}
              isClosingPosition={isClosingPosition}
              closingPositionId={closingPositionId}
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

      <Dialog open={tpslDialog.open} onOpenChange={(open) => setTpslDialog({ ...tpslDialog, open })}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg">TP/SL for Position</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Coin</span>
              <span className="font-medium">{tpslDialog.coin}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Position</span>
              <span className={cn(
                "font-medium",
                tpslDialog.side === "long" ? "text-bullish" : "text-bearish"
              )}>
                {formatSize(tpslDialog.size)} {tpslDialog.coin}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Entry Price</span>
              <span className="font-mono">{formatPrice(tpslDialog.entryPrice)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Mark Price</span>
              <span className="font-mono">{formatPrice(tpslDialog.markPrice)}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-2">
                <Input
                  type="number"
                  placeholder="TP Price"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  className="font-mono bg-muted/50"
                  data-testid="input-tp-price"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-bullish text-sm font-medium">Gain</span>
                <Badge variant="outline" className="text-xs">%</Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Input
                  type="number"
                  placeholder="SL Price"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  className="font-mono bg-muted/50"
                  data-testid="input-sl-price"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-bearish text-sm font-medium">Loss</span>
                <Badge variant="outline" className="text-xs">%</Badge>
              </div>
            </div>
            
            <Button 
              onClick={handleSetTPSL} 
              className="w-full bg-primary hover:bg-primary/90"
              data-testid="button-confirm-tpsl"
            >
              Confirm
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              By default take-profit and stop-loss orders apply to the entire position. 
              They automatically cancel after closing the position.
            </p>
          </div>
        </DialogContent>
      </Dialog>
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
  isClosingPosition,
  closingPositionId,
}: { 
  positions: any[]; 
  currentPrices: Record<string, number>;
  formatPrice: (p: number) => string;
  formatSize: (s: number | string) => string;
  getTPSLDisplay: (pos: any) => { tp: string; sl: string };
  onEditTPSL: (pos: any) => void;
  onClosePosition: (pos: any) => void;
  isClosingPosition: boolean;
  closingPositionId: string | null;
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
                <span className="font-medium">{pos.coin}</span>
                <span className={cn("ml-1 text-[10px]", pos.side === "long" ? "text-bullish" : "text-bearish")}>
                  {pos.leverage}x
                </span>
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
                pos.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {pos.unrealizedPnl >= 0 ? "+" : ""}{formatPrice(pos.unrealizedPnl)} ({roe >= 0 ? "+" : ""}{roe.toFixed(2)}%)
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
