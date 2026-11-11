"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScanLine, Eye, FolderTree, UtensilsCrossed, Store } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { daysAgoISO, startOfMonthISO, startOfTodayISO } from "@/lib/utils";

interface DayBar { label: string; count: number }
interface Ranked { name: string; count: number }

export default function AnalyticsPage() {
  const { loading, restaurant } = useOwner();
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(0);
  const [month, setMonth] = useState(0);
  const [qrTotal, setQrTotal] = useState(0);
  const [days, setDays] = useState<DayBar[]>([]);
  const [topItems, setTopItems] = useState<Ranked[]>([]);
  const [topCats, setTopCats] = useState<Ranked[]>([]);

  useEffect(() => {
    if (!supabase || !restaurant) { if (!loading) setFetching(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const rid = restaurant.id;
        const [totalRes, todayRes, monthRes, scansRes, viewsRes, itemsRes, catsRes, qrRes] = await Promise.all([
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfTodayISO()),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("created_at", startOfMonthISO()),
          supabase.from("menu_scans").select("created_at").eq("restaurant_id", rid).gte("created_at", daysAgoISO(13)).order("created_at", { ascending: true }).limit(10000),
          supabase.from("item_views").select("menu_item_id, category_id").eq("restaurant_id", rid).limit(10000),
          supabase.from("menu_items").select("id, name").eq("restaurant_id", rid),
          supabase.from("categories").select("id, name").eq("restaurant_id", rid),
          supabase.from("menu_scans").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).eq("source", "qr"),
        ]);
        if (cancelled) return;
        setTotal(totalRes.count ?? 0);
        setToday(todayRes.count ?? 0);
        setMonth(monthRes.count ?? 0);
        setQrTotal(qrRes.count ?? 0);

        // Daily bars for the last 14 days (client-side bucketing).
        const buckets = new Map<string, number>();
        for (let i = 13; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          buckets.set(d.toDateString(), 0);
        }
        (scansRes.data ?? []).forEach((s: { created_at: string }) => {
          const key = new Date(s.created_at).toDateString();
          if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
        });
        setDays([...buckets.entries()].map(([key, count]) => ({
          label: new Date(key).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), count,
        })));

        const itemNames = new Map((itemsRes.data ?? []).map((i: { id: string; name: string }) => [i.id, i.name]));
        const catNames = new Map((catsRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
        const itemCounts = new Map<string, number>();
        const catCounts = new Map<string, number>();
        (viewsRes.data ?? []).forEach((v: { menu_item_id: string; category_id: string | null }) => {
          itemCounts.set(v.menu_item_id, (itemCounts.get(v.menu_item_id) ?? 0) + 1);
          if (v.category_id) catCounts.set(v.category_id, (catCounts.get(v.category_id) ?? 0) + 1);
        });
        const rank = (m: Map<string, number>, names: Map<string, string>): Ranked[] =>
          [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([id, count]) => ({ name: names.get(id) ?? "Deleted item", count }));
        setTopItems(rank(itemCounts, itemNames));
        setTopCats(rank(catCounts, catNames));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load analytics.");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant, loading]);

  const maxDay = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);

  return (
    <DashboardShell title="Analytics">
      {loading || fetching ? <Loading label="Loading analytics…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Analytics appear once your restaurant and its public menu exist."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="!p-4 text-center">
              <ScanLine size={20} className="mx-auto text-brand" />
              <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{total}</p>
              <p className="text-xs text-slate-500">Total menu visits</p>
            </Card>
            <Card className="!p-4 text-center">
              <ScanLine size={20} className="mx-auto text-brand" />
              <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{qrTotal}</p>
              <p className="text-xs text-slate-500">QR scans (all time)</p>
            </Card>
            <Card className="!p-4 text-center">
              <ScanLine size={20} className="mx-auto text-brand" />
              <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{today}</p>
              <p className="text-xs text-slate-500">Visits today</p>
            </Card>
            <Card className="!p-4 text-center">
              <ScanLine size={20} className="mx-auto text-brand" />
              <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{month}</p>
              <p className="text-xs text-slate-500">Visits this month</p>
            </Card>
          </div>

          <Card>
            <h2 className="font-heading text-base font-semibold text-ink">Daily menu visits — last 14 days</h2>
            {days.every((d) => d.count === 0) ? (
              <p className="mt-3 text-sm text-slate-500">No visits in the last 14 days yet. Print your QR card and put it on your tables — a visit is recorded the first time a customer opens your menu (reopening it within 30 minutes is not counted again).</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {days.map((d) => (
                  <li key={d.label} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs text-slate-500">{d.label}</span>
                    <span className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((d.count / maxDay) * 100)}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-semibold text-ink">{d.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedCard icon={UtensilsCrossed} title="Most viewed items" rows={topItems} empty="No item views yet. When customers tap dishes on your menu, rankings appear here." />
            <RankedCard icon={FolderTree} title="Most viewed categories" rows={topCats} empty="No category views yet. Category views are counted from the dishes customers open." />
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
            <Eye size={14} className="mt-0.5 shrink-0" />
            How counting works now: a “QR scan” means the menu was opened from one of your printed QR codes
            (re-download them from the QR page — older prints still work but count as link visits). A “menu visit”
            also includes direct/shared links. The same phone is counted at most once every 30 minutes, your own
            visits as the restaurant owner are never counted, and a dish “view” counts once per dish per visit.
            Older numbers were inflated because every page refresh counted. Visits measure interest — they are not orders.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

function RankedCard({ icon: Icon, title, rows, empty }: { icon: typeof Eye; title: string; rows: Ranked[]; empty: string }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink"><Icon size={18} className="text-brand" /> {title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li key={r.name + i} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light/60 font-heading text-xs font-semibold text-brand-dark">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{r.count} views</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
