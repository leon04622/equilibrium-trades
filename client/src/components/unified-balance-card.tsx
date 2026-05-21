import { ArrowDownToLine, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTrading } from "@/lib/trading-context";
import { useDepositSheet } from "@/lib/deposit-sheet-context";

function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${v.toFixed(2)}`;
}

type UnifiedBalanceCardProps = {
  className?: string;
  compact?: boolean;
};

/**
 * Single place to see "your money": trading account + USDC sitting on Arbitrum wallet.
 */
export function UnifiedBalanceCard({ className, compact = false }: UnifiedBalanceCardProps) {
  const {
    unifiedAccountUsd,
    walletUsdcArbitrum,
    walletUsdcBridged,
    isLoadingWalletUsdc,
    isLoadingAccount,
    connected,
  } = useTrading();
  const { openAddToTrading } = useDepositSheet();

  const trading = unifiedAccountUsd;
  const wallet = walletUsdcArbitrum;
  const total = trading + wallet;
  const hasWalletFunds = wallet >= 0.01;
  const loading =
    (isLoadingWalletUsdc && wallet <= 0 && trading <= 0) ||
    (isLoadingAccount && trading <= 0 && wallet <= 0);

  if (!connected) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4",
        className,
      )}
      data-testid="unified-balance-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Your balance</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-lg text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating…
              </span>
            ) : (
              fmtUsd(total)
            )}
          </p>
          {!compact && (
            <p className="mt-1 text-xs text-muted-foreground">
              Includes USDC in your wallet and on your trading account — no extra steps to see incoming sends.
            </p>
          )}
        </div>
        {hasWalletFunds && !loading ? (
          <Button
            size="sm"
            className="shrink-0"
            type="button"
            onClick={openAddToTrading}
            data-testid="button-add-to-trading"
          >
            <ArrowDownToLine className="h-4 w-4 mr-1" />
            Add to trading
          </Button>
        ) : null}
      </div>

      <div className={cn("mt-4 grid gap-2 text-xs", compact ? "grid-cols-2" : "sm:grid-cols-2")}>
        <div className="rounded-lg border border-border/80 bg-background/60 px-3 py-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3 w-3" />
            In your wallet (Arbitrum)
          </div>
          <p className="mt-1 font-mono font-semibold text-foreground">{fmtUsd(wallet)}</p>
          {hasWalletFunds ? (
            <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
              Tap Add to trading to use it for orders
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-muted-foreground">Send USDC here — it shows up automatically</p>
          )}
        </div>
        <div className="rounded-lg border border-border/80 bg-background/60 px-3 py-2">
          <div className="text-muted-foreground">Ready to trade (Hyperliquid)</div>
          <p className="mt-1 font-mono font-semibold text-foreground">{fmtUsd(trading)}</p>
        </div>
      </div>

      {(walletUsdcBridged ?? 0) >= 0.01 && wallet < 0.01 ? (
        <p className="mt-2 text-[10px] text-destructive">
          You have bridged USDC.e — swap to native USDC on Arbitrum before adding to trading.
        </p>
      ) : null}
    </div>
  );
}
