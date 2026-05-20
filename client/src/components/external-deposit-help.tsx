import { AlertCircle, CheckCircle2, Copy, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type ExternalDepositHelpProps = {
  walletAddress: string;
  nativeUsdc: number | null;
  bridgedUsdc: number | null;
  minDepositUsdc: number;
  isLoading?: boolean;
};

export function ExternalDepositHelp({
  walletAddress,
  nativeUsdc,
  bridgedUsdc,
  minDepositUsdc,
  isLoading = false,
}: ExternalDepositHelpProps) {
  const { toast } = useToast();
  const native = nativeUsdc ?? 0;
  const bridged = bridgedUsdc ?? 0;
  const hasNative = native >= 0.01;
  const bridgedOnly = !hasNative && bridged >= 0.01;
  const readyToBridge = native >= minDepositUsdc;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast({ title: "Address copied", description: "Use this as the Revolut withdrawal destination on Arbitrum." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="external-deposit-help">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-medium text-foreground flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          Sent USDC from Revolut or another app?
        </p>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Bank and exchange withdrawals only move USDC to your{" "}
          <strong className="text-foreground">wallet on Arbitrum</strong>. They do{" "}
          <strong className="text-foreground">not</strong> credit your Hyperliquid trading balance by themselves.
          After it arrives, connect the <strong className="text-foreground">same wallet</strong> here and press{" "}
          <strong className="text-foreground">Deposit USDC</strong> to complete the Circle CCTP bridge (1:1 native USDC).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="text-[11px] bg-muted px-2 py-1 rounded font-mono">{shortAddress(walletAddress)}</code>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void copyAddress()}>
            <Copy className="h-3 w-3 mr-1" />
            Copy address
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a
              href={`https://arbiscan.io/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Arbiscan
            </a>
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Network must be <strong className="text-foreground">Arbitrum One</strong> (chain 42161) and token{" "}
          <strong className="text-foreground">native USDC</strong>, not USDC.e.
        </p>
      </div>

      {!isLoading && readyToBridge ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            We see <strong>{native.toFixed(2)} USDC</strong> on Arbitrum in this wallet. Enter the amount below and
            press <strong>Deposit USDC</strong> to move it to your trading account (allow a few minutes for attestation).
          </span>
        </div>
      ) : null}

      {!isLoading && hasNative && !readyToBridge ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            You have {native.toFixed(2)} USDC on Arbitrum but the venue minimum is {minDepositUsdc} USDC per deposit.
          </span>
        </div>
      ) : null}

      {!isLoading && bridgedOnly ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This wallet holds <strong>{bridged.toFixed(2)} USDC.e</strong> (bridged) but no native USDC. In-app deposit
            requires <strong>native USDC</strong>. Swap USDC.e to native USDC on Arbitrum, then deposit.
          </span>
        </div>
      ) : null}

      {!isLoading && !hasNative && !bridgedOnly && nativeUsdc !== null ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            No native USDC detected yet on Arbitrum for this wallet. If you just sent from Revolut, wait 1–5 minutes and
            tap Refresh. Confirm Revolut used <strong className="text-foreground">Arbitrum</strong> and the address above.
          </span>
        </div>
      ) : null}
    </div>
  );
}
