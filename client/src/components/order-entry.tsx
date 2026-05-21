import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { computeTrailingCallbackRateDecimal } from "@/lib/trailing-stop-orchestrator";
import { useWallet } from "@/lib/wallet-context";
import {
  placeOrder as placeHyperliquidOrder,
  setLeverage,
  getCoinMaxLeverage,
  isSpotCoin,
} from "@/lib/hyperliquid-client";
import { useToast } from "@/hooks/use-toast";
import { useTradeHandshake } from "@/components/trade-handshake-context";
import { saveTradeToJournal } from "@/lib/TradeExecution";
import { calcTpslPnlUsd, describeTpslPnlUsd } from "@/lib/tpsl-pnl";
import type { TradeJournalPatternStatus } from "@shared/schema";

export type OrderSubmitPayload = {
  isBuy: boolean;
  side: "long" | "short";
  orderType: "market" | "limit";
  qty: number;
  price: number;
  leverage: number;
  isSpot: boolean;
};

interface OrderEntryProps {
  coin: string;
  currentPrice: number;
  onOrderSubmit?: (order: OrderSubmitPayload) => void;
  /** Display pair for the journal (e.g. BTC/USDT) */
  pairLabel?: string;
  /** Best AI scanner pattern status for this symbol/timeframe — drives entry grade */
  aiPatternStatus?: TradeJournalPatternStatus | null;
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export function OrderEntry({ coin, currentPrice, onOrderSubmit, pairLabel, aiPatternStatus }: OrderEntryProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [size, setSize] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [leverage, setLeverage_] = useState(10);
  const [maxLev, setMaxLev] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewSide, setPreviewSide] = useState<"long" | "short">("long");
  const isSpot = isSpotCoin(coin);

  const { balance, refreshAccount, placeTPSL } = useTrading();
  const {
    address: walletAddr,
    isConnected,
    signer,
    isCheckingApproval,
    isPreparingHyperliquidSession,
  } = useWallet();
  const { toast } = useToast();
  const { ensureTradeReady } = useTradeHandshake();

