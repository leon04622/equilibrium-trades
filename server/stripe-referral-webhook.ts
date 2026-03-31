import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { persistMongoCrmReferralFromStripeCheckout } from "./mongo-vault";

function isCheckoutReferralEvent(type: string): boolean {
  return type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
}

/**
 * Optional sidecar: verifies the webhook with the same signing secret you configure in Stripe Dashboard.
 * If `STRIPE_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SIGNING_SECRET` is unset, skips (stripe-replit-sync may still
 * use a secret from Postgres `stripe._managed_webhooks`).
 */
export async function tryPersistStripeReferralFromWebhookPayload(
  payload: Buffer,
  signature: string,
): Promise<void> {
  const whsec =
    process.env.STRIPE_WEBHOOK_SECRET?.trim() || process.env.STRIPE_WEBHOOK_SIGNING_SECRET?.trim();
  if (!whsec) return;

  let event: Stripe.Event;
  try {
    const stripe = await getUncachableStripeClient();
    event = stripe.webhooks.constructEvent(payload, signature, whsec);
  } catch {
    return;
  }

  if (!isCheckoutReferralEvent(event.type)) return;

  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata ?? {};
  const buyer = typeof meta.walletAddress === "string" ? meta.walletAddress.trim() : "";
  const referral = typeof meta.referral_wallet === "string" ? meta.referral_wallet.trim() : "";
  if (!buyer || !referral) return;

  await persistMongoCrmReferralFromStripeCheckout({
    buyerWallet: buyer,
    referralWallet: referral,
    stripeSessionId: session.id,
  });
}
