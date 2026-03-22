import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePaywall } from "@/lib/paywall-context";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Zap,
  Brain,
  TrendingUp,
  BookOpen,
  BarChart2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRO_STRIPE_LINK = "https://buy.stripe.com/28EfZggCd8QQ0dk81L0oM05";

const PREMIUM_FEATURES = [
  {
    icon: TrendingUp,
    title: "21/200 SMA Strategy Overlays",
    description: "Live SMA crossover signals & overlay lines on every chart",
  },
  {
    icon: Brain,
    title: "AI Pattern Recognition",
    description: "Real-time pattern detection with entry, SL & TP targets",
  },
  {
    icon: BookOpen,
    title: "Trade Journal",
    description: "Graded trade log with performance analytics & feedback",
  },
  {
    icon: BarChart2,
    title: "Live Trading — 200+ Markets",
    description: "Perps & spot markets with direct wallet execution",
  },
];

export function PaywallModal() {
  const { isOpen, triggerFeature, closePaywall } = usePaywall();
  const { address, isConnected, connect } = useWallet();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleSubscribe = async () => {
    if (!isConnected || !address) {
      try {
        await connect();
      } catch {
        toast({
          title: "Wallet Required",
          description: "Connect your wallet, then click Subscribe again.",
          variant: "destructive",
        });
      }
      return;
    }

    setIsCheckingOut(true);
    const url = `${PRO_STRIPE_LINK}?client_reference_id=${encodeURIComponent(address)}`;
    window.location.href = url;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closePaywall()}>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden border-border/80 gap-0"
        data-testid="paywall-modal"
      >
        <DialogTitle className="sr-only">Unlock Full Platform</DialogTitle>
        <DialogDescription className="sr-only">Subscribe to Equilibrium Pro for £50/month to unlock all premium features.</DialogDescription>

        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-background px-6 pt-8 pb-6 text-center border-b border-border/50">
          <button
            onClick={closePaywall}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-paywall"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
            <Lock className="h-7 w-7 text-primary" />
          </div>

          {triggerFeature && (
            <Badge variant="secondary" className="mb-3 text-xs">
              {triggerFeature}
            </Badge>
          )}

          <h2 className="text-2xl font-display font-bold text-foreground">
            Unlock Full Platform
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you need to trade with an edge — one plan, no limits.
          </p>

          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold font-display text-foreground">£50</span>
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 py-5 space-y-3">
          {PREMIUM_FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 space-y-3">
          <Button
            onClick={handleSubscribe}
            disabled={isCheckingOut}
            className="w-full h-12 text-base font-semibold gap-2"
            data-testid="button-paywall-subscribe"
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting checkout...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Subscribe — £50/month
              </>
            )}
          </Button>

          <button
            onClick={closePaywall}
            className={cn(
              "w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1",
            )}
            data-testid="button-paywall-dismiss"
          >
            Maybe later
          </button>

          <p className="text-center text-[10px] text-muted-foreground">
            Cancel anytime · Non-custodial · Your keys, your funds
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
