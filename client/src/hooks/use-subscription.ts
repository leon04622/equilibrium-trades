import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

export interface SubscriptionStatus {
  tier: 'free' | 'pro' | 'elite';
  active: boolean;
  expiresAt: string | null;
}

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

  const hasAccess = (feature: 'ai_signals' | 'heatmap' | 'advanced_education' | 'coaching') => {
    if (!subscription?.active) return false;
    
    switch (feature) {
      case 'ai_signals':
        return isPro || isElite;
      case 'heatmap':
        return isElite;
      case 'advanced_education':
        return isPro || isElite;
      case 'coaching':
        return isElite;
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
