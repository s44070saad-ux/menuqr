import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Phase 4 — server-side Stripe plumbing (API routes only; NEVER import
 * this from client code).
 *
 * Restaurants use their OWN Stripe account: they paste a restricted
 * key into Velora, it is stored in restaurant_secrets (RLS on, no
 * client policies), and only these server routes — using the
 * platform's Supabase service-role key — can read it. Velora never
 * touches the money; the restaurant is the merchant of record.
 *
 * SUPABASE_SERVICE_ROLE_KEY must be set in the Vercel env. Without it
 * every helper here returns null and the routes answer
 * PLATFORM_NOT_CONFIGURED instead of failing obscurely.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function getServiceClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RestaurantStripe {
  stripe: Stripe;
  secretKey: string;
  webhookSecret: string | null;
  publishableKey: string | null;
}

/** Load a restaurant's Stripe credentials (service role) or null. */
export async function getRestaurantStripe(
  svc: SupabaseClient,
  restaurantId: string,
): Promise<RestaurantStripe | null> {
  const { data: secret } = await svc
    .from("restaurant_secrets")
    .select("stripe_secret_key, stripe_webhook_secret")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!secret?.stripe_secret_key) return null;
  const { data: settings } = await svc
    .from("restaurant_settings")
    .select("stripe_publishable_key, stripe_enabled")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!settings?.stripe_enabled) return null;
  return {
    stripe: new Stripe(secret.stripe_secret_key),
    secretKey: secret.stripe_secret_key,
    webhookSecret: secret.stripe_webhook_secret ?? null,
    publishableKey: settings.stripe_publishable_key ?? null,
  };
}

/** Currencies Stripe treats as zero-decimal (amount = whole units). */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** Convert a major-unit amount (e.g. PKR 250.50) to Stripe minor units. */
export function toMinorUnits(amount: number, currency: string): number {
  const cur = currency.toUpperCase();
  if (ZERO_DECIMAL.has(cur)) return Math.round(amount);
  return Math.round(amount * 100);
}
