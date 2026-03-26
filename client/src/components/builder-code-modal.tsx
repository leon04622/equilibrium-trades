import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWallet } from "@/lib/wallet-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Shield,
  Loader2,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { submitEquilibriumBuilderSignin } from "@/lib/equilibrium-builder-signin";

type Step = "idle" | "signing" | "registering" | "complete";

/**
 * Standalone Equilibrium sign-in modal. Auto-open is disabled for go-live: the first LONG/SHORT
 * opens the trade handshake flow instead, which bundles wallet + this sign-in + HL agent.
 */
const AUTO_OPEN_BUILDER_MODAL = false;

export function BuilderCodeModal() {
  const {
    address,
    isConnected,
    signer,
    builderCodeApproved,
    isCheckingApproval,
    refreshApprovalStatus,
    confirmBuilderCodeApproved,
  } = useWallet();
  const { terminalReady } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const isOpen =
    AUTO_OPEN_BUILDER_MODAL &&
    isConnected &&
    terminalReady &&
    !isCheckingApproval &&
    !builderCodeApproved &&
    step !== "complete";

  useEffect(() => {
    if (builderCodeApproved) {
      setStep("complete");
    }
  }, [builderCodeApproved]);

  const handleSign = async () => {
    if (!signer || !address) return;
    setError(null);
    setStep("signing");
    const result = await submitEquilibriumBuilderSignin(signer, address);
    if (!result.ok) {
      setError(result.error);
      setStep("idle");
      if (!result.userCancelled) {
        toast({
          title: "Sign-in failed",
          description: result.error,
          variant: "destructive",
        });
      }
      return;
    }

    setStep("registering");
    confirmBuilderCodeApproved();
    await refreshApprovalStatus();
    setStep("complete");
    toast({
      title: "You're signed in",
      description: "Hyperliquid secure trading setup runs when you trade — use the trade panel if prompted.",
    });
  };

  if (!isOpen) return null;

  const isLoading = step === "signing" || step === "registering";

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden border-border/80 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="builder-code-modal"
        hideClose
      >
        <DialogTitle className="sr-only">Sign in to Equilibrium</DialogTitle>
        <DialogDescription className="sr-only">
          Sign a message to verify your wallet and save your account. No gas required.
        </DialogDescription>

        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background px-6 pt-8 pb-6 text-center border-b border-border/50">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">
            Sign in to Equilibrium
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
            One wallet signature — no gas. This verifies your wallet and saves your account. Hyperliquid trading setup is a separate step when you place orders.
          </p>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-colors",
              "bg-primary/5 border-primary/20",
            )}
          >
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

          <div
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-colors",
              step === "signing" || step === "registering"
                ? "bg-primary/10 border-primary/30"
                : "bg-muted/30 border-border/50",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                step === "signing" || step === "registering" ? "bg-primary/20" : "bg-muted",
              )}
            >
              {step === "signing" || step === "registering" ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Shield className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Verify wallet</p>
              <p className="text-xs text-muted-foreground">
                {step === "signing"
                  ? "Check your wallet for the sign-in message…"
                  : step === "registering"
                    ? "Saving your account…"
                    : "Plain signature — authentication only, not a transaction"}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 pb-2">
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="px-6 pb-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/40">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your private keys never leave your wallet. Hyperliquid trading permissions are confirmed when you trade.
            </p>
          </div>
        </div>

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
                {step === "signing" ? "Waiting for signature…" : "Saving…"}
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Sign in
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
