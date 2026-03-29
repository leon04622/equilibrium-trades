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

function mapSyncToResult(data: {
  tier: SubscriptionCheckResult["tier"];
  active: boolean;
  expiresAt: string | null;
}): SubscriptionCheckResult {
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

/**
 * Same subscription rules as the UI (`GET /api/user/sync`), with fallback to `/api/user-status/:wallet`.
 */
export async function checkSubscription(walletAddress: string): Promise<SubscriptionCheckResult> {
  const free: SubscriptionCheckResult = {
    tier: "free",
    active: false,
    expiresAt: null,
    isSubscribed: false,
  };

  try {
    const syncRes = await fetch("/api/user/sync", {
      credentials: "include",
      headers: {
        "x-wallet-address": walletAddress,
        Authorization: `Bearer ${walletAddress}`,
      },
    });
    if (syncRes.ok) {
      const body = (await syncRes.json()) as { subscription?: SubscriptionCheckResult };
      const s = body.subscription;
      if (s?.tier != null) {
        return mapSyncToResult({
          tier: s.tier,
          active: !!s.active,
          expiresAt: s.expiresAt ?? null,
        });
      }
    }
  } catch {
    /* fall through */
  }

  const enc = encodeURIComponent(walletAddress);
  const res = await fetch(`/api/user-status/${enc}`, { credentials: "include" });
  if (!res.ok) return free;
  const data = (await res.json()) as {
    tier: SubscriptionCheckResult["tier"];
    active: boolean;
    expiresAt: string | null;
  };
  return mapSyncToResult(data);
}
