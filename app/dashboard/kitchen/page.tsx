"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, Check, CheckCheck, Clock3, Lock, Store, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { EmptyState, ErrorBox, Loading, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice, startOfTodayISO } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

const ORDERING_PLANS = ["pro", "business"];

/**
 * Kitchen Display System (KDS) — a big, glanceable live board for the
 * kitchen: New (pending) → Preparing (confirmed) → Done (completed).
 * Polls every 5 seconds + realtime, and beeps when a new order lands.
 * Same data and statuses as the Orders page; nothing kitchen-only.
 */
export default function KitchenPage() {
  const { loading, restaurant, subscription } = useOwner();
  const planSlug = subscription?.plan?.slug ?? "free";
  const planAllows = ORDERING_PLANS.includes(planSlug);

  const [fetching, setFetching] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase || !restaurant) return;
    if (!quiet) setFetching(true);
    const { data, error: err } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("restaurant_id", restaurant.id)
      .gte("created_at", startOfTodayISO())
      .order("created_at", { ascending: true })
      .limit(200);
    if (err) { setError(err.message); setFetching(false); return; }
    const list = (data as Order[]) ?? [];
    if (seenIds.current) {
      const fresh = list.filter((o) => o.status === "pending" && !seenIds.current!.has(o.id));
      if (fresh.length > 0) beep();
    }
    seenIds.current = new Set(list.map((o) => o.id));
    setOrders(list);
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { if (planAllows) load(); else setFetching(false); }, [load, planAllows]);

  useEffect(() => {
    if (!supabase || !restaurant || !planAllows) return;
    const sb = supabase;
    const channel = sb
      .channel(`kitchen-${restaurant.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => load(true))
      .subscribe();
    const t = setInterval(() => load(true), 5000);
    return () => { sb.removeChannel(channel); clearInterval(t); };
  }, [restaurant, load, planAllows]);

  function beep() {
    try {
      audioRef.current = audioRef.current ?? new AudioContext();
      const ctx = audioRef.current;
      [0, 0.25, 0.5].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 1046;
        gain.gain.setValueAtTime(0.12, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch { /* sound is a nicety */ }
  }

  async function setStatus(order: Order, status: OrderStatus) {
    if (!supabase || busyId) return;
    setBusyId(order.id);
    setError(null);
    const { error: err } = await supabase.from("orders")
      .update({ status }).eq("id", order.id).eq("restaurant_id", order.restaurant_id);
    if (err) setError(err.message);
    else setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status } : o)));
    setBusyId(null);
  }

  const pending = orders.filter((o) => o.status === "pending");
  const preparing = orders.filter((o) => o.status === "confirmed");
  const done = orders.filter((o) => o.status === "completed").slice(-8).reverse();

  return (
    <DashboardShell title="Kitchen Display">
      {loading || fetching ? <Loading label="Loading the kitchen board…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="The kitchen display shows live orders for your restaurant."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planAllows ? (
        <EmptyState title="Kitchen Display is a Pro feature"
          hint="On the Pro and Business plans, orders land on this big live kitchen board — new, preparing and done — with a sound alert for every new order. Paid plans are activated manually by the platform admin."
          action={<Link href="/dashboard/subscription" className={btnPrimary}><Lock size={18} /> See my subscription</Link>} />
      ) : (
        <div className="space-y-4">
          <ErrorBox message={error} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              Kitchen live
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-800">{pending.length} new</span>
            <span className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-600 shadow-card">{preparing.length} preparing</span>
            <span className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-600 shadow-card">{done.length} done today</span>
            <span className="ml-auto hidden text-xs text-slate-400 sm:block">Keep this screen open in the kitchen — it refreshes itself.</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BoardColumn title="New orders" icon={<Clock3 size={19} className="text-amber-500" />} emptyText="No new orders. New orders appear here with a sound.">
              {pending.map((o) => (
                <KitchenCard key={o.id} order={o} currency={restaurant.currency} busy={busyId === o.id} highlight
                  onStatus={(s) => setStatus(o, s)} />
              ))}
            </BoardColumn>

            <BoardColumn title="Preparing" icon={<ChefHat size={19} className="text-brand" />} emptyText="Nothing being prepared right now.">
              {preparing.map((o) => (
                <KitchenCard key={o.id} order={o} currency={restaurant.currency} busy={busyId === o.id}
                  onStatus={(s) => setStatus(o, s)} />
              ))}
            </BoardColumn>

            <BoardColumn title="Done today" icon={<CheckCheck size={19} className="text-slate-400" />} emptyText="Completed orders will stack here.">
              {done.map((o) => (
                <KitchenCard key={o.id} order={o} currency={restaurant.currency} busy={busyId === o.id} muted
                  onStatus={(s) => setStatus(o, s)} />
              ))}
            </BoardColumn>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function BoardColumn({ title, icon, emptyText, children }: {
  title: string; icon: React.ReactNode; emptyText: string; children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-3xl bg-white/60 p-3 shadow-card sm:p-4">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-bold text-ink">{icon} {title}</h2>
      <div className="space-y-3">
        {has ? children : <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{emptyText}</p>}
      </div>
    </section>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function KitchenCard({ order: o, currency, busy, highlight = false, muted = false, onStatus }: {
  order: Order; currency: string; busy: boolean; highlight?: boolean; muted?: boolean;
  onStatus: (s: OrderStatus) => void;
}) {
  const late = o.status !== "completed" && o.status !== "cancelled"
    && Date.now() - new Date(o.created_at).getTime() > 15 * 60000;
  return (
    <article className={`rounded-2xl bg-white p-4 shadow-card ${highlight ? "ring-2 ring-amber-300" : ""} ${muted ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${o.order_type === "dine_in" ? "bg-brand-light/70 text-brand-dark" : "bg-violet-100 text-violet-800"}`}>
          {o.order_type === "dine_in" ? `Table ${o.table_number ?? "—"}` : "Takeaway"}
        </span>
        {o.order_type === "takeaway" && o.customer_name && (
          <span className="text-sm font-semibold text-ink">{o.customer_name}</span>
        )}
        <span className={`ml-auto text-xs font-medium ${late ? "font-bold text-red-600" : "text-slate-400"}`}>
          {timeAgo(o.created_at)}{late ? " · late" : ""}
        </span>
      </div>

      <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {(o.items ?? []).map((it) => (
          <li key={it.id}>
            <p className="text-[17px] font-semibold leading-snug text-ink">
              {it.item_name} <span className="text-brand">× {it.quantity}</span>
            </p>
            {it.options_snapshot && it.options_snapshot.length > 0 && (
              <p className="mt-0.5 text-sm font-medium text-slate-500">
                {it.options_snapshot.map((op) => `${op.group_name}: ${op.option_name}`).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {o.note && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[15px] font-medium text-amber-900">📝 {o.note}</p>}

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <span className="font-heading text-base font-bold text-ink">{formatPrice(Number(o.total_amount), currency)}</span>
        <span className="ml-auto flex gap-2">
          {o.status === "pending" && (
            <>
              <button type="button" disabled={busy} onClick={() => onStatus("cancelled")}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50">
                <X size={16} /> Reject
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus("confirmed")}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <Check size={17} /> Start preparing
              </button>
            </>
          )}
          {o.status === "confirmed" && (
            <button type="button" disabled={busy} onClick={() => onStatus("completed")}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <CheckCheck size={17} /> Mark done
            </button>
          )}
        </span>
      </div>
    </article>
  );
}
