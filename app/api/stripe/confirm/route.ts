import { NextResponse } from "next/server";
import { getServiceClient, getRestaurantStripe } from "@/lib/stripeServer";

/**
 * Phase 4 — reconcile an order's payment state with Stripe (used
 * when the customer returns from Checkout; the webhook is the
 * always-on path, this is the instant-feedback path). Token-gated,
 * reads the truth from Stripe, never trusts the client.
 */
export async function POST(req: Request) {
  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  let body: { order_id?: string; token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const orderId = body.order_id ?? "";
  const token = body.token ?? "";
  if (!orderId || !token) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: order } = await svc
    .from("orders")
    .select("id, restaurant_id, payment_status, stripe_session_id, customer_token")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.customer_token !== token) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }
  if (order.payment_status === "paid" || !order.stripe_session_id) {
    return NextResponse.json({ payment_status: order.payment_status });
  }
  const rs = await getRestaurantStripe(svc, order.restaurant_id);
  if (!rs) return NextResponse.json({ payment_status: order.payment_status });

  try {
    const session = await rs.stripe.checkout.sessions.retrieve(order.stripe_session_id);
    let next = order.payment_status as string;
    if (session.payment_status === "paid") next = "paid";
    else if (session.status === "expired") next = "failed";
    if (next !== order.payment_status) {
      await svc.from("orders").update({ payment_status: next }).eq("id", order.id);
    }
    return NextResponse.json({ payment_status: next });
  } catch {
    return NextResponse.json({ payment_status: order.payment_status });
  }
}
