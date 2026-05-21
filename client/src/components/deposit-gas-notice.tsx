import { AlertCircle, CheckCircle2, ExternalLink, Fuel } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatArbitrumEth,
  hasEnoughArbitrumGasForBurn,
  MIN_ARB_ETH_FOR_CCTP_BURN,
  RECOMMENDED_ARB_ETH_FOR_DEPOSIT,
} from "@/lib/arbitrum-gas";

type DepositGasNoticeProps = {
  walletAddress: string | null;
  ethBalance: number | null;
  isLoading?: boolean;
  /** When true, burn already sent — only finishing attestation/mint (no new Arbitrum gas). */
  resumeOnly?: boolean;
  relayMintEnabled?: boolean;
};

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function DepositGasNotice({
  walletAddress,
  ethBalance,
  isLoading = false,
  resumeOnly = false,
  relayMintEnabled = false,
}: DepositGasNoticeProps) {
  if (resumeOnly) {
    return (
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-[11px] text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-1.5">
          <Fuel className="h-3.5 w-3.5 text-primary" />
          Gas for this step
        </p>
        <p>
          Your Arbitrum transfer already went through. Finishing the deposit does{" "}
          <strong className="text-foreground">not</strong> need another ETH gas payment from you
          {relayMintEnabled ? " (we complete HyperEVM for you)." : "."}
        </p>
      </div>
    );
  }

  const eth = ethBalance ?? 0;
  const enough = hasEnoughArbitrumGasForBurn(eth);
  const addr = walletAddress?.trim() ?? "";

  return (
    <div className="space-y-2" data-testid="deposit-gas-notice">
      <div
        className={
          enough
            ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-[11px] text-emerald-800 dark:text-emerald-300"
            : "rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-[11px] text-amber-900 dark:text-amber-200"
        }
      >
        <p className="font-medium flex items-center gap-1.5">
          {enough ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          Arbitrum gas (ETH) — same wallet as USDC
        </p>
        {addr ? (
          <p className="mt-1 font-mono text-[10px] opacity-90">{shortAddr(addr)}</p>
        ) : null}
        <p className="mt-2 leading-relaxed">
          {isLoading ? (
            "Checking ETH on Arbitrum…"
          ) : enough ? (
            <>
              <strong>{formatArbitrumEth(eth)}</strong> available for the one Arbitrum transaction that moves USDC.
            </>
          ) : (
            <>
              Need about <strong>{formatArbitrumEth(MIN_ARB_ETH_FOR_CCTP_BURN)}</strong> ETH on{" "}
              <strong>Arbitrum One</strong> in this wallet (we recommend{" "}
              {formatArbitrumEth(RECOMMENDED_ARB_ETH_FOR_DEPOSIT)}). You have{" "}
              <strong>{formatArbitrumEth(eth)}</strong>.
            </>
          )}
        </p>
        <p className="mt-2 leading-relaxed opacity-90">
          <strong className="text-foreground">Trading USDC cannot pay this.</strong> Gas is paid in ETH on your
          connected wallet, not from USDC already on Hyperliquid or from the amount you are depositing.
        </p>
        {!enough && !isLoading ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" asChild>
              <a href="https://bridge.arbitrum.io/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />
                Bridge ETH to Arbitrum
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" asChild>
              <a
                href={
                  addr
                    ? `https://arbiscan.io/address/${addr}`
                    : "https://arbiscan.io/"
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View wallet on Arbiscan
              </a>
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug px-0.5">
        Step 1 (sign USDC) uses no gas. Step 2 (send on Arbitrum) uses ETH. Some wallets let you buy or swap a small
        amount of ETH on Arbitrum inside Rabby or MetaMask.
      </p>
    </div>
  );
}
