import { useEffect } from "react";
import { Check, Sparkles, Crown, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

const PRO_STRIPE_LINK = "https://buy.stripe.com/28EfZggCd8QQ0dk81L0oM05";
const MENTORING_STRIPE_LINK = "https://buy.stripe.com/eVqeVc3Prc326BI6XH0oM04";

const proFeatures = [
  "AI-powered pattern detection",
  "Real-time pattern alerts",
  "Full TradingView trading charts",
  "Live trading — 200+ perp & spot markets",
  "Portfolio management & analytics",
  "Trade setup recommendations (entry, SL, TP)",
  "RSI, Stoch RSI & SMA indicators",
  "Full educational content library",
  "Priority support",
];

const mentoringFeatures = [
  "Everything in the Pro plan",
  "1-on-1 personalised mentoring sessions",
  "Personalised trading strategy review",
  "Live trade analysis with your mentor",
  "Direct access & messaging support",
];


export default function Pricing() {
  const { toast } = useToast();
  const { address, isConnected, connect } = useWallet();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    const canceled = urlParams.get("canceled");

    if (success === "true") {
      toast({
        title: "Subscription Active!",
        description: "Welcome! You now have access to all Pro tools.",
      });
      window.history.replaceState({}, "", "/pricing");
    } else if (canceled === "true") {
      toast({
        title: "Checkout Cancelled",
        description: "Your payment was not completed. Try again whenever you're ready.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/pricing");
    }
  }, [toast]);

  const handleProCheckout = async () => {
    if (!isConnected || !address) {
      try {
        await connect();
      } catch {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet, then click 'Get Pro Access' again.",
          variant: "destructive",
        });
      }
      return;
    }

    const url = `${PRO_STRIPE_LINK}?client_reference_id=${encodeURIComponent(address)}`;
    window.location.href = url;
  };

  const handleMentoringCheckout = () => {
    window.location.href = MENTORING_STRIPE_LINK;
  };

  return (
    <div className="p-6 space-y-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-3">
        <Badge className="mb-2">
          <Sparkles className="h-3 w-3 mr-1" />
          Simple Pricing
        </Badge>
        <h1 className="text-4xl font-display font-bold">
          Choose Your Trading Edge
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          One plan for the full platform. One plan for those who want personalised coaching on top.
        </p>
      </div>

      {/* Two pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pro Plan — £50/month */}
        <Card
          className="relative overflow-hidden border-primary shadow-lg shadow-primary/10 flex flex-col"
          data-testid="pricing-card-pro"
        >
          <div className="absolute top-0 right-0">
            <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground">
              Most Popular
            </Badge>
          </div>

          <CardHeader className="pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-display font-bold">Pro Access</h2>
            <p className="text-sm text-muted-foreground">
              Full access to every tool on the platform
            </p>
          </CardHeader>

          <CardContent className="space-y-6 flex flex-col flex-1">
            <div>
              <span className="text-5xl font-bold font-display">£50</span>
              <span className="text-muted-foreground ml-1">/month</span>
            </div>

            <ul className="space-y-3 flex-1">
              {proFeatures.map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary mt-0.5">
                    <Check className="h-3 w-3" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              size="lg"
              onClick={handleProCheckout}
              data-testid="button-subscribe-pro"
            >
              Get Pro Access
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Cancel anytime. No lock-in.
            </p>
          </CardContent>
        </Card>

        {/* Mentoring Plan — £500 one-time */}
        <Card
          className="relative overflow-hidden flex flex-col"
          data-testid="pricing-card-mentoring"
        >
          <CardHeader className="pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
              <Crown className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-display font-bold">1-on-1 Mentoring</h2>
            <p className="text-sm text-muted-foreground">
              Personal coaching plus full Pro access included
            </p>
          </CardHeader>

          <CardContent className="space-y-6 flex flex-col flex-1">
            <div>
              <span className="text-5xl font-bold font-display">£500</span>
              <span className="text-muted-foreground ml-1">/one-time</span>
            </div>

            <ul className="space-y-3 flex-1">
              {mentoringFeatures.map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5",
                    i === 0
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Check className="h-3 w-3" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={handleMentoringCheckout}
              data-testid="button-subscribe-mentoring"
            >
              Book Mentoring
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              One-time payment. Pro platform access granted after payment.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Feature comparison note */}
      <div className="rounded-xl border bg-muted/30 p-6 space-y-4">
        <h3 className="font-display font-semibold text-center text-lg">
          What's included in Pro Access
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Trading Tools</p>
            <ul className="space-y-1">
              <li>• TradingView charts</li>
              <li>• AI pattern detection</li>
              <li>• Trade setup signals</li>
              <li>• RSI &amp; Stoch RSI</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Exchange Integration</p>
            <ul className="space-y-1">
              <li>• Live trading connection</li>
              <li>• Live portfolio view</li>
              <li>• Deposit &amp; withdraw</li>
              <li>• Order management</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Education &amp; Support</p>
            <ul className="space-y-1">
              <li>• Full pattern library</li>
              <li>• Educational modules</li>
              <li>• Video content</li>
              <li>• Priority support</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
