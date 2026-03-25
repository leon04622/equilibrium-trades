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
import { buildEquilibriumBuilderApprovalMessage } from "@/lib/equilibrium-builder-approval-message";

type Step = "idle" | "signing" | "registering" | "complete" | "error";

export function BuilderCodeModal() {
  const { address, isConnected, signer, builderCodeApproved, isCheckingApproval, refreshApprovalStatus } = useWallet();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const isOpen =
    isConnected &&
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

    const message = buildEquilibriumBuilderApprovalMessage();

    try {
      setStep("signing");
      const signature = await signer.signMessage(message);

      setStep("registering");
      const res = await apiRequest("POST", "/api/wallet-user/approve-builder-code", {
        walletAddress: address,
        signature,
        message,
      });
      const data = await res.json();

      if (data.success) {
        setStep("complete");
        await refreshApprovalStatus();
        toast({
          title: "Platform access granted",
          description: "Your account is set up and ready to trade.",
        });
      } else {
        throw new Error(data.error || "Approval failed");
      }
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected") || err.message?.includes("denied")) {
        setError("Signature rejected. Please approve the message to access the platform.");
        setStep("idle");
      } else {
        setError(err.message || "Something went wrong. Please try again.");
        setStep("error");
      }
    }
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
            Sign a one-time message to authorise Equilibrium for trading. This is free and takes seconds.
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
                {step === "signing" ? "Waiting for signature…" : "Setting up account…"}
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
