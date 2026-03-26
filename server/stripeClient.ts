import Stripe from 'stripe';

function getEnvStripeCredentials(): { publishableKey: string; secretKey: string } | null {
  const sk = process.env.STRIPE_SECRET_KEY?.trim();
  if (!sk) return null;
  const pk = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || '';
  return { publishableKey: pk, secretKey: sk };
}

async function getCredentials() {
  const envCreds = getEnvStripeCredentials();
  if (!envCreds) {
    throw new Error(
      'Stripe credentials unavailable: set STRIPE_SECRET_KEY (and STRIPE_PUBLISHABLE_KEY for checkout UI)'
    );
  }
  return envCreds;
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2026-02-25.clover',
  });
}

/** Publishable key for the checkout UI; null if Stripe is not configured. */
export async function getStripePublishableKey(): Promise<string | null> {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (pk) return pk;
  try {
    const { publishableKey } = await getCredentials();
    return publishableKey?.trim() || null;
  } catch {
    return null;
  }
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

/** Uses npm package `stripe-replit-sync` for Postgres-backed catalog + webhooks (works on any host with DATABASE_URL + STRIPE_SECRET_KEY). */
export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
