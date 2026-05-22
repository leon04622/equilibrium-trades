import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "@/lib/wallet-context";
import { WalletAccountPicker } from "@/components/wallet-account-picker";
import { RabbyMobileConnectHelp } from "@/components/rabby-mobile-connect-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Smartphone, Monitor, ArrowRight, Loader2, Mail, CheckCircle2, TrendingUp, Shield, Zap, AlertCircle, BookOpen, GraduationCap, CreditCard } from "lucide-react";

/** `/admin` Command Center requires a connected wallet (server verifies master via `ADMIN_EQUILIBRIUM_MASTER_WALLET`). */
const PUBLIC_PATHS = ["/pricing", "/subscribe", "/learn", "/guide/deposit", "/docs"];

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isPublicTradingPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === "/trading" || normalized === "/trade";
}

/**
 * Browse without a wallet when:
 * - `VITE_WALLET_GATE_DISABLED=true` (or `1`) — use for Replit/production preview; unset for go-live.
 * - Local `npm run dev` — gate is off by default so you can use Trading + Live Chat as a guest.
 * Set `VITE_WALLET_GATE_DISABLED=false` in dev if you need to test the gate.
 */
function isWalletGateDisabled(): boolean {
  const v = import.meta.env.VITE_WALLET_GATE_DISABLED;
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return import.meta.env.DEV;
}

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const {
    isConnected,
    isConnecting,
    connect,
    isMobile,
    detectedWallets,
    connectError,
    clearConnectError,
    pendingConnectAccounts,
    pendingConnectWalletName,
    confirmConnectAccount,
    cancelPendingConnect,
    walletBrowserKind,
    hasInjectedProvider,
    prepareRabbyPasteHandoff,
    rabbyPasteHandoffActive,
  } = useWallet();
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const normalizedPath = normalizePath(pathname);

  if (
    isWalletGateDisabled() ||
    isConnected ||
    PUBLIC_PATHS.includes(normalizedPath) ||
    isPublicTradingPath(normalizedPath)
  ) {
    return <>{children}</>;
  }

  const handleEmailCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setIsSubmittingEmail(true);
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "wallet_gate" }),
      });
      setEmailSubmitted(true);
    } catch {
      // Fail silently
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const hasWallet = hasInjectedProvider || detectedWallets.length > 0 || !!window.ethereum;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-6 py-10 flex flex-col items-center text-center gap-6">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Equilibrium</h1>
            <p className="text-muted-foreground text-sm mt-1">Professional Trading Education Platform</p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="w-full grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: "21/200 SMA Strategy" },
            { icon: Shield, label: "Non-Custodial Trading" },
            { icon: Zap, label: "AI Pattern Detection" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-border/50">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
            </div>
          ))}
        </div>

        {/* Connect section */}
        <div className="w-full space-y-3">
          <p className="text-sm font-medium text-foreground">Connect your wallet to get started</p>
          <p className="text-xs text-muted-foreground text-left leading-relaxed">
            Use a standard <strong>Ethereum (EVM)</strong> wallet (e.g. Rabby, MetaMask, Coinbase Wallet).
            You&apos;ll stay on Equilibrium. After connecting, you&apos;ll{" "}
            <strong>sign in once</strong> (no gas), then complete one-time trading setup when you place orders.
          </p>

          {connectError && (
            <div
              className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm ${
                rabbyPasteHandoffActive
                  ? "border-green-500/40 bg-green-500/10 text-green-800 dark:text-green-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{connectError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs self-start border-destructive/30"
                onClick={() => clearConnectError()}
              >
                Dismiss
              </Button>
            </div>
          )}

          {pendingConnectAccounts && pendingConnectAccounts.length > 0 ? (
            <WalletAccountPicker
              accounts={pendingConnectAccounts}
              walletName={pendingConnectWalletName}
              isSubmitting={isConnecting}
              onSelect={(acc) => void confirmConnectAccount(acc)}
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
              onConnectRabby={() => connect("rabby", { forceAccountPicker: true })}
              onConnectMetamask={() => connect("metamask", { forceAccountPicker: true })}
              onConnectWallet={(t) => connect(t, { forceAccountPicker: true })}
              isConnecting={isConnecting}
              onCopyLink={prepareRabbyPasteHandoff}
              pasteHandoffActive={rabbyPasteHandoffActive}
            />
          ) : hasWallet ? (
            <>
              {detectedWallets.length > 0 ? (
                detectedWallets.map((wallet) => (
                  <Button
                    key={wallet.type}
                    onClick={() => connect(wallet.type, { forceAccountPicker: true })}
                    disabled={isConnecting}
                    className="w-full h-12 gap-3 text-base font-semibold"
                    data-testid={`button-connect-${wallet.type}`}
                  >
                    {isConnecting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Wallet className="h-5 w-5" />
                    )}
                    {isConnecting ? "Connecting..." : `Connect ${wallet.name}`}
                    {!isConnecting && <ArrowRight className="h-4 w-4 ml-auto" />}
                  </Button>
                ))
              ) : (
                <Button
                  onClick={() => connect(undefined, { forceAccountPicker: true })}
                  disabled={isConnecting}
                  className="w-full h-12 gap-3 text-base font-semibold"
                  data-testid="button-connect-wallet"
                >
                  {isConnecting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Wallet className="h-5 w-5" />
                  )}
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                  {!isConnecting && <ArrowRight className="h-4 w-4 ml-auto" />}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-3 w-full">
              <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-left text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground text-sm">No wallet detected</p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs leading-relaxed">
                  <li>
                    Install <strong>Rabby</strong> or <strong>MetaMask</strong> from your browser&apos;s extension store (Chrome, Edge, Firefox, Brave).
                  </li>
                  <li>
                    On mobile, open this page inside your wallet app&apos;s browser, or use the &quot;Open in Rabby / MetaMask&quot; options when shown.
                  </li>
                  <li>
                    Everything after that happens here — connect, approve builder access, then trade. No third-party exchange website redirect.
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                <Monitor className="h-3.5 w-3.5" />
                <span>Desktop extension or phone wallet browser</span>
                <Smartphone className="h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or stay updated</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="w-full grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to="/trading">
              <TrendingUp className="h-4 w-4" />
              Browse trading
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to="/learn">
              <GraduationCap className="h-4 w-4" />
              Learn first
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to="/pricing">
              <CreditCard className="h-4 w-4" />
              View plans
            </Link>
          </Button>
        </div>

        <div className="w-full rounded-xl border border-border/60 bg-card/40 p-3 text-left text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            Need help before connecting?
          </div>
          <p className="mt-1 leading-relaxed">
            You can still browse the trading workspace, courses, pricing, and deposit guide without connecting a wallet first.
          </p>
        </div>

        {/* Email capture */}
        {emailSubmitted ? (
          <div className="w-full flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">You're on the list!</p>
              <p className="text-xs text-muted-foreground">We'll notify you about new features and updates.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailCapture} className="w-full space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="input-lead-email"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={isSubmittingEmail || !email}
                className="h-11 px-4"
                data-testid="button-submit-lead-email"
              >
                {isSubmittingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Notify me"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">No spam, ever. We'll notify you about updates.</p>
          </form>
        )}
      </div>
    </div>
  );
}
