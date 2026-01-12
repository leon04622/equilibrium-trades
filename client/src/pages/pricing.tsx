import { Check, Sparkles, Flame, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PricingCard, pricingTiers } from "@/components/pricing-card";
import { useToast } from "@/hooks/use-toast";

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
    answer: "Elite members get access to monthly 1-on-1 video calls with experienced traders who can review your trades, help you improve your strategy, and answer any questions about using the platform or trading in general."
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

export default function Pricing() {
  const { toast } = useToast();

  const handleSelect = (tierId: string) => {
    toast({
      title: "Coming Soon!",
      description: "Subscription functionality will be available soon.",
    });
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
              <Button className="gap-2" onClick={() => handleSelect("elite")}>
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
                    <th className="text-center py-4 px-4 font-medium">Pro</th>
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
                    <td className="py-3 px-4">1-on-1 Trading Coaching</td>
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
    </div>
  );
}
