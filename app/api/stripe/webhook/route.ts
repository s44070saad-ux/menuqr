import { NextResponse } from "next/server";
import { getServiceClient, getRestaurantStripe } from "@/lib/stripeServer";

/**
 * Phase 4 — Stripe webhook (one endpoint for all restaurants).
 * The restaurant is identified from the order row behind the
 * Checkout session id; the signature is then verified against THAT
 * restaurant's own webhook secret before anything is trusted.
 * Restaurants that skip the webhook secret still reconcile via the
 * confirm route when the customer returns.
 */
export async function POST(req: Request) {
  const svc = getServiceClient();
  if (!svc) return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let sessionId = "";
  let eventType = "";
  try {
    const parsed = JSON.parse(raw) as {
      type?: string;
      data?: { object?: { id?: string } };
    };
    eventType = parsed.type ?? "";
    sessionId = parsed.data?.object?.id ?? "";
  } catch {
    return NextResponse.json({ error: "BAD_BODY" }, { status: 400 });
  }
  if (!sessionId || !eventType.startsWith("checkout.session.")) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const { data: order } = await svc
    .from("orders")
    .select("id, restaurant_id, payment_status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!order) return NextResponse.json({ received: true, ignored: true });

  const rs = await getRestaurantStripe(svc, order.restaurant_id);
  if (!rs?.webhookSecret) {
    // No webhook secret on file — cannot verify; the confirm route
    // reconciles this order when the customer returns instead.
    return NextResponse.json({ received: true, unverified: true });
  }

  let event;
  try {
    event = rs.stripe.webhooks.constructEvent(raw, sig, rs.webhookSecret);
  } catch {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { payment_status?: string };
    if (session.payment_status === "paid" && order.payment_status !== "paid") {
      await svc.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
    }
  } else if (event.type === "checkout.session.expired") {
    if (order.payment_status === "pending_card") {
      await svc.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
    }
  }
  return NextResponse.json({ received: true });
}
