import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { persistMongoCrmReferralFromStripeCheckout } from "./mongo-vault";
import { upsertMongoCrmSubscriptionAuthority } from "./mongo-vault";
import { storage } from "./storage";
import { PRODUCT_TIER_MAP } from "./stripeService";

function isCheckoutReferralEvent(type: string): boolean {
  return type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
}

function isSubscriptionLifecycleEvent(type: string): boolean {
  return (
    type === "checkout.session.completed" ||
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted" ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed"
  );
}

function tierFromUnitAmountCents(unitAmount: unknown): "pro" | "mentoring" | null {
  const n = typeof unitAmount === "number" ? unitAmount : Number(unitAmount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 40_00 && n <= 60_00) return "pro";
  if (n >= 400_00 && n <= 600_00) return "mentoring";
  return null;
}

function tierFromPriceLike(
  price:
    | { product?: string | Stripe.Product | Stripe.DeletedProduct | null; unit_amount?: number | null }
    | null
    | undefined,
) {
  if (!price) return null;
  const productId =
    typeof price.product === "string"
      ? price.product
      : price.product && typeof price.product === "object" && "id" in price.product
        ? String(price.product.id)
        : null;
  if (productId && PRODUCT_TIER_MAP[productId]) return PRODUCT_TIER_MAP[productId];
  return tierFromUnitAmountCents(price.unit_amount);
}

function periodEndToDate(periodEnd: number | null | undefined): Date | null {
  if (!periodEnd || !Number.isFinite(periodEnd)) return null;
  return new Date(periodEnd * 1000);
}

async function ensureWalletUserRow(walletAddress: string): Promise<void> {
  const existing = await storage.getWalletUser(walletAddress);
  if (existing) return;
  await storage.createWalletUser({
    walletAddress,
    subscriptionTier: "free",
    subscriptionActive: false,
    manualProOverride: false,
  });
}

async function persistSubscriptionAccess(params: {
  walletAddress: string;
  tier: "free" | "pro" | "mentoring";
  active: boolean;
  expiresAt: Date | null;
}) {
  const walletAddress = params.walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) return;
  await ensureWalletUserRow(walletAddress);
  await storage.updateWalletUserSubscription(walletAddress, params.tier, params.active, params.expiresAt);
  await storage.setManualProOverride(walletAddress, false);
  await upsertMongoCrmSubscriptionAuthority({
    walletAddress,
    subscriptionTier: params.tier,
    subscriptionActive: params.active,
    manualProOverride: false,
    subscriptionExpiresAt: params.expiresAt,
  });
}

async function walletAddressFromCustomer(stripe: Stripe, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  if (!customer) return null;
  if (typeof customer !== "string") {
    if ("deleted" in customer && customer.deleted) return null;
    const wallet = customer.metadata?.walletAddress?.trim().toLowerCase();
    return wallet && /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
  }
  try {
    const cust = await stripe.customers.retrieve(customer);
    if (cust.deleted) return null;
    const wallet = cust.metadata?.walletAddress?.trim().toLowerCase();
    return wallet && /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
  } catch {
    return null;
  }
}

async function resolveWalletFromSubscription(stripe: Stripe, subscription: Stripe.Subscription): Promise<string | null> {
  const fromMeta = subscription.metadata?.walletAddress?.trim().toLowerCase();
  if (fromMeta && /^0x[a-f0-9]{40}$/.test(fromMeta)) return fromMeta;
  return await walletAddressFromCustomer(stripe, subscription.customer);
}

async function processSubscriptionLifecycleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  if (!isSubscriptionLifecycleEvent(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const wallet =
      typeof session.metadata?.walletAddress === "string"
        ? session.metadata.walletAddress.trim().toLowerCase()
        : "";
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) return;

    const mode = session.mode;
    if (mode === "subscription" && typeof session.subscription === "string") {
      const subscription = await stripe.subscriptions.retrieve(session.subscription, {
        expand: ["items.data.price.product", "customer"],
      });
      const subscriptionPeriodEnd = (subscription as unknown as { current_period_end?: number | null }).current_period_end;
      const firstItem = subscription.items.data[0];
      const tier = tierFromPriceLike(firstItem?.price);
      if (!tier) return;
      const active = subscription.status === "active" || subscription.status === "trialing";
      await persistSubscriptionAccess({
        walletAddress: wallet,
        tier,
        active,
        expiresAt: periodEndToDate(subscriptionPeriodEnd),
      });
      return;
    }

    // One-time mentoring checkout: grant access until the paid expiry is managed manually/admin-side.
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const first = lineItems.data[0];
    const tier = tierFromPriceLike(first?.price ?? null);
    if (tier === "mentoring") {
      await persistSubscriptionAccess({
        walletAddress: wallet,
        tier: "mentoring",
        active: true,
        expiresAt: null,
      });
    }
    return;
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionPeriodEnd = (subscription as unknown as { current_period_end?: number | null }).current_period_end;
    const wallet = await resolveWalletFromSubscription(stripe, subscription);
    if (!wallet) return;
    const firstItem = subscription.items.data[0];
    const tier = tierFromPriceLike(firstItem?.price) ?? "pro";
    const active = subscription.status === "active" || subscription.status === "trialing";
    await persistSubscriptionAccess({
      walletAddress: wallet,
      tier,
      active,
      expiresAt: periodEndToDate(subscriptionPeriodEnd),
    });
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const invoiceSubscription = (invoice as unknown as { subscription?: string | null }).subscription;
    if (!invoiceSubscription || typeof invoiceSubscription !== "string") return;
    const subscription = await stripe.subscriptions.retrieve(invoiceSubscription, {
      expand: ["items.data.price.product", "customer"],
    });
    const subscriptionPeriodEnd = (subscription as unknown as { current_period_end?: number | null }).current_period_end;
    const wallet = await resolveWalletFromSubscription(stripe, subscription);
    if (!wallet) return;
    const firstItem = subscription.items.data[0];
    const tier = tierFromPriceLike(firstItem?.price) ?? "pro";
    const active =
      event.type === "invoice.paid" &&
      (subscription.status === "active" || subscription.status === "trialing");
    await persistSubscriptionAccess({
      walletAddress: wallet,
      tier,
      active,
      expiresAt: periodEndToDate(subscriptionPeriodEnd),
    });
  }
}

/**
 * Optional sidecar: verifies the webhook with the same signing secret you configure in Stripe Dashboard.
 * If `STRIPE_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SIGNING_SECRET` is unset, skips (stripe-replit-sync may still
 * use a secret from Postgres `stripe._managed_webhooks`).
 */
export async function processVerifiedStripeWebhookPayload(
  payload: Buffer,
  signature: string,
): Promise<boolean> {
  const whsec =
    process.env.STRIPE_WEBHOOK_SECRET?.trim() || process.env.STRIPE_WEBHOOK_SIGNING_SECRET?.trim();
  if (!whsec) return false;

  let event: Stripe.Event;
  const stripe = await getUncachableStripeClient();
  try {
    event = stripe.webhooks.constructEvent(payload, signature, whsec);
  } catch {
    return false;
  }

  if (isCheckoutReferralEvent(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};
    const buyer = typeof meta.walletAddress === "string" ? meta.walletAddress.trim() : "";
    const referral = typeof meta.referral_wallet === "string" ? meta.referral_wallet.trim() : "";
    if (buyer && referral) {
      await persistMongoCrmReferralFromStripeCheckout({
        buyerWallet: buyer,
        referralWallet: referral,
        stripeSessionId: session.id,
      });
    }
  }

  await processSubscriptionLifecycleEvent(stripe, event);
  return true;
}
