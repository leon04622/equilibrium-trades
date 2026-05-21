import { useTrading } from "@/lib/trading-context";
import { useDepositSheet } from "@/lib/deposit-sheet-context";
import { cn } from "@/lib/utils";

/** Slim header strip when wallet holds USDC not yet on HL. */
export function WalletUsdcStrip({ className }: { className?: string }) {
  const { walletUsdcArbitrum, connected, isLoadingWalletUsdc } = useTrading();
  const { openAddToTrading } = useDepositSheet();
  if (!connected || (isLoadingWalletUsdc && walletUsdcArbitrum < 0.01) || walletUsdcArbitrum < 0.01)
    return null;

  return (
    <button
      type="button"
      onClick={openAddToTrading}
      className={cn(
        "flex w-full items-center justify-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/15 transition-colors",
        className,
      )}
      data-testid="wallet-usdc-strip"
    >
      <span className="font-medium">
        {walletUsdcArbitrum.toFixed(2)} USDC in your wallet
      </span>
      <span className="underline font-semibold">Add to trading →</span>
    </button>
  );
}
