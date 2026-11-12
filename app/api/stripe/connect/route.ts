import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getServiceClient } from "@/lib/stripeServer";

/**
 * Phase 4 — owner connects (or disconnects) their restaurant's OWN
 * Stripe account. The caller is authenticated with their Supabase JWT;
 * membership is proven by an RLS-scoped read. The secret key is
 * validated against Stripe, then stored via the service role in
 * restaurant_secrets — a table no client can read back. Only the
 * publishable key + last-4 hint live in restaurant_settings.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function memberRestaurant(token: string, restaurantId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await supabase
    .from("restaurant_settings")
    .select("restaurant_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return Boolean(data);
}

function bearer(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
}

export async function POST(req: Request) {
  const svc = getServiceClient();
  if (!svc) {
    return NextResponse.json(
      { error: "PLATFORM_NOT_CONFIGURED", message: "Card payments are not switched on at platform level yet (the platform owner must add SUPABASE_SERVICE_ROLE_KEY in Vercel)." },
      { status: 501 },
    );
  }
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  let body: { restaurant_id?: string; publishable_key?: string; secret_key?: string; webhook_secret?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const restaurantId = body.restaurant_id ?? "";
  const publishable = (body.publishable_key ?? "").trim();
  const secret = (body.secret_key ?? "").trim();
  const webhookSecret = (body.webhook_secret ?? "").trim();

  if (!restaurantId || !publishable || !secret) {
    return NextResponse.json({ error: "MISSING_FIELDS", message: "Restaurant, publishable key and secret key are required." }, { status: 400 });
  }
  if (!/^pk_(live|test)_/.test(publishable)) {
    return NextResponse.json({ error: "BAD_PUBLISHABLE", message: "The publishable key should start with pk_live_ or pk_test_." }, { status: 400 });
  }
  if (!/^(sk|rk)_(live|test)_/.test(secret)) {
    return NextResponse.json({ error: "BAD_SECRET", message: "The secret key should start with sk_ or rk_ (a restricted key, rk_…, is recommended)." }, { status: 400 });
  }
  if (!(await memberRestaurant(token, restaurantId))) {
    return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });
  }

  // Validate the key against Stripe itself. A 401 means the key is
  // wrong/revoked; a permission error means the key exists but is too
  // narrow to check — we accept it and say so (checkout creation is
  // the real test, and its errors surface at order time).
  let verified = false;
  try {
    const stripe = new Stripe(secret);
    await stripe.checkout.sessions.list({ limit: 1 });
    verified = true;
  } catch (e) {
    const err = e as { statusCode?: number; code?: string };
    if (err.statusCode === 401) {
      return NextResponse.json({ error: "KEY_REJECTED", message: "Stripe rejected this key (401). Check you copied the full key from YOUR Stripe account." }, { status: 400 });
    }
    // 403 / permission errors: key exists, too narrow to verify here.
    verified = false;
  }

  const { error: secErr } = await svc.from("restaurant_secrets").upsert({
    restaurant_id: restaurantId,
    stripe_secret_key: secret,
    stripe_webhook_secret: webhookSecret || null,
    updated_at: new Date().toISOString(),
  });
  if (secErr) return NextResponse.json({ error: "DB_ERROR", message: secErr.message }, { status: 500 });

  const { error: setErr } = await svc.from("restaurant_settings").update({
    stripe_enabled: true,
    stripe_publishable_key: publishable,
    stripe_key_last4: secret.slice(-4),
  }).eq("restaurant_id", restaurantId);
  if (setErr) return NextResponse.json({ error: "DB_ERROR", message: setErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, verified, last4: secret.slice(-4) });
}

export async function DELETE(req: Request) {
  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  let body: { restaurant_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const restaurantId = body.restaurant_id ?? "";
  if (!restaurantId || !(await memberRestaurant(token, restaurantId))) {
    return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });
  }
  await svc.from("restaurant_secrets").delete().eq("restaurant_id", restaurantId);
  await svc.from("restaurant_settings").update({
    stripe_enabled: false, stripe_publishable_key: null, stripe_key_last4: null,
  }).eq("restaurant_id", restaurantId);
  return NextResponse.json({ ok: true });
}
