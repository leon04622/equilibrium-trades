import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";
import { checkSubscription } from "@/lib/check-subscription";

export interface SubscriptionStatus {
  tier: "free" | "pro" | "mentoring" | "elite";
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
    queryKey: ["/api/user-status", address],
    enabled: isConnected && !!address,
    // Avoid refetching on every navigation/focus; UserTierSync still invalidates on wallet change.
    staleTime: 120_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await checkSubscription(address!);
      return {
        tier: r.tier,
        active: r.active,
        expiresAt: r.expiresAt,
      } satisfies SubscriptionStatus;
    },
  });

  const isMentoring =
    subscription?.active &&
    (subscription.tier === "mentoring" || subscription.tier === "elite");
  const isPro =
    subscription?.active &&
    (subscription.tier === "pro" || subscription.tier === "mentoring" || subscription.tier === "elite");
  const isFree = !subscription?.active || subscription?.tier === "free";

  const hasAccess = (feature: PremiumFeature): boolean => {
    switch (feature) {
      case "ai_signals":
      case "advanced_education":
      case "sma_overlays":
      case "live_trading":
      case "trade_journal":
      case "video_library":
        return !!isPro;
      case "heatmap":
        return !!isPro;
      case "coaching":
        return !!isMentoring;
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
    /** Active Mentoring ($500/mo) or legacy elite tier from API. */
    isMentoring,
    /** @deprecated use isMentoring */
    isElite: isMentoring,
    isFree,
    /** Alias for an active Pro or Mentoring plan (Stripe-verified when connected). */
    isSubscribed: !!isPro,
    tier: subscription?.tier || 'free',
    hasAccess,
    isConnected,
  };
}
