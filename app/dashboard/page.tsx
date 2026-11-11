"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  UtensilsCrossed, FolderTree, ScanLine, CalendarDays, CheckCircle2, XCircle,
  CreditCard, TrendingUp, ArrowRight, Store, ClipboardList, Banknote, Circle,
  QrCode, Link2, Sparkles,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice, startOfMonthISO, startOfTodayISO } from "@/lib/utils";

interface RecentOrder {
  id: string; order_type: string; table_number: string | null;
  customer_name: string | null; total_amount: number; status: string; created_at: string;
}

interface Stats {
  items: number; categories: number; available: number; unavailable: number;
  scansToday: number; scansMonth: number; scansTotal: number;
  pendingOrders: number;
  ordersToday: number; revenueToday: number;
  visits14: { label: string; count: number }[];
  qrVisits: number; linkVisits: number;
  madeTotal: number; madeMonth: number; madeOrders: number; upsellTotal: number;
  recentOrders: RecentOrder[];
  popular: { id: string; name: string; price: number; views: number }[];
}

const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Preparing", cls: "bg-sky-100 text-sky-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
};

export default function DashboardOverviewPage() {
  const { loading, restaurant, subscription, error } = useOwner();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !restaurant) return;
    let cancelled = false;
    (async () => {
      try {
        const rid = restaurant.id;
        const since14 = new Date(Date.now() - 13 * 24 * 3600 * 1000);
        since14.setHours(0, 0, 0, 0);
        const [itemsRes, catsRes, todayRes, monthRes, totalRes, viewsRes, pendingRes, scans14Res, ordersTodayRes, recentRes, allOrdersRes, upsellRes] = await Promise.all([
          supabase.from("menu_items").select("id, is_available").eq("restaurant_id", rid),
          supabase.from("categories").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfTodayISO()),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfMonthISO()),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
          supabase.from("item_views").select("menu_item_id").eq("restaurant_id", rid).limit(2000),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).eq("status", "pending"),
          supabase.from("menu_scans").select("created_at, source").eq("restaurant_id", rid).gte("created_at", since14.toISOString()).order("created_at", { ascending: true }).limit(5000),
          supabase.from("orders").select("total_amount, status").eq("restaurant_id", rid).gte("created_at", startOfTodayISO()),
          supabase.from("orders").select("id, order_type, table_number, customer_name, total_amount, status, created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(5),
          supabase.from("orders").select("total_amount, status, created_at").eq("restaurant_id", rid).limit(5000),
          supabase.from("order_items").select("subtotal, orders!inner(status)").eq("restaurant_id", rid).eq("via_upsell", true).limit(5000),
        ]);
        if (cancelled) return;
        const items = itemsRes.data ?? [];
        const viewCounts = new Map<string, number>();
        (viewsRes.data ?? []).forEach((v: { menu_item_id: string }) => {
          viewCounts.set(v.menu_item_id, (viewCounts.get(v.menu_item_id) ?? 0) + 1);
        });
        let popular: Stats["popular"] = [];
        if (viewCounts.size > 0) {
          const topIds = [...viewCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
          const { data: topItems } = await supabase.from("menu_items").select("id, name, price").in("id", topIds);
          popular = (topItems ?? []).map((it) => ({
            id: it.id as string, name: it.name as string, price: Number(it.price),
            views: viewCounts.get(it.id as string) ?? 0,
          })).sort((a, b) => b.views - a.views);
        }
        // 14-day visit buckets + QR/link split (real menu_scans rows only)
        const buckets = new Map<string, number>();
        for (let i = 0; i < 14; i++) {
          const d = new Date(since14.getTime() + i * 24 * 3600 * 1000);
          buckets.set(d.toDateString(), 0);
        }
        let qrVisits = 0; let linkVisits = 0;
        (scans14Res.data ?? []).forEach((s: { created_at: string; source: string | null }) => {
          const key = new Date(s.created_at).toDateString();
          if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
          if (s.source === "qr") qrVisits++; else linkVisits++;
        });
        const visits14 = [...buckets.entries()].map(([day, count]) => ({
          label: new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          count,
        }));
        const todaysOrders = (ordersTodayRes.data ?? []) as { total_amount: number; status: string }[];
        const liveOrders = todaysOrders.filter((o) => !["cancelled", "rejected"].includes(o.status));
        if (!cancelled) {
          setStats({
            items: items.length,
            categories: catsRes.count ?? 0,
            available: items.filter((i) => i.is_available).length,
            unavailable: items.filter((i) => !i.is_available).length,
            scansToday: todayRes.count ?? 0,
            scansMonth: monthRes.count ?? 0,
            scansTotal: totalRes.count ?? 0,
            pendingOrders: pendingRes.count ?? 0,
            ordersToday: liveOrders.length,
            revenueToday: liveOrders.reduce((n, o) => n + Number(o.total_amount ?? 0), 0),
            visits14, qrVisits, linkVisits,
            ...(() => {
              // Phase 2.2: "Velora made you $X" — real orders rows only,
              // cancelled/rejected excluded, same honesty rule as Admin.
              const all = ((allOrdersRes.data ?? []) as { total_amount: number; status: string; created_at: string }[])
                .filter((o) => !["cancelled", "rejected"].includes(o.status));
              const monthStart = startOfMonthISO();
              return {
                madeTotal: all.reduce((n, o) => n + Number(o.total_amount ?? 0), 0),
                madeOrders: all.length,
                madeMonth: all.filter((o) => o.created_at >= monthStart).reduce((n, o) => n + Number(o.total_amount ?? 0), 0),
                upsellTotal: ((upsellRes.data ?? []) as unknown as { subtotal: number; orders: { status: string } }[])
                  .filter((r) => !["cancelled", "rejected"].includes(r.orders?.status ?? ""))
                  .reduce((n, r) => n + Number(r.subtotal ?? 0), 0),
              };
            })(),
            recentOrders: (recentRes.data as RecentOrder[]) ?? [],
            popular,
          });
        }
      } catch (e) {
        if (!cancelled) setStatsError(e instanceof Error ? e.message : "Could not load statistics.");
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant]);

  const trialDaysLeft = subscription?.status === "trialing" && subscription?.ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.ends_at).getTime() - Date.now()) / 86400000))
    : null;

  const checklist = restaurant ? [
    { done: Boolean(restaurant.name && restaurant.phone && restaurant.address), label: "Add your phone & address", href: "/dashboard/restaurant" },
    { done: Boolean(restaurant.logo_url), label: "Upload your logo", href: "/dashboard/restaurant" },
    { done: (stats?.categories ?? 0) >= 1, label: "Create your first category", href: "/dashboard/categories" },
    { done: (stats?.items ?? 0) >= 3, label: "Add at least 3 dishes", href: "/dashboard/items" },
    { done: restaurant.is_published && restaurant.status === "published", label: "Publish your menu", href: "/dashboard/restaurant" },
  ] : [];
  const checklistDone = checklist.filter((c) => c.done).length;
  const showChecklist = Boolean(restaurant && stats && checklistDone < checklist.length);

  return (
    <DashboardShell title="Overview">
      <ErrorBox message={error || statsError} />
      {loading ? (
        <Loading label="Loading your restaurant…" />
      ) : !restaurant ? (
        <EmptyState
          title="Set up your restaurant first"
          hint="Add your restaurant name, logo and details — your public menu page and permanent QR code are created automatically."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink px-5 py-4 text-white shadow-card">
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
              : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand font-heading text-lg font-bold">{restaurant.name.charAt(0).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">
                <span className="truncate">{restaurant.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${restaurant.is_published && restaurant.status === "published" ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-slate-300"}`}>
                  {restaurant.is_published && restaurant.status === "published" ? "● LIVE" : "Not published"}
                </span>
              </p>
              <p className="truncate text-sm text-slate-300">/menu/{restaurant.slug}</p>
            </div>
            <Link href={`/menu/${restaurant.slug}`} target="_blank" className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20">
              View public menu <ArrowRight size={16} />
            </Link>
          </div>

          {trialDaysLeft != null && (
            <Link href="/dashboard/subscription" className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-4 text-amber-950 shadow-card">
              <Sparkles size={22} className="shrink-0" />
              <span className="min-w-0 flex-1 text-sm">
                <strong className="font-heading text-base">Your {subscription?.plan?.name ?? "Pro"} free trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left.</strong>{" "}
                Every premium feature is unlocked right now — upgrade before it ends to keep them.
              </span>
              <span className="inline-flex min-h-[38px] items-center rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white">See plans <ArrowRight size={15} className="ml-1" /></span>
            </Link>
          )}

          {!stats ? <Loading label="Loading statistics…" /> : (
            <>
              {stats.pendingOrders > 0 && (
                <Link href="/dashboard/orders" className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-amber-900 shadow-card">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 font-heading text-base font-bold text-white">{stats.pendingOrders}</span>
                  <span className="flex-1 text-sm font-medium">
                    new order{stats.pendingOrders === 1 ? "" : "s"} waiting for confirmation — tap to open Orders.
                  </span>
                  <ArrowRight size={18} className="shrink-0" />
                </Link>
              )}

              {(subscription?.plan?.slug === "pro" || subscription?.plan?.slug === "business") && (
                <div className="rounded-2xl bg-gradient-to-r from-teal-700 to-emerald-600 px-5 py-4 text-white shadow-card">
                  <p className="flex items-center gap-2 text-sm font-medium text-teal-100">
                    <TrendingUp size={17} /> Velora made you
                  </p>
                  <p className="mt-1 font-heading text-3xl font-bold">{formatPrice(stats.madeTotal, restaurant.currency)}</p>
                  <p className="mt-1 text-sm text-teal-50">
                    from {stats.madeOrders} order{stats.madeOrders === 1 ? "" : "s"} placed through your Velora menu · {formatPrice(stats.madeMonth, restaurant.currency)} this month
                    {stats.upsellTotal > 0 && <> · <strong>{formatPrice(stats.upsellTotal, restaurant.currency)}</strong> of it came from "Pairs well with" suggestions</>}
                  </p>
                  <p className="mt-1 text-xs text-teal-200/80">Counted from your real orders only — cancelled orders excluded. Marketplace apps would have taken ~20–30% of this in commission.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard icon={ScanLine} tone="bg-sky-100 text-sky-600" label="Menu visits today" value={stats.scansToday} sub={`${stats.scansMonth} this month · ${stats.scansTotal} all time`} />
                <StatCard icon={ClipboardList} tone="bg-violet-100 text-violet-600" label="Orders today" value={stats.ordersToday} sub={stats.pendingOrders ? `${stats.pendingOrders} waiting for confirmation` : "no orders waiting"} />
                <StatCard icon={Banknote} tone="bg-emerald-100 text-emerald-600" label="Order value today" value={formatPrice(stats.revenueToday, restaurant.currency)} sub="from real orders, excl. cancelled" />
                <StatCard icon={UtensilsCrossed} tone="bg-brand-light/60 text-brand-dark" label="Menu items" value={stats.items} sub={`${stats.available} available · ${stats.categories} categories`} />
              </div>

              {showChecklist && (
                <Card>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-heading text-base font-semibold text-ink">Getting started</h2>
                    <span className="text-xs font-medium text-slate-500">{checklistDone} of {checklist.length} done</span>
                    <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(checklistDone / checklist.length) * 100}%` }} />
                    </div>
                  </div>
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {checklist.map((c) => (
                      <li key={c.label}>
                        <Link href={c.href} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${c.done ? "text-slate-400" : "bg-appbg font-medium text-ink hover:bg-brand-light/40"}`}>
                          {c.done ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : <Circle size={18} className="shrink-0 text-slate-300" />}
                          <span className={c.done ? "line-through" : ""}>{c.label}</span>
                          {!c.done && <ArrowRight size={15} className="ml-auto shrink-0 text-brand" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><TrendingUp size={18} className="text-brand" /> Menu visits — last 14 days</h2>
                  {stats.visits14.every((d) => d.count === 0) ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">No visits yet in the last 14 days. Print your QR code and put it on tables — every scan and visit will chart here, counted once per visitor per 30 minutes.</p>
                  ) : (
                    <>
                      <div className="mt-5 flex h-32 items-end gap-1.5">
                        {stats.visits14.map((d, i) => {
                          const max = Math.max(...stats.visits14.map((x) => x.count), 1);
                          return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.count} visits`}>
                              <div className="w-full rounded-t-md bg-gradient-to-t from-brand-dark to-brand" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
                              <span className="text-[9px] font-medium text-slate-400">{i === 0 || i === 13 ? d.label.split(" ")[0] : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><QrCode size={13} className="text-brand" /> QR scans: <strong className="text-ink">{stats.qrVisits}</strong></span>
                        <span className="flex items-center gap-1.5"><Link2 size={13} className="text-brand" /> Link visits: <strong className="text-ink">{stats.linkVisits}</strong></span>
                        <span>Total: <strong className="text-ink">{stats.qrVisits + stats.linkVisits}</strong> (14 days)</span>
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center gap-2">
                    <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><ClipboardList size={18} className="text-brand" /> Recent orders</h2>
                    <Link href="/dashboard/orders" className="ml-auto text-sm font-medium text-brand underline">Open Orders</Link>
                  </div>
                  {stats.recentOrders.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">No orders yet. On Pro and Business, customers order straight from the menu — new orders appear here and on the Orders page in real time.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {stats.recentOrders.map((o) => {
                        const meta = ORDER_STATUS_META[o.status] ?? { label: o.status, cls: "bg-slate-100 text-slate-600" };
                        return (
                          <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">
                                {o.order_type === "dine_in" ? `Dine-in · Table ${o.table_number ?? "—"}` : `Takeaway · ${o.customer_name ?? "Customer"}`}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {new Date(o.created_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </span>
                            <span className="font-semibold text-ink">{formatPrice(Number(o.total_amount), restaurant.currency)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><TrendingUp size={18} className="text-brand" /> Availability & plan</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <Row icon={<CheckCircle2 size={17} className="text-emerald-500" />} label="Available items" value={stats.available} />
                    <Row icon={<XCircle size={17} className="text-slate-400" />} label="Unavailable items" value={stats.unavailable} />
                    <Row icon={<CreditCard size={17} className="text-brand" />} label="Subscription"
                      value={`${subscription?.plan?.name ?? "Free"} · ${subscription?.status === "trialing" ? "free trial" : subscription?.status ?? "active"}`} />
                    <Row icon={<UtensilsCrossed size={17} className="text-brand" />} label="Plan item limit"
                      value={subscription?.plan?.max_items == null ? "Unlimited items" : `${stats.items} / ${subscription.plan.max_items} items used`} />
                    <Row icon={<CalendarDays size={17} className="text-brand" />} label="Total menu visits" value={stats.scansTotal} />
                    <Row icon={<FolderTree size={17} className="text-brand" />} label="Categories" value={stats.categories} />
                  </div>
                  <Link href="/dashboard/subscription" className="mt-4 inline-block text-sm font-medium text-brand underline">Manage subscription</Link>
                </Card>

                <Card>
                  <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><TrendingUp size={18} className="text-brand" /> Most viewed items</h2>
                  {stats.popular.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No item views yet. Share your QR code — when customers tap dishes on your public menu, the most popular ones will appear here.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {stats.popular.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light/60 font-heading text-xs font-semibold text-brand-dark">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>
                          <span className="text-slate-500">{formatPrice(p.price, restaurant.currency)}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{p.views} views</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-slate-400">Views = taps on the public menu. They show interest, not confirmed purchases.</p>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

function StatCard({ icon: Icon, tone, label, value, sub }: { icon: typeof ScanLine; tone: string; label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card className="!p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
      <p className="mt-2.5 truncate font-heading text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-xs leading-snug text-slate-500">{sub}</p>
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className="flex-1 text-slate-600">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
