import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

interface StripeCredentials {
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeWebhookSecret?: string;
  accountId?: string;
}

async function fetchStripeCredentials(): Promise<StripeCredentials> {
  const connectorsHost = process.env.REPLIT_CONNECTORS_HOSTNAME;

  if (!connectorsHost) {
    throw new Error(
      "REPLIT_CONNECTORS_HOSTNAME not set. Make sure Stripe integration is configured in Replit.",
    );
  }

  const response = await fetch(
    `https://${connectorsHost}/stripe/credentials`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Stripe credentials: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data as StripeCredentials;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const creds = await fetchStripeCredentials();
  return new Stripe(creds.stripeSecretKey);
}

let stripeSyncInstance: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (stripeSyncInstance) return stripeSyncInstance;

  const creds = await fetchStripeCredentials();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for StripeSync");
  }

  stripeSyncInstance = new StripeSync({
    stripeSecretKey: creds.stripeSecretKey,
    stripeWebhookSecret: creds.stripeWebhookSecret || "",
    databaseUrl,
  });

  return stripeSyncInstance;
}

export { fetchStripeCredentials };
