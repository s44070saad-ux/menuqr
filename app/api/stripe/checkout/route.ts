import { NextResponse } from "next/server";
import { getServiceClient, getRestaurantStripe, toMinorUnits } from "@/lib/stripeServer";

/**
 * Phase 4 — create a Stripe Checkout session for an already-placed
 * order, on the RESTAURANT's own Stripe account. The customer's
 * order token is the credential (same trust model as the status
 * page). The amount is read from the stored order — never from the
 * client — and the order flips to payment_status 'pending_card'.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export async function POST(req: Request) {
  const svc = getServiceClient();
  if (!svc) {
    return NextResponse.json(
      { error: "PLATFORM_NOT_CONFIGURED", message: "Card payments are not switched on at platform level yet." },
      { status: 501 },
    );
  }
  let body: { order_id?: string; token?: string; slug?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const orderId = body.order_id ?? "";
  const token = body.token ?? "";
  const slug = (body.slug ?? "").replace(/[^a-zA-Z0-9-_]/g, "");
  if (!orderId || !token || !slug) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: order } = await svc
    .from("orders")
    .select("id, restaurant_id, total_amount, payment_status, customer_token, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.customer_token !== token) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "ALREADY_PAID" }, { status: 409 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "ORDER_CANCELLED" }, { status: 409 });
  }
  const total = Number(order.total_amount);
  if (!(total > 0)) {
    return NextResponse.json({ error: "NOTHING_TO_PAY", message: "This order is fully covered (e.g. by a gift card) — nothing to pay by card." }, { status: 400 });
  }

  const rs = await getRestaurantStripe(svc, order.restaurant_id);
  if (!rs) {
    return NextResponse.json({ error: "STRIPE_NOT_CONNECTED", message: "This restaurant has not connected Stripe." }, { status: 400 });
  }
  const { data: restaurant } = await svc
    .from("restaurants")
    .select("name, currency")
    .eq("id", order.restaurant_id)
    .maybeSingle();
  const currency = (restaurant?.currency ?? "USD").toLowerCase();
  const name = restaurant?.name ?? "Restaurant";

  try {
    const session = await rs.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toMinorUnits(total, currency),
            product_data: { name: `Order at ${name}` },
          },
        },
      ],
      metadata: { order_id: order.id, restaurant_id: order.restaurant_id },
      success_url: `${SITE_URL}/menu/${slug}?payment=success`,
      cancel_url: `${SITE_URL}/menu/${slug}?payment=cancelled`,
    });
    await svc.from("orders").update({
      stripe_session_id: session.id, payment_status: "pending_card",
    }).eq("id", order.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: "STRIPE_ERROR", message: `Card payment could not be started: ${msg}` }, { status: 502 });
  }
}
