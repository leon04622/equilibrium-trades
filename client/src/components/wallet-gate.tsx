import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Smartphone, Monitor, ArrowRight, Loader2, Mail, CheckCircle2, TrendingUp, Shield, Zap, ExternalLink, AlertCircle } from "lucide-react";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { isConnected, isConnecting, connect, isMobile, openInWalletBrowser, detectedWallets, connectError } = useWallet();
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  if (isConnected) return <>{children}</>;

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

  const hasWallet = detectedWallets.length > 0 || !!window.ethereum;

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

          {connectError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{connectError}</span>
            </div>
          )}

          {isMobile && !hasWallet ? (
            <>
              <Button
                onClick={() => openInWalletBrowser("metamask")}
                className="w-full h-12 gap-3 text-base font-semibold"
                data-testid="button-open-metamask"
              >
                <Wallet className="h-5 w-5" />
                Open in MetaMask
                <ArrowRight className="h-4 w-4 ml-auto" />
              </Button>
              <p className="text-xs text-muted-foreground">
                Don't have MetaMask?{" "}
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-primary underline">
                  Download it free
                </a>
              </p>
            </>
          ) : hasWallet ? (
            <>
              {detectedWallets.length > 0 ? (
                detectedWallets.map((wallet) => (
                  <Button
                    key={wallet.type}
                    onClick={() => connect(wallet.type)}
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
                  onClick={() => connect()}
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
            <div className="space-y-3">
              <Button
                onClick={() => window.open("https://metamask.io/download/", "_blank")}
                className="w-full h-12 gap-3 text-base font-semibold"
                data-testid="button-install-metamask"
              >
                <ExternalLink className="h-5 w-5" />
                Install MetaMask
                <ArrowRight className="h-4 w-4 ml-auto" />
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Monitor className="h-3.5 w-3.5" />
                <span>Or open this site in your wallet's browser</span>
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
