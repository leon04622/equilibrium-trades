import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { Wallet, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountEquity() {
  const { connected, accountValue, balance, marginUsed, isLoadingAccount, positions } = useTrading();
  const { connect } = useWallet();

  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
  const crossMarginRatio = accountValue > 0 ? (marginUsed / accountValue) * 100 : 0;
  const maintenanceMargin = marginUsed * 0.03;

  const formatValue = (v: number) => {
    if (v === 0) return "$0.00";
    if (Math.abs(v) >= 1000) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${v.toFixed(2)}`;
  };

  if (!connected) {
    return (
      <div className="border rounded-lg p-4 bg-card">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Connect wallet to view account</p>
          <Button 
            size="sm" 
            onClick={() => connect()}
            className="gap-2"
            data-testid="button-connect-equity"
          >
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-card">
      {/* Header actions */}
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-semibold">Account Equity</span>
        <div className="flex items-center gap-1">
          <Button 
            variant="default" 
            size="sm" 
            className="h-7 text-xs bg-primary"
            onClick={() => window.open("https://app.hyperliquid.xyz/trade", "_blank")}
            data-testid="button-deposit"
          >
            Deposit
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => window.open("https://app.hyperliquid.xyz/trade", "_blank")}
            data-testid="button-withdraw"
          >
            Withdraw
          </Button>
        </div>
      </div>

      {/* Account stats */}
      <div className="p-3 space-y-2 text-xs">
        {isLoadingAccount ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Value</span>
              <span className="font-mono font-semibold">{formatValue(accountValue)}</span>
            </div>
            
            <Separator />
            
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono">{formatValue(balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unrealized PNL</span>
                <span className={cn(
                  "font-mono",
                  totalUnrealizedPnl > 0 ? "text-bullish" : totalUnrealizedPnl < 0 ? "text-bearish" : ""
                )}>
                  {totalUnrealizedPnl >= 0 ? "+" : ""}{formatValue(totalUnrealizedPnl)}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5 text-muted-foreground">
              <div className="text-[10px] font-medium uppercase tracking-wide">Perps Overview</div>
              <div className="flex justify-between">
                <span>Cross Margin Ratio</span>
                <span className="font-mono text-foreground">{crossMarginRatio.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Maintenance Margin</span>
                <span className="font-mono text-foreground">{formatValue(maintenanceMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span>Margin Used</span>
                <span className="font-mono text-foreground">{formatValue(marginUsed)}</span>
              </div>
            </div>

            {accountValue === 0 && (
              <div className="mt-3 p-2 bg-amber-500/10 rounded text-[10px] text-center">
                <p className="text-muted-foreground">
                  Deposit funds on{" "}
                  <a 
                    href="https://app.hyperliquid.xyz" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-0.5"
                  >
                    Hyperliquid <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {" "}to start trading
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
