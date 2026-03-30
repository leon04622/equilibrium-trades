import { useWallet } from "@/lib/wallet-context";
import { useUserSync } from "@/context/AuthContext";

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
  const { data: sync, isLoading, error, refetch, isFetching } = useUserSync();

  const subscription: SubscriptionStatus | undefined = sync?.subscription
    ? {
        tier: sync.subscription.tier,
        active: sync.subscription.active,
        expiresAt: sync.subscription.expiresAt,
      }
    : undefined;

  const isLoadingEffective = !!(isConnected && address && isLoading);

  /** Admin “Grant Pro” / CRM `manualProOverride` must unlock UI even if `active` lags one frame. */
  const manualProUnlock = sync?.profile?.manualProOverride === true;

  const isMentoring =
    (subscription?.active || manualProUnlock) &&
    (subscription?.tier === "mentoring" || subscription?.tier === "elite");
  const isPro =
    manualProUnlock ||
    (!!subscription?.active &&
      (subscription.tier === "pro" ||
        subscription.tier === "mentoring" ||
        subscription.tier === "elite"));
  const isFree = !isPro;

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
    isLoading: isLoadingEffective,
    error,
    refetch,
    isFetching,
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
