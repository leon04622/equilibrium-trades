import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { useUserSync } from "@/context/AuthContext";
import { ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { StatePanel } from "@/components/state-panel";

export function AccountEquity() {
  const {
    connected,
    accountValue,
    spotUsdcTotal,
    unifiedAccountUsd,
    balance,
    marginUsed,
    isLoadingAccount,
    positions,
  } = useTrading();
  const { data: userSync } = useUserSync();
  const { connect } = useWallet();
  const navigate = useNavigate();

  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
  const crossMarginRatio = accountValue > 0 ? (marginUsed / accountValue) * 100 : 0;
  const maintenanceMargin = marginUsed * 0.03;

  const mongoTotal = userSync?.totalBalance ?? userSync?.hlBalance?.totalUsd ?? null;
  const displayUnified =
    unifiedAccountUsd > 0 ? unifiedAccountUsd : mongoTotal != null && mongoTotal > 0 ? mongoTotal : unifiedAccountUsd;

  const formatValue = (v: number) => {
    if (v === 0) return "$0.00";
    if (Math.abs(v) >= 1000) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${v.toFixed(2)}`;
  };

  if (!connected) {
    return (
      <StatePanel
        icon={<Wallet className="h-6 w-6" />}
        title="Connect a wallet to unlock account controls"
        description="View unified balance, collateral health, and funding controls the moment your wallet is connected."
        actionLabel="Connect wallet"
        onAction={() => connect()}
        className="bg-card"
        contentClassName="min-h-[260px]"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/20 p-3">
        <div>
          <span className="text-sm font-semibold">Account Equity</span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Live collateral overview</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => navigate("/funding?tab=deposit")}
            data-testid="button-deposit"
          >
            Deposit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs bg-background/80"
            onClick={() => navigate("/funding?tab=withdraw")}
            data-testid="button-withdraw"
          >
            Withdraw
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3 text-xs">
        {isLoadingAccount ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Unified total
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-primary" />
                  Perp + spot
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold">{formatValue(displayUnified)}</div>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Perp account value</span>
              <span className="font-mono">{formatValue(accountValue)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Spot USDC (HL)</span>
              <span className="font-mono">{formatValue(spotUsdcTotal)}</span>
            </div>

            {mongoTotal != null && mongoTotal > 0 && unifiedAccountUsd <= 0 && (
              <p className="text-[10px] text-muted-foreground">
                Showing last saved total from your profile — live HL sync pending.{" "}
                {userSync?.hlBalance?.updatedAt
                  ? `Updated ${new Date(userSync.hlBalance.updatedAt).toLocaleString()}.`
                  : null}
              </p>
            )}

            <Separator />

            <div className="flex justify-between">
              <span className="text-muted-foreground">Perp free collateral</span>
              <span className="font-mono">{formatValue(balance)}</span>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unrealized PNL</span>
                <span
                  className={cn(
                    "font-mono",
                    totalUnrealizedPnl > 0 ? "text-bullish" : totalUnrealizedPnl < 0 ? "text-bearish" : "",
                  )}
                >
                  {totalUnrealizedPnl >= 0 ? "+" : ""}
                  {formatValue(totalUnrealizedPnl)}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5 text-muted-foreground">
              <div className="text-[10px] font-medium uppercase tracking-wide">Perps overview</div>
              <div className="flex justify-between">
                <span>Cross margin ratio</span>
                <span className="font-mono text-foreground">{crossMarginRatio.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Maintenance margin</span>
                <span className="font-mono text-foreground">{formatValue(maintenanceMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span>Margin used</span>
                <span className="font-mono text-foreground">{formatValue(marginUsed)}</span>
              </div>
            </div>

            {displayUnified === 0 && (
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[10px] text-center">
                <p className="text-muted-foreground">
                  Deposit funds to start trading. Visit the{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/funding?tab=deposit")}
                    className="text-primary underline"
                  >
                    Funding page
                  </button>{" "}
                  to manage funds.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
