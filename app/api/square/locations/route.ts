import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSquareTokens, squareConfigured, squareFetch } from "@/lib/squareServer";

/**
 * Phase 5 — Square locations: POST lists the connected account's
 * locations (owner JWT); PUT saves the owner's chosen location and
 * switches order push on.
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function ownerDb(req: NextRequest, restaurantId: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: rest } = await db.from("restaurants").select("id").eq("id", restaurantId).maybeSingle();
  return rest ? db : null;
}

export async function POST(req: NextRequest) {
  if (!squareConfigured()) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  let body: { restaurantId?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.restaurantId) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  const db = await ownerDb(req, body.restaurantId);
  if (!db) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const tokens = await getSquareTokens(body.restaurantId);
  if (!tokens) return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });
  const res = await squareFetch(tokens.accessToken, "/v2/locations");
  if (!res.ok) return NextResponse.json({ error: "SQUARE_ERROR" }, { status: 502 });
  const locs = (res.json.locations as { id: string; name?: string; status?: string }[] | undefined ?? [])
    .filter((l) => l.status !== "INACTIVE")
    .map((l) => ({ id: l.id, name: l.name ?? l.id }));
  return NextResponse.json({ ok: true, locations: locs });
}

export async function PUT(req: NextRequest) {
  if (!squareConfigured()) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  let body: { restaurantId?: string; locationId?: string; locationName?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.restaurantId || !body.locationId) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  const db = await ownerDb(req, body.restaurantId);
  if (!db) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { error } = await db.from("restaurant_settings").update({
    square_enabled: true,
    square_location_id: body.locationId,
    square_location_name: body.locationName ?? null,
  }).eq("restaurant_id", body.restaurantId);
  if (error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
