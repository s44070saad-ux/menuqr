"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Store, ClipboardList, Phone, Check, CheckCheck, X, Lock, RefreshCw, BellRing, Printer,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import PrintTicket from "@/components/PrintTicket";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice, startOfTodayISO } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

const ORDERING_PLANS = ["pro", "business"];
type Filter = "all" | OrderStatus;

export default function OrdersPage() {
  const { loading, restaurant, subscription } = useOwner();
  const planSlug = subscription?.plan?.slug ?? "free";
  const planAllows = ORDERING_PLANS.includes(planSlug);

  const [fetching, setFetching] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orderingOn, setOrderingOn] = useState<boolean | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  const [charges, setCharges] = useState<{ tax: string; service: string; min: string; prep: string }>({ tax: "0", service: "0", min: "0", prep: "20" });
  const [savingCharges, setSavingCharges] = useState(false);
  const [printReq, setPrintReq] = useState<{ order: Order; kind: "kitchen" | "receipt" } | null>(null);

  useEffect(() => {
    if (!printReq) return;
    const t = setTimeout(() => window.print(), 80);
    const clear = () => setPrintReq(null);
    window.addEventListener("afterprint", clear);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", clear); };
  }, [printReq]);
  const seenIds = useRef<Set<string> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase || !restaurant) return;
    if (!quiet) setFetching(true);
    const { data, error: err } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (err) { setError(err.message); setFetching(false); return; }
    const list = (data as Order[]) ?? [];
    // Sound for genuinely new pending orders (after the first load).
    if (seenIds.current) {
      const fresh = list.filter((o) => o.status === "pending" && !seenIds.current!.has(o.id));
      if (fresh.length > 0) beep();
    }
    seenIds.current = new Set(list.map((o) => o.id));
    setOrders(list);
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { load(); }, [load]);

  // Live updates: realtime when available + 10s polling fallback.
  useEffect(() => {
    if (!supabase || !restaurant) return;
    const sb = supabase;
    const channel = sb
      .channel(`orders-${restaurant.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => load(true))
      .subscribe();
    const t = setInterval(() => load(true), 10000);
    return () => { sb.removeChannel(channel); clearInterval(t); };
  }, [restaurant, load]);

  // Ordering on/off toggle (restaurant_settings.enable_ordering).
  useEffect(() => {
    if (!supabase || !restaurant) return;
    (async () => {
      const { data } = await supabase.from("restaurant_settings")
        .select("enable_ordering, tax_percent, service_percent, min_order_amount, prep_time_minutes").eq("restaurant_id", restaurant.id).single();
      const d = data as { enable_ordering?: boolean; tax_percent?: number; service_percent?: number; min_order_amount?: number; prep_time_minutes?: number } | null;
      setOrderingOn(Boolean(d?.enable_ordering ?? true));
      setCharges({
        tax: String(Number(d?.tax_percent ?? 0)),
        service: String(Number(d?.service_percent ?? 0)),
        min: String(Number(d?.min_order_amount ?? 0)),
        prep: String(Number(d?.prep_time_minutes ?? 20)),
      });
    })();
  }, [restaurant]);

  async function toggleOrdering(next: boolean) {
    if (!supabase || !restaurant || savingToggle) return;
    setSavingToggle(true);
    setError(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ enable_ordering: next }).eq("restaurant_id", restaurant.id);
    if (err) setError(err.message);
    else { setOrderingOn(next); setSuccess(next ? "Ordering is ON — customers can order from your menu." : "Ordering is OFF — customers can browse your menu but cannot order."); }
    setSavingToggle(false);
  }

  async function saveCharges() {
    if (!supabase || !restaurant || savingCharges) return;
    const tax = parseFloat(charges.tax), service = parseFloat(charges.service), min = parseFloat(charges.min);
    const prep = parseInt(charges.prep, 10);
    if ([tax, service].some((v) => Number.isNaN(v) || v < 0 || v > 100)) { setError("Tax and service charge must be percentages between 0 and 100."); return; }
    if (Number.isNaN(min) || min < 0) { setError("Minimum order must be 0 or more."); return; }
    if (Number.isNaN(prep) || prep < 1 || prep > 240) { setError("Preparation time must be between 1 and 240 minutes."); return; }
    setSavingCharges(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ tax_percent: tax, service_percent: service, min_order_amount: min, prep_time_minutes: prep })
      .eq("restaurant_id", restaurant.id);
    if (err) setError(err.message);
    else setSuccess("Settings saved — charges apply to new orders, and the prep time drives customer ETAs.");
    setSavingCharges(false);
  }

  function beep() {
    try {
      audioRef.current = audioRef.current ?? new AudioContext();
      const ctx = audioRef.current;
      [0, 0.25].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.12, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch { /* sound is a nicety, never an error */ }
  }

  async function setStatus(order: Order, status: OrderStatus) {
    if (!supabase || busyId) return;
    setBusyId(order.id);
    setError(null); setSuccess(null);
    const { error: err } = await supabase.from("orders")
      .update({ status }).eq("id", order.id).eq("restaurant_id", order.restaurant_id);
    if (err) setError(err.message);
    else {
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status } : o)));
      if (status === "confirmed") setSuccess("Order confirmed — the customer's phone updates automatically while their order page is open.");
    }
    setBusyId(null);
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: orders.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    orders.forEach((o) => { c[o.status] += 1; });
    return c;
  }, [orders]);

  const todayStats = useMemo(() => {
    const start = new Date(startOfTodayISO()).getTime();
    const todays = orders.filter((o) => new Date(o.created_at).getTime() >= start && o.status !== "cancelled");
    return { count: todays.length, revenue: todays.reduce((n, o) => n + Number(o.total_amount), 0) };
  }, [orders]);

  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <DashboardShell title="Orders">
      {loading ? <Loading label="Loading orders…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Orders appear here once your restaurant exists and customers order from the menu."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planAllows ? (
        <Card className="py-10 text-center">
          <Lock size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-heading text-lg font-semibold text-ink">Ordering is a Pro feature</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
            Your current plan is <strong className="text-ink">{subscription?.plan?.name ?? "Free"}</strong>.
            On Pro (PKR 4,999/month) and Business, customers can order directly from your menu —
            dine-in by table QR or takeaway with their phone number — and you confirm orders here.
          </p>
          <Link href="/dashboard/subscription" className={`${btnPrimary} mt-5`}>See plans</Link>
        </Card>
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          {/* Controls row */}
          <Card className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light/60 text-brand-dark"><BellRing size={19} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-semibold text-ink">Ordering is {orderingOn ? "ON" : "OFF"}</p>
              <p className="text-xs text-slate-500">
                {orderingOn ? "Customers can add dishes and place orders from your public menu." : "Customers can browse, but the order buttons are hidden."}
              </p>
            </div>
            <button type="button" role="switch" aria-checked={orderingOn ?? false} disabled={orderingOn === null || savingToggle}
              onClick={() => toggleOrdering(!orderingOn)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${orderingOn ? "bg-brand" : "bg-slate-300"} disabled:opacity-50`}>
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${orderingOn ? "left-7" : "left-1"}`} />
            </button>
            <button type="button" onClick={() => load()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600">
              <RefreshCw size={15} /> Refresh
            </button>
          </Card>

          {/* Charges (Phase 1.4) */}
          <Card>
            <p className="font-heading text-sm font-semibold text-ink">Tax, service charge, minimum order & prep time</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              Tax and service are added on top of the items subtotal and shown to the customer in the cart before they order (leave at 0 to switch off; totals are always calculated by the system). Prep time drives the "ready by" estimate on the customer's order-tracking page.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="ch-tax">Tax %</label>
                <input id="ch-tax" type="number" min="0" max="100" step="0.1" value={charges.tax}
                  onChange={(e) => setCharges((c) => ({ ...c, tax: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="ch-svc">Service %</label>
                <input id="ch-svc" type="number" min="0" max="100" step="0.1" value={charges.service}
                  onChange={(e) => setCharges((c) => ({ ...c, service: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="ch-prep">Prep time (minutes)</label>
                <input id="ch-prep" type="number" min="1" max="240" step="1" value={charges.prep}
                  onChange={(e) => setCharges((c) => ({ ...c, prep: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="ch-min">Minimum order ({restaurant.currency})</label>
                <input id="ch-min" type="number" min="0" step="1" value={charges.min}
                  onChange={(e) => setCharges((c) => ({ ...c, min: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              </div>
            </div>
            <button type="button" onClick={saveCharges} disabled={savingCharges}
              className="mt-3 inline-flex min-h-[42px] items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {savingCharges ? "Saving…" : "Save charges"}
            </button>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="!p-4 text-center">
              <p className="font-heading text-xl font-bold text-ink sm:text-2xl">{counts.pending}</p>
              <p className="text-xs text-slate-500">Waiting to confirm</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="font-heading text-xl font-bold text-ink sm:text-2xl">{todayStats.count}</p>
              <p className="text-xs text-slate-500">Orders today</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="font-heading text-xl font-bold text-ink sm:text-2xl">{formatPrice(todayStats.revenue, restaurant.currency)}</p>
              <p className="text-xs text-slate-500">Order value today</p>
            </Card>
          </div>

          {/* Filter tabs */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {(["all", "pending", "confirmed", "completed", "cancelled"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`min-h-[40px] shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize ${filter === f ? "bg-ink text-white" : "bg-white text-slate-600 shadow-card"}`}>
                {f} · {counts[f]}
              </button>
            ))}
          </div>

          {/* Orders list */}
          {fetching ? <Loading label="Loading orders…" /> : visible.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No orders yet" : `No ${filter} orders`}
              hint={filter === "all"
                ? "When a customer orders from your public menu (table QR for dine-in, or takeaway with a phone number), it appears here instantly. Confirm it and the customer's phone updates automatically."
                : "Orders with this status will appear here."}
            />
          ) : (
            <div className="space-y-3">
              {visible.map((o) => (
                <OrderCard key={o.id} order={o} currency={restaurant.currency} busy={busyId === o.id}
                  onStatus={(s) => setStatus(o, s)}
                  onPrint={(kind) => setPrintReq({ order: o, kind })} />
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-slate-400">
            New orders play a sound and appear automatically on this page. When you confirm, the customer
            sees “Confirmed — being prepared” on their phone while their order page is open. Payment is at
            the counter — Velora does not take online payment for orders yet.
          </p>
        </div>
      )}
      {printReq && restaurant && (
        <PrintTicket restaurantName={restaurant.name} currency={restaurant.currency}
          order={printReq.order} kind={printReq.kind} />
      )}
    </DashboardShell>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " +
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
};

function OrderCard({ order: o, currency, busy, onStatus, onPrint }: {
  order: Order; currency: string; busy: boolean; onStatus: (s: OrderStatus) => void;
  onPrint: (kind: "kitchen" | "receipt") => void;
}) {
  return (
    <Card className={o.status === "pending" ? "ring-2 ring-amber-300" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${o.order_type === "dine_in" ? "bg-brand-light/70 text-brand-dark" : "bg-violet-100 text-violet-800"}`}>
          {o.order_type === "dine_in" ? `🍽 Dine-in · Table ${o.table_number ?? "—"}` : "🛍 Takeaway"}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[o.status]}`}>{o.status}</span>
        <span className="ml-auto text-xs text-slate-400">{timeAgo(o.created_at)}</span>
      </div>

      {(o.customer_name || o.customer_phone) && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          {o.customer_name && <span className="font-medium text-ink">{o.customer_name}</span>}
          {o.customer_phone && (
            <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1 font-medium text-brand underline">
              <Phone size={14} /> {o.customer_phone}
            </a>
          )}
        </p>
      )}

      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
        {(o.items ?? []).map((it) => (
          <li key={it.id}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-700">{it.item_name} <span className="text-slate-400">× {it.quantity}</span></span>
              <span className="font-medium text-ink">{formatPrice(Number(it.subtotal), currency)}</span>
            </div>
            {it.options_snapshot && it.options_snapshot.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {it.options_snapshot.map((op) => `${op.group_name}: ${op.option_name}`).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {o.note && <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {o.note}</p>}
      {(Number(o.discount_amount ?? 0) > 0 || Number(o.gift_card_amount ?? 0) > 0) && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-emerald-700">
          {Number(o.discount_amount ?? 0) > 0 && <span>Coupon {o.coupon_code ?? ""}: −{formatPrice(Number(o.discount_amount), currency)}</span>}
          {Number(o.gift_card_amount ?? 0) > 0 && <span>Gift card paid: {formatPrice(Number(o.gift_card_amount), currency)} (already covered — collect the rest)</span>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="font-heading text-base font-bold text-ink">{formatPrice(Number(o.total_amount), currency)}</span>
        <span className="text-xs text-slate-400">pay at counter</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => onPrint("kitchen")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600">
            <Printer size={15} /> Ticket
          </button>
          <button type="button" onClick={() => onPrint("receipt")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600">
            <Printer size={15} /> Receipt
          </button>
          {o.status === "pending" && (
            <>
              <button type="button" disabled={busy} onClick={() => onStatus("confirmed")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Check size={16} /> Confirm order
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus("cancelled")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 disabled:opacity-50">
                <X size={16} /> Reject
              </button>
            </>
          )}
          {o.status === "confirmed" && (
            <>
              <button type="button" disabled={busy} onClick={() => onStatus("completed")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <CheckCheck size={16} /> Mark completed
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus("cancelled")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 disabled:opacity-50">
                <X size={16} /> Cancel
              </button>
            </>
          )}
          {(o.status === "completed" || o.status === "cancelled") && (
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><ClipboardList size={15} /> No actions — order is {o.status}.</span>
          )}
        </span>
      </div>
    </Card>
  );
}
