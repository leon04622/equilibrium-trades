import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import {
  placeOrder as placeHyperliquidOrder,
  trySetReferrer,
  setLeverage,
  getCoinMaxLeverage,
} from "@/lib/hyperliquid-client";
import { useToast } from "@/hooks/use-toast";

interface OrderEntryProps {
  coin: string;
  currentPrice: number;
  onOrderSubmit?: (order: any) => void;
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export function OrderEntry({ coin, currentPrice, onOrderSubmit }: OrderEntryProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [size, setSize] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [leverage, setLeverage_] = useState(10);
  const [maxLev, setMaxLev] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { balance, refreshAccount, placeTPSL } = useTrading();
  const { isConnected, signer, connect } = useWallet();
  const { toast } = useToast();

  useEffect(() => {
    getCoinMaxLeverage(coin).then(max => {
      setMaxLev(max);
      setLeverage_(prev => Math.min(prev, max));
    });
  }, [coin]);

  const getExecPrice = () => {
    if (orderType === "market") return currentPrice;
    const p = parseFloat(limitPrice);
    return isNaN(p) || p <= 0 ? currentPrice : p;
  };

  const getSizeNum = () => {
    const s = parseFloat(size);
    return isNaN(s) || s <= 0 ? 0 : s;
  };

  const setPercent = (pct: number) => {
    const maxQty = (balance * leverage) / Math.max(currentPrice, 1);
    setSize((maxQty * pct / 100).toFixed(4));
  };

  const handleSubmit = async (isBuy: boolean) => {
    if (!isConnected) {
      try { await connect(); } catch {
        toast({ title: "Connect failed", description: "Please connect your wallet.", variant: "destructive" });
      }
      return;
    }

    if (!signer) {
      toast({ title: "Wallet not ready", description: "Please connect your wallet first.", variant: "destructive" });
      return;
    }

    const qty = getSizeNum();
    if (qty <= 0) {
      toast({ title: "Invalid size", description: "Enter a position size greater than 0.", variant: "destructive" });
      return;
    }

    if (orderType === "limit") {
      const p = parseFloat(limitPrice);
      if (isNaN(p) || p <= 0) {
        toast({ title: "Invalid price", description: "Enter a valid limit price.", variant: "destructive" });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Register referral code (best-effort, won't block order)
      await trySetReferrer(signer);

      // Set leverage before placing order
      await setLeverage(signer, coin, leverage, true);

      const result = await placeHyperliquidOrder(signer, {
        coin,
        isBuy,
        size: qty,
        price: orderType === "limit" ? parseFloat(limitPrice) : undefined,
        orderType,
        reduceOnly: false,
        slippage: 0.02,
      });

      if (!result.success) {
        let msg = result.error || "Unable to place order";
        if (msg.includes("does not exist")) msg = "Please deposit funds on Hyperliquid first at app.hyperliquid.xyz";
        else if (msg.includes("Insufficient")) msg = "Insufficient margin. Please deposit more funds.";
        toast({ title: "Order Failed", description: msg, variant: "destructive" });
        return;
      }

      const fillPrice = result.avgPrice || getExecPrice();
      toast({
        title: `${isBuy ? "Long" : "Short"} ${result.status === "filled" ? "Filled" : "Placed"}`,
        description: `${qty} ${coin} @ $${fmt(fillPrice)} · ${leverage}x`,
      });

      await refreshAccount();

      // Place TP/SL if provided
      const tp = takeProfit ? parseFloat(takeProfit) : undefined;
      const sl = stopLoss ? parseFloat(stopLoss) : undefined;

      if (tp || sl) {
        let tpSlErr = "";
        if (tp) {
          if (isBuy && tp <= fillPrice) tpSlErr = `TP must be above fill price ($${fmt(fillPrice)}) for a Long`;
          if (!isBuy && tp >= fillPrice) tpSlErr = `TP must be below fill price ($${fmt(fillPrice)}) for a Short`;
        }
        if (!tpSlErr && sl) {
          if (isBuy && sl >= fillPrice) tpSlErr = `SL must be below fill price ($${fmt(fillPrice)}) for a Long`;
          if (!isBuy && sl <= fillPrice) tpSlErr = `SL must be above fill price ($${fmt(fillPrice)}) for a Short`;
        }
        if (tpSlErr) {
          toast({ title: "TP/SL Skipped", description: tpSlErr, variant: "destructive" });
        } else {
          const tpslRes = await placeTPSL(coin, qty, isBuy, tp, sl, fillPrice);
          if (tpslRes.success) {
            toast({
              title: "TP/SL Set",
              description: `${tp ? `TP $${fmt(tp)}` : ""}${tp && sl ? "  ·  " : ""}${sl ? `SL $${fmt(sl)}` : ""}`,
            });
          } else {
            toast({ title: "TP/SL Failed", description: tpslRes.error, variant: "destructive" });
          }
        }
      }

      setSize("");
      setLimitPrice("");
      setTakeProfit("");
      setStopLoss("");

      onOrderSubmit?.({ isBuy, orderType, qty, price: fillPrice, leverage });
    } catch (err: any) {
      toast({ title: "Order Failed", description: err.message || "Transaction failed.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const notionalValue = getSizeNum() * getExecPrice();
  const marginRequired = leverage > 0 ? notionalValue / leverage : notionalValue;

  return (
    <div className="flex flex-col gap-3 p-3">

      {/* Market / Limit toggle */}
      <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
        {(["market", "limit"] as const).map(t => (
          <button
            key={t}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
              orderType === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setOrderType(t)}
            data-testid={`order-type-${t}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Balance summary */}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Available</span>
        <span className="font-mono text-foreground">${fmt(balance)}</span>
      </div>

      {/* Size */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Size</span>
          <span className="text-muted-foreground">{coin}</span>
        </div>
        <Input
          type="number"
          min="0"
          placeholder="0.0000"
          value={size}
          onChange={e => setSize(e.target.value)}
          className="h-9 font-mono text-right"
          data-testid="input-order-size"
        />
        <div className="grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              onClick={() => setPercent(pct)}
              className="h-6 text-[10px] font-mono rounded border border-border hover:bg-muted transition-colors"
              data-testid={`size-pct-${pct}`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Limit Price</span>
            <span className="text-muted-foreground">USDC</span>
          </div>
          <Input
            type="number"
            min="0"
            placeholder={fmt(currentPrice)}
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            className="h-9 font-mono text-right"
            data-testid="input-limit-price"
          />
        </div>
      )}

      {/* Leverage */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Leverage</span>
          <span className="text-[10px] text-muted-foreground">max {maxLev}x</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            max={maxLev}
            value={leverage}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= 1 && v <= maxLev) setLeverage_(v);
            }}
            className="h-9 font-mono text-right w-20 shrink-0"
            data-testid="input-leverage"
          />
          <span className="text-xs text-muted-foreground">x</span>
          <input
            type="range"
            min="1"
            max={maxLev}
            value={leverage}
            onChange={e => setLeverage_(parseInt(e.target.value))}
            className="flex-1 accent-primary"
            data-testid="slider-leverage"
          />
        </div>
      </div>

      {/* TP / SL */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[11px] text-bullish font-medium">Take Profit</span>
          <Input
            type="number"
            min="0"
            placeholder={fmt(currentPrice * 1.05)}
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            className="h-9 font-mono text-right text-bullish placeholder:text-muted-foreground"
            data-testid="input-take-profit"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-bearish font-medium">Stop Loss</span>
          <Input
            type="number"
            min="0"
            placeholder={fmt(currentPrice * 0.95)}
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            className="h-9 font-mono text-right text-bearish placeholder:text-muted-foreground"
            data-testid="input-stop-loss"
          />
        </div>
      </div>

      {/* Order summary */}
      {getSizeNum() > 0 && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] space-y-0.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order Value</span>
            <span className="font-mono">${fmt(notionalValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Margin Required</span>
            <span className="font-mono">${fmt(marginRequired)}</span>
          </div>
        </div>
      )}

      {/* Buy / Sell buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          className="h-11 font-semibold bg-bullish hover:bg-bullish/90 text-white"
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting}
          data-testid="button-buy-long"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy / Long"}
        </Button>
        <Button
          className="h-11 font-semibold bg-bearish hover:bg-bearish/90 text-white"
          onClick={() => handleSubmit(false)}
          disabled={isSubmitting}
          data-testid="button-sell-short"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sell / Short"}
        </Button>
      </div>

      {!isConnected && (
        <p className="text-center text-[11px] text-muted-foreground">
          Connect your wallet to trade
        </p>
      )}
    </div>
  );
}
