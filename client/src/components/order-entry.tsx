import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShieldCheck, Target, AlertTriangle, TrendingUp, TrendingDown, Wallet, Loader2 } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { placeOrder as placeHyperliquidOrder, setLeverage } from "@/lib/hyperliquid-client";
import { useToast } from "@/hooks/use-toast";

interface OrderEntryProps {
  coin: string;
  currentPrice: number;
  onOrderSubmit?: (order: any) => void;
}

export function OrderEntry({ coin, currentPrice, onOrderSubmit }: OrderEntryProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [showSLTP, setShowSLTP] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverageValue, setLeverageValue] = useState([5]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { balance, placeOrder } = useTrading();
  const { isConnected, address, signer, connect } = useWallet();
  const { toast } = useToast();

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const getQuantity = () => {
    const parsed = parseFloat(quantity);
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
  };

  const getPrice = () => {
    if (orderType === "market") return currentPrice;
    const parsed = parseFloat(price);
    return isNaN(parsed) || parsed <= 0 ? currentPrice : parsed;
  };

  const calculateEstimate = () => {
    const qty = getQuantity();
    const orderPrice = getPrice();
    return qty * orderPrice;
  };

  const calculateMargin = () => {
    return calculateEstimate() / leverageValue[0];
  };

  const calculatePnL = () => {
    if (!showSLTP) return null;
    const qty = getQuantity();
    if (qty <= 0) return null;
    
    const entryPrice = getPrice();
    const slPrice = parseFloat(stopLoss);
    const tpPrice = parseFloat(takeProfit);
    
    let slPnL = 0, tpPnL = 0;
    
    if (side === "buy") {
      if (!isNaN(slPrice) && slPrice > 0) slPnL = (slPrice - entryPrice) * qty * leverageValue[0];
      if (!isNaN(tpPrice) && tpPrice > 0) tpPnL = (tpPrice - entryPrice) * qty * leverageValue[0];
    } else {
      if (!isNaN(slPrice) && slPrice > 0) slPnL = (entryPrice - slPrice) * qty * leverageValue[0];
      if (!isNaN(tpPrice) && tpPrice > 0) tpPnL = (entryPrice - tpPrice) * qty * leverageValue[0];
    }
    
    return { slPnL, tpPnL };
  };

  const isValidOrder = () => {
    const qty = getQuantity();
    if (qty <= 0) return false;
    const orderPrice = getPrice();
    if (orderPrice <= 0) return false;
    if (orderType === "limit") {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) return false;
    }
    const margin = calculateMargin();
    if (margin <= 0 || margin > balance) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isConnected) {
      try {
        await connect();
      } catch (error) {
        toast({
          title: "Connection Failed",
          description: "Failed to connect wallet. Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    if (!isValidOrder()) {
      if (getPrice() <= 0) {
        toast({
          title: "Price not available",
          description: "Waiting for market data. Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    if (!signer) {
      toast({
        title: "Wallet not ready",
        description: "Please connect your wallet first.",
        variant: "destructive",
      });
      return;
    }
    
    const orderPrice = getPrice();
    const qty = getQuantity();
    
    setIsSubmitting(true);
    
    try {
      await setLeverage(signer, coin, leverageValue[0], true);
      
      const result = await placeHyperliquidOrder(signer, {
        coin,
        isBuy: side === "buy",
        size: qty,
        price: orderType === "limit" ? orderPrice : undefined,
        orderType,
        reduceOnly: false,
        slippage: 0.02,
      });

      if (!result.success) {
        let errorMsg = result.error || "Unable to place order";
        
        if (errorMsg.includes("does not exist")) {
          errorMsg = "Please deposit funds on Hyperliquid first at app.hyperliquid.xyz";
        } else if (errorMsg.includes("Insufficient")) {
          errorMsg = "Insufficient margin. Please deposit more funds on Hyperliquid.";
        }
        
        toast({
          title: "Order Failed",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: `${side === "buy" ? "Long" : "Short"} Order ${result.status === "filled" ? "Filled" : "Placed"}`,
        description: `${qty} ${coin} at $${formatPrice(result.avgPrice || orderPrice)} with ${leverageValue[0]}x leverage`,
      });

      setQuantity("");
      setPrice("");
      setStopLoss("");
      setTakeProfit("");

      onOrderSubmit?.({
        side,
        type: orderType,
        quantity: qty,
        price: result.avgPrice || orderPrice,
        leverage: leverageValue[0],
        orderId: result.orderId,
      });
    } catch (error: any) {
      console.error("Order error:", error);
      toast({
        title: "Order Failed",
        description: error.message || "Transaction failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pnl = calculatePnL();

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Place Order</span>
          <div className="flex items-center gap-2">
            {isConnected && address && (
              <Badge variant="outline" className="font-mono text-xs">
                <Wallet className="h-3 w-3 mr-1" />
                {address.slice(0, 6)}...{address.slice(-4)}
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-xs">
              {coin}/USDC
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <div className="p-3 bg-primary/10 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-2">Connect wallet to start trading</p>
            <Button size="sm" onClick={() => connect()} data-testid="button-connect-order">
              Connect Wallet
            </Button>
          </div>
        )}

        <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="buy"
              className={cn(
                "data-[state=active]:bg-bullish data-[state=active]:text-white"
              )}
              data-testid="order-side-buy"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Buy / Long
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className={cn(
                "data-[state=active]:bg-bearish data-[state=active]:text-white"
              )}
              data-testid="order-side-sell"
            >
              <TrendingDown className="h-4 w-4 mr-1" />
              Sell / Short
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as "market" | "limit")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="market" data-testid="order-type-market">Market</TabsTrigger>
            <TabsTrigger value="limit" data-testid="order-type-limit">Limit</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {orderType === "limit" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Price</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder={formatPrice(currentPrice)}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="font-mono pr-16"
                  data-testid="input-order-price"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Quantity ({coin})</Label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="font-mono pr-16"
                data-testid="input-order-quantity"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {coin}
              </span>
            </div>
            <div className="flex gap-1 mt-1">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-6 text-[10px]"
                  onClick={() => {
                    const maxQty = (balance * leverageValue[0]) / currentPrice;
                    setQuantity((maxQty * (pct / 100)).toFixed(4));
                  }}
                  data-testid={`quantity-${pct}`}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Leverage: {leverageValue[0]}x</Label>
            <Slider
              value={leverageValue}
              onValueChange={setLeverageValue}
              min={1}
              max={50}
              step={1}
              className="py-2"
              data-testid="slider-leverage"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1x</span>
              <span>25x</span>
              <span>50x</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Switch
                checked={showSLTP}
                onCheckedChange={setShowSLTP}
                data-testid="toggle-sltp"
              />
              <Label className="text-xs cursor-pointer" onClick={() => setShowSLTP(!showSLTP)}>
                TP / SL
              </Label>
            </div>
            <div className="text-right text-xs">
              <div className="text-muted-foreground">Margin: ${formatPrice(calculateMargin())}</div>
              <div className="text-muted-foreground">Est: ${formatPrice(calculateEstimate())}</div>
            </div>
          </div>

          {showSLTP && (
            <div className="space-y-3 p-3 bg-muted/30 rounded-md">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Target className="h-3 w-3 text-bullish" />
                  Take Profit
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder={side === "buy" 
                      ? formatPrice(currentPrice * 1.05)
                      : formatPrice(currentPrice * 0.95)
                    }
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    className="font-mono pr-16"
                    data-testid="input-take-profit"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    USDC
                  </span>
                </div>
                {pnl?.tpPnL !== 0 && (
                  <p className="text-xs text-bullish">
                    +${formatPrice(Math.abs(pnl?.tpPnL || 0))} potential profit
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-bearish" />
                  Stop Loss
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder={side === "buy"
                      ? formatPrice(currentPrice * 0.98)
                      : formatPrice(currentPrice * 1.02)
                    }
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="font-mono pr-16"
                    data-testid="input-stop-loss"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    USDC
                  </span>
                </div>
                {pnl?.slPnL !== 0 && (
                  <p className="text-xs text-bearish">
                    -${formatPrice(Math.abs(pnl?.slPnL || 0))} max loss
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-muted-foreground">
                  TP/SL orders execute at market price when triggered
                </span>
              </div>
            </div>
          )}
        </div>

        <Button
          className={cn(
            "w-full font-semibold",
            !isConnected
              ? ""
              : side === "buy"
                ? "bg-bullish hover:bg-bullish/90"
                : "bg-bearish hover:bg-bearish/90"
          )}
          onClick={handleSubmit}
          disabled={isSubmitting || (isConnected && !isValidOrder())}
          data-testid="button-submit-order"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Signing...
            </>
          ) : !isConnected 
            ? "Connect Wallet to Trade"
            : `${side === "buy" ? "Buy / Long" : "Sell / Short"} ${coin}`
          }
        </Button>

        <p className="text-[10px] text-center text-muted-foreground">
          Trading involves risk. Only trade with funds you can afford to lose.
        </p>
        {isConnected && (
          <p className="text-[10px] text-center text-muted-foreground">
            Requires funded Hyperliquid account at{" "}
            <a 
              href="https://app.hyperliquid.xyz" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              app.hyperliquid.xyz
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
