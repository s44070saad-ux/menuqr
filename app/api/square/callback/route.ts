import { NextRequest, NextResponse } from "next/server";
import { exchangeSquareCode, getServiceClient, squareConfigured, verifySquareState } from "@/lib/squareServer";

/**
 * Phase 5 — Square OAuth, step 2 (public callback): verify the
 * HMAC state, exchange the code, store the restaurant's tokens in
 * restaurant_secrets via the service role, and bounce the owner
 * back to the Orders page to pick their Square location.
 */

export const runtime = "nodejs";

function back(req: NextRequest, status: string): NextResponse {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/dashboard/orders?square=${status}`);
}

export async function GET(req: NextRequest) {
  if (!squareConfigured()) return back(req, "not_configured");
  const u = new URL(req.url);
  const code = u.searchParams.get("code") ?? "";
  const state = u.searchParams.get("state") ?? "";
  const restaurantId = verifySquareState(state);
  if (!code || !restaurantId) return back(req, "error");

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const tokens = await exchangeSquareCode(code, `${origin}/api/square/callback`);
  if (!tokens?.access_token) return back(req, "error");

  const svc = getServiceClient();
  if (!svc) return back(req, "not_configured");
  const { error: secErr } = await svc.from("restaurant_secrets").upsert({
    restaurant_id: restaurantId,
    square_access_token: tokens.access_token,
    square_refresh_token: tokens.refresh_token ?? null,
    square_token_expires_at: tokens.expires_at ?? null,
  }, { onConflict: "restaurant_id" });
  if (secErr) return back(req, "error");
  await svc.from("restaurant_settings")
    .update({ square_merchant_id: tokens.merchant_id ?? null })
    .eq("restaurant_id", restaurantId);
  return back(req, "connected");
}
