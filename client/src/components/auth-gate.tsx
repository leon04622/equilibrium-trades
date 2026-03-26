import { useState, useCallback } from "react";
import { Loader2, Shield, Zap, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWallet, ARBITRUM_CHAIN_ID } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { linkHyperliquidReferralCode } from "@/lib/hyperliquid-onboarding";
import { HL_REFERRAL_CODE } from "@/lib/hyperliquid-platform-config";
import { useToast } from "@/hooks/use-toast";
import { isUserRejectedWalletError } from "@/lib/wallet-errors";
import { isTerminalAuthDisabled } from "@/lib/apex-auth-flags";
import {
  clearHyperliquidAgentOnly,
  getHyperliquidLocalAgentAddress,
} from "@/lib/hyperliquid-client";

export interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Gates the Apex Sovereign terminal (chart + HL execution) until:
 * wallet on Arbitrum, referral linked (or already referred elsewhere on L1),
 * builder fee approved when configured, and API agent approved on L1.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { toast } = useToast();
  const { signer, chainId, address, isConnected, prepareHyperliquidSession, switchToArbitrum } =
    useWallet();
  const { terminalReady, isHlVerifying, isHlError, hlError, hlSnapshot, refetchHlAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const gateOff = isTerminalAuthDisabled();
  const wrongChain = isConnected && chainId !== ARBITRUM_CHAIN_ID;

  const runSetup = useCallback(async () => {
    if (!signer || !address) return;
    setErr(null);
    setBusy(true);
    try {
      const snap = hlSnapshot;
      if (snap?.referral === "none") {
        const link = await linkHyperliquidReferralCode(signer, HL_REFERRAL_CODE);
        if (!link.ok) {
          setErr(link.error ?? "Could not link builder protocol on Hyperliquid.");
          return;
        }
        toast({
          title: "Builder protocol linked",
          description: "Your account is tied to the Apex Sovereign referral on L1.",
        });
      }

      const localA = getHyperliquidLocalAgentAddress(address);
      if (snap && !snap.agentOnL1 && localA) {
        clearHyperliquidAgentOnly(address);
      }

      const session = await prepareHyperliquidSession();
      if (!session.success) {
        setErr(session.error ?? "Trading session setup failed.");
        return;
      }

      await refetchHlAuth();
      toast({
        title: "Instant trading enabled",
        description: "SL/TP drags and closes can use your API agent — not withdrawals.",
      });
    } catch (e: unknown) {
      if (isUserRejectedWalletError(e)) {
        setErr("Request cancelled in wallet.");
      } else {
        setErr(e instanceof Error ? e.message : "Setup failed.");
      }
    } finally {
      setBusy(false);
    }
  }, [signer, address, hlSnapshot, prepareHyperliquidSession, refetchHlAuth, toast]);

  if (gateOff) {
    return <>{children}</>;
  }

  if (!isConnected || !address) {
    return <>{children}</>;
  }

  if (wrongChain) {
    return (
      <div className="relative flex flex-1 min-h-0 flex-col">
        <div className="pointer-events-none flex-1 min-h-0 opacity-40 blur-[2px]">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
          <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
            <p className="text-sm font-medium text-foreground">Wrong network</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Apex Sovereign runs against Hyperliquid on <strong>Arbitrum One</strong>.
            </p>
            <Button className="mt-4 w-full" onClick={() => void switchToArbitrum()}>
              Switch to Arbitrum
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showGate = !terminalReady;
  const snap = hlSnapshot;
  const stepReferral = snap?.referral === "none";
  const needsSessionOnly = snap && snap.referral !== "none";

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      <div
        className={cn(
          "flex flex-1 min-h-0 flex-col transition-[filter,opacity]",
          showGate && "pointer-events-none select-none opacity-[0.35] blur-[3px]",
        )}
      >
        {children}
      </div>

      <Dialog open={showGate} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-[min(100vw-1.5rem,28rem)] border-border/80 bg-card p-0 gap-0 overflow-hidden sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="bg-gradient-to-br from-primary/15 via-transparent to-transparent px-6 pt-6 pb-4">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-lg font-semibold leading-tight pr-8">
                Apex Sovereign Terminal
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                One-time Hyperliquid L1 setup. After this, you won&apos;t be asked again for this
                wallet.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 pb-6">
            {isHlError ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-destructive">
                  {hlError?.message ?? "Could not load Hyperliquid account state."}
                </p>
                <Button variant="outline" className="w-full" onClick={() => void refetchHlAuth()}>
                  Retry
                </Button>
              </div>
            ) : isHlVerifying && !snap ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying account on Hyperliquid…
              </div>
            ) : (
              <>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <Link2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      <strong className="text-foreground">Builder protocol</strong> — link your
                      account to our referral on L1
                      {stepReferral ? " (required)." : " (already set)."}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Instant trading</strong> — approve a
                      non-custodial <strong className="text-foreground">API agent</strong> that
                      can place trades only; it{" "}
                      <strong className="text-foreground">cannot withdraw</strong> funds.
                    </span>
                  </li>
                </ul>

                <Alert className="border-amber-500/30 bg-amber-500/5">
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                    L1 actions use a small amount of gas on Arbitrum (typically under ~$0.10). You may
                    see separate prompts for referral link, builder fee (if enabled), and agent
                    approval.
                  </AlertDescription>
                </Alert>

                {err && (
                  <p className="text-sm text-destructive" role="alert">
                    {err}
                  </p>
                )}

                <Button
                  className="w-full h-11 font-semibold"
                  disabled={busy || isHlVerifying}
                  onClick={() => void runSetup()}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirm in wallet…
                    </>
                  ) : stepReferral ? (
                    "Link builder & enable trading"
                  ) : needsSessionOnly ? (
                    "Enable instant trading"
                  ) : (
                    "Complete setup"
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
