import { getStripeSync } from "./stripeClient";
import { processVerifiedStripeWebhookPayload } from "./stripe-referral-webhook";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const verifiedByAppSecret = await processVerifiedStripeWebhookPayload(payload, signature);

    const sync = await getStripeSync();
    try {
      await sync.processWebhook(payload, signature);
    } catch (error) {
      // If the webhook was verified and handled with the app's configured `whsec_...`,
      // do not fail the request just because stripe-replit-sync does not recognize a
      // manually created Stripe endpoint secret. Core access/referral side effects already ran.
      if (verifiedByAppSecret) {
        console.warn("[stripe webhook] sync.processWebhook skipped after app-secret verification:", error);
        return;
      }
      throw error;
    }
  }
}
