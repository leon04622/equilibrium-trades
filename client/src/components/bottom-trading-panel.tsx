import { useState } from "react";
import { useTrading, HLOpenOrder } from "@/lib/trading-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface BottomTradingPanelProps {
  coin?: string;
}

type TabType = "positions" | "orders" | "trades" | "history";

export function BottomTradingPanel({ coin }: BottomTradingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("positions");
  const { positions, openOrders, cancelHLOrder, connected } = useTrading();
  const { toast } = useToast();

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

  const formatPrice = (p: number | string) => {
    const price = typeof p === "string" ? parseFloat(p) : p;
    if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const formatSize = (s: number | string) => {
    const size = typeof s === "string" ? parseFloat(s) : s;
    return size.toFixed(4);
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
          <PositionsTable positions={filteredPositions} formatPrice={formatPrice} formatSize={formatSize} />
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
  );
}

function PositionsTable({ 
  positions, 
  formatPrice, 
  formatSize 
}: { 
  positions: any[]; 
  formatPrice: (p: number) => string;
  formatSize: (s: number | string) => string;
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
          <th className="text-left px-3 py-1.5 font-medium">Side</th>
          <th className="text-right px-3 py-1.5 font-medium">Size</th>
          <th className="text-right px-3 py-1.5 font-medium">Entry Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Mark Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Liq. Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Unrealized PnL</th>
          <th className="text-right px-3 py-1.5 font-medium">Leverage</th>
          <th className="text-center px-3 py-1.5 font-medium">TP/SL</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos, i) => (
          <tr key={i} className="border-b border-border/50 hover:bg-muted/30" data-testid={`position-row-${pos.coin}`}>
            <td className="px-3 py-1.5 font-medium">{pos.coin}</td>
            <td className={cn("px-3 py-1.5", pos.side === "long" ? "text-bullish" : "text-bearish")}>
              {pos.side === "long" ? "Long" : "Short"}
            </td>
            <td className="px-3 py-1.5 text-right font-mono">{formatSize(pos.size)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{formatPrice(pos.entryPrice)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{formatPrice(pos.markPrice)}</td>
            <td className="px-3 py-1.5 text-right font-mono text-bearish">
              {pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : "--"}
            </td>
            <td className={cn(
              "px-3 py-1.5 text-right font-mono",
              pos.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {pos.unrealizedPnl >= 0 ? "+" : ""}{formatPrice(pos.unrealizedPnl)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono">{pos.leverage}x</td>
            <td className="px-3 py-1.5 text-center">--</td>
          </tr>
        ))}
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
          <th className="text-left px-3 py-1.5 font-medium">Time</th>
          <th className="text-left px-3 py-1.5 font-medium">Type</th>
          <th className="text-left px-3 py-1.5 font-medium">Coin</th>
          <th className="text-left px-3 py-1.5 font-medium">Direction</th>
          <th className="text-right px-3 py-1.5 font-medium">Size</th>
          <th className="text-right px-3 py-1.5 font-medium">Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Trigger</th>
          <th className="text-center px-3 py-1.5 font-medium">Reduce Only</th>
          <th className="text-right px-3 py-1.5 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order, i) => {
          const orderType = getOrderType(order);
          const isBuy = order.side === "B" || order.side === "buy";
          const isStopLoss = orderType === "Stop Loss";
          
          return (
            <tr key={order.oid || i} className="border-b border-border/50 hover:bg-muted/30" data-testid={`order-row-${order.oid}`}>
              <td className="px-3 py-1.5 text-muted-foreground">--</td>
              <td className={cn("px-3 py-1.5", isStopLoss ? "text-bearish" : "text-bullish")}>
                {orderType}
              </td>
              <td className="px-3 py-1.5 font-medium">{order.coin}</td>
              <td className={cn("px-3 py-1.5", isBuy ? "text-bullish" : "text-bearish")}>
                {isBuy ? "Buy" : "Sell"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatSize(order.sz)}</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {order.limitPx === "0" ? "Market" : formatPrice(order.limitPx)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {order.triggerPx ? formatPrice(order.triggerPx) : "--"}
              </td>
              <td className="px-3 py-1.5 text-center">
                {(order as any).reduceOnly ? "Yes" : "--"}
              </td>
              <td className="px-3 py-1.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-bearish hover:text-bearish hover:bg-bearish/10"
                  onClick={() => onCancel(order)}
                  data-testid={`button-cancel-order-${order.oid}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
