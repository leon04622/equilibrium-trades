import { useState, useCallback } from "react";
import { Loader2, Shield, Smartphone } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { isUserRejectedWalletError } from "@/lib/wallet-errors";
import { isTerminalAuthDisabled } from "@/lib/apex-auth-flags";
import {
  clearHyperliquidAgentOnly,
  getHyperliquidLocalAgentAddress,
} from "@/lib/hyperliquid-client";
import { isLikelyMobileDevice } from "@/lib/eip712-typed-data";

export interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Gates the Apex terminal until the secure API agent is approved on Hyperliquid L1.
 * Referral / platform fees are applied in the background (agent-signed setReferrer) — not shown here.
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
  const mobile = isLikelyMobileDevice();

  const runSetup = useCallback(async () => {
    if (!signer || !address) return;
    setErr(null);
    setBusy(true);
    try {
      const snap = hlSnapshot;
      const localA = getHyperliquidLocalAgentAddress(address);
      if (snap && !snap.agentOnL1 && localA) {
        clearHyperliquidAgentOnly(address);
      }

      const session = await prepareHyperliquidSession();
      if (!session.success) {
        setErr(session.error ?? "Secure setup failed.");
        return;
      }

      await refetchHlAuth();
      toast({
        title: "Instant trading ready",
        description: "Your agent can sign trades and TP/SL — it cannot withdraw funds.",
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
              Hyperliquid signing requires <strong>Arbitrum One</strong> (chain 42161).
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
                Secure account setup
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                One-time setup: approve your secure trading agent for instant moves on Hyperliquid.
                This key <strong className="text-foreground">cannot withdraw</strong> your funds — it
                only signs trades you initiate here.
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
            ) : isHlVerifying && !hlSnapshot ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking your Hyperliquid account…
              </div>
            ) : (
              <>
                <Alert className="border-muted">
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                    You may need a small amount of ETH on Arbitrum for gas on the first approval
                    (typically under ~$0.10). After that, routine order updates use the agent without
                    wallet popups until the agent expires.
                  </AlertDescription>
                </Alert>

                {busy && mobile && (
                  <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-foreground">
                    <Smartphone className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Check your wallet app</p>
                      <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                        If no prompt appears in the browser, switch to MetaMask, Rabby, Coinbase, or
                        Phantom and confirm the signature there. Use HTTPS for wallet deep links.
                      </p>
                    </div>
                  </div>
                )}

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
                      Waiting for wallet…
                    </>
                  ) : (
                    "Approve secure trading agent"
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
