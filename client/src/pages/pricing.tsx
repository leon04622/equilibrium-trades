import { useEffect, useState } from "react";
import { Check, Sparkles, Flame, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PricingCard, pricingTiers } from "@/components/pricing-card";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const faqs = [
  {
    question: "What is the Liquidity Heatmap?",
    answer: "The Liquidity Heatmap visualizes where large buy and sell orders are placed in the order book. This helps you identify key support and resistance levels, spot institutional activity, and make more informed trading decisions. It's similar to tools like Bookmap but integrated directly into the Equilibrium platform."
  },
  {
    question: "How does AI Pattern Detection work?",
    answer: "Our AI continuously scans price action across multiple timeframes to identify chart patterns as they form. It calculates a confidence score for each pattern and provides trade setup recommendations including entry, stop loss, and take profit levels."
  },
  {
    question: "Can I connect my Hyperliquid account with any plan?",
    answer: "Yes! You can connect your Hyperliquid account with any plan, including the free Starter plan. However, AI-powered trade recommendations and advanced features are only available on Pro and Elite plans."
  },
  {
    question: "What's included in 1-on-1 trading coaching?",
    answer: "Elite members get access to weekly 40-minute 1-on-1 video calls with experienced traders who can review your trades, help you improve your strategy, and answer any questions about using the platform or trading in general."
  },
  {
    question: "Is there a free trial?",
    answer: "The Starter plan is completely free and includes access to the pattern library, basic charts, and educational content. You can upgrade anytime to access advanced features."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Yes, you can cancel your subscription at any time. You'll continue to have access to your paid features until the end of your billing period."
  },
];

interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  metadata: { tier?: string };
  prices: StripePrice[];
}

export default function Pricing() {
  const { toast } = useToast();
  const { address, isConnected, connect } = useWallet();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [stripeProducts, setStripeProducts] = useState<StripeProduct[]>([]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    const canceled = urlParams.get("canceled");
    const tier = urlParams.get("tier");

    if (success === "true") {
      toast({
        title: "Subscription Successful!",
        description: `Welcome to ${tier === "elite" ? "Elite Mentoring" : "AI Pro"}! Your subscription is now active.`,
      });
      window.history.replaceState({}, "", "/pricing");
    } else if (canceled === "true") {
      toast({
        title: "Checkout Canceled",
        description: "Your subscription was not completed. Feel free to try again when ready.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/pricing");
    }
  }, [toast]);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch("/api/stripe/products");
        if (response.ok) {
          const data = await response.json();
          setStripeProducts(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch Stripe products:", error);
      }
    }
    fetchProducts();
    
    // Add a small interval to re-fetch if products aren't loaded yet
    const interval = setInterval(() => {
      if (stripeProducts.length === 0) {
        fetchProducts();
      } else {
        clearInterval(interval);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const getPriceIdForTier = (tierId: string): string | null => {
    const tierMap: Record<string, string> = {
      pro: "AI Pro",
      elite: "Elite Mentoring",
    };

    const productName = tierMap[tierId];
    if (!productName) return null;

    const product = stripeProducts.find((p) => p.name === productName);
    if (!product || product.prices.length === 0) return null;

    return product.prices[0].id;
  };

  const handleSelect = async (tierId: string) => {
    if (tierId === "starter") {
      toast({
        title: "Free Plan",
        description: "You're already on the Starter plan! Connect your wallet to get started.",
      });
      return;
    }

    if (!isConnected) {
      try {
        await connect();
      } catch (error) {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet to subscribe.",
          variant: "destructive",
        });
        return;
      }
    }

    setSelectedTier(tierId);
    setShowEmailDialog(true);
  };

  const handleCheckout = async () => {
    if (!selectedTier || !address) return;

    const priceId = getPriceIdForTier(selectedTier);
    if (!priceId) {
      toast({
        title: "Products Not Ready",
        description: "Subscription products are being set up. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/stripe/checkout", {
        priceId,
        walletAddress: address,
        email: email || undefined,
        tier: selectedTier,
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout Failed",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setShowEmailDialog(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <Badge className="mb-4">
          <Sparkles className="h-3 w-3 mr-1" />
          Pricing Plans
        </Badge>
        <h1 className="text-4xl font-display font-bold mb-4">
          Choose Your Trading Edge
        </h1>
        <p className="text-muted-foreground text-lg">
          From learning the basics to gaining institutional-level insights, 
          we have a plan for every trader.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {pricingTiers.map((tier) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            onSelect={() => handleSelect(tier.id)}
          />
        ))}
      </div>

      <Card className="max-w-5xl mx-auto bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-warning/15">
                <Flame className="h-8 w-8 text-warning" />
              </div>
              <div>
                <h3 className="text-xl font-display font-bold">Liquidity Heatmap</h3>
                <p className="text-muted-foreground">
                  See where institutional orders are hiding
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Available on</p>
                <p className="font-semibold">Elite Plan</p>
              </div>
              <Button className="gap-2" onClick={() => handleSelect("elite")} data-testid="button-get-elite-access">
                Get Access
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-center">Compare Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-4 px-4 font-medium">Feature</th>
                    <th className="text-center py-4 px-4 font-medium">Starter</th>
                    <th className="text-center py-4 px-4 font-medium">AI Pro</th>
                    <th className="text-center py-4 px-4 font-medium">Elite</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-3 px-4">Pattern Library Access</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">TradingView Charts</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">SMA Indicators</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Hyperliquid Connection</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">AI Pattern Detection</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Trade Setup Recommendations</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Real-time Pattern Alerts</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr className="bg-warning/5">
                    <td className="py-3 px-4 font-medium">Liquidity Heatmap</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Order Flow Analysis</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Weekly 1-on-1 Zoom Coaching</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Private Discord Access</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4 text-muted-foreground">-</td>
                    <td className="text-center py-3 px-4"><Check className="h-4 w-4 mx-auto text-success" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-display font-bold text-center mb-6">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="text-left hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Your Subscription</DialogTitle>
            <DialogDescription>
              Enter your email to receive subscription updates and receipts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-subscription-email"
              />
              <p className="text-xs text-muted-foreground">
                Your wallet address will be linked to your subscription.
              </p>
            </div>
            <Button 
              className="w-full" 
              onClick={handleCheckout}
              disabled={isLoading}
              data-testid="button-proceed-checkout"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                `Subscribe to ${selectedTier === "elite" ? "Elite Mentoring" : "AI Pro"}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
