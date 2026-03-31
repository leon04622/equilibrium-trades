/** Session key written when a visitor lands on `/pricing?ref=0x…` (see `pricing.tsx`). */
export const PRICING_REF_SESSION_KEY = "equilibrium_pricing_ref_wallet";

/** Normalized referrer wallet for Stripe checkout metadata, if present and valid. */
export function getPricingReferralWallet(): string | null {
  try {
    const v = sessionStorage.getItem(PRICING_REF_SESSION_KEY)?.trim();
    if (v && /^0x[a-fA-F0-9]{40}$/i.test(v)) {
      return v.toLowerCase();
    }
  } catch {
    /* private mode / quota */
  }
  return null;
}
