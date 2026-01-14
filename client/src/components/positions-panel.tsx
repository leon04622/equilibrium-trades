import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, RefreshCcw, Wallet, ShieldCheck, Target, Loader2 } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { placeTriggerOrder } from "@/lib/hyperliquid-client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface SLTPPopoverProps {
  position: {
    id: string;
    coin: string;
    side: "long" | "short";
    size: number;
    entryPrice: number;
    markPrice: number;
  };
  onClose: () => void;
}

function SLTPPopover({ position, onClose }: SLTPPopoverProps) {
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signer } = useWallet();
  const { toast } = useToast();

  const isLong = position.side === "long";
  const suggestedSL = isLong ? position.entryPrice * 0.97 : position.entryPrice * 1.03;
  const suggestedTP = isLong ? position.entryPrice * 1.05 : position.entryPrice * 0.95;

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const handleSetSLTP = async (type: "sl" | "tp") => {
    const priceStr = type === "sl" ? stopLoss : takeProfit;
    const price = parseFloat(priceStr);
    
    if (!price || price <= 0) {
      toast({
        title: "Invalid Price",
        description: `Please enter a valid ${type === "sl" ? "stop loss" : "take profit"} price.`,
        variant: "destructive",
      });
      return;
    }

    if (!signer) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to set SL/TP.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await placeTriggerOrder(signer, {
        coin: position.coin,
        isBuy: !isLong,
        size: position.size,
        triggerPrice: price,
        isStopLoss: type === "sl",
        reduceOnly: true,
      });

      if (result.success) {
        toast({
          title: `${type === "sl" ? "Stop Loss" : "Take Profit"} Set`,
          description: `${type === "sl" ? "SL" : "TP"} order placed at $${formatPrice(price)}`,
        });
        if (type === "sl") setStopLoss("");
        else setTakeProfit("");
      } else {
        let errorMsg = result.error || "Failed to place order";
        if (errorMsg.includes("does not exist")) {
          errorMsg = "Please ensure you have funds on Hyperliquid";
        }
        toast({
          title: "Order Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set order",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 p-1">
      <div className="text-sm font-medium">Set SL/TP for {position.coin}</div>
      <div className="text-xs text-muted-foreground">
        Entry: ${formatPrice(position.entryPrice)} | Mark: ${formatPrice(position.markPrice)}
      </div>
      
      <div className="space-y-2">
        <Label className="text-xs">Stop Loss</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={formatPrice(suggestedSL)}
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Button 
            size="sm" 
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => handleSetSLTP("sl")}
            disabled={isSubmitting || !stopLoss}
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Set SL
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Suggested: ${formatPrice(suggestedSL)} ({isLong ? "-3%" : "+3%"})
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Take Profit</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={formatPrice(suggestedTP)}
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Button 
            size="sm" 
            variant="default"
            className="h-8 text-xs bg-green-600 hover:bg-green-700"
            onClick={() => handleSetSLTP("tp")}
            disabled={isSubmitting || !takeProfit}
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3 mr-1" />}
            Set TP
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Suggested: ${formatPrice(suggestedTP)} ({isLong ? "+5%" : "-5%"})
        </div>
      </div>
    </div>
  );
}

export function PositionsPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const { connected, positions, orders, tradeHistory, closePosition, cancelOrder, updatePrices, accountValue, marginUsed, balance, isLoadingAccount, refreshAccount } = useTrading();
  const { connect: walletConnect } = useWallet();
  const { toast } = useToast();

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
                        
                        <Popover open={activePopover === pos.id} onOpenChange={(open) => setActivePopover(open ? pos.id : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              data-testid={`button-sltp-${pos.id}`}
                            >
                              <Target className="h-3 w-3 mr-1" />
                              SL/TP
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72" align="end">
                            <SLTPPopover 
                              position={pos} 
                              onClose={() => setActivePopover(null)} 
                            />
                          </PopoverContent>
                        </Popover>
                        
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
