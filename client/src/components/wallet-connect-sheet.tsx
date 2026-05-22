import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useWallet, WalletType } from "@/lib/wallet-context";
import { Wallet, ExternalLink, Smartphone, Loader2, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { WalletAccountPicker } from "@/components/wallet-account-picker";
import { RabbyMobileConnectHelp } from "@/components/rabby-mobile-connect-help";

interface WalletConnectSheetProps {
  trigger?: React.ReactNode;
  onConnect?: () => void;
  /** Controlled open (e.g. account picker after "Switch account"). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Wallet brand colours and labels
const WALLET_META: Record<string, { color: string; label: string; installUrl: string }> = {
  metamask: { color: "#E8761A", label: "MetaMask",       installUrl: "https://metamask.io/download/" },
  rabby:    { color: "#7B61FF", label: "Rabby Wallet",   installUrl: "https://rabby.io/" },
  okx:      { color: "#000000", label: "OKX Wallet",     installUrl: "https://www.okx.com/web3" },
  coinbase: { color: "#0052FF", label: "Coinbase Wallet",installUrl: "https://www.coinbase.com/wallet" },
  trust:    { color: "#3375BB", label: "Trust Wallet",   installUrl: "https://trustwallet.com/" },
  phantom:  { color: "#AB9FF2", label: "Phantom",        installUrl: "https://phantom.app/" },
  injected: { color: "#6B7280", label: "Browser Wallet", installUrl: "https://metamask.io/download/" },
};

// Simple SVG letter-badge for each wallet
function WalletIcon({ type, color }: { type: string; color: string }) {
  const letter = (WALLET_META[type]?.label ?? "W")[0];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
      style={{ backgroundColor: color + "33", border: `1.5px solid ${color}55` }}
    >
      <span style={{ color }}>{letter}</span>
    </div>
  );
}

// Popular wallets to suggest installing when none detected
const SUGGESTED_INSTALLS = ["metamask", "rabby", "okx", "coinbase"];

export function WalletConnectSheet({ trigger, onConnect, open: openProp, onOpenChange }: WalletConnectSheetProps) {
  const { 
    detectedWallets, 
    isMobile, 
    connect, 
    isConnecting, 
    isConnected, 
    address,
    connectError,
    clearConnectError,
    walletBrowserKind,
    hasInjectedProvider,
    prepareRabbyPasteHandoff,
    rabbyPasteHandoffActive,
    pendingConnectAccounts,
    pendingConnectWalletName,
    confirmConnectAccount,
    cancelPendingConnect,
  } = useWallet();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) setOpen(false);
  }, [isConnected, address]);

  const handleConnect = async (walletType?: WalletType) => {
    setLocalError(null);
    setConnectingWallet(walletType ?? null);
    try {
      await connect(walletType, {
        forceAccountPicker: !isMobile || hasInjectedProvider,
      });
      onConnect?.();
    } catch (err: any) {
      // Error is already stored in connectError via context; surface it locally too
      setLocalError(
        connectError ?? (err instanceof Error ? err.message : null) ?? "Connection failed. Please try again.",
      );
    } finally {
      setConnectingWallet(null);
    }
  };

  const errorMessage = localError ?? connectError;

  if (isConnected && address && !(pendingConnectAccounts && pendingConnectAccounts.length > 0)) {
    return (
      <Button variant="outline" className="gap-2" data-testid="button-wallet-connected">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        {address.slice(0, 6)}...{address.slice(-4)}
      </Button>
    );
  }

  const defaultTrigger = (
    <Button className="gap-2" data-testid="button-connect-wallet" aria-label="Connect wallet">
      <Wallet className="h-4 w-4" aria-hidden />
      Connect Wallet
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setLocalError(null);
          clearConnectError();
        } else {
          setLocalError(null);
        }
      }}
    >
      <SheetTrigger asChild>
        {trigger || defaultTrigger}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left pb-2">
          <SheetTitle>Connect your wallet to start</SheetTitle>
          <SheetDescription>
            {isMobile
              ? hasInjectedProvider
                ? "You opened Equilibrium inside a wallet app. Tap Connect Rabby below and approve — then pick your account if you have more than one."
                : "On phone, copy the link, open Rabby → DApps, paste the URL, then tap Connect Rabby inside Rabby (not from Safari)."
              : "Select your wallet below. Any EVM-compatible wallet works."}
          </SheetDescription>
        </SheetHeader>

        <div className="mb-3 grid gap-2 rounded-xl border bg-muted/20 p-3 text-[11px] text-muted-foreground sm:grid-cols-3">
          <div>Non-custodial access</div>
          <div>No email or password needed</div>
          <div>Required for member sync and billing</div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 mb-3 text-sm ${
              rabbyPasteHandoffActive
                ? "border-green-500/40 bg-green-500/10 text-green-800 dark:text-green-300"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="py-3 space-y-2">
          {pendingConnectAccounts && pendingConnectAccounts.length > 0 ? (
            <WalletAccountPicker
              accounts={pendingConnectAccounts}
              walletName={pendingConnectWalletName}
              isSubmitting={isConnecting}
              onSelect={async (acc) => {
                setLocalError(null);
                try {
                  await confirmConnectAccount(acc);
                  onConnect?.();
                  setOpen(false);
                } catch (err: unknown) {
                  setLocalError(
                    err instanceof Error ? err.message : "Could not connect with that account.",
                  );
                }
              }}
              onCancel={() => cancelPendingConnect()}
            />
          ) : isMobile ? (
            <RabbyMobileConnectHelp
              inWalletBrowser={hasInjectedProvider}
              walletBrowserLabel={
                walletBrowserKind === "rabby"
                  ? "Rabby"
                  : walletBrowserKind === "metamask"
                    ? "MetaMask"
                    : "Wallet"
              }
              detectedWalletTypes={detectedWallets.map((w) => w.type)}
              onConnectRabby={() => handleConnect("rabby")}
              onConnectMetamask={() => handleConnect("metamask")}
              onConnectWallet={(t) => handleConnect(t)}
              isConnecting={isConnecting}
              onCopyLink={prepareRabbyPasteHandoff}
              pasteHandoffActive={rabbyPasteHandoffActive}
            />
          ) : detectedWallets.length > 0 ? (
            /* ── Desktop: wallets found ── */
            <>
              <p className="text-xs text-muted-foreground pb-1">
                {detectedWallets.length} wallet{detectedWallets.length > 1 ? "s" : ""} detected
              </p>
              {detectedWallets.map((wallet) => {
                const meta = WALLET_META[wallet.type] ?? WALLET_META.injected;
                return (
                  <Button
                    key={wallet.type}
                    variant="outline"
                    className="w-full justify-between h-14 text-left"
                    onClick={() => handleConnect(wallet.type)}
                    disabled={isConnecting}
                    data-testid={`button-connect-${wallet.type}`}
                  >
                    <div className="flex items-center gap-3">
                      <WalletIcon type={wallet.type} color={meta.color} />
                      <span className="font-medium">{wallet.name}</span>
                    </div>
                    {connectingWallet === wallet.type ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                );
              })}
            </>
          ) : (
            /* ── Desktop: no wallets found ── */
            <>
              <p className="text-sm text-muted-foreground mb-3">
                No wallet extension detected. Install one of the options below, then refresh this page to continue into the platform.
              </p>
              {SUGGESTED_INSTALLS.map((key) => {
                const meta = WALLET_META[key];
                return (
                  <Button
                    key={key}
                    variant="outline"
                    className="w-full justify-between h-14"
                    onClick={() => window.open(meta.installUrl, "_blank")}
                    data-testid={`button-install-${key}`}
                  >
                    <div className="flex items-center gap-3">
                      <WalletIcon type={key} color={meta.color} />
                      <div className="text-left">
                        <span className="font-medium block">Install {meta.label}</span>
                        <span className="text-xs text-muted-foreground">Browser extension</span>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                );
              })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
