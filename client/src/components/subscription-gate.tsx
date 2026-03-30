import { Lock, Zap, Crown, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import { useWallet } from "@/lib/wallet-context";
import { usePaywall } from "@/lib/paywall-context";
import type { PremiumFeature } from "@/hooks/use-subscription";
import { PremiumFeatureLock } from "@/components/premium-feature-lock";
import { cn } from "@/lib/utils";

interface SubscriptionGateProps {
  feature: PremiumFeature;
  children: React.ReactNode;
  title?: string;
  description?: string;
  /** `overlay`: show page content blurred with Pro CTA (freemium). `card`: full-page gate (default). */
  variant?: "card" | "overlay";
}

const featureRequirements: Record<PremiumFeature, { tier: "pro" | "mentoring"; icon: React.ReactNode; name: string }> = {
  ai_signals: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "AI Pattern Detection" },
  sma_overlays: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "SMA Strategy Overlays" },
  live_trading: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "Live Trading" },
  trade_journal: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "Trade Journal" },
  advanced_education: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "Advanced Education" },
  video_library: { tier: "pro", icon: <Zap className="h-5 w-5" />, name: "Course Video Library" },
  heatmap: { tier: "mentoring", icon: <Crown className="h-5 w-5" />, name: "Liquidity Heatmap" },
  coaching: { tier: "mentoring", icon: <Crown className="h-5 w-5" />, name: "1-on-1 Coaching" },
};

export function SubscriptionGate({
  feature,
  children,
  title,
  description,
  variant = "card",
}: SubscriptionGateProps) {
  const { hasAccess, isLoading, tier, isSyncError, refetch } = useSubscription();
  const { isConnected } = useWallet();
  const { openPaywall } = usePaywall();

  const requirement = featureRequirements[feature];
  const featureName = requirement?.name || "Premium Feature";

  if (isSyncError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[40vh] p-8">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-lg">Subscription sync failed</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[40vh]">
        <div className="animate-pulse text-muted-foreground">Loading subscription…</div>
      </div>
    );
  }

  const subscribed = hasAccess(feature);

  if (variant === "overlay") {
    if (subscribed) {
      return <>{children}</>;
    }
    return (
      <div className="relative h-full min-h-0 flex flex-col">
        <PremiumFeatureLock
          locked
          featureLabel={featureName}
          title={title || "Upgrade to Pro"}
          subtitle={
            description ||
            `Unlock ${featureName.toLowerCase()} — connect a wallet at checkout if you have not already.`
          }
          className="min-h-[min(70vh,520px)] flex-1 rounded-none"
        >
          <div className={cn("min-h-[min(70vh,520px)] p-4 md:p-6", !isConnected && "opacity-90")}>
            {children}
          </div>
        </PremiumFeatureLock>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Connect Your Wallet</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to access {featureRequirements[feature]?.name || "this feature"}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (subscribed) {
    return <>{children}</>;
  }

  const requiredTier = requirement?.tier || "pro";

  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-lg">
            {title || featureName}
          </CardTitle>
          {requiredTier === "mentoring" ? (
            <Badge variant="secondary" className="mx-auto bg-amber-500/10 text-amber-500 border-amber-500/30">
              Mentoring Required
            </Badge>
          ) : (
            <Badge variant="secondary" className="mx-auto bg-primary/10 text-primary border-primary/30">
              Pro Required
            </Badge>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            {description || `Unlock ${featureName.toLowerCase()} with a Pro subscription.`}
          </p>

          {tier !== 'free' && (
            <p className="text-xs text-muted-foreground">
              Current plan: <span className="font-medium capitalize">{tier}</span>
            </p>
          )}

          <Button
            className="w-full"
            onClick={() => openPaywall(featureName)}
            data-testid="button-upgrade-subscription"
          >
            {requiredTier === "mentoring" ? (
              <>
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Mentoring
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Unlock Full Platform — $50/month
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
