import { useWallet } from "@/lib/wallet-context";
import { useUserSync } from "@/context/AuthContext";
import { isMasterBypassWallet } from "@/lib/master-bypass-wallets";

export interface SubscriptionStatus {
  tier: "free" | "pro" | "mentoring" | "elite";
  active: boolean;
  expiresAt: string | null;
}

export type PremiumFeature =
  | "ai_signals"
  | "heatmap"
  | "advanced_education"
  | "coaching"
  | "sma_overlays"
  | "live_trading"
  | "trade_journal"
  | "video_library";

const PAID_SUB_TIER_LABELS = new Set(["pro", "mentor", "mentoring", "elite"]);

export function useSubscription() {
  const { address, isConnected } = useWallet();
  const userSync = useUserSync();
  const { data: sync, status, error, refetch, isFetching, isError } = userSync;

  const syncEnabled = Boolean(isConnected && address);
  const masterBypass = isMasterBypassWallet(address);

  /** True only after a successful `/api/user/sync` for the connected wallet — avoids treating users as Free while pending. */
  const subscriptionHydrated = syncEnabled && status === "success" && sync != null;

  const isSyncError = syncEnabled && isError && !masterBypass;

  const isLoadingEffective =
    !masterBypass && syncEnabled && !isSyncError && !subscriptionHydrated;

  const subscription: SubscriptionStatus | undefined = sync?.subscription
    ? {
        tier: sync.subscription.tier,
        active: sync.subscription.active,
        expiresAt: sync.subscription.expiresAt,
      }
    : undefined;

  const manualProUnlock = sync?.profile?.manualProOverride === true;

  const subNorm = String(sync?.subscription?.subTier ?? "")
    .trim()
    .toLowerCase();
  const paidByMongoSubTier = PAID_SUB_TIER_LABELS.has(subNorm);
  const expRaw = sync?.subscription?.expiresAt;
  const expMs = expRaw ? new Date(expRaw).getTime() : NaN;
  const subscriptionExpOk = !Number.isFinite(expMs) || expMs > Date.now();

  /** Backup if `tier`/`active` lag but CRM `subTier` already shows Pro/Mentor. */
  const mongoSubTierUnlock =
    subscriptionHydrated && paidByMongoSubTier && subscriptionExpOk;

  const mentorLabel =
    subscription?.tier === "mentoring" ||
    subscription?.tier === "elite" ||
    subNorm === "mentor" ||
    subNorm === "mentoring" ||
    subNorm === "elite";

  const isMentoring =
    subscriptionHydrated &&
    mentorLabel &&
    (manualProUnlock || mongoSubTierUnlock || !!subscription?.active);

  const isPro =
    masterBypass ||
    manualProUnlock ||
    mongoSubTierUnlock ||
    (subscriptionHydrated &&
      !!subscription?.active &&
      (subscription.tier === "pro" || subscription.tier === "mentoring" || subscription.tier === "elite"));

  const isFree = subscriptionHydrated && !isPro && !masterBypass;

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
    subscriptionHydrated,
    isLoading: isLoadingEffective,
    error,
    isSyncError,
    refetch,
    isFetching,
    isPro,
    isMentoring,
    /** @deprecated use isMentoring */
    isElite: isMentoring,
    isFree,
    /** Alias for an active Pro or Mentoring plan (Mongo + Postgres + Stripe, after sync). */
    isSubscribed: !!isPro,
    tier: masterBypass ? "mentoring" : (subscriptionHydrated ? subscription?.tier : undefined) || "free",
    masterBypass,
    hasAccess,
    isConnected,
  };
}
