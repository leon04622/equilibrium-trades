import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, Crown, ArrowRight, Shield, Zap, BookOpen, Share2, Quote, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";
import { proCheckoutUrl, mentoringCheckoutUrl } from "@/lib/stripe-payment-links";
import { getPricingReferralWallet, PRICING_REF_SESSION_KEY } from "@/lib/pricing-referral";

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
  const [checkoutBusy, setCheckoutBusy] = useState<null | "pro" | "mentoring">(null);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refWallet = urlParams.get("ref")?.trim();
    if (refWallet && /^0x[a-fA-F0-9]{40}$/i.test(refWallet)) {
      try {
        sessionStorage.setItem(PRICING_REF_SESSION_KEY, refWallet.toLowerCase());
      } catch {
        /* ignore quota / private mode */
      }
    }

    const success = urlParams.get("success");
    const canceled = urlParams.get("canceled");
    const tier = urlParams.get("tier");

    if (success === "true") {
      toast({
        title: "Subscription Active!",
        description:
          tier === "mentoring"
            ? "Welcome! Your mentoring access is active and includes the full Pro platform."
            : "Welcome! You now have access to all Pro tools.",
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

  const handlePortalOpen = async () => {
    if (!isConnected || !address) {
      try {
        await connect();
      } catch {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet first so we can open the right billing portal.",
          variant: "destructive",
        });
      }
      return;
    }

    setPortalBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not open billing portal");
      }
      window.location.href = data.url;
    } catch (error) {
      toast({
        title: "Billing portal unavailable",
        description:
          error instanceof Error
            ? error.message
            : "We could not open the Stripe billing portal right now.",
        variant: "destructive",
      });
    } finally {
      setPortalBusy(false);
    }
  };

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

    const referralWallet = getPricingReferralWallet();
    setCheckoutBusy("pro");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          tier: "pro",
          ...(referralWallet ? { referralWallet } : {}),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout failed");
      }
      window.location.href = data.url;
    } catch {
      toast({
        title: "Using backup checkout",
        description:
          "The payment link will open instead. Referral details may not appear in Stripe for this attempt.",
        variant: "destructive",
      });
      window.location.href = proCheckoutUrl(address);
    } finally {
      setCheckoutBusy(null);
    }
  };

  const handleMentoringCheckout = async () => {
    if (!isConnected || !address) {
      window.location.href = mentoringCheckoutUrl(null);
      return;
    }

    const referralWallet = getPricingReferralWallet();
    setCheckoutBusy("mentoring");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          tier: "mentoring",
          ...(referralWallet ? { referralWallet } : {}),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout failed");
      }
      window.location.href = data.url;
    } catch {
      toast({
        title: "Using backup checkout",
        description:
          "The payment link will open instead. Referral details may not appear in Stripe for this attempt.",
        variant: "destructive",
      });
      window.location.href = mentoringCheckoutUrl(address);
    } finally {
      setCheckoutBusy(null);
    }
  };

  const shareUrl = useMemo(() => {
    const base = `${window.location.origin}/pricing`;
    if (address) {
      return `${base}?ref=${encodeURIComponent(address)}`;
    }
    return base;
  }, [address]);

  const testimonials = [
    {
      quote:
        "Having signals, the journal, and the vault in one place finally stopped me from bouncing between five tabs during the session.",
      attribution: "Pro member",
      role: "Futures & spot",
    },
    {
      quote:
        "The mentoring add-on was worth it for execution feedback I could not get from generic courses alone.",
      attribution: "Mentoring member",
      role: "Part-time trader",
    },
    {
      quote:
        "Checkout was straightforward and I could cancel my subscription from the billing portal when my schedule changed.",
      attribution: "Pro member",
      role: "Swing focus",
    },
  ];

  const trustPoints = [
    {
      icon: Shield,
      title: "Persistent member access",
      body: "Pro access is loaded from the live backend so members do not lose their plan after refresh.",
    },
    {
      icon: Zap,
      title: "Single workspace",
      body: "Signals, trading, journal, and vault content live inside one connected product flow.",
    },
    {
      icon: BookOpen,
      title: "Education included",
      body: "The platform is built so every subscription unlocks practical education, not just raw tooling.",
    },
  ];

  return (
    <div className="p-6 space-y-10 max-w-5xl mx-auto">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-8 text-center shadow-xl shadow-primary/5">
        <div className="space-y-3">
          <Badge className="mb-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Premium Trading Membership
          </Badge>
          <h1 className="text-4xl font-display font-bold md:text-5xl">
            Choose the plan that matches how closely you want to work with Equilibrium.
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Pro unlocks the platform. Mentoring adds direct guidance and a higher-touch experience for traders who want
            personalised feedback.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {trustPoints.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-background/80 p-4 text-left">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center space-y-3">
        <Badge className="mb-2">
          <Sparkles className="h-3 w-3 mr-1" />
          Simple Pricing
        </Badge>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          One plan for the full platform. One plan for those who want personalised coaching on top.
        </p>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                toast({
                  title: "Link copied",
                  description: address
                    ? "Share it with traders you trust — your wallet is attached for referral context."
                    : "Share the pricing page — connect a wallet to attach a referral hint in the URL.",
                });
              } catch {
                toast({
                  title: "Copy failed",
                  description: shareUrl,
                  variant: "destructive",
                });
              }
            }}
          >
            <Share2 className="h-4 w-4" />
            Copy membership link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void handlePortalOpen()}
            disabled={portalBusy || checkoutBusy !== null}
          >
            {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Manage billing
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card/60 p-6 md:p-8">
        <div className="mb-6 text-center">
          <h2 className="font-display text-xl font-semibold md:text-2xl">What members say</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Anonymous-style quotes reflect common feedback themes — not financial advice.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.quote.slice(0, 40)} className="relative rounded-xl border bg-background/80 p-5 text-left shadow-sm">
              <Quote className="absolute right-4 top-4 h-8 w-8 text-primary/15" aria-hidden />
              <p className="text-sm leading-relaxed text-foreground/90">{t.quote}</p>
              <p className="mt-4 text-xs font-medium text-foreground">{t.attribution}</p>
              <p className="text-xs text-muted-foreground">{t.role}</p>
            </div>
          ))}
        </div>
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
              onClick={() => void handleProCheckout()}
              disabled={checkoutBusy !== null}
              data-testid="button-subscribe-pro"
            >
              {checkoutBusy === "pro" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Get Pro Access
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Cancel anytime from the Stripe customer portal. No long-term lock-in.
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
              onClick={() => void handleMentoringCheckout()}
              disabled={checkoutBusy !== null}
              data-testid="button-subscribe-mentoring"
            >
              {checkoutBusy === "mentoring" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Book Mentoring
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              One-time payment. Pro platform access granted after payment.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
        <h3 className="font-display text-center text-base font-semibold text-foreground">Billing, refunds, and membership</h3>
        <ul className="mx-auto mt-4 max-w-2xl list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Pro (monthly):</span> You can cancel before the next renewal from
            the Stripe billing portal linked from checkout emails or your account flow. Access typically continues until
            the end of the paid period.
          </li>
          <li>
            <span className="font-medium text-foreground">Mentoring (one-time):</span> Coaching is a delivered service;
            refund eligibility depends on what was already scheduled or delivered — contact support if something went
            wrong with payment or access.
          </li>
          <li>
            <span className="font-medium text-foreground">Fair use:</span> Automated abuse of signup, support, or checkout
            may be rate-limited or blocked to keep the workspace reliable for paying members.
          </li>
        </ul>
      </div>

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

      <Card className="border-primary/15 bg-gradient-to-r from-background to-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold">What members are really buying</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Not just charts or lessons. The value is having execution, review, and learning tied together in one
                environment.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Best fit for Pro</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Members who want the full platform and can execute independently with better structure and guidance.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Best fit for Mentoring</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Traders who want direct accountability, feedback on execution, and a more bespoke path.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