  useEffect(() => {
    if (isSpot) { setMaxLev(1); setLeverage_(1); return; }
    getCoinMaxLeverage(coin).then(max => {
      setMaxLev(max);
      setLeverage_(prev => Math.min(prev, max));
    });
  }, [coin, isSpot]);

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
    // Spot: can only spend available balance (no leverage); perps: leverage multiplied
    const effectiveLeverage = isSpot ? 1 : leverage;
    const maxQty = (balance * effectiveLeverage) / Math.max(currentPrice, 1);
    setSize((maxQty * pct / 100).toFixed(4));
  };

  const handleSubmit = async (isBuy: boolean) => {
    const ready = await ensureTradeReady();
    if (!ready) {
      return;
    }

    if (!signer) {
      toast({ title: "Wallet not ready", description: "Please connect your wallet first.", variant: "destructive" });
      return;
    }

    if (isCheckingApproval) {
      toast({ title: "One moment", description: "Checking your account setup…" });
      return;
    }

    if (isPreparingHyperliquidSession) {
      toast({
        title: "Finishing setup",
        description: "Complete any wallet prompts for trading setup, then try again.",
      });
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

    const isSpot = isSpotCoin(coin);
    setIsSubmitting(true);
    try {
      // Set leverage before placing order (perps only — spot has no leverage)
      if (!isSpot) {
        await setLeverage(signer, coin, leverage, true);
      }

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
        if (msg.includes("does not exist")) msg = "Account not found. Please deposit funds via the Portfolio page first.";
        else if (msg.includes("Insufficient")) msg = "Insufficient margin. Please deposit more funds.";
        toast({ title: "Order Failed", description: msg, variant: "destructive" });
        return;
      }

      const fillPrice = result.avgPrice || getExecPrice();
      const sideWord = isSpot ? (isBuy ? "Buy" : "Sell") : isBuy ? "Long" : "Short";
      const statusWord = result.status === "filled" ? "Filled" : "Placed";
      if (!onOrderSubmit) {
        toast({
          title: `${sideWord} ${statusWord}`,
          description: isSpot
            ? `${qty} @ $${fmt(fillPrice)}`
            : `${qty} ${coin} @ $${fmt(fillPrice)} · ${leverage}x`,
        });
      }

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
          const slCb =
            sl != null ? computeTrailingCallbackRateDecimal(isBuy, fillPrice, sl) : null;
          const tpslRes = await placeTPSL(
            coin,
            qty,
            isBuy,
            tp,
            sl,
            fillPrice,
            slCb != null ? { slTrailingCallbackRate: slCb } : undefined,
          );
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

      if (walletAddr) {
        try {
          const slN = sl != null && Number.isFinite(sl) ? sl : undefined;
          const tpN = tp != null && Number.isFinite(tp) ? tp : undefined;
          void saveTradeToJournal(walletAddr, {
            walletAddress: walletAddr,
            pair: pairLabel?.trim() || `${coin}/USDT`,
            coin,
            side: isBuy ? "long" : "short",
            entryPrice: fillPrice,
            size: qty,
            stopLoss: slN ?? null,
            takeProfit: tpN ?? null,
            leverage,
            patternStatusAtEntry: aiPatternStatus ?? null,
            openedAt: new Date().toISOString(),
          });
        } catch (journalErr) {
          console.warn("[trade journal]", journalErr);
        }
      }

      setSize("");
      setLimitPrice("");
      setTakeProfit("");
      setStopLoss("");

      onOrderSubmit?.({
        isBuy,
        side: isBuy ? "long" : "short",
        orderType,
        qty,
        price: fillPrice,
        leverage,
        isSpot,
      });
    } catch (err: any) {
      toast({ title: "Order Failed", description: err.message || "Transaction failed.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const notionalValue = getSizeNum() * getExecPrice();
  const effectiveLeverage = isSpot ? 1 : leverage;
  const marginRequired = effectiveLeverage > 0 ? notionalValue / effectiveLeverage : notionalValue;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Order Entry</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Build the trade with size, leverage, and protective levels before sending it live.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {isSpot ? "Spot" : "Perps"}
          </div>
        </div>
      </div>

      {/* Market / Limit toggle */}
      <div className="flex gap-1 rounded-xl bg-muted p-0.5">
        {(["market", "limit"] as const).map(t => (
          <button
            key={t}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors",
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
      <div className="rounded-xl border bg-card/60 px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Available</span>
          <span className="font-mono text-foreground">${fmt(balance)}</span>
        </div>
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
              className="h-7 rounded-lg border border-border bg-card text-[10px] font-mono transition-colors hover:bg-muted"
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

      {/* Leverage — hidden for spot markets */}
      {!isSpot && (
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
      )}

      {/* Spot info banner */}
      {isSpot && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-400">
          Spot market — buying and selling the actual token, with no leverage applied.
        </div>
      )}

      {/* TP / SL */}
      {!isSpot && (
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
            {getSizeNum() > 0 && takeProfit && (() => {
              const trigger = parseFloat(takeProfit);
              if (!Number.isFinite(trigger)) return null;
              const entry = getExecPrice();
              const pnl = calcTpslPnlUsd(previewSide, getSizeNum(), entry, trigger);
              return (
                <p className={cn("text-[10px] font-mono", pnl >= 0 ? "text-bullish" : "text-bearish")}>
                  {describeTpslPnlUsd(pnl, "tp")} ({previewSide})
                </p>
              );
            })()}
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
            {getSizeNum() > 0 && stopLoss && (() => {
              const trigger = parseFloat(stopLoss);
              if (!Number.isFinite(trigger)) return null;
              const entry = getExecPrice();
              const pnl = calcTpslPnlUsd(previewSide, getSizeNum(), entry, trigger);
              return (
                <p className={cn("text-[10px] font-mono", pnl >= 0 ? "text-bullish" : "text-bearish")}>
                  {describeTpslPnlUsd(pnl, "sl")} ({previewSide})
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {/* Order summary */}
      {getSizeNum() > 0 && (
        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-[11px] space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Zap className="h-3 w-3" />
            Order summary
          </div>
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
          className="h-11 rounded-xl font-semibold bg-bullish hover:bg-bullish/90 text-white shadow-lg shadow-emerald-500/10"
          onMouseEnter={() => setPreviewSide("long")}
          onFocus={() => setPreviewSide("long")}
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting}
          data-testid="button-buy-long"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isSpot ? "Buy" : "Buy / Long"}
        </Button>
        <Button
          className="h-11 rounded-xl font-semibold bg-bearish hover:bg-bearish/90 text-white shadow-lg shadow-rose-500/10"
          onMouseEnter={() => setPreviewSide("short")}
          onFocus={() => setPreviewSide("short")}
          onClick={() => handleSubmit(false)}
          disabled={isSubmitting}
          data-testid="button-sell-short"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isSpot ? "Sell" : "Sell / Short"}
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
