import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

export interface SubscriptionStatus {
  tier: 'free' | 'pro' | 'elite';
  active: boolean;
  expiresAt: string | null;
}

export type PremiumFeature =
  | 'ai_signals'
  | 'heatmap'
  | 'advanced_education'
  | 'coaching'
  | 'sma_overlays'
  | 'live_trading'
  | 'trade_journal'
  | 'video_library';

export function useSubscription() {
  const { address, isConnected } = useWallet();

  const { data: subscription, isLoading, error, refetch } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/stripe/subscription", address],
    enabled: isConnected && !!address,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const isPro = subscription?.active && (subscription.tier === 'pro' || subscription.tier === 'elite');
  const isElite = subscription?.active && subscription.tier === 'elite';
  const isFree = !subscription?.active || subscription?.tier === 'free';

  const hasAccess = (feature: PremiumFeature): boolean => {
    switch (feature) {
      // Pro features
      case 'ai_signals':
      case 'advanced_education':
      case 'sma_overlays':
      case 'live_trading':
      case 'trade_journal':
      case 'video_library':
        return !!(isPro || isElite);
      // Elite features
      case 'heatmap':
      case 'coaching':
        return !!isElite;
      default:
        return false;
    }
  };

  return {
    subscription,
    isLoading,
    error,
    refetch,
    isPro,
    isElite,
    isFree,
    tier: subscription?.tier || 'free',
    hasAccess,
    isConnected,
  };
}
