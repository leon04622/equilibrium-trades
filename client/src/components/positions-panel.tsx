import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, RefreshCcw, Wallet } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function PositionsPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const { connected, positions, orders, tradeHistory, closePosition, cancelOrder, updatePrices, accountValue, marginUsed, balance, isLoadingAccount, refreshAccount } = useTrading();
  const { connect: walletConnect } = useWallet();

  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 3000,
    enabled: connected,
  });

  useEffect(() => {
    if (tickers.length > 0) {
      const prices: Record<string, number> = {};
      tickers.forEach((t: any) => {
        if (t.coin && t.markPx) {
          prices[t.coin] = parseFloat(t.markPx);
        }
      });
      updatePrices(prices);
    }
  }, [tickers, updatePrices]);

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(6);
  };

  const formatPnl = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  };

  const openOrders = orders.filter(o => o.status === "pending");

  if (!connected) {
    return (
      <div className="border-t bg-background">
        <div 
          className="flex items-center justify-between px-4 py-2 cursor-pointer hover-elevate"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Positions</span>
            <Badge variant="secondary" className="text-xs">Not Connected</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
        
        {isExpanded && (
          <div className="px-4 pb-4">
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Connect your wallet to view positions</p>
              <Button 
                variant="default" 
                size="sm" 
                className="mt-3" 
                onClick={() => walletConnect()}
                data-testid="button-connect-wallet"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t bg-background">
      <Tabs defaultValue="positions" className="w-full">
        <div className="flex items-center justify-between px-2 border-b gap-2">
          <TabsList className="bg-transparent h-10 p-0 gap-0">
            <TabsTrigger 
              value="positions" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-positions"
            >
              Positions
              <Badge variant="secondary" className="ml-2 text-xs h-5">{positions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="orders"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-orders"
            >
              Open Orders
              <Badge variant="secondary" className="ml-2 text-xs h-5">{openOrders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-history"
            >
              Trade History
              <Badge variant="secondary" className="ml-2 text-xs h-5">{tradeHistory.length}</Badge>
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-4">
            {isLoadingAccount ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <div className="text-right">
                  <span className="text-muted-foreground">Account Value</span>
                  <p className="font-mono font-semibold text-foreground">${accountValue.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Available</span>
                  <p className="font-mono font-semibold text-bullish">${balance.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Margin Used</span>
                  <p className="font-mono font-semibold text-foreground">${marginUsed.toFixed(2)}</p>
                </div>
              </div>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={() => refreshAccount()}
              disabled={isLoadingAccount}
              data-testid="button-refresh-account"
            >
              <RefreshCcw className={cn("h-4 w-4", isLoadingAccount && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <ScrollArea className="h-40">
            <TabsContent value="positions" className="m-0">
              {positions.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No open positions
                </div>
              ) : (
                <div className="divide-y">
                  {positions.map(pos => (
                    <div key={pos.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={pos.side === "long" ? "default" : "destructive"}
                            className={cn(
                              "text-xs",
                              pos.side === "long" ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-red-500/20 text-red-500 border-red-500/30"
                            )}
                          >
                            {pos.side.toUpperCase()} {pos.leverage}x
                          </Badge>
                          <span className="font-semibold">{pos.coin}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Size: {pos.size}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right text-xs">
                          <div className="text-muted-foreground">Entry</div>
                          <div className="font-mono">${formatPrice(pos.entryPrice)}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="text-muted-foreground">Mark</div>
                          <div className="font-mono">${formatPrice(pos.markPrice)}</div>
                        </div>
                        <div className="text-right text-xs min-w-[80px]">
                          <div className="text-muted-foreground">PnL</div>
                          <div className={cn(
                            "font-mono font-medium",
                            pos.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {formatPnl(pos.unrealizedPnl)}
                            <span className="text-[10px] ml-1">
                              ({pos.unrealizedPnlPercent >= 0 ? "+" : ""}{pos.unrealizedPnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs hover:bg-red-500/20 hover:text-red-500"
                          onClick={() => closePosition(pos.id)}
                          data-testid={`button-close-position-${pos.id}`}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Close
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="orders" className="m-0">
              {openOrders.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No open orders
                </div>
              ) : (
                <div className="divide-y">
                  {openOrders.map(order => (
                    <div key={order.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant={order.side === "buy" ? "default" : "destructive"} className="text-xs">
                          {order.side.toUpperCase()}
                        </Badge>
                        <span className="font-semibold">{order.coin}</span>
                        <span className="text-xs text-muted-foreground">{order.type}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-xs">
                          <div className="text-muted-foreground">Qty</div>
                          <div className="font-mono">{order.quantity}</div>
                        </div>
                        {order.price && (
                          <div className="text-right text-xs">
                            <div className="text-muted-foreground">Price</div>
                            <div className="font-mono">${formatPrice(order.price)}</div>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs hover:bg-red-500/20 hover:text-red-500"
                          onClick={() => cancelOrder(order.id)}
                          data-testid={`button-cancel-order-${order.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="history" className="m-0">
              {tradeHistory.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No trade history
                </div>
              ) : (
                <div className="divide-y">
                  {tradeHistory.slice(0, 20).map(trade => (
                    <div key={trade.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        {trade.side === "buy" ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-semibold">{trade.coin}</span>
                        <span className="text-xs text-muted-foreground">{trade.size} @ ${formatPrice(trade.price)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {trade.pnl !== undefined && (
                          <span className={cn(
                            "text-sm font-mono font-medium",
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {formatPnl(trade.pnl)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {trade.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        )}
      </Tabs>
    </div>
  );
}
