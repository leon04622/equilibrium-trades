import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWallet } from "@/lib/wallet-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Wallet, Link2, AlertCircle, Smartphone } from "lucide-react";
import { TRADE_HANDSHAKE_USER_MESSAGE, runEquilibriumLifetimeHandshake } from "@/lib/trade-execution-logic";
import {
  ARBITRUM_CHAIN_ID,
  ensureWalletOnArbitrum,
  isFullyTradeReady,
  isTradingHandshakeComplete,
} from "@/lib/trade-readiness";
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
  const busyHandshakeRef = useRef(false);
  const [handshakeRunning, setHandshakeRunning] = useState(false);
  const [switchingChain, setSwitchingChain] = useState(false);
  const autoSwitchAttemptedRef = useRef(false);

  const readiness = {
    address: address ?? null,
    chainId,
    builderCodeApproved,
    hyperliquidSessionReady,
    isConnected,
    hasSigner: !!signer,
  };

  const allReady = isFullyTradeReady(readiness);
  const handshakeComplete = isTradingHandshakeComplete(readiness);

  useEffect(() => {
    if (!open || !allReady) return;
    onFinalize(true);
  }, [open, allReady, onFinalize]);

  useEffect(() => {
    if (!open) {
      autoSwitchAttemptedRef.current = false;
      return;
    }
    if (!isConnected || !signer || chainId === ARBITRUM_CHAIN_ID || autoSwitchAttemptedRef.current) {
      return;
    }
    autoSwitchAttemptedRef.current = true;
    setSwitchingChain(true);
    void ensureWalletOnArbitrum(signer, switchToArbitrum).finally(() => setSwitchingChain(false));
  }, [open, isConnected, signer, chainId, switchToArbitrum]);

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      toast({ title: "Connect failed", description: "Please try again from your wallet.", variant: "destructive" });
    }
  };

  /** One CTA: EIP-191 Equilibrium sign-in (if needed) + HL approveAgent + approveBuilderFee; then CRM `isBuilderLinked`. */
  const handleLifetimeHandshake = useCallback(async () => {
    if (!signer || !address || busyHandshakeRef.current) return;
    busyHandshakeRef.current = true;
    setHandshakeRunning(true);
    try {
      const result = await runEquilibriumLifetimeHandshake(signer, address, {
        skipEquilibriumSignIn: builderCodeApproved,
      });
      if (!result.ok) {
        if (!result.userCancelled) {
          toast({ title: "Setup incomplete", description: result.error, variant: "destructive" });
        }
        return;
      }
      confirmBuilderCodeApproved();
      await refreshApprovalStatus();
      await prepareHyperliquidSession();
      await refetchHlAuth();
      toast({
        title: "Trading enabled",
        description: "Builder linked, agent approved, and account ready.",
      });
      onFinalize(true);
    } finally {
      busyHandshakeRef.current = false;
      setHandshakeRunning(false);
    }
  }, [
    signer,
    address,
    builderCodeApproved,
    confirmBuilderCodeApproved,
    refreshApprovalStatus,
    prepareHyperliquidSession,
    refetchHlAuth,
    toast,
    onFinalize,
  ]);

  const wrongChain = isConnected && chainId !== ARBITRUM_CHAIN_ID;
  const needsUnifiedHandshake = isConnected && !wrongChain && !handshakeComplete;
  const handshakeBusy = handshakeRunning || isPreparingHyperliquidSession;

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
                      Trading setup uses Arbitrum One. We can switch your wallet automatically.
                    </p>
                    <Button
                      className="h-12 w-full text-base font-semibold"
                      disabled={switchingChain}
                      onClick={() => {
                        if (!signer) return;
                        setSwitchingChain(true);
                        void ensureWalletOnArbitrum(signer, switchToArbitrum).finally(() =>
                          setSwitchingChain(false),
                        );
                      }}
                    >
                      {switchingChain ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Switching…
                        </>
                      ) : (
                        "Switch network"
                      )}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-emerald-600/90">On Arbitrum One</p>
                )}
              </div>
            </div>
          )}

          {needsUnifiedHandshake && (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">3. One-time trading handshake</p>
                <Alert className="border-muted py-2">
                  <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                    Your wallet will prompt for Equilibrium sign-in (if not done yet), then{" "}
                    <strong>approveAgent</strong> and <strong>approveBuilderFee</strong> for the platform builder.
                    The first on-chain action may include a one-time ~1 USDC activation debit per exchange rules.
                  </AlertDescription>
                </Alert>
                {mobile && handshakeBusy && (
                  <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <Smartphone className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span className="text-muted-foreground">Confirm each step in your wallet app if the browser shows no prompt.</span>
                  </div>
                )}
                {isCheckingApproval ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking account…
                  </div>
                ) : allReady ? (
                  <p className="text-xs text-emerald-600/90">Ready</p>
                ) : (
                  <Button
                    className="h-12 w-full text-base font-semibold"
                    disabled={!signer || handshakeBusy}
                    onClick={() => void handleLifetimeHandshake()}
                  >
                    {handshakeBusy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Waiting for wallet…
                      </>
                    ) : (
                      "Sign & enable trading"
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
              Setup is once per wallet. After that, placing orders does not ask for a signature each time.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
