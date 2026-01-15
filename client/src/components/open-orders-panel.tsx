import { useTrading, type HLOpenOrder } from "@/lib/trading-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Target, Shield, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface OpenOrdersPanelProps {
  coin?: string;
  compact?: boolean;
}

export function OpenOrdersPanel({ coin, compact = false }: OpenOrdersPanelProps) {
  const { openOrders, cancelHLOrder, currentPrices, refreshAccount } = useTrading();
  const { toast } = useToast();
  
  const filteredOrders = coin 
    ? openOrders.filter(o => o.coin === coin) 
    : openOrders;
  
  const handleCancelOrder = async (order: HLOpenOrder) => {
    const result = await cancelHLOrder(order.coin, order.oid);
    if (result.success) {
      toast({
        title: "Order Cancelled",
        description: `${order.coin} order cancelled successfully`,
      });
    } else {
      toast({
        title: "Cancel Failed",
        description: result.error || "Failed to cancel order",
        variant: "destructive",
      });
    }
  };
  
  const formatPrice = (price: string | number) => {
    const p = typeof price === "string" ? parseFloat(price) : price;
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };
  
  const getOrderTypeInfo = (order: HLOpenOrder) => {
    if (order.triggerPx) {
      const triggerPrice = parseFloat(order.triggerPx);
      const limitPrice = parseFloat(order.limitPx);
      const currentPrice = currentPrices[order.coin] || 0;
      
      if (order.side === "B" || order.side === "buy") {
        if (triggerPrice > currentPrice) {
          return { type: "Take Profit", icon: Target, color: "text-bullish", bgColor: "bg-bullish/10" };
        } else {
          return { type: "Stop Loss", icon: Shield, color: "text-bearish", bgColor: "bg-bearish/10" };
        }
      } else {
        if (triggerPrice < currentPrice) {
          return { type: "Take Profit", icon: Target, color: "text-bullish", bgColor: "bg-bullish/10" };
        } else {
          return { type: "Stop Loss", icon: Shield, color: "text-bearish", bgColor: "bg-bearish/10" };
        }
      }
    }
    return { type: "Limit", icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted" };
  };
  
  if (filteredOrders.length === 0) {
    if (compact) return null;
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground text-center">No open orders</p>
        </CardContent>
      </Card>
    );
  }
  
  if (compact) {
    return (
      <div className="space-y-1.5">
        {filteredOrders.map((order) => {
          const orderInfo = getOrderTypeInfo(order);
          const Icon = orderInfo.icon;
          const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
          
          return (
            <div 
              key={order.oid}
              className={cn(
                "flex items-center justify-between p-2 rounded-md",
                orderInfo.bgColor
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("h-3.5 w-3.5", orderInfo.color)} />
                <span className={cn("text-xs font-medium", orderInfo.color)}>
                  {orderInfo.type}
                </span>
                <span className="text-xs font-mono">
                  ${formatPrice(triggerPrice)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => handleCancelOrder(order)}
                data-testid={`button-cancel-order-${order.oid}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Open Orders ({filteredOrders.length})</CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-xs"
          onClick={() => refreshAccount()}
          data-testid="button-refresh-orders"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="py-0 px-4 pb-3">
        <div className="space-y-2">
          {filteredOrders.map((order) => {
            const orderInfo = getOrderTypeInfo(order);
            const Icon = orderInfo.icon;
            const triggerPrice = order.triggerPx ? parseFloat(order.triggerPx) : parseFloat(order.limitPx);
            const size = parseFloat(order.sz);
            
            return (
              <div 
                key={order.oid}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-md border",
                  orderInfo.bgColor
                )}
                data-testid={`order-${order.oid}`}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded", orderInfo.bgColor)}>
                    <Icon className={cn("h-4 w-4", orderInfo.color)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{order.coin}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {orderInfo.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{order.side === "B" || order.side === "buy" ? "Buy" : "Sell"}</span>
                      <span>{size.toFixed(4)}</span>
                      <span>@ ${formatPrice(triggerPrice)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleCancelOrder(order)}
                  data-testid={`button-cancel-order-${order.oid}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
