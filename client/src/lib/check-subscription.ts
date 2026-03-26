export type SubscriptionCheckResult = {
  tier: "free" | "pro" | "mentoring" | "elite";
  active: boolean;
  expiresAt: string | null;
  /** True when Stripe (or backend) reports an active Pro or Mentoring plan. */
  isSubscribed: boolean;
};

function isPaidTier(t: string | undefined): boolean {
  return t === "pro" || t === "mentoring" || t === "elite";
}

/**
 * Resolves Pro ($50/mo) vs Mentoring ($500/mo, includes Pro) via `/api/stripe/subscription/:wallet`.
 */
export async function checkSubscription(walletAddress: string): Promise<SubscriptionCheckResult> {
  const res = await fetch(`/api/stripe/subscription/${walletAddress}`);
  if (!res.ok) {
    return {
      tier: "free",
      active: false,
      expiresAt: null,
      isSubscribed: false,
    };
  }
  const data = (await res.json()) as {
    tier: SubscriptionCheckResult["tier"];
    active: boolean;
    expiresAt: string | null;
  };
  const rawTier = data.tier ?? "free";
  const tier = rawTier === "elite" ? "mentoring" : rawTier;
  const isSubscribed = !!(data.active && isPaidTier(rawTier));
  return {
    tier,
    active: !!data.active,
    expiresAt: data.expiresAt ?? null,
    isSubscribed,
  };
}
