import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Phase 3 — win-back email sender.
 * Called by the owner from the Customers page with their own Supabase
 * access token; every database read/write runs AS that user, so RLS
 * (restaurant membership) is the authorization. Emails go out through
 * Resend (https://resend.com) — set RESEND_API_KEY (and optionally
 * RESEND_FROM) in the Vercel env. Without the key this route returns
 * EMAIL_NOT_CONFIGURED and the UI shows setup instructions; nothing is
 * ever faked as "sent".
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const MAX_BATCH = 50;
const COOLDOWN_DAYS = 30;

interface CustomerRow {
  id: string; name: string | null; email: string | null;
  email_consent: boolean; unsubscribe_token: string; last_order_at: string;
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EMAIL_NOT_CONFIGURED", message: "Win-back email is not configured yet. Add a Resend API key (RESEND_API_KEY) to enable sending." },
      { status: 501 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  let body: { restaurant_id?: string; customer_ids?: string[]; subject?: string; message?: string; restaurant_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const restaurantId = body.restaurant_id ?? "";
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const ids = [...new Set(body.customer_ids ?? [])].slice(0, MAX_BATCH);
  if (!restaurantId || !subject || !message || ids.length === 0) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, name, email, email_consent, unsubscribe_token, last_order_at")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (custErr) return NextResponse.json({ error: "DB_ERROR", message: custErr.message }, { status: 500 });

  const eligible = ((customers as CustomerRow[]) ?? []).filter((c) => c.email && c.email_consent);
  if (eligible.length === 0) {
    return NextResponse.json({ sent: 0, skipped: ids.length, note: "No selected customer has a consented email address." });
  }

  // 30-day cooldown per customer (winback_sends is the log).
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86400000).toISOString();
  const { data: recent } = await supabase
    .from("winback_sends")
    .select("customer_id")
    .eq("restaurant_id", restaurantId)
    .in("customer_id", eligible.map((c) => c.id))
    .gte("sent_at", since);
  const cooling = new Set((recent ?? []).map((r: { customer_id: string }) => r.customer_id));

  const from = process.env.RESEND_FROM ?? "Velora <onboarding@resend.dev>";
  const restaurantName = (body.restaurant_name ?? "Your restaurant").slice(0, 80);
  let sent = 0;
  let skipped = ids.length - eligible.length;

  for (const c of eligible) {
    if (cooling.has(c.id)) { skipped++; continue; }
    const unsub = `${SITE_URL}/unsubscribe?c=${c.id}&t=${c.unsubscribe_token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="font-size:19px">${escapeHtml(restaurantName)}</h2>
      <p style="font-size:15px;line-height:1.55">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
      <p style="font-size:12px;color:#888;margin-top:28px">You are receiving this because you ordered from ${escapeHtml(restaurantName)} and agreed to email offers.
      <a href="${unsub}" style="color:#888">Unsubscribe</a></p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [c.email], subject, html }),
    });
    if (!res.ok) { skipped++; continue; }
    await supabase.from("winback_sends").insert({ restaurant_id: restaurantId, customer_id: c.id, subject });
    sent++;
  }

  return NextResponse.json({ sent, skipped });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
