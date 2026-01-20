import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ShieldCheck, Target, AlertTriangle, Loader2, Info, HelpCircle } from "lucide-react";
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
  const [leverageValue, setLeverageValue] = useState([10]);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { balance, refreshAccount } = useTrading();
  const { isConnected, signer, connect } = useWallet();
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

  const isValidOrder = () => {
    const qty = getQuantity();
    if (qty <= 0) return false;
    const orderPrice = getPrice();
    if (orderPrice <= 0) return false;
    if (orderType === "limit") {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) return false;
    }
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
        reduceOnly,
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

      // Refresh positions after successful order
      await refreshAccount();

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

  const availableToTrade = balance * leverageValue[0];
  const currentPosition = 0; // Would come from positions

  return (
    <div className="border rounded-lg bg-card">
      {/* Header with mode toggles */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-mono">{coin}</Badge>
          <span className="text-xs text-muted-foreground">Perp</span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  orderType === "market" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setOrderType("market")}
              >
                Market
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold">Market Order</p>
              <p className="text-xs mt-1">Executes immediately at the current market price. Best for quick entries/exits. May have slight slippage during volatile conditions.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  orderType === "limit" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setOrderType("limit")}
              >
                Limit
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold">Limit Order</p>
              <p className="text-xs mt-1">Only executes at your specified price or better. Won't fill if price doesn't reach your level. Good for getting a specific entry price.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Buy/Sell Toggle with tooltips */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "py-2 text-sm font-medium rounded-md transition-all",
                  side === "buy" 
                    ? "bg-bullish text-white shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setSide("buy")}
                data-testid="order-side-buy"
              >
                Buy / Long
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold">Going Long (Buy)</p>
              <p className="text-xs mt-1">You profit when the price goes UP. Buy low, sell high. This is the most common way to trade.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "py-2 text-sm font-medium rounded-md transition-all",
                  side === "sell" 
                    ? "bg-bearish text-white shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setSide("sell")}
                data-testid="order-side-sell"
              >
                Sell / Short
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold">Going Short (Sell)</p>
              <p className="text-xs mt-1">You profit when the price goes DOWN. You're betting the price will fall. More advanced - use with caution.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Order info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Available to Trade</span>
            <p className="font-mono font-semibold text-bullish">${formatPrice(availableToTrade)}</p>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Current Position</span>
            <p className="font-mono">{currentPosition.toFixed(4)} {coin}</p>
          </div>
        </div>

        <Separator />

        {/* Size input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Size</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold">Position Size</p>
                  <p className="text-xs mt-1">How much of the asset you want to buy/sell. Start small (e.g. 0.001 BTC) while learning. Use the % buttons below to quickly set based on your balance.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-[10px] text-muted-foreground">{coin}</span>
          </div>
          <Input
            type="number"
            placeholder="0.0000"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="font-mono h-9 text-right"
            data-testid="input-order-quantity"
          />
          <div className="flex gap-1">
            {[25, 50, 75, 100].map((pct) => (
              <Button
                key={pct}
                variant="outline"
                size="sm"
                className="flex-1 h-6 text-[10px] font-mono"
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

        {/* Price input for limit orders */}
        {orderType === "limit" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Price</Label>
              <span className="text-[10px] text-muted-foreground">USDC</span>
            </div>
            <Input
              type="number"
              placeholder={formatPrice(currentPrice)}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="font-mono h-9 text-right"
              data-testid="input-order-price"
            />
          </div>
        )}

        {/* Leverage slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Leverage</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold text-warning">Leverage (Risk Warning!)</p>
                  <p className="text-xs mt-1">Multiplies your gains AND losses. 10x means a 1% price move = 10% profit/loss. Higher leverage = higher risk of liquidation. Beginners should use 1-3x maximum.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={leverageValue[0]}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= 50) {
                    setLeverageValue([val]);
                  }
                }}
                className="w-14 h-6 text-xs font-mono text-center p-1"
              />
              <span className="text-xs text-muted-foreground">x</span>
            </div>
          </div>
          <Slider
            value={leverageValue}
            onValueChange={setLeverageValue}
            min={1}
            max={50}
            step={1}
            className="py-1"
            data-testid="slider-leverage"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>1x</span>
            <span>10x</span>
            <span>25x</span>
            <span>50x</span>
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Switch
              checked={reduceOnly}
              onCheckedChange={setReduceOnly}
              id="reduce-only"
              className="scale-75"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <label htmlFor="reduce-only" className="text-muted-foreground cursor-pointer flex items-center gap-1">
                  Reduce Only
                  <HelpCircle className="h-3 w-3" />
                </label>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold">Reduce Only Mode</p>
                <p className="text-xs mt-1">Only allows closing existing positions, won't open new ones. Use this when you only want to take profits or exit a trade.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={showSLTP}
              onCheckedChange={setShowSLTP}
              id="sltp-toggle"
              className="scale-75"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <label htmlFor="sltp-toggle" className="text-muted-foreground cursor-pointer flex items-center gap-1">
                  TP / SL
                  <HelpCircle className="h-3 w-3" />
                </label>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold">Take Profit & Stop Loss</p>
                <p className="text-xs mt-1">Set automatic exit points. Take Profit closes your trade at a target profit. Stop Loss protects you by closing if price moves against you. Essential for risk management!</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* TP/SL inputs */}
        {showSLTP && (
          <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="text-[10px] flex items-center gap-1 cursor-help">
                      <Target className="h-3 w-3 text-bullish" />
                      Take Profit
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground" />
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold text-bullish">Take Profit (TP)</p>
                    <p className="text-xs mt-1">The price at which you want to lock in your profit. For a long position, set this ABOVE your entry. For a short, set it BELOW. Example: Entry at $100, TP at $105 = 5% profit.</p>
                  </TooltipContent>
                </Tooltip>
                <Input
                  type="number"
                  placeholder={formatPrice(currentPrice * (side === "buy" ? 1.05 : 0.95))}
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="font-mono h-8 text-xs"
                  data-testid="input-take-profit"
                />
              </div>
              <div className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="text-[10px] flex items-center gap-1 cursor-help">
                      <ShieldCheck className="h-3 w-3 text-bearish" />
                      Stop Loss
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground" />
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold text-bearish">Stop Loss (SL)</p>
                    <p className="text-xs mt-1">The price at which you exit to limit your loss. For a long, set this BELOW entry. For a short, set it ABOVE. Never trade without a stop loss! Protects your capital.</p>
                  </TooltipContent>
                </Tooltip>
                <Input
                  type="number"
                  placeholder={formatPrice(currentPrice * (side === "buy" ? 0.98 : 1.02))}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="font-mono h-8 text-xs"
                  data-testid="input-stop-loss"
                />
              </div>
            </div>
          </div>
        )}

        {/* Order summary */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help flex items-center gap-1">Order Value <HelpCircle className="h-2.5 w-2.5" /></span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total value of your order (Size x Price)</p>
              </TooltipContent>
            </Tooltip>
            <span className="font-mono">${formatPrice(calculateEstimate())}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help flex items-center gap-1">Margin Required <HelpCircle className="h-2.5 w-2.5" /></span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>The amount of your balance needed to open this position. With 10x leverage, you only need 10% of the total order value.</p>
              </TooltipContent>
            </Tooltip>
            <span className="font-mono">${formatPrice(calculateMargin())}</span>
          </div>
        </div>

        {/* Submit button */}
        <Button
          className={cn(
            "w-full h-10 font-semibold text-white",
            !isConnected
              ? "bg-primary"
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
              Signing Order...
            </>
          ) : !isConnected 
            ? "Enable Trading"
            : `${side === "buy" ? "Buy / Long" : "Sell / Short"} ${coin}`
          }
        </Button>

        {isConnected && (
          <p className="text-[10px] text-center text-muted-foreground">
            Est. 0% / Max 0.05%
          </p>
        )}
      </div>
    </div>
  );
}
