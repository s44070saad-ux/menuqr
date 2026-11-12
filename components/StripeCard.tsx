"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Card, ErrorBox, SuccessBox, btnGhost, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { SITE_URL } from "@/lib/supabaseClient";

/**
 * Phase 4 — connect the restaurant's OWN Stripe account (BYO keys).
 * The secret key goes to /api/stripe/connect and is stored server-side
 * in restaurant_secrets; it is never readable from the dashboard
 * again (only the last-4 hint shows). Velora never touches the money.
 */
export default function StripeCard({
  restaurantId,
  enabled,
  keyLast4,
  onChanged,
}: {
  restaurantId: string;
  enabled: boolean;
  keyLast4: string | null;
  onChanged: () => void;
}) {
  const [publishable, setPublishable] = useState("");
  const [secret, setSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function call(method: "POST" | "DELETE", payload: Record<string, string>) {
    if (!supabase) return;
    setBusy(true); setError(null); setSuccess(null); setNotConfigured(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setError("Your session expired — please log in again."); setBusy(false); return; }
      const res = await fetch("/api/stripe/connect", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 501 || out.error === "PLATFORM_NOT_CONFIGURED") { setNotConfigured(true); setBusy(false); return; }
      if (!res.ok) { setError(out.message || "Something went wrong."); setBusy(false); return; }
      if (method === "POST") {
        setSuccess(out.verified
          ? `Stripe connected (key …${out.last4}) and verified with Stripe. Customers can now choose "Pay now by card" at checkout.`
          : `Stripe connected (key …${out.last4}). The key was too restricted to verify automatically — the first real checkout will confirm it works.`);
        setPublishable(""); setSecret(""); setWebhookSecret("");
      } else {
        setSuccess("Stripe disconnected. Customers will pay at the counter again.");
      }
      onChanged();
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setBusy(false);
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";
  const webhookUrl = `${SITE_URL}/api/stripe/webhook`;

  return (
    <Card>
      <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
        <CreditCard size={17} className="text-brand" /> Card payments — your own Stripe
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Connect <strong>your own</strong> Stripe account and customers can pay at the table or for takeaway by
        card, Apple Pay or Google Pay. The money goes straight to your Stripe — Velora never touches it and
        takes no cut. You need a Stripe account in your own country (Stripe handles your KYC and payouts).
      </p>
      <ErrorBox message={error} />
      <SuccessBox message={success} />
      {notConfigured && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Platform setup pending.</strong> The platform owner still needs to add the
          {" "}<code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel before any restaurant can connect Stripe.
          Your keys are never stored until that is done.
        </div>
      )}
      {enabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            Connected{keyLast4 ? ` · key …${keyLast4}` : ""}
          </span>
          <button type="button" disabled={busy} onClick={() => call("DELETE", { restaurant_id: restaurantId })} className={btnGhost}>
            {busy ? "Working…" : "Disconnect Stripe"}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div>
            <label className={labelCls} htmlFor="stripe-pk">Publishable key (pk_live_… or pk_test_…)</label>
            <input id="stripe-pk" className={inputCls} value={publishable} onChange={(e) => setPublishable(e.target.value)} placeholder="pk_live_…" autoComplete="off" />
          </div>
          <div>
            <label className={labelCls} htmlFor="stripe-sk">Restricted secret key (rk_… recommended — Stripe Dashboard → Developers → API keys → Create restricted key, with "Checkout Sessions: Write")</label>
            <input id="stripe-sk" type="password" className={inputCls} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="rk_live_…" autoComplete="off" />
          </div>
          <div>
            <label className={labelCls} htmlFor="stripe-wh">Webhook secret (optional, whsec_… — enables instant payment confirmation)</label>
            <input id="stripe-wh" type="password" className={inputCls} value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="whsec_…" autoComplete="off" />
            <p className="mt-1 text-xs text-slate-400">
              To get one: Stripe Dashboard → Developers → Webhooks → Add endpoint → URL{" "}
              <code className="break-all">{webhookUrl}</code> → events <code>checkout.session.completed</code> and{" "}
              <code>checkout.session.expired</code> → copy its signing secret. Without it, payments still confirm
              when the customer returns to the menu — just not instantly in the background.
            </p>
          </div>
          <div>
            <button type="button" disabled={busy || !publishable.trim() || !secret.trim()}
              onClick={() => call("POST", { restaurant_id: restaurantId, publishable_key: publishable, secret_key: secret, webhook_secret: webhookSecret })}
              className={btnPrimary}>
              {busy ? "Connecting…" : "Connect Stripe"}
            </button>
          </div>
          <p className="text-xs text-slate-400">Your secret key is stored server-side only and is never shown again — not even to you. Disconnecting deletes it.</p>
        </div>
      )}
    </Card>
  );
}
