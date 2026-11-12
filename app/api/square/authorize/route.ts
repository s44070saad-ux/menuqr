import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SQUARE_BASE, signSquareState, squareConfigured } from "@/lib/squareServer";

/**
 * Phase 5 — Square OAuth, step 1: the dashboard POSTs the owner's
 * JWT + restaurant id; we answer the Square authorize URL. The
 * `state` is the restaurant id plus an HMAC signature and a
 * timestamp (keyed by the app secret), so the public callback can
 * trust it without server-side session storage.
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SCOPES = ["ORDERS_WRITE", "ORDERS_READ", "ITEMS_READ", "MERCHANT_PROFILE_READ", "PAYMENTS_WRITE"];

export async function POST(req: NextRequest) {
  if (!squareConfigured()) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  if (!SUPABASE_URL || !SUPABASE_ANON) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  let body: { restaurantId?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.restaurantId) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: rest } = await db.from("restaurants").select("id").eq("id", body.restaurantId).maybeSingle();
  if (!rest) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const redirectUri = `${origin}/api/square/callback`;
  const url = `${SQUARE_BASE}/oauth2/authorize?client_id=${encodeURIComponent(process.env.SQUARE_APPLICATION_ID ?? "")}&scope=${encodeURIComponent(SCOPES.join(" "))}&session=false&state=${encodeURIComponent(signSquareState(body.restaurantId))}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return NextResponse.json({ ok: true, url, redirectUri });
}
