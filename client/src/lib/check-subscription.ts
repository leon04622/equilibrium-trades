export type SubscriptionCheckResult = {
  tier: "free" | "pro" | "elite";
  active: boolean;
  expiresAt: string | null;
  /** True when Stripe (or backend) reports an active Pro or Elite plan. */
  isSubscribed: boolean;
};

/**
 * Verifies $50/mo Pro (or Elite) status for a wallet via the existing Stripe subscription API.
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
  const isSubscribed = !!(data.active && (data.tier === "pro" || data.tier === "elite"));
  return {
    tier: data.tier ?? "free",
    active: !!data.active,
    expiresAt: data.expiresAt ?? null,
    isSubscribed,
  };
}
