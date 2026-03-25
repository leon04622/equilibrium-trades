/** Default [Stripe Payment Links](https://stripe.com/docs/payment-links) — override via Vite env for staging. */
const DEFAULT_PRO = "https://buy.stripe.com/28EfZggCd8QQ0dk81L0oM05";
const DEFAULT_MENTORING = "https://buy.stripe.com/eVqeVc3Prc326BI6XH0oM04";

export const STRIPE_PAYMENT_LINK_PRO =
  (import.meta.env.VITE_STRIPE_PAYMENT_LINK_PRO as string | undefined)?.trim() ||
  DEFAULT_PRO;

export const STRIPE_PAYMENT_LINK_MENTORING =
  (import.meta.env.VITE_STRIPE_PAYMENT_LINK_MENTORING as string | undefined)?.trim() ||
  DEFAULT_MENTORING;

export function proCheckoutUrl(walletAddress: string): string {
  const u = new URL(STRIPE_PAYMENT_LINK_PRO);
  u.searchParams.set("client_reference_id", walletAddress);
  return u.toString();
}

export function mentoringCheckoutUrl(walletAddress?: string | null): string {
  if (!walletAddress?.trim()) return STRIPE_PAYMENT_LINK_MENTORING;
  const u = new URL(STRIPE_PAYMENT_LINK_MENTORING);
  u.searchParams.set("client_reference_id", walletAddress.trim());
  return u.toString();
}
