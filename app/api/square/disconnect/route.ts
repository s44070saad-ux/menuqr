import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/squareServer";

/** Phase 5 — disconnect Square: clears stored tokens + settings flags. */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(req: NextRequest) {
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

  const { error } = await db.from("restaurant_settings").update({
    square_enabled: false, square_location_id: null, square_location_name: null, square_merchant_id: null,
  }).eq("restaurant_id", body.restaurantId);
  if (error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });

  const svc = getServiceClient();
  if (svc) {
    await svc.from("restaurant_secrets").update({
      square_access_token: null, square_refresh_token: null, square_token_expires_at: null,
    }).eq("restaurant_id", body.restaurantId);
  }
  return NextResponse.json({ ok: true });
}
