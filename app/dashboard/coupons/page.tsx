"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Gift, Lock, Plus, Store, TicketPercent, Trash2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { Coupon, GiftCard } from "@/lib/types";

const ORDERING_PLANS = ["pro", "business"];

/**
 * Phase 3 — coupons & gift cards (owner management).
 * All money rules are validated again inside place_customer_order at
 * order time (DB RLS also restricts writes to Pro/Business); this page
 * only manages the records.
 */
export default function CouponsPage() {
  const { loading, restaurant, subscription } = useOwner();
  const planSlug = subscription?.plan?.slug ?? "free";
  const planAllows = ORDERING_PLANS.includes(planSlug);

  const [fetching, setFetching] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cf, setCf] = useState({ code: "", kind: "percent", value: "10", min: "0", max: "", firstOnly: false, expires: "" });
  const [gf, setGf] = useState({ code: "", amount: "1000", note: "" });

  const load = useCallback(async () => {
    if (!supabase || !restaurant) return;
    setFetching(true);
    const [{ data: cp }, { data: gc }] = await Promise.all([
      supabase.from("coupons").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }),
      supabase.from("gift_cards").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }),
    ]);
    setCoupons((cp as Coupon[]) ?? []);
    setCards((gc as GiftCard[]) ?? []);
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { if (planAllows) load(); else setFetching(false); }, [load, planAllows]);

  async function addCoupon() {
    if (!supabase || !restaurant) return;
    const code = cf.code.trim().toUpperCase();
    const value = parseFloat(cf.value);
    if (!code) { setError("Give the coupon a code, e.g. WELCOME10."); return; }
    if (Number.isNaN(value) || value <= 0 || (cf.kind === "percent" && value > 100)) { setError("Value must be a positive number (max 100 for %)."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("coupons").insert({
      restaurant_id: restaurant.id, code, kind: cf.kind, value,
      min_order_amount: parseFloat(cf.min) || 0,
      max_redemptions: cf.max.trim() === "" ? null : parseInt(cf.max, 10),
      first_order_only: cf.firstOnly,
      expires_at: cf.expires ? new Date(cf.expires + "T23:59:59").toISOString() : null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSuccess(`Coupon ${code} created.`);
    setCf({ code: "", kind: "percent", value: "10", min: "0", max: "", firstOnly: false, expires: "" });
    load();
  }

  async function addCard() {
    if (!supabase || !restaurant) return;
    const code = gf.code.trim().toUpperCase() || `GC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const amount = parseFloat(gf.amount);
    if (Number.isNaN(amount) || amount <= 0) { setError("Gift card amount must be a positive number."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("gift_cards").insert({
      restaurant_id: restaurant.id, code, initial_amount: amount, balance: amount, note: gf.note.trim() || null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSuccess(`Gift card ${code} created with ${formatPrice(amount, restaurant.currency)}. Give the code to the buyer — it pays at checkout.`);
    setGf({ code: "", amount: "1000", note: "" });
    load();
  }

  async function toggle(table: "coupons" | "gift_cards", id: string, active: boolean) {
    if (!supabase) return;
    const { error: err } = await supabase.from(table).update({ is_active: !active }).eq("id", id);
    if (err) setError(err.message); else load();
  }

  async function remove(table: "coupons" | "gift_cards", id: string, label: string) {
    if (!supabase) return;
    if (!window.confirm(`Delete ${label}? Past orders that used it are not affected.`)) return;
    const { error: err } = await supabase.from(table).delete().eq("id", id);
    if (err) setError(err.message); else load();
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <DashboardShell title="Coupons & gift cards">
      {loading || fetching ? <Loading label="Loading coupons…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Coupons and gift cards live here once your restaurant exists."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planAllows ? (
        <EmptyState title="Coupons & gift cards are a Pro feature"
          hint="On Pro and Business you can run discount codes (percent or fixed, with minimum order, expiry and first-order-only rules) and sell gift cards that customers spend at checkout — all validated by the system at order time. Paid plans are activated manually by the platform admin."
          action={<Link href="/dashboard/subscription" className={btnPrimary}><Lock size={18} /> See my subscription</Link>} />
      ) : (
        <div className="space-y-4">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <TicketPercent size={17} className="text-brand" /> Coupons
            </p>
            {coupons.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100">
                {coupons.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-xs font-bold tracking-wide text-white">{c.code}</span>
                    <span className="font-semibold text-ink">{c.kind === "percent" ? `${Number(c.value)}% off` : `${formatPrice(Number(c.value), restaurant.currency)} off`}</span>
                    <span className="text-xs text-slate-500">
                      {Number(c.min_order_amount) > 0 && `min ${formatPrice(Number(c.min_order_amount), restaurant.currency)} · `}
                      {c.first_order_only && "first order only · "}
                      redeemed {c.times_redeemed}{c.max_redemptions != null ? `/${c.max_redemptions}` : ""}
                      {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <button type="button" onClick={() => toggle("coupons", c.id, c.is_active)} aria-label="Toggle coupon"
                        className={`inline-flex min-h-[32px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{c.is_active ? "ON" : "OFF"}</button>
                      <button type="button" onClick={() => remove("coupons", c.id, `coupon ${c.code}`)} aria-label="Delete coupon"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-3">
              <div>
                <label className={labelCls} htmlFor="cp-code">Code</label>
                <input id="cp-code" className={inputCls} value={cf.code} placeholder="WELCOME10" onChange={(e) => setCf((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cp-kind">Type</label>
                <select id="cp-kind" className={inputCls} value={cf.kind} onChange={(e) => setCf((f) => ({ ...f, kind: e.target.value }))}>
                  <option value="percent">% off</option>
                  <option value="fixed">{restaurant.currency} off</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="cp-value">Value</label>
                <input id="cp-value" type="number" min="0" step="any" className={inputCls} value={cf.value} onChange={(e) => setCf((f) => ({ ...f, value: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cp-min">Minimum order ({restaurant.currency})</label>
                <input id="cp-min" type="number" min="0" className={inputCls} value={cf.min} onChange={(e) => setCf((f) => ({ ...f, min: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cp-max">Max redemptions (blank = unlimited)</label>
                <input id="cp-max" type="number" min="1" className={inputCls} value={cf.max} onChange={(e) => setCf((f) => ({ ...f, max: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cp-exp">Expires on (optional)</label>
                <input id="cp-exp" type="date" className={inputCls} value={cf.expires} onChange={(e) => setCf((f) => ({ ...f, expires: e.target.value }))} />
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={cf.firstOnly} onChange={(e) => setCf((f) => ({ ...f, firstOnly: e.target.checked }))} className="h-5 w-5 accent-teal-700" />
                First order only (new customers)
              </label>
              <div className="flex items-end">
                <button type="button" onClick={addCoupon} disabled={busy} className={btnPrimary}><Plus size={17} /> {busy ? "Adding…" : "Add coupon"}</button>
              </div>
            </div>
          </Card>

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <Gift size={17} className="text-brand" /> Gift cards
            </p>
            <p className="mt-1 text-sm text-slate-500">Sell or gift a prepaid balance. The holder enters the code at checkout; the system deducts it and tracks the remaining balance here.</p>
            {cards.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100">
                {cards.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="rounded-md bg-teal-700 px-2 py-1 font-mono text-xs font-bold tracking-wide text-white">{g.code}</span>
                    <span className="font-semibold text-ink">{formatPrice(Number(g.balance), restaurant.currency)} left</span>
                    <span className="text-xs text-slate-500">of {formatPrice(Number(g.initial_amount), restaurant.currency)}{g.note ? ` · ${g.note}` : ""}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <button type="button" onClick={() => toggle("gift_cards", g.id, g.is_active)} aria-label="Toggle gift card"
                        className={`inline-flex min-h-[32px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${g.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{g.is_active ? "ON" : "OFF"}</button>
                      <button type="button" onClick={() => remove("gift_cards", g.id, `gift card ${g.code}`)} aria-label="Delete gift card"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-3">
              <div>
                <label className={labelCls} htmlFor="gc-code">Code (blank = auto-generate)</label>
                <input id="gc-code" className={inputCls} value={gf.code} placeholder="GC-XXXXXX" onChange={(e) => setGf((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="gc-amount">Amount ({restaurant.currency})</label>
                <input id="gc-amount" type="number" min="0" className={inputCls} value={gf.amount} onChange={(e) => setGf((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="gc-note">Note (buyer, occasion…)</label>
                <input id="gc-note" className={inputCls} value={gf.note} onChange={(e) => setGf((f) => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={addCard} disabled={busy} className={btnPrimary}><Plus size={17} /> {busy ? "Adding…" : "Create gift card"}</button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
