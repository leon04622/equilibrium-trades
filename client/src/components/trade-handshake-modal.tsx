import { useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWallet, ARBITRUM_CHAIN_ID } from "@/lib/wallet-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Wallet, Link2, AlertCircle, Smartphone } from "lucide-react";
import { TRADE_HANDSHAKE_USER_MESSAGE } from "@/lib/trade-execution-logic";
import { submitEquilibriumBuilderSignin } from "@/lib/equilibrium-builder-signin";
import { isLikelyMobileDevice } from "@/lib/eip712-typed-data";

type Props = {
  open: boolean;
  onFinalize: (ok: boolean) => void;
};

export function TradeHandshakeModal({ open, onFinalize }: Props) {
  const { toast } = useToast();
  const { refetchHlAuth } = useAuth();
  const {
    address,
    isConnected,
    connect,
    isConnecting,
    chainId,
    signer,
    builderCodeApproved,
    isCheckingApproval,
    hyperliquidSessionReady,
    isPreparingHyperliquidSession,
    prepareHyperliquidSession,
    switchToArbitrum,
    refreshApprovalStatus,
    confirmBuilderCodeApproved,
  } = useWallet();

  const mobile = isLikelyMobileDevice();
  const busySignRef = useRef(false);

  const allReady =
    isConnected &&
    chainId === ARBITRUM_CHAIN_ID &&
    builderCodeApproved &&
    hyperliquidSessionReady &&
    !!signer;

  useEffect(() => {
    if (!open || !allReady) return;
    onFinalize(true);
  }, [open, allReady, onFinalize]);

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      toast({ title: "Connect failed", description: "Please try again from your wallet.", variant: "destructive" });
    }
  };

  const handleBuilderSign = async () => {
    if (!signer || !address || busySignRef.current) return;
    busySignRef.current = true;
    try {
      const result = await submitEquilibriumBuilderSignin(signer, address);
      if (!result.ok) {
        if (!result.userCancelled) {
          toast({ title: "Sign-in failed", description: result.error, variant: "destructive" });
        }
        return;
      }
      confirmBuilderCodeApproved();
      await refreshApprovalStatus();
      toast({
        title: "Wallet linked",
        description: "Complete Hyperliquid approval below to place this trade.",
      });
    } finally {
      busySignRef.current = false;
    }
  };

  const handleHyperliquid = useCallback(async () => {
    const session = await prepareHyperliquidSession();
    if (!session.success) {
      toast({
        title: "Setup required",
        description: session.error || "Approve the trading agent in your wallet.",
        variant: "destructive",
      });
      return;
    }
    await refetchHlAuth();
    try {
      if (address) {
        await fetch("/api/wallet-user/instant-trading-complete", {
          method: "POST",
          headers: { "x-wallet-address": address },
        });
      }
    } catch {
      /* non-fatal CRM ingest */
    }
    toast({
      title: "Ready to trade",
      description: "Gas-free order flow is active for this session.",
    });
  }, [prepareHyperliquidSession, refetchHlAuth, toast, address]);

  const wrongChain = isConnected && chainId !== ARBITRUM_CHAIN_ID;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onFinalize(false);
      }}
    >
      <DialogContent
        className="max-w-[min(100vw-1.25rem,26rem)] w-full gap-0 overflow-hidden border-border/80 p-0 sm:max-w-md touch-manipulation"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="bg-gradient-to-br from-primary/15 via-transparent to-transparent px-5 pt-6 pb-4 sm:px-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold leading-tight pr-6">
              Complete setup to trade
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {TRADE_HANDSHAKE_USER_MESSAGE}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 pb-6 sm:px-6">
          {/* Step 1: Wallet */}
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">1. Connect wallet</p>
              {!isConnected ? (
                <Button
                  className="h-12 w-full text-base font-semibold"
                  disabled={isConnecting}
                  onClick={() => void handleConnect()}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    "Connect wallet"
                  )}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Network */}
          {isConnected && (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Link2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">2. Arbitrum One</p>
                {wrongChain ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Hyperliquid signing requires Arbitrum One (chain 42161).
                    </p>
                    <Button
                      className="h-12 w-full text-base font-semibold"
                      onClick={() => void switchToArbitrum()}
                    >
                      Switch network
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-emerald-600/90">On Arbitrum One</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Equilibrium sign-in */}
          {isConnected && !wrongChain && (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">3. Link Sovereign Protocol</p>
                <p className="text-xs text-muted-foreground">
                  One plain-message signature — no gas. Verifies your wallet for Equilibrium.
                </p>
                {isCheckingApproval ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking account…
                  </div>
                ) : builderCodeApproved ? (
                  <p className="text-xs text-emerald-600/90">Sovereign link complete</p>
                ) : (
                  <Button
                    className="h-12 w-full text-base font-semibold"
                    disabled={!signer}
                    onClick={() => void handleBuilderSign()}
                  >
                    Sign to link
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 4: HL agent */}
          {isConnected && !wrongChain && builderCodeApproved && (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">4. Approve trading agent</p>
                <Alert className="border-muted py-2">
                  <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                    Enables gas-free order updates. The agent cannot withdraw your funds.
                  </AlertDescription>
                </Alert>
                {mobile && isPreparingHyperliquidSession && (
                  <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <Smartphone className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span className="text-muted-foreground">Confirm in your wallet app if the browser shows no prompt.</span>
                  </div>
                )}
                {hyperliquidSessionReady ? (
                  <p className="text-xs text-emerald-600/90">Agent active</p>
                ) : (
                  <Button
                    className="h-12 w-full text-base font-semibold"
                    disabled={isPreparingHyperliquidSession}
                    onClick={() => void handleHyperliquid()}
                  >
                    {isPreparingHyperliquidSession ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Waiting for wallet…
                      </>
                    ) : (
                      "Approve in wallet"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              onClick={() => onFinalize(false)}
            >
              Cancel
            </Button>
            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              You can connect from the header anytime; this flow only runs when you trade.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
