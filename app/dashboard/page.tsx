"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  UtensilsCrossed, FolderTree, ScanLine, CalendarDays, CheckCircle2, XCircle,
  CreditCard, TrendingUp, ArrowRight, Store,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice, startOfMonthISO, startOfTodayISO } from "@/lib/utils";

interface Stats {
  items: number; categories: number; available: number; unavailable: number;
  scansToday: number; scansMonth: number; scansTotal: number;
  pendingOrders: number;
  popular: { id: string; name: string; price: number; views: number }[];
}

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
        const [itemsRes, catsRes, todayRes, monthRes, totalRes, viewsRes, pendingRes] = await Promise.all([
          supabase.from("menu_items").select("id, is_available").eq("restaurant_id", rid),
          supabase.from("categories").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfTodayISO()),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfMonthISO()),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
          supabase.from("item_views").select("menu_item_id").eq("restaurant_id", rid).limit(2000),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).eq("status", "pending"),
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
            popular,
          });
        }
      } catch (e) {
        if (!cancelled) setStatsError(e instanceof Error ? e.message : "Could not load statistics.");
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant]);

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
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-semibold">{restaurant.name}</p>
              <p className="truncate text-sm text-slate-300">/menu/{restaurant.slug} · {restaurant.is_published && restaurant.status === "published" ? "Menu is live" : "Menu not published"}</p>
            </div>
            <Link href={`/menu/${restaurant.slug}`} target="_blank" className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20">
              View public menu <ArrowRight size={16} />
            </Link>
          </div>

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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard icon={UtensilsCrossed} label="Menu items" value={stats.items} sub={`${stats.available} available`} />
                <StatCard icon={FolderTree} label="Categories" value={stats.categories} sub="on your menu" />
                <StatCard icon={ScanLine} label="Menu visits today" value={stats.scansToday} sub={`${stats.scansMonth} this month`} />
                <StatCard icon={CalendarDays} label="Total menu visits" value={stats.scansTotal} sub="QR scans + link visits" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><TrendingUp size={18} className="text-brand" /> Availability & plan</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <Row icon={<CheckCircle2 size={17} className="text-emerald-500" />} label="Available items" value={stats.available} />
                    <Row icon={<XCircle size={17} className="text-slate-400" />} label="Unavailable items" value={stats.unavailable} />
                    <Row icon={<CreditCard size={17} className="text-brand" />} label="Subscription"
                      value={`${subscription?.plan?.name ?? "Free"} · ${subscription?.status ?? "active"}`} />
                    <Row icon={<UtensilsCrossed size={17} className="text-brand" />} label="Plan item limit"
                      value={subscription?.plan?.max_items == null ? "Unlimited items" : `${stats.items} / ${subscription.plan.max_items} items used`} />
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

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof ScanLine; label: string; value: number; sub: string }) {
  return (
    <Card className="!p-4">
      <Icon size={22} className="text-brand" />
      <p className="mt-2 font-heading text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{sub}</p>
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
