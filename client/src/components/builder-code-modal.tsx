import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle2,
  Shield,
  Loader2,
  AlertCircle,
  Zap,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAddress } from "ethers";
import { buildEquilibriumBuilderApprovalMessage } from "@/lib/equilibrium-builder-approval-message";
import {
  ensureHyperliquidTradingSession,
  isHyperliquidTradingSessionReady,
} from "@/lib/hyperliquid-client";
import { ARBITRUM_CHAIN_ID } from "@/lib/wallet-context";
import { isUserRejectedWalletError, parseApiRequestError } from "@/lib/wallet-errors";

type Step = "idle" | "signing" | "registering" | "hyperliquid" | "complete" | "error";

export function BuilderCodeModal() {
  const {
    address,
    isConnected,
    signer,
    builderCodeApproved,
    isCheckingApproval,
    refreshApprovalStatus,
    provider,
    chainId,
    switchToArbitrum,
  } = useWallet();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const hlReady = Boolean(address && isHyperliquidTradingSessionReady(address));

  // Stay open until Equilibrium approval + Hyperliquid session; keep open if HL failed after API success.
  const isOpen =
    isConnected &&
    !isCheckingApproval &&
    step !== "complete" &&
    (!builderCodeApproved ||
      !hlReady ||
      step === "signing" ||
      step === "registering" ||
      step === "hyperliquid");

  useEffect(() => {
    if (builderCodeApproved && hlReady) {
      setStep("complete");
    }
  }, [builderCodeApproved, hlReady]);

  const handleSign = async () => {
    if (!signer || !address) return;
    setError(null);

    let normalizedAddress: string;
    try {
      normalizedAddress = getAddress(address);
      const signerAddr = getAddress(await signer.getAddress());
      if (signerAddr !== normalizedAddress) {
        setError(
          "Wallet mismatch: the active signer does not match your connected address. Reconnect your wallet and try again.",
        );
        setStep("idle");
        return;
      }
    } catch {
      setError("Could not read your wallet address. Reconnect and try again.");
      setStep("idle");
      return;
    }

    const timestampMs = Date.now();
    const message = buildEquilibriumBuilderApprovalMessage(normalizedAddress, timestampMs);
    let phase: "equilibrium" | "api" | "hyperliquid" = "equilibrium";

    try {
      setStep("signing");
      phase = "equilibrium";
      let signature: string;
      try {
        signature = await signer.signMessage(message);
      } catch (e) {
        if (isUserRejectedWalletError(e)) {
          setError("You cancelled the Equilibrium sign-in message in your wallet. Tap Approve & Continue to try again.");
          setStep("idle");
          return;
        }
        throw e;
      }

      setStep("registering");
      phase = "api";
      const res = await apiRequest("POST", "/api/wallet-user/approve-builder-code", {
        walletAddress: normalizedAddress,
        signature,
        message,
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Approval was not saved. Please try again.");
        setStep("idle");
        return;
      }

      await refreshApprovalStatus();

      if (provider && chainId !== null && chainId !== ARBITRUM_CHAIN_ID) {
        try {
          await switchToArbitrum();
        } catch {
          throw new Error(
            "Switch to Arbitrum One (chain 42161) in your wallet for Hyperliquid setup, then tap Approve & Continue again.",
          );
        }
        const net = await provider.getNetwork();
        if (Number(net.chainId) !== ARBITRUM_CHAIN_ID) {
          throw new Error(
            "Wrong network: Hyperliquid setup needs Arbitrum One (42161). Switch in your wallet and try again.",
          );
        }
      }

      setStep("hyperliquid");
      phase = "hyperliquid";
      const hl = await ensureHyperliquidTradingSession(signer);
      if (!hl.success) {
        setError(
          hl.error ||
            "Hyperliquid setup did not finish. Approve the agent and builder-fee prompts in your wallet, then try again.",
        );
        setStep("idle");
        return;
      }

      await refreshApprovalStatus();
      setStep("complete");
      toast({
        title: "You're ready to trade",
        description: "Equilibrium is linked and Hyperliquid will no longer ask for a signature on each order.",
      });
    } catch (err: unknown) {
      console.error("Builder / HL setup:", err);
      if (phase === "api") {
        const apiMsg = parseApiRequestError(err);
        setError(apiMsg ?? (err instanceof Error ? err.message : "Could not verify your signature. Please try again."));
        setStep("idle");
        return;
      }
      if (phase === "hyperliquid") {
        setError(err instanceof Error ? err.message : "Hyperliquid setup failed.");
        setStep("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStep("error");
    }
  };

  if (!isOpen) return null;

  const isLoading = step === "signing" || step === "registering" || step === "hyperliquid";

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden border-border/80 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="builder-code-modal"
        hideClose
      >
        <DialogTitle className="sr-only">Platform Setup Required</DialogTitle>
        <DialogDescription className="sr-only">Approve Equilibrium as your builder to continue.</DialogDescription>

        {/* Header */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background px-6 pt-8 pb-6 text-center border-b border-border/50">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">
            One-Time Platform Setup
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
            One-time setup: approve Equilibrium, then authorize Hyperliquid&apos;s trading key. After that, orders and TP/SL use background signing — no repeat wallet popups.
          </p>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-3">
          {/* Step 1: Wallet */}
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
            "bg-primary/5 border-primary/20"
          )}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Wallet connected</p>
              <p className="text-xs text-muted-foreground font-mono">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
            </div>
          </div>

          {/* Step 2: Sign */}
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
            step === "signing" || step === "registering"
              ? "bg-primary/10 border-primary/30"
              : "bg-muted/30 border-border/50"
          )}>
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              step === "signing" || step === "registering"
                ? "bg-primary/20"
                : "bg-muted"
            )}>
              {step === "signing" || step === "registering" ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Shield className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Authorise builder code</p>
              <p className="text-xs text-muted-foreground">
                {step === "signing"
                  ? "Check your wallet for a signature request…"
                  : step === "registering"
                  ? "Saving your approval…"
                  : "Sign a message — no gas, no cost"}
              </p>
            </div>
          </div>

          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
            step === "hyperliquid" ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border/50"
          )}>
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              step === "hyperliquid" ? "bg-primary/20" : "bg-muted"
            )}>
              {step === "hyperliquid" ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Zap className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Hyperliquid trading session</p>
              <p className="text-xs text-muted-foreground">
                {step === "hyperliquid"
                  ? "Approve the agent and builder fee in your wallet (usually two prompts). Only once."
                  : "Enables frictionless orders, TP/SL, and cancels"}
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Security notice */}
        <div className="px-6 pb-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/40">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your private keys never leave your wallet. This signature only authorises order attribution — you stay in full control of your funds.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <Button
            onClick={handleSign}
            disabled={isLoading}
            className="w-full h-12 text-base font-semibold gap-2"
            data-testid="button-approve-builder-code"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {step === "signing"
                  ? "Waiting for signature…"
                  : step === "hyperliquid"
                  ? "Hyperliquid setup…"
                  : "Setting up account…"}
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Approve & Continue
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
