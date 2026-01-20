import { Link } from "wouter";
import { Lock, Zap, Crown, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import { useWallet } from "@/lib/wallet-context";

interface SubscriptionGateProps {
  feature: 'ai_signals' | 'heatmap' | 'advanced_education' | 'coaching';
  children: React.ReactNode;
  title?: string;
  description?: string;
}

const featureRequirements: Record<string, { tier: string; icon: React.ReactNode; name: string }> = {
  ai_signals: { tier: 'pro', icon: <Zap className="h-5 w-5" />, name: 'AI Pattern Detection' },
  heatmap: { tier: 'elite', icon: <Crown className="h-5 w-5" />, name: 'Liquidity Heatmap' },
  advanced_education: { tier: 'pro', icon: <Zap className="h-5 w-5" />, name: 'Advanced Education' },
  coaching: { tier: 'elite', icon: <Crown className="h-5 w-5" />, name: '1-on-1 Coaching' },
};

export function SubscriptionGate({ feature, children, title, description }: SubscriptionGateProps) {
  const { hasAccess, isLoading, tier } = useSubscription();
  const { isConnected, address } = useWallet();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
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
              Connect your wallet to access {featureRequirements[feature]?.name || 'this feature'}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (hasAccess(feature)) {
    return <>{children}</>;
  }

  const requirement = featureRequirements[feature];
  const requiredTier = requirement?.tier || 'pro';
  const featureName = requirement?.name || 'Premium Feature';
  const FeatureIcon = requirement?.icon || <Lock className="h-5 w-5" />;

  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            {FeatureIcon}
            {title || featureName}
          </CardTitle>
          {requiredTier === 'elite' ? (
            <Badge variant="secondary" className="mx-auto bg-amber-500/10 text-amber-500 border-amber-500/30">
              Elite Required
            </Badge>
          ) : (
            <Badge variant="secondary" className="mx-auto bg-primary/10 text-primary border-primary/30">
              AI Pro Required
            </Badge>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            {description || `Upgrade to ${requiredTier === 'elite' ? 'Elite Mentoring' : 'AI Pro'} to unlock ${featureName.toLowerCase()}.`}
          </p>
          
          {tier !== 'free' && (
            <p className="text-xs text-muted-foreground">
              Current plan: <span className="font-medium capitalize">{tier}</span>
            </p>
          )}

          <Link href="/pricing">
            <Button className="w-full" data-testid="button-upgrade-subscription">
              {requiredTier === 'elite' ? (
                <>
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade to Elite
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Upgrade to AI Pro
                </>
              )}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
