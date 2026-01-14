import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, RefreshCcw, Wallet, Pencil, Loader2 } from "lucide-react";
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
    <div className="space-y-3 p-1 min-w-[280px]">
      <div className="text-sm font-medium text-foreground">TP/SL for {position.coin}</div>
      <div className="text-xs text-muted-foreground">
        Entry: ${formatPrice(position.entryPrice)} | Mark: ${formatPrice(position.markPrice)}
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Take Profit</Label>
          <span className="text-[10px] text-muted-foreground">Suggested: ${formatPrice(suggestedTP)}</span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={formatPrice(suggestedTP)}
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            className="h-8 text-xs font-mono bg-background"
          />
          <Button 
            size="sm" 
            className="h-8 text-xs bg-green-600 hover:bg-green-700"
            onClick={() => handleSetSLTP("tp")}
            disabled={isSubmitting || !takeProfit}
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Stop Loss</Label>
          <span className="text-[10px] text-muted-foreground">Suggested: ${formatPrice(suggestedSL)}</span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={formatPrice(suggestedSL)}
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            className="h-8 text-xs font-mono bg-background"
          />
          <Button 
            size="sm" 
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => handleSetSLTP("sl")}
            disabled={isSubmitting || !stopLoss}
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PositionsPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const { connected, positions, orders, tradeHistory, closePosition, cancelOrder, updatePrices, accountValue, marginUsed, balance, isLoadingAccount, refreshAccount } = useTrading();
  const { connect: walletConnect, signer } = useWallet();
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
      <div className="border-t bg-[#0d1117]">
        <div 
          className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[#161b22]"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300">Positions</span>
            <Badge variant="secondary" className="text-xs bg-[#21262d] text-gray-400">Not Connected</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
        
        {isExpanded && (
          <div className="px-4 pb-4">
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">Connect your wallet to view positions</p>
              <Button 
                variant="default" 
                size="sm" 
                className="mt-3 bg-[#238636] hover:bg-[#2ea043]" 
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
    <div className="border-t bg-[#0d1117] text-gray-300">
      <Tabs defaultValue="positions" className="w-full">
        <div className="flex items-center justify-between px-2 border-b border-[#21262d] gap-2">
          <TabsList className="bg-transparent h-9 p-0 gap-0">
            <TabsTrigger 
              value="balances"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#58a6ff] data-[state=active]:bg-transparent data-[state=active]:text-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              data-testid="tab-balances"
            >
              Balances
            </TabsTrigger>
            <TabsTrigger 
              value="positions" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#58a6ff] data-[state=active]:bg-transparent data-[state=active]:text-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              data-testid="tab-positions"
            >
              Positions ({positions.length})
            </TabsTrigger>
            <TabsTrigger 
              value="orders"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#58a6ff] data-[state=active]:bg-transparent data-[state=active]:text-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              data-testid="tab-orders"
            >
              Open Orders
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#58a6ff] data-[state=active]:bg-transparent data-[state=active]:text-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              data-testid="tab-history"
            >
              Trade History
            </TabsTrigger>
            <TabsTrigger 
              value="funding"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#58a6ff] data-[state=active]:bg-transparent data-[state=active]:text-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              data-testid="tab-funding"
            >
              Funding History
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-gray-400 hover:text-white" 
              onClick={() => refreshAccount()}
              disabled={isLoadingAccount}
              data-testid="button-refresh-account"
            >
              <RefreshCcw className={cn("h-4 w-4", isLoadingAccount && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-white" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="min-h-[80px]">
            <TabsContent value="balances" className="m-0 p-4">
              <div className="flex items-center gap-8 text-xs">
                <div>
                  <span className="text-gray-500">Account Value</span>
                  <p className="font-mono text-white">${accountValue.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Available</span>
                  <p className="font-mono text-green-400">${balance.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Margin Used</span>
                  <p className="font-mono text-white">${marginUsed.toFixed(2)}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="positions" className="m-0">
              {positions.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-6">
                  No open positions
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-[#21262d]">
                        <th className="text-left py-2 px-3 font-normal">Coin</th>
                        <th className="text-right py-2 px-3 font-normal">Size</th>
                        <th className="text-right py-2 px-3 font-normal">Position Value</th>
                        <th className="text-right py-2 px-3 font-normal">Entry Price</th>
                        <th className="text-right py-2 px-3 font-normal">Mark Price</th>
                        <th className="text-right py-2 px-3 font-normal">PNL (ROE %)</th>
                        <th className="text-right py-2 px-3 font-normal">Liq. Price</th>
                        <th className="text-right py-2 px-3 font-normal">Margin</th>
                        <th className="text-right py-2 px-3 font-normal">Funding</th>
                        <th className="text-center py-2 px-3 font-normal">Close All</th>
                        <th className="text-center py-2 px-3 font-normal">TP/SL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(pos => {
                        const positionValue = pos.size * pos.markPrice;
                        const margin = positionValue / pos.leverage;
                        const liqPrice = pos.side === "long" 
                          ? pos.entryPrice * (1 - 1/pos.leverage * 0.9)
                          : pos.entryPrice * (1 + 1/pos.leverage * 0.9);
                        const roe = margin > 0 ? (pos.unrealizedPnl / margin) * 100 : 0;
                        
                        return (
                          <tr key={pos.id} className="border-b border-[#21262d] hover:bg-[#161b22]">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-xs font-medium",
                                  pos.side === "long" ? "text-green-400" : "text-red-400"
                                )}>
                                  {pos.coin}
                                </span>
                                <Badge 
                                  variant="secondary" 
                                  className={cn(
                                    "text-[10px] px-1 py-0",
                                    pos.side === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                  )}
                                >
                                  {pos.leverage}x
                                </Badge>
                              </div>
                            </td>
                            <td className={cn(
                              "text-right py-2 px-3 font-mono",
                              pos.side === "long" ? "text-green-400" : "text-red-400"
                            )}>
                              {pos.side === "long" ? "" : "-"}{pos.size} {pos.coin}
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-300">
                              {positionValue.toFixed(2)} USDC
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-300">
                              {formatPrice(pos.entryPrice)}
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-300">
                              {formatPrice(pos.markPrice)}
                            </td>
                            <td className={cn(
                              "text-right py-2 px-3 font-mono",
                              pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                              <div className="flex items-center justify-end gap-1">
                                {formatPnl(pos.unrealizedPnl)}
                                <span className="text-[10px]">
                                  ({roe >= 0 ? "+" : ""}{roe.toFixed(1)}%)
                                </span>
                                <RefreshCcw className="h-3 w-3 text-gray-500 cursor-pointer hover:text-gray-300" onClick={() => refreshAccount()} />
                              </div>
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-300">
                              {formatPrice(liqPrice)}
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-300">
                              <div className="flex items-center justify-end gap-1">
                                ${margin.toFixed(2)}
                                <span className="text-[10px] text-gray-500">(isolated)</span>
                                <Pencil className="h-3 w-3 text-gray-500 cursor-pointer hover:text-gray-300" />
                              </div>
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-gray-400">
                              -$0.00
                            </td>
                            <td className="text-center py-2 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-gray-400 hover:text-white hover:bg-[#21262d]"
                                  onClick={() => {}}
                                >
                                  Limit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-gray-400 hover:text-white hover:bg-[#21262d]"
                                  onClick={() => closePosition(pos.id)}
                                  data-testid={`button-close-market-${pos.id}`}
                                >
                                  Market
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] text-gray-400 hover:text-white hover:bg-[#21262d]"
                                  onClick={() => {}}
                                >
                                  Reverse
                                </Button>
                              </div>
                            </td>
                            <td className="text-center py-2 px-3">
                              <Popover open={activePopover === pos.id} onOpenChange={(open) => setActivePopover(open ? pos.id : null)}>
                                <PopoverTrigger asChild>
                                  <div className="flex items-center justify-center gap-1 cursor-pointer text-gray-400 hover:text-white">
                                    <span className="text-[10px]">-/-</span>
                                    <Pencil className="h-3 w-3" />
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto bg-[#161b22] border-[#30363d]" align="end">
                                  <SLTPPopover 
                                    position={pos} 
                                    onClose={() => setActivePopover(null)} 
                                  />
                                </PopoverContent>
                              </Popover>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="orders" className="m-0">
              {openOrders.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-6">
                  No open orders
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-[#21262d]">
                        <th className="text-left py-2 px-3 font-normal">Coin</th>
                        <th className="text-left py-2 px-3 font-normal">Type</th>
                        <th className="text-right py-2 px-3 font-normal">Side</th>
                        <th className="text-right py-2 px-3 font-normal">Size</th>
                        <th className="text-right py-2 px-3 font-normal">Price</th>
                        <th className="text-center py-2 px-3 font-normal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOrders.map(order => (
                        <tr key={order.id} className="border-b border-[#21262d] hover:bg-[#161b22]">
                          <td className="py-2 px-3 font-medium text-gray-300">{order.coin}</td>
                          <td className="py-2 px-3 text-gray-400">{order.type}</td>
                          <td className={cn(
                            "text-right py-2 px-3",
                            order.side === "buy" ? "text-green-400" : "text-red-400"
                          )}>
                            {order.side.toUpperCase()}
                          </td>
                          <td className="text-right py-2 px-3 font-mono text-gray-300">{order.quantity}</td>
                          <td className="text-right py-2 px-3 font-mono text-gray-300">
                            {order.price ? `$${formatPrice(order.price)}` : "Market"}
                          </td>
                          <td className="text-center py-2 px-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => cancelOrder(order.id)}
                              data-testid={`button-cancel-order-${order.id}`}
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="history" className="m-0">
              {tradeHistory.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-6">
                  No trade history
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-[#21262d]">
                        <th className="text-left py-2 px-3 font-normal">Coin</th>
                        <th className="text-right py-2 px-3 font-normal">Side</th>
                        <th className="text-right py-2 px-3 font-normal">Size</th>
                        <th className="text-right py-2 px-3 font-normal">Price</th>
                        <th className="text-right py-2 px-3 font-normal">PnL</th>
                        <th className="text-right py-2 px-3 font-normal">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.slice(0, 20).map(trade => (
                        <tr key={trade.id} className="border-b border-[#21262d] hover:bg-[#161b22]">
                          <td className="py-2 px-3 font-medium text-gray-300">{trade.coin}</td>
                          <td className={cn(
                            "text-right py-2 px-3",
                            trade.side === "buy" ? "text-green-400" : "text-red-400"
                          )}>
                            {trade.side.toUpperCase()}
                          </td>
                          <td className="text-right py-2 px-3 font-mono text-gray-300">{trade.size}</td>
                          <td className="text-right py-2 px-3 font-mono text-gray-300">${formatPrice(trade.price)}</td>
                          <td className={cn(
                            "text-right py-2 px-3 font-mono",
                            trade.pnl !== undefined && trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {trade.pnl !== undefined ? formatPnl(trade.pnl) : "-"}
                          </td>
                          <td className="text-right py-2 px-3 text-gray-400">
                            {trade.timestamp.toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="funding" className="m-0 p-4">
              <div className="text-center text-sm text-gray-500">
                No funding history
              </div>
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}
