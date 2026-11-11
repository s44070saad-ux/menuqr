"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Lock, Mail, Search, Send, Stamp, Store, Trash2, Users } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { Customer } from "@/lib/types";

const ORDERING_PLANS = ["pro", "business"];
const WINBACK_DAYS = 30;

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Phase 3 — customer database + loyalty settings + win-back composer.
 * Customers are auto-built by place_customer_order (one row per phone);
 * this page is the owner's view: search, CSV export, GDPR delete,
 * loyalty stamps (completed orders per phone) and the 30-day win-back
 * email flow (sent via /api/winback/send → Resend, when configured).
 */
export default function CustomersPage() {
  const { loading, restaurant, subscription } = useOwner();
  const planSlug = subscription?.plan?.slug ?? "free";
  const planAllows = ORDERING_PLANS.includes(planSlug);

  const [fetching, setFetching] = useState(true);
  const [rows, setRows] = useState<Customer[]>([]);
  const [stamps, setStamps] = useState<Map<string, number>>(new Map());
  const [lastSent, setLastSent] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loyaltyOn, setLoyaltyOn] = useState(false);
  const [buyX, setBuyX] = useState("6");
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("We miss you — here's a treat on us");
  const [message, setMessage] = useState("It has been a while since your last order with us. Come back this week and mention this email at the counter — we'd love to serve you again.");
  const [sending, setSending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !restaurant) return;
    setFetching(true);
    const [{ data: cust }, { data: completed }, { data: st }, { data: sends }] = await Promise.all([
      supabase.from("customers").select("*").eq("restaurant_id", restaurant.id).order("last_order_at", { ascending: false }).limit(500),
      supabase.from("orders").select("customer_phone").eq("restaurant_id", restaurant.id).eq("status", "completed").limit(5000),
      supabase.from("restaurant_settings").select("loyalty_enabled, loyalty_buy_x").eq("restaurant_id", restaurant.id).single(),
      supabase.from("winback_sends").select("customer_id, sent_at").eq("restaurant_id", restaurant.id).order("sent_at", { ascending: false }).limit(500),
    ]);
    setRows((cust as Customer[]) ?? []);
    const sm = new Map<string, number>();
    (completed ?? []).forEach((o: { customer_phone: string | null }) => {
      if (o.customer_phone) sm.set(o.customer_phone, (sm.get(o.customer_phone) ?? 0) + 1);
    });
    setStamps(sm);
    const lm = new Map<string, string>();
    (sends ?? []).forEach((w: { customer_id: string; sent_at: string }) => {
      if (!lm.has(w.customer_id)) lm.set(w.customer_id, w.sent_at);
    });
    setLastSent(lm);
    const s = st as { loyalty_enabled?: boolean; loyalty_buy_x?: number } | null;
    setLoyaltyOn(Boolean(s?.loyalty_enabled));
    setBuyX(String(s?.loyalty_buy_x ?? 6));
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { if (planAllows) load(); else setFetching(false); }, [load, planAllows]);

  const cutoff = Date.now() - WINBACK_DAYS * 86400000;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q));
  }, [rows, query]);
  const winbackCandidates = useMemo(
    () => rows.filter((c) => c.email && c.email_consent && new Date(c.last_order_at).getTime() <= cutoff),
    [rows, cutoff],
  );

  async function saveLoyalty() {
    if (!supabase || !restaurant) return;
    const x = parseInt(buyX, 10);
    if (Number.isNaN(x) || x < 2 || x > 50) { setError("Stamps needed must be between 2 and 50."); return; }
    setSavingLoyalty(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ loyalty_enabled: loyaltyOn, loyalty_buy_x: x }).eq("restaurant_id", restaurant.id);
    setSavingLoyalty(false);
    if (err) setError(err.message);
    else setSuccess(loyaltyOn ? `Loyalty is ON — every ${x} completed orders earns a reward (shown on the customer's tracking page).` : "Loyalty switched off.");
  }

  async function removeCustomer(c: Customer) {
    if (!supabase) return;
    if (!window.confirm(`Delete ${c.name || c.phone} from your customer list? This removes their saved contact details (GDPR delete-on-request). Their past orders stay in your order history.`)) return;
    const { error: err } = await supabase.from("customers").delete().eq("id", c.id);
    if (err) setError(err.message); else { setSuccess("Customer deleted."); load(); }
  }

  function exportCsv() {
    const head = "name,phone,email,email_consent,orders,total_spent,first_order,last_order\n";
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = filtered.map((c) => [c.name ?? "", c.phone, c.email ?? "", c.email_consent ? "yes" : "no", c.order_count, c.total_spent, c.first_order_at, c.last_order_at].map(esc).join(",")).join("\n");
    downloadCsv(`${restaurant?.slug ?? "customers"}-customers.csv`, head + body);
  }

  async function sendWinback() {
    if (!supabase || !restaurant || selected.size === 0) return;
    setSending(true); setError(null); setSuccess(null); setNotConfigured(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setError("Your session expired — please log in again."); setSending(false); return; }
      const res = await fetch("/api/winback/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          restaurant_id: restaurant.id, restaurant_name: restaurant.name,
          customer_ids: [...selected], subject, message,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 501 || out.error === "EMAIL_NOT_CONFIGURED") { setNotConfigured(true); setSending(false); return; }
      if (!res.ok) { setError(out.message || "Sending failed."); setSending(false); return; }
      setSuccess(`Win-back sent to ${out.sent} customer${out.sent === 1 ? "" : "s"}${out.skipped ? ` · ${out.skipped} skipped (no consented email or emailed within 30 days)` : ""}.`);
      setSelected(new Set());
      load();
    } catch {
      setError("Sending failed — please try again.");
    }
    setSending(false);
  }

  const buyXNum = Math.max(2, parseInt(buyX, 10) || 6);

  return (
    <DashboardShell title="Customers">
      {loading || fetching ? <Loading label="Loading customers…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Your customer database builds itself from orders once your restaurant exists."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planAllows ? (
        <EmptyState title="Customers is a Pro feature"
          hint="On Pro and Business, every order quietly builds your own customer database — names, phones, consented emails, order history and loyalty stamps — plus win-back emails for customers who haven't ordered in 30 days. The data is yours; export it any time. Paid plans are activated manually by the platform admin."
          action={<Link href="/dashboard/subscription" className={btnPrimary}><Lock size={18} /> See my subscription</Link>} />
      ) : (
        <div className="space-y-4">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <Stamp size={17} className="text-brand" /> Loyalty stamps
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Customers earn a stamp for every completed order (tracked by phone). At the target, their tracking page
              shows a reward message to present at your counter — you honour it there, like a paper stamp card.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={loyaltyOn} onChange={(e) => setLoyaltyOn(e.target.checked)} className="h-5 w-5 accent-teal-700" />
                Loyalty on
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="buyx">Stamps for a reward</label>
                <input id="buyx" type="number" min="2" max="50" value={buyX} onChange={(e) => setBuyX(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              </div>
              <button type="button" onClick={saveLoyalty} disabled={savingLoyalty} className={btnPrimary}>
                {savingLoyalty ? "Saving…" : "Save loyalty"}
              </button>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
                <Users size={17} className="text-brand" /> Your customers ({rows.length})
              </p>
              <span className="ml-auto flex flex-wrap gap-2">
                <span className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email"
                    className="min-h-[42px] rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-[16px]" aria-label="Search customers" />
                </span>
                <button type="button" onClick={exportCsv} className={btnGhost}><Download size={16} /> Export CSV</button>
              </span>
            </div>
            {filtered.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No customers yet — they appear automatically when orders come in with a phone number.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {filtered.map((c) => {
                  const st = stamps.get(c.phone) ?? 0;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{c.name || "Customer"}</span>
                        <span className="block text-xs text-slate-500">{c.phone}{c.email ? ` · ${c.email}${c.email_consent ? "" : " (no email consent)"}` : " · no email"}</span>
                      </span>
                      <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{c.order_count} order{c.order_count === 1 ? "" : "s"} · {formatPrice(Number(c.total_spent), restaurant.currency)}</span>
                        <span>last {new Date(c.last_order_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                        {loyaltyOn && <span className="inline-flex items-center gap-1 font-semibold text-brand-dark"><Stamp size={13} /> {st % buyXNum}/{buyXNum}{st > 0 && st % buyXNum === 0 ? " · reward due!" : ""}</span>}
                        <button type="button" onClick={() => removeCustomer(c)} aria-label="Delete customer"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">Built automatically from orders. Deleting a customer removes their contact details (GDPR) — order history is kept without the saved contact.</p>
          </Card>

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <Mail size={17} className="text-brand" /> Win-back — customers quiet for {WINBACK_DAYS}+ days
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {winbackCandidates.length} customer{winbackCandidates.length === 1 ? "" : "s"} with a consented email haven't ordered in {WINBACK_DAYS}+ days.
              One email per customer per 30 days, always with an unsubscribe link.
            </p>
            {notConfigured && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>Email sending isn't switched on yet.</strong> Win-back needs a free Resend account:
                create one at resend.com, verify your sending domain (or use their test sender), and add the
                API key as <code>RESEND_API_KEY</code> in the platform settings. Until then, everything else
                here works — the list, the composer and the cooldown tracking are ready.
              </div>
            )}
            {winbackCandidates.length > 0 && (
              <>
                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
                  {winbackCandidates.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input type="checkbox" className="h-5 w-5 accent-teal-700"
                          checked={selected.has(c.id)}
                          onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                        <span className="font-medium text-ink">{c.name || "Customer"}</span>
                        <span className="text-xs text-slate-500">{c.email} · last order {new Date(c.last_order_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{lastSent.has(c.id) ? ` · emailed ${new Date(lastSent.get(c.id)!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="wb-subject">Subject</label>
                    <input id="wb-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="wb-message">Message</label>
                    <textarea id="wb-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
                  </div>
                  <button type="button" onClick={sendWinback} disabled={sending || selected.size === 0} className={`${btnPrimary} justify-self-start`}>
                    <Send size={16} /> {sending ? "Sending…" : `Send to ${selected.size} selected`}
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
