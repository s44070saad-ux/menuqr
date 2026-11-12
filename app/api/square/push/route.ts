import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient, getSquareTokens, squareConfigured, squareFetch } from "@/lib/squareServer";
import { toMinorUnits } from "@/lib/stripeServer";

/**
 * Phase 5 — push one Velora order into the restaurant's Square.
 * Called by the owner from the Orders page ("Send to Square").
 * Idempotency: the Square idempotency key is derived from our
 * order id, and once orders.square_order_id is set the route
 * refuses to push twice — staff never see duplicates.
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface OrderRow {
  id: string; restaurant_id: string; order_type: string; table_number: string | null;
  customer_name: string | null; total_amount: number; square_order_id: string | null;
}
interface ItemRow { item_name: string; quantity: number; unit_price: number }

export async function POST(req: NextRequest) {
  if (!squareConfigured()) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  if (!SUPABASE_URL || !SUPABASE_ANON) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  let body: { orderId?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.orderId) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  // RLS: the owner only ever sees their own restaurant's orders.
  const { data: order } = await db.from("orders").select("id, restaurant_id, order_type, table_number, customer_name, total_amount, square_order_id").eq("id", body.orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const o = order as OrderRow;
  if (o.square_order_id) return NextResponse.json({ ok: true, already: true, squareOrderId: o.square_order_id });

  const [{ data: items }, { data: settings }, { data: rest }] = await Promise.all([
    db.from("order_items").select("item_name, quantity, unit_price").eq("order_id", o.id),
    db.from("restaurant_settings").select("square_enabled, square_location_id").eq("restaurant_id", o.restaurant_id).maybeSingle(),
    db.from("restaurants").select("currency").eq("id", o.restaurant_id).maybeSingle(),
  ]);
  const s = settings as { square_enabled?: boolean; square_location_id?: string | null } | null;
  if (!s?.square_enabled || !s.square_location_id) return NextResponse.json({ error: "SQUARE_NOT_READY" }, { status: 409 });
  const currency = (rest as { currency?: string } | null)?.currency ?? "USD";
  const lines = (items as ItemRow[] | null) ?? [];
  if (lines.length === 0) return NextResponse.json({ error: "EMPTY_ORDER" }, { status: 422 });

  const tokens = await getSquareTokens(o.restaurant_id);
  if (!tokens) return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });

  const note = `Velora order · ${o.order_type === "dine_in" ? `Table ${o.table_number ?? "?"}` : "Takeaway"}${o.customer_name ? ` · ${o.customer_name}` : ""}`;
  const res = await squareFetch(tokens.accessToken, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `velora-${o.id}`,
      order: {
        location_id: s.square_location_id,
        reference_id: o.id,
        source: { name: "Velora" },
        line_items: lines.map((l) => ({
          name: l.item_name,
          quantity: String(l.quantity),
          base_price_money: { amount: toMinorUnits(Number(l.unit_price), currency), currency },
          note,
        })),
      },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "SQUARE_ERROR", detail: res.json }, { status: 502 });
  const squareOrder = res.json.order as { id?: string } | undefined;
  if (!squareOrder?.id) return NextResponse.json({ error: "SQUARE_ERROR" }, { status: 502 });

  const svc = getServiceClient();
  if (svc) {
    await svc.from("orders").update({ square_order_id: squareOrder.id }).eq("id", o.id);
  } else {
    await db.from("orders").update({ square_order_id: squareOrder.id }).eq("id", o.id);
  }
  return NextResponse.json({ ok: true, squareOrderId: squareOrder.id });
}
