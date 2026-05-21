import { ArrowDownToLine, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrading } from "@/lib/trading-context";
import { useDepositSheet } from "@/lib/deposit-sheet-context";
import { cn } from "@/lib/utils";

type ChartBalanceBarProps = {
  className?: string;
};

/** Compact balances + transfer actions on the trading chart (exchange-style). */
export function ChartBalanceBar({ className }: ChartBalanceBarProps) {
  const {
    connected,
    displayTotalUsd,
    unifiedAccountUsd,
    walletUsdcArbitrum,
    isLoadingWalletUsdc,
    isLoadingAccount,
  } = useTrading();
  const { openAddToTrading, openTransfer } = useDepositSheet();

  if (!connected) return null;

  const loading = isLoadingWalletUsdc && walletUsdcArbitrum <= 0 && unifiedAccountUsd <= 0;
  const hasWallet = walletUsdcArbitrum >= 0.01;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-2 py-1.5 text-[11px] backdrop-blur-sm",
        className,
      )}
      data-testid="chart-balance-bar"
    >
      <div className="flex items-center gap-3 font-mono shrink-0">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold text-foreground">
          {loading ? "…" : `$${displayTotalUsd.toFixed(2)}`}
        </span>
        <span className="hidden sm:inline text-muted-foreground/60">|</span>
        <span className="hidden sm:inline text-muted-foreground">Trade</span>
        <span className="hidden sm:inline font-medium">
          {loading ? "…" : `$${unifiedAccountUsd.toFixed(2)}`}
        </span>
        {hasWallet && (
          <>
            <span className="hidden md:inline text-muted-foreground/60">|</span>
            <span className="hidden md:inline text-amber-700 dark:text-amber-400">
              Wallet ${walletUsdcArbitrum.toFixed(2)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={openTransfer}
          data-testid="button-chart-transfer"
        >
          <ArrowRightLeft className="h-3 w-3 mr-1" />
          Transfer
        </Button>
        {hasWallet ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={openAddToTrading}
            data-testid="button-chart-add-to-trading"
          >
            <ArrowDownToLine className="h-3 w-3 mr-1" />
            Add to trading
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={openAddToTrading}
            data-testid="button-chart-deposit"
          >
            <ArrowDownToLine className="h-3 w-3 mr-1" />
            Deposit
          </Button>
        )}
      </div>
    </div>
  );
}
