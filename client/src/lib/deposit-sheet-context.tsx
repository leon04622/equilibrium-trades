import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowDownToLine, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCctpDeposit } from "@/hooks/use-cctp-deposit";
import { useWallet } from "@/lib/wallet-context";
import { useTrading } from "@/lib/trading-context";

type DepositSheetContextValue = {
  openAddToTrading: () => void;
  openTransfer: () => void;
};

const DepositSheetCtx = createContext<DepositSheetContextValue | null>(null);

export function useDepositSheet(): DepositSheetContextValue {
  const v = useContext(DepositSheetCtx);
  if (!v) {
    return {
      openAddToTrading: () => {
        window.location.href = "/funding?tab=deposit&activate=1";
      },
      openTransfer: () => {
        window.location.href = "/portfolio?transfer=1";
      },
    };
  }
  return v;
}

export function DepositSheetProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { address, chainId } = useWallet();
  const { walletUsdcArbitrum, isLoadingWalletUsdc } = useTrading();
  const [open, setOpen] = useState(false);
  const deposit = useCctpDeposit();

  const { prepareDeposit, resetDepositState } = deposit;

  const openAddToTrading = useCallback(() => {
    if (!address) {
      navigate("/funding?tab=deposit");
      return;
    }
    resetDepositState();
    setOpen(true);
    void prepareDeposit();
  }, [address, navigate, prepareDeposit, resetDepositState]);

  const openTransfer = useCallback(() => {
    navigate("/portfolio?transfer=1");
  }, [navigate]);

  const isOnArbitrum = chainId === 42161;
  const maxBal = walletUsdcArbitrum ?? 0;
  const minDeposit = deposit.depositCfg?.minDepositUsdc ?? 5;
  const canSubmit =
    !deposit.depositing &&
    !isLoadingWalletUsdc &&
    !!deposit.depositCfg &&
    deposit.depositAmount &&
    parseFloat(deposit.depositAmount) >= minDeposit &&
    parseFloat(deposit.depositAmount) <= maxBal + 0.001;

  return (
    <DepositSheetCtx.Provider value={{ openAddToTrading, openTransfer }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-primary" />
              Add to trading
            </SheetTitle>
            <SheetDescription>
              Move USDC from your Arbitrum wallet into Hyperliquid. Each new deposit needs a few wallet steps (not
              every time you trade).
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">Wallet USDC (Arbitrum)</p>
              <p className="font-mono text-lg font-semibold">
                {isLoadingWalletUsdc ? "Loading…" : `${maxBal.toFixed(2)} USDC`}
              </p>
            </div>

            {!isOnArbitrum && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                Switch to Arbitrum One when your wallet prompts you.
              </div>
            )}

            {deposit.depositCfgLoadError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                {deposit.depositCfgLoadError}
              </div>
            )}

            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Wallet confirmations (Circle CCTP)</p>
              <p>
                <strong className="text-foreground">New deposit:</strong> sign USDC on Arbitrum → confirm burn → wait
                1–5 min → confirm <strong className="text-foreground">one mint</strong> on HyperEVM (chain 999).
              </p>
              <p>
                <strong className="text-foreground">Resume:</strong> usually only the HyperEVM mint (one confirmation).
              </p>
            </div>

            {deposit.hasResumableDeposit && !deposit.depositing && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
                Deposit in progress — tap Resume once. If you see a red error but Arbitrum USDC already left your
                wallet, wait 2 minutes and Resume again (do not start a second full deposit).
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sheet-deposit-amount">Amount (USDC)</Label>
              <div className="flex gap-2">
                <Input
                  id="sheet-deposit-amount"
                  inputMode="decimal"
                  value={deposit.depositAmount}
                  onChange={(e) => deposit.setDepositAmount(e.target.value)}
                  data-testid="input-sheet-deposit-amount"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const safe = Math.floor(maxBal * 100) / 100;
                    deposit.setDepositAmount(safe > 0 ? safe.toFixed(2) : "");
                  }}
                >
                  Max
                </Button>
              </div>
              {deposit.depositCfg && (
                <p className="text-[11px] text-muted-foreground">
                  Minimum {deposit.depositCfg.minDepositUsdc} USDC per deposit.
                </p>
              )}
            </div>

            {deposit.depositStep && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                <Loader2
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5",
                    (deposit.depositing || deposit.depositAwaitingChain) && "animate-spin",
                  )}
                />
                <span>{deposit.depositStep}</span>
              </div>
            )}

            {deposit.depositResult && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-xs",
                  deposit.depositResult.success
                    ? "border-bullish/25 bg-bullish/10 text-bullish"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {deposit.depositResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {deposit.depositResult.success
                    ? "Deposit flow finished. Balances update in a few seconds."
                    : deposit.depositResult.error}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={deposit.depositing || !canSubmit}
                onClick={() => void deposit.runDeposit()}
                data-testid="button-sheet-deposit-confirm"
              >
                {deposit.depositing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : deposit.hasResumableDeposit ? (
                  "Resume deposit"
                ) : (
                  "Confirm — add to trading"
                )}
              </Button>
              {deposit.depositing && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => deposit.cancelDeposit()}
                  data-testid="button-sheet-deposit-cancel"
                >
                  Cancel (safe to close — resume later)
                </Button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug">
              You do not confirm anything to place normal trades — only when moving USDC from your wallet into
              Hyperliquid.
            </p>

            <Button
              variant="ghost"
              className="w-full text-xs"
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/funding?tab=deposit");
              }}
            >
              Open full funding page
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DepositSheetCtx.Provider>
  );
}
