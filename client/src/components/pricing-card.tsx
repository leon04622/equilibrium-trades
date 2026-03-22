import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  icon: "basic" | "pro" | "elite";
}

interface PricingCardProps {
  tier: PricingTier;
  onSelect?: () => void;
}

export function PricingCard({ tier, onSelect }: PricingCardProps) {
  const iconMap = {
    basic: Zap,
    pro: Sparkles,
    elite: Crown,
  };

  const Icon = iconMap[tier.icon];

  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all",
        tier.highlighted && "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
      )}
      data-testid={`pricing-card-${tier.id}`}
    >
      {tier.badge && (
        <div className="absolute top-0 right-0">
          <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground">
            {tier.badge}
          </Badge>
        </div>
      )}
      <CardHeader className="pb-4">
        <div className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl mb-4",
          tier.highlighted ? "bg-primary text-primary-foreground" : "bg-muted"
        )}>
          <Icon className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl font-display">{tier.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{tier.description}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <span className="text-4xl font-bold font-display">£{tier.price}</span>
          <span className="text-muted-foreground ml-1">/{tier.period}</span>
        </div>

        <ul className="space-y-3">
          {tier.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5",
                tier.highlighted ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Check className="h-3 w-3" />
              </div>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <Button 
          variant={tier.highlighted ? "default" : "secondary"} 
          className="w-full"
          onClick={onSelect}
          data-testid={`button-select-${tier.id}`}
        >
          {tier.price === 0 ? "Get Started Free" : "Subscribe Now"}
        </Button>
      </CardContent>
    </Card>
  );
}

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    period: "month",
    description: "Perfect for learning the basics of trading patterns",
    icon: "basic",
    features: [
      "Access to pattern library",
      "Basic TradingView charts",
      "5 educational modules",
      "21 & 200 SMA indicators",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "AI Pro",
    price: 50,
    period: "month",
    description: "AI-powered pattern detection and alerts",
    icon: "pro",
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Everything in Starter",
      "AI-powered pattern detection",
      "Real-time pattern alerts",
      "Advanced educational content",
      "SMA crossover signals",
      "Trade setup recommendations",
      "Priority support",
    ],
  },
  {
    id: "elite",
    name: "Elite Mentoring",
    price: 500,
    period: "month",
    description: "1-on-1 coaching with 40-minute weekly Zoom calls",
    icon: "elite",
    features: [
      "Everything in AI Pro",
      "Weekly 40-minute 1-on-1 Zoom call",
      "Personalized trading strategy review",
      "Live trade analysis sessions",
      "Liquidity Heatmap access",
      "Order flow analysis",
      "Private Discord access",
      "Direct messaging support",
    ],
  },
];
