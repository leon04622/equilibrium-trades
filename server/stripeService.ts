import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

// Product ID → tier mapping (from replit.md)
const PRODUCT_TIER_MAP: Record<string, 'pro' | 'elite'> = {
  'prod_TpGvzRznydzDhy': 'pro',   // AI Pro
  'prod_TpGvGOpqOoE8xL': 'elite', // Elite Mentoring
};

export class StripeService {
  async createCustomer(email: string, walletAddress: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { walletAddress },
    });
  }

  async createCheckoutSession(
    customerId: string, 
    priceId: string, 
    walletAddress: string,
    successUrl: string, 
    cancelUrl: string,
    mode: 'subscription' | 'payment' = 'subscription'
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { walletAddress },
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getProduct(productId: string) {
    if (!db) return null;
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async listProducts(active = true) {
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active}`
    );
    return result.rows;
  }

  async listProductsWithPrices(active = true) {
    if (!db) return [];
    const result = await db.execute(
      sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = ${active}
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }

  async listProductsWithPricesFromStripe() {
    const stripe = await getUncachableStripeClient();
    const [products, prices] = await Promise.all([
      stripe.products.list({ active: true, limit: 20 }),
      stripe.prices.list({ active: true, limit: 100 }),
    ]);
    return products.data.map(product => ({
      product_id: product.id,
      product_name: product.name,
      product_description: product.description ?? null,
      product_active: product.active,
      product_metadata: product.metadata,
      prices: prices.data
        .filter(p => p.product === product.id)
        .map(p => ({
          price_id: p.id,
          unit_amount: p.unit_amount,
          currency: p.currency,
          recurring: p.recurring,
          price_active: p.active,
          price_metadata: p.metadata,
        })),
    }));
  }

  async getPrice(priceId: string) {
    if (!db) return null;
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE id = ${priceId}`
    );
    return result.rows[0] || null;
  }

  async listPrices(active = true) {
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active}`
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    if (!db) return null;
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  async getCustomerByEmail(email: string) {
    if (!db) return null;
    const result = await db.execute(
      sql`SELECT * FROM stripe.customers WHERE email = ${email} LIMIT 1`
    );
    return result.rows[0] || null;
  }

  async getCustomerSubscriptions(customerId: string) {
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE customer = ${customerId} AND status = 'active'`
    );
    return result.rows;
  }

  /**
   * Look up active subscription details by wallet address.
   * Checks stripe.customers (metadata->walletAddress), finds active subscriptions,
   * and maps product to tier.
   * Returns null if no active subscription found.
   */
  async getActiveSubscriptionByWalletAddress(walletAddress: string): Promise<{
    tier: 'pro' | 'elite';
    active: true;
    expiresAt: string | null;
  } | null> {
    try {
      if (!db) return null;
      // Find customer by walletAddress in metadata (case-insensitive match)
      const customerResult = await db.execute(
        sql`
          SELECT id FROM stripe.customers 
          WHERE LOWER(metadata->>'walletAddress') = LOWER(${walletAddress})
          LIMIT 1
        `
      );
      
      let customerId: string;

      if (customerResult.rows.length > 0) {
        customerId = (customerResult.rows[0] as any).id as string;
      } else {
        // Fallback: find customer via checkout session client_reference_id (payment links)
        const sessionResult = await db.execute(
          sql`
            SELECT customer FROM stripe.checkout_sessions
            WHERE LOWER(client_reference_id) = LOWER(${walletAddress})
              AND status = 'complete'
              AND customer IS NOT NULL
            ORDER BY created DESC
            LIMIT 1
          `
        );
        if (sessionResult.rows.length === 0) return null;
        customerId = (sessionResult.rows[0] as any).customer as string;
        // Backfill walletAddress onto the customer so future lookups use the faster path
        try {
          const stripe = await getUncachableStripeClient();
          await stripe.customers.update(customerId, { metadata: { walletAddress } });
        } catch { /* non-fatal */ }
      }

      // Get active subscriptions with their product info via items
      const subResult = await db.execute(
        sql`
          SELECT 
            s.id as sub_id,
            s.status,
            s.current_period_end,
            si.price as price_id,
            p.product as product_id
          FROM stripe.subscriptions s
          JOIN stripe.subscription_items si ON si.subscription = s.id
          JOIN stripe.prices p ON p.id = si.price
          WHERE s.customer = ${customerId}
            AND s.status IN ('active', 'trialing')
          ORDER BY s.created DESC
          LIMIT 1
        `
      );

      if (subResult.rows.length === 0) return null;

      const row = subResult.rows[0] as any;
      const productId = row.product_id as string;
      const tier = PRODUCT_TIER_MAP[productId];
      
      if (!tier) return null;

      const expiresAt = row.current_period_end
        ? new Date(Number(row.current_period_end) * 1000).toISOString()
        : null;

      return { tier, active: true, expiresAt };
    } catch (err) {
      console.error('[stripeService] getActiveSubscriptionByWalletAddress error:', err);
      return null;
    }
  }
}

export const stripeService = new StripeService();
export { PRODUCT_TIER_MAP };
