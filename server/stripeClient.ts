import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  return new Stripe(secretKey);
}

let stripeSyncInstance: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (stripeSyncInstance) return stripeSyncInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for StripeSync");
  }

  stripeSyncInstance = new StripeSync({
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret,
    databaseUrl,
  });

  return stripeSyncInstance;
}
