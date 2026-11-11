"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Store, CreditCard, ScanLine, Loader2, LogOut, Home, Ban, CheckCircle2,
  Users, Banknote, CalendarClock, Search, Phone, MessageCircle, Save, ChevronDown,
} from "lucide-react";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, inputCls, labelCls, btnPrimary, btnGhost } from "@/components/ui";
import { supabase, isSupabaseConfigured, NotConfiguredState } from "@/lib/adminHelpers";
import { formatPrice, startOfTodayISO } from "@/lib/utils";
import type { Payment, PaymentMethod, Profile, Restaurant, Subscription, SubscriptionPlan } from "@/lib/types";

interface SubRow extends Subscription { plan?: SubscriptionPlan | null }
interface PaymentRow extends Payment { planName?: string }

type Tab = "restaurants" | "subscriptions" | "users" | "payments" | "plans";
type SubFilter = "all" | "free" | "starter" | "pro" | "business" | "expiring" | "expired";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "EasyPaisa" },
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

function isExpiredSub(s: SubRow): boolean {
  return Boolean(s.ends_at) && new Date(s.ends_at!).getTime() <= Date.now()
    && (s.plan?.slug ?? "free") !== "free" && (s.status === "active" || s.status === "trialing");
}
function isExpiringSoon(s: SubRow): boolean {
  if (!s.ends_at || isExpiredSub(s)) return false;
  const ms = new Date(s.ends_at).getTime() - Date.now();
  return ms > 0 && ms <= 7 * 24 * 3600 * 1000 && (s.plan?.slug ?? "free") !== "free";
}
function daysLeft(s: SubRow): number | null {
  if (!s.ends_at) return null;
  return Math.ceil((new Date(s.ends_at).getTime() - Date.now()) / (24 * 3600 * 1000));
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Super Admin panel v2. Access requires profiles.role = 'super_admin' —
 * verified here against the DATABASE (and enforced again by RLS via
 * is_super_admin()). Hiding the link in the UI is not the security.
 *
 * Controls: platform stats + estimated MRR, all restaurants (owner
 * contacts, suspend/activate), subscriptions with due dates and a
 * confirm-payment flow (assign plan + months + method -> sets the due
 * date and writes a payments row), filters incl. Pro users and
 * expiring/expired, all users, payment history, and plan price/limit
 * editing. Expired paid plans behave as Free (DB function + owner app).
 */
export default function AdminPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "denied" | "ready">("checking");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [itemCounts, setItemCounts] = useState<Map<string, number>>(new Map());
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(new Map());
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("restaurants");
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<SubFilter>("all");

  async function loadAll() {
    if (!supabase) return;
    const [rRes, sRes, pRes, scanRes, profRes, payRes, itemsRes, scansRes, ordRes] = await Promise.all([
      supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*, plan:subscription_plans(*)").order("created_at", { ascending: false }),
      supabase.from("subscription_plans").select("*").order("display_order", { ascending: true }),
      supabase.from("menu_scans").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("menu_items").select("restaurant_id").limit(20000),
      supabase.from("menu_scans").select("restaurant_id").limit(20000),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfTodayISO()),
    ]);
    if (rRes.error) setError(rRes.error.message);
    const rests = (rRes.data as Restaurant[]) ?? [];
    const planList = (pRes.data as SubscriptionPlan[]) ?? [];
    setRestaurants(rests);
    setSubs((sRes.data as SubRow[]) ?? []);
    setPlans(planList);
    setTotalScans(scanRes.count ?? 0);
    setOrdersToday(ordRes.count ?? 0);
    setProfiles((profRes.data as Profile[]) ?? []);
    const planNameById = new Map(planList.map((p) => [p.id, p.name]));
    const restNameById = new Map(rests.map((r) => [r.id, r.name]));
    setPayments(((payRes.data as Payment[]) ?? []).map((p) => ({
      ...p,
      planName: p.plan_id ? planNameById.get(p.plan_id) ?? undefined : undefined,
      restaurantName: restNameById.get(p.restaurant_id),
    } as PaymentRow & { restaurantName?: string })));
    const countBy = (rows: { restaurant_id: string }[] | null) => {
      const m = new Map<string, number>();
      (rows ?? []).forEach((r) => m.set(r.restaurant_id, (m.get(r.restaurant_id) ?? 0) + 1));
      return m;
    };
    setItemCounts(countBy(itemsRes.data as { restaurant_id: string }[]));
    setVisitCounts(countBy(scansRes.data as { restaurant_id: string }[]));
    setLoadingData(false);
  }

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!u.user) { router.replace("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      if (cancelled) return;
      if (!data || (data as Profile).role !== "super_admin") { setPhase("denied"); return; }
      setProfile(data as Profile);
      setPhase("ready");
      loadAll();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const ownerById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const restaurantById = useMemo(() => new Map(restaurants.map((r) => [r.id, r])), [restaurants]);
  const subByRestaurant = useMemo(() => new Map(subs.map((s) => [s.restaurant_id, s])), [subs]);

  const stats = useMemo(() => {
    const paid = subs.filter((s) => (s.plan?.slug ?? "free") !== "free" && (s.status === "active" || s.status === "trialing") && !isExpiredSub(s));
    const mrr = paid.reduce((n, s) => n + Number(s.plan?.price_monthly ?? 0), 0);
    return {
      paidCount: paid.length,
      proCount: subs.filter((s) => ["pro", "business"].includes(s.plan?.slug ?? "") && !isExpiredSub(s) && (s.status === "active" || s.status === "trialing")).length,
      expiring: subs.filter(isExpiringSoon).length,
      expired: subs.filter(isExpiredSub).length,
      mrr,
    };
  }, [subs]);

  async function toggleSuspend(r: Restaurant) {
    if (!supabase) return;
    const suspending = r.status !== "suspended";
    if (!window.confirm(suspending
      ? `Suspend "${r.name}"? Its public menu will stop opening for customers.`
      : `Reactivate "${r.name}"? Its public menu will go live again.`)) return;
    setBusyId(r.id); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurants")
      .update(suspending ? { status: "suspended", is_published: false } : { status: "published", is_published: true })
      .eq("id", r.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setSuccess(suspending ? `${r.name} suspended.` : `${r.name} reactivated.`);
    loadAll();
  }

  async function quickExtend(s: SubRow) {
    if (!supabase) return;
    const name = restaurantById.get(s.restaurant_id)?.name ?? "Restaurant";
    if (!window.confirm(`Give ${name} a free +30 day extension (no payment recorded)? The due date moves 30 days later.`)) return;
    const base = s.ends_at && new Date(s.ends_at).getTime() > Date.now() ? new Date(s.ends_at) : new Date();
    base.setDate(base.getDate() + 30);
    setBusyId(s.id); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("subscriptions")
      .update({ ends_at: base.toISOString(), status: "active" }).eq("id", s.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setSuccess(`${name} extended — new due date ${fmtDate(base.toISOString())}.`);
    loadAll();
  }

  async function setFree(s: SubRow) {
    if (!supabase) return;
    const free = plans.find((p) => p.slug === "free");
    if (!free) return;
    const name = restaurantById.get(s.restaurant_id)?.name ?? "Restaurant";
    if (!window.confirm(`Move ${name} back to the Free plan? Paid features (including ordering) stop immediately.`)) return;
    setBusyId(s.id); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("subscriptions")
      .update({ plan_id: free.id, status: "active", ends_at: null }).eq("id", s.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setSuccess(`${name} is now on the Free plan.`);
    loadAll();
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!isSupabaseConfigured) {
    return <div className="min-h-screen bg-appbg px-4 py-10 font-body"><NotConfiguredState /></div>;
  }
  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-appbg font-body text-slate-600">
        <div className="flex items-center gap-3 text-sm"><Loader2 size={20} className="animate-spin text-brand" /> Verifying super admin access…</div>
      </div>
    );
  }
  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-appbg px-4 font-body">
        <Card className="max-w-md text-center">
          <ShieldCheck size={36} className="mx-auto mb-3 text-slate-300" />
          <h1 className="font-heading text-lg font-semibold text-ink">Super Admin only</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            This area requires a profile with role <code className="rounded bg-slate-100 px-1">super_admin</code> in the database.
            To grant it, run the promotion SQL from SETUP.md in the Supabase SQL Editor.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand underline">Go to my dashboard</Link>
        </Card>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const matches = (name: string, extra = "") => !q || name.toLowerCase().includes(q) || extra.toLowerCase().includes(q);
  const visibleRestaurants = restaurants.filter((r) => {
    const o = ownerById.get(r.owner_id);
    return matches(r.name, `${o?.email ?? ""} ${o?.full_name ?? ""} ${r.slug}`);
  });
  const visibleSubs = subs.filter((s) => {
    const r = restaurantById.get(s.restaurant_id);
    const o = r ? ownerById.get(r.owner_id) : undefined;
    if (!matches(r?.name ?? "", `${o?.email ?? ""} ${o?.full_name ?? ""}`)) return false;
    switch (subFilter) {
      case "all": return true;
      case "expiring": return isExpiringSoon(s);
      case "expired": return isExpiredSub(s);
      default: return (s.plan?.slug ?? "free") === subFilter && !isExpiredSub(s);
    }
  });
  const visibleUsers = profiles.filter((p) => matches(p.full_name ?? "", p.email));

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "restaurants", label: "Restaurants", count: restaurants.length },
    { key: "subscriptions", label: "Subscriptions", count: subs.length },
    { key: "users", label: "Users", count: profiles.length },
    { key: "payments", label: "Payments", count: payments.length },
    { key: "plans", label: "Plans" },
  ];

  return (
    <div className="min-h-screen bg-appbg font-body text-slate-800">
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-ink"><ShieldCheck size={20} /></span>
          <div>
            <p className="font-heading text-base font-semibold leading-none">Velora Super Admin</p>
            <p className="mt-0.5 text-[11px] text-slate-300">{profile?.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" aria-label="Home" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-300 hover:text-white"><Home size={20} /></Link>
            <button type="button" onClick={signOut} aria-label="Sign out" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-300 hover:text-white"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ErrorBox message={error} />
        <div className="mt-1"><SuccessBox message={success} /></div>

        {loadingData ? <Loading label="Loading platform data…" /> : (
          <div className="mt-4 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={Store} label="Restaurants" value={restaurants.length} />
              <StatCard icon={Users} label="Users (owners)" value={profiles.length} />
              <StatCard icon={CreditCard} label="Paid active" value={stats.paidCount} sub={`${stats.proCount} Pro/Business`} />
              <StatCard icon={Banknote} label="Est. MRR" value={formatPrice(stats.mrr)} sub="from active paid plans" />
              <StatCard icon={CalendarClock} label="Expiring ≤ 7 days" value={stats.expiring} sub={stats.expired ? `${stats.expired} already expired` : "none expired"} warn={stats.expiring > 0 || stats.expired > 0} />
              <StatCard icon={ScanLine} label="Menu visits" value={totalScans} sub={`${ordersToday} orders today`} />
            </div>

            {/* Tabs + search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {TABS.map((t) => (
                  <button key={t.key} type="button" onClick={() => setTab(t.key)}
                    className={`min-h-[40px] shrink-0 rounded-full px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-ink text-white" : "bg-white text-slate-600 shadow-card"}`}>
                    {t.label}{t.count != null ? ` · ${t.count}` : ""}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto w-full sm:w-64">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm" />
              </div>
            </div>

            {/* ---------------- Restaurants ---------------- */}
            {tab === "restaurants" && (
              <section>
                {visibleRestaurants.length === 0 ? (
                  <EmptyState title="No restaurants found" hint="Restaurants appear here as soon as owners register and create their profiles." />
                ) : (
                  <div className="space-y-2">
                    {visibleRestaurants.map((r) => {
                      const o = ownerById.get(r.owner_id);
                      const s = subByRestaurant.get(r.id);
                      const dl = s ? daysLeft(s) : null;
                      return (
                        <Card key={r.id} className="!py-3.5">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1 basis-52">
                              <p className="truncate font-medium text-ink">{r.name}{" "}
                                <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === "suspended" ? "bg-red-100 text-red-700" : r.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                /menu/{r.slug} · since {fmtDate(r.created_at)} · {itemCounts.get(r.id) ?? 0} items · {visitCounts.get(r.id) ?? 0} visits
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                Owner: <span className="font-medium text-slate-700">{o?.full_name ?? "—"}</span> · {o?.email ?? "—"}
                                {r.phone && <> · <Phone size={11} className="inline" /> {r.phone}</>}
                                {r.whatsapp && <> · WhatsApp {r.whatsapp}</>}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-ink">{s?.plan?.name ?? "Free"}{s && isExpiredSub(s) && <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">EXPIRED</span>}</p>
                              <p className="text-xs text-slate-500">
                                {s?.plan?.slug === "free" || !s ? "no due date" : s.ends_at ? `due ${fmtDate(s.ends_at)}${dl != null ? ` (${dl <= 0 ? "overdue" : `${dl}d left`})` : ""}` : "no due date set"}
                              </p>
                            </div>
                            <Link href={`/menu/${r.slug}`} target="_blank" className="text-sm font-medium text-brand underline">View menu</Link>
                            <button type="button" disabled={busyId === r.id} onClick={() => toggleSuspend(r)}
                              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${r.status === "suspended" ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                              {busyId === r.id ? <Loader2 size={16} className="animate-spin" /> : r.status === "suspended" ? <CheckCircle2 size={16} /> : <Ban size={16} />}
                              {r.status === "suspended" ? "Activate" : "Suspend"}
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ---------------- Subscriptions ---------------- */}
            {tab === "subscriptions" && (
              <section className="space-y-3">
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  {([
                    ["all", "All"], ["free", "Free"], ["starter", "Starter"], ["pro", "Pro"],
                    ["business", "Business"], ["expiring", "Expiring soon"], ["expired", "Expired"],
                  ] as [SubFilter, string][]).map(([f, label]) => (
                    <button key={f} type="button" onClick={() => setSubFilter(f)}
                      className={`min-h-[38px] shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${subFilter === f ? "bg-brand text-white" : "bg-white text-slate-600 shadow-card"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-slate-500">
                  Flow: the restaurant pays you (JazzCash / EasyPaisa / bank / cash) → you verify it → open
                  “Confirm payment & activate”, choose the plan and months. The due date is set automatically
                  and the payment is written to the Payments history. Past the due date, a paid plan behaves
                  as Free until renewed.
                </p>
                {visibleSubs.length === 0 ? (
                  <EmptyState title="No subscriptions in this view" hint="Try a different filter or search." />
                ) : visibleSubs.map((s) => (
                  <SubscriptionRow key={s.id} sub={s} plans={plans}
                    restaurantName={restaurantById.get(s.restaurant_id)?.name ?? s.restaurant_id}
                    ownerLabel={(() => { const r = restaurantById.get(s.restaurant_id); const o = r ? ownerById.get(r.owner_id) : undefined; return o ? `${o.full_name ?? ""} · ${o.email}` : ""; })()}
                    busy={busyId === s.id}
                    onExtend={() => quickExtend(s)} onSetFree={() => setFree(s)}
                    onDone={(msg) => { setSuccess(msg); loadAll(); }} onError={(m) => setError(m)} />
                ))}
              </section>
            )}

            {/* ---------------- Users ---------------- */}
            {tab === "users" && (
              <section>
                {visibleUsers.length === 0 ? (
                  <EmptyState title="No users found" hint="Registered owners appear here." />
                ) : (
                  <div className="space-y-2">
                    {visibleUsers.map((p) => {
                      const r = restaurants.find((x) => x.owner_id === p.id);
                      const s = r ? subByRestaurant.get(r.id) : undefined;
                      return (
                        <Card key={p.id} className="flex flex-wrap items-center gap-3 !py-3.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-sm font-semibold text-white">
                            {(p.full_name || p.email).trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1 basis-52">
                            <p className="truncate font-medium text-ink">{p.full_name ?? "—"}{" "}
                              {p.role === "super_admin" && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">SUPER ADMIN (you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{p.email} · joined {fmtDate(p.created_at)}</p>
                          </div>
                          <div className="text-sm text-slate-600">
                            {r ? <>{r.name} · <span className="font-medium text-ink">{s?.plan?.name ?? "Free"}</span>{r.status === "suspended" && <span className="text-red-600"> · suspended</span>}</> : <span className="text-slate-400">no restaurant yet</span>}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-400">User accounts are not deleted from here — suspend their restaurant instead if access must stop.</p>
              </section>
            )}

            {/* ---------------- Payments ---------------- */}
            {tab === "payments" && (
              <section>
                {payments.length === 0 ? (
                  <EmptyState title="No payments recorded yet" hint="Every “Confirm payment & activate” in Subscriptions writes one row here — amount, method, reference and the period it paid for." />
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <Card key={p.id} className="flex flex-wrap items-center gap-3 !py-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Banknote size={19} /></span>
                        <div className="min-w-0 flex-1 basis-52">
                          <p className="truncate font-medium text-ink">{(p as PaymentRow & { restaurantName?: string }).restaurantName ?? p.restaurant_id}</p>
                          <p className="truncate text-xs text-slate-500">
                            {p.planName ?? "Plan"} · {p.months} month{p.months === 1 ? "" : "s"} · {fmtDate(p.starts_at)} → {fmtDate(p.ends_at)}
                            {p.reference && <> · ref {p.reference}</>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-heading font-bold text-ink">{formatPrice(Number(p.amount), p.currency)}</p>
                          <p className="text-xs capitalize text-slate-500">{METHODS.find((m) => m.value === p.method)?.label ?? p.method} · {fmtDate(p.created_at)}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ---------------- Plans ---------------- */}
            {tab === "plans" && (
              <section>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {plans.map((p) => <PlanEditor key={p.id} plan={p} onDone={(m) => { setSuccess(m); loadAll(); }} onError={(m) => setError(m)} />)}
                </div>
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
                  <MessageCircle size={14} className="mt-0.5 shrink-0" />
                  Prices and limits saved here apply immediately inside the app (dashboards, item limits, ordering).
                  The public homepage shows its plan cards from the site code, so after changing a price here, tell Tom to sync the homepage text too.
                </p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, warn }: { icon: typeof Store; label: string; value: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <Card className={`!p-4 text-center ${warn ? "ring-2 ring-amber-300" : ""}`}>
      <Icon size={19} className="mx-auto text-brand" />
      <p className="mt-1.5 truncate font-heading text-lg font-bold text-ink sm:text-xl">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</p>}
    </Card>
  );
}

function SubscriptionRow({ sub: s, plans, restaurantName, ownerLabel, busy, onExtend, onSetFree, onDone, onError }: {
  sub: SubRow; plans: SubscriptionPlan[]; restaurantName: string; ownerLabel: string;
  busy: boolean; onExtend: () => void; onSetFree: () => void;
  onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(s.plan_id);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("jazzcash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const chosenPlan = plans.find((p) => p.id === planId);
  useEffect(() => {
    if (chosenPlan) setAmount(String(Number(chosenPlan.price_monthly) * months));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, months]);

  const dl = daysLeft(s);
  const expired = isExpiredSub(s);
  const soon = isExpiringSoon(s);
  const base = s.ends_at && new Date(s.ends_at).getTime() > Date.now() ? new Date(s.ends_at) : new Date();
  const newEnds = new Date(base); newEnds.setMonth(newEnds.getMonth() + months);

  async function confirmPayment() {
    if (!supabase || !chosenPlan || saving) return;
    const amt = Number(amount);
    if (!amt || amt < 0) { onError("Enter the amount the customer actually paid."); return; }
    if (!window.confirm(`Confirm payment for ${restaurantName}?\n\nPlan: ${chosenPlan.name}\nAmount: ${formatPrice(amt, chosenPlan.currency)} via ${METHODS.find((m) => m.value === method)?.label}\nPeriod: ${months} month${months === 1 ? "" : "s"} → new due date ${fmtDate(newEnds.toISOString())}`)) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase.from("subscriptions")
      .update({ plan_id: chosenPlan.id, status: "active", ends_at: newEnds.toISOString() })
      .eq("id", s.id);
    if (upErr) { setSaving(false); onError(upErr.message); return; }
    const { data: me } = await supabase.auth.getUser();
    const { error: payErr } = await supabase.from("payments").insert({
      restaurant_id: s.restaurant_id, subscription_id: s.id, plan_id: chosenPlan.id,
      amount: amt, currency: chosenPlan.currency, method,
      reference: reference.trim() || null, months,
      starts_at: nowIso, ends_at: newEnds.toISOString(), recorded_by: me.user?.id ?? null,
    });
    setSaving(false);
    if (payErr) {
      onError(`Plan was activated, but the payment could NOT be logged: ${payErr.message}. Note it down and tell Tom.`);
      onDone("");
      return;
    }
    setOpen(false);
    onDone(`${restaurantName} activated on ${chosenPlan.name} — due ${fmtDate(newEnds.toISOString())}. Payment of ${formatPrice(amt, chosenPlan.currency)} recorded.`);
  }

  return (
    <Card className={`!py-3.5 ${expired ? "ring-2 ring-red-200" : soon ? "ring-2 ring-amber-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-52">
          <p className="truncate font-medium text-ink">{restaurantName}</p>
          <p className="truncate text-xs text-slate-500">{ownerLabel}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Current: <span className="font-semibold text-ink">{s.plan?.name ?? "Free"}</span> · <span className="capitalize">{expired ? "expired" : s.status}</span>
            {" "}· since {fmtDate(s.starts_at)}
            {s.ends_at && <> · due <span className={expired ? "font-semibold text-red-600" : soon ? "font-semibold text-amber-600" : ""}>{fmtDate(s.ends_at)}</span>{dl != null && <> ({dl <= 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`})</>}</>}
            {!s.ends_at && s.plan?.slug !== "free" && <> · <span className="text-amber-600">no due date set</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className={`${btnPrimary} !min-h-[40px] !px-3.5 !py-2 text-[13px]`}>
            Confirm payment & activate <ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />
          </button>
          <button type="button" disabled={busy} onClick={onExtend} className={`${btnGhost} !min-h-[40px] !px-3 !py-2 text-[13px]`}>+30 days free</button>
          {s.plan?.slug !== "free" && (
            <button type="button" disabled={busy} onClick={onSetFree} className="inline-flex min-h-[40px] items-center rounded-xl border border-red-200 bg-white px-3 py-2 text-[13px] font-medium text-red-600 disabled:opacity-50">Set Free</button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Plan to activate</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.currency} {Number(p.price_monthly).toLocaleString("en-US")}/mo</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Months paid</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputCls}>
              {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount received (PKR)</label>
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Reference / transaction ID (optional)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. JazzCash TID" className={inputCls} />
          </div>
          <div className="flex items-end">
            <p className="rounded-xl bg-appbg px-3.5 py-2.5 text-sm text-slate-600">
              New due date: <span className="font-semibold text-ink">{fmtDate(newEnds.toISOString())}</span>
              {s.ends_at && new Date(s.ends_at).getTime() > Date.now() && <span className="block text-xs text-slate-400">extends from the current due date</span>}
            </p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="button" onClick={confirmPayment} disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
              {saving ? "Activating…" : `Confirm payment & activate ${chosenPlan?.name ?? ""}`}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PlanEditor({ plan, onDone, onError }: {
  plan: SubscriptionPlan; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [price, setPrice] = useState(String(plan.price_monthly));
  const [maxItems, setMaxItems] = useState(plan.max_items == null ? "" : String(plan.max_items));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!supabase || saving) return;
    const p = Number(price);
    if (Number.isNaN(p) || p < 0) { onError(`Enter a valid price for ${plan.name}.`); return; }
    const mi = maxItems.trim() === "" ? null : Number(maxItems);
    if (mi != null && (Number.isNaN(mi) || mi < 0)) { onError(`Enter a valid item limit for ${plan.name} (or leave empty for unlimited).`); return; }
    setSaving(true);
    const { error } = await supabase.from("subscription_plans")
      .update({ price_monthly: p, max_items: mi }).eq("id", plan.id);
    setSaving(false);
    if (error) onError(error.message);
    else onDone(`${plan.name} updated — ${plan.currency} ${p.toLocaleString("en-US")}/month, ${mi == null ? "unlimited" : mi} items.`);
  }

  return (
    <Card className="!py-4">
      <p className="font-heading font-semibold text-ink">{plan.name}</p>
      <div className="mt-3 space-y-2.5">
        <div>
          <label className={labelCls}>Price / month ({plan.currency})</label>
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Max menu items (blank = unlimited)</label>
          <input type="number" min={0} value={maxItems} onChange={(e) => setMaxItems(e.target.value)} placeholder="Unlimited" className={inputCls} />
        </div>
        <p className="text-xs text-slate-400">{plan.max_restaurants == null ? "Unlimited restaurants" : `${plan.max_restaurants} restaurant(s)`} · applies immediately</p>
        <button type="button" onClick={save} disabled={saving} className={`${btnGhost} w-full`}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save {plan.name}
        </button>
      </div>
    </Card>
  );
}
