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
import { ShieldCheck, Target, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface OrderEntryProps {
  coin: string;
  currentPrice: number;
  onOrderSubmit?: (order: OrderData) => void;
}

interface OrderData {
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage: number;
}

export function OrderEntry({ coin, currentPrice, onOrderSubmit }: OrderEntryProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [showSLTP, setShowSLTP] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState([5]);

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

  const calculatePnL = () => {
    if (!showSLTP) return null;
    const qty = getQuantity();
    if (qty <= 0) return null;
    
    const entryPrice = getPrice();
    const slPrice = parseFloat(stopLoss);
    const tpPrice = parseFloat(takeProfit);
    
    let slPnL = 0, tpPnL = 0;
    
    if (side === "buy") {
      if (!isNaN(slPrice) && slPrice > 0) slPnL = (slPrice - entryPrice) * qty * leverage[0];
      if (!isNaN(tpPrice) && tpPrice > 0) tpPnL = (tpPrice - entryPrice) * qty * leverage[0];
    } else {
      if (!isNaN(slPrice) && slPrice > 0) slPnL = (entryPrice - slPrice) * qty * leverage[0];
      if (!isNaN(tpPrice) && tpPrice > 0) tpPnL = (entryPrice - tpPrice) * qty * leverage[0];
    }
    
    return { slPnL, tpPnL };
  };

  const isValidOrder = () => {
    const qty = getQuantity();
    if (qty <= 0) return false;
    if (orderType === "limit") {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (!isValidOrder()) return;
    
    const order: OrderData = {
      side,
      type: orderType,
      quantity: getQuantity(),
      price: orderType === "limit" ? getPrice() : undefined,
      stopLoss: showSLTP && stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: showSLTP && takeProfit ? parseFloat(takeProfit) : undefined,
      leverage: leverage[0],
    };
    onOrderSubmit?.(order);
  };

  const pnl = calculatePnL();

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Place Order</span>
          <Badge variant="outline" className="font-mono text-xs">
            {coin}/USDC
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                  onClick={() => setQuantity((0.1 * (pct / 100)).toFixed(4))}
                  data-testid={`quantity-${pct}`}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Leverage: {leverage[0]}x</Label>
            <Slider
              value={leverage}
              onValueChange={setLeverage}
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
            <span className="text-xs text-muted-foreground">
              Est: ${formatPrice(calculateEstimate())}
            </span>
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
            side === "buy"
              ? "bg-bullish hover:bg-bullish/90"
              : "bg-bearish hover:bg-bearish/90"
          )}
          onClick={handleSubmit}
          disabled={!isValidOrder()}
          data-testid="button-submit-order"
        >
          {side === "buy" ? "Buy / Long" : "Sell / Short"} {coin}
        </Button>

        <p className="text-[10px] text-center text-muted-foreground">
          Trading involves risk. Only trade with funds you can afford to lose.
        </p>
      </CardContent>
    </Card>
  );
}
