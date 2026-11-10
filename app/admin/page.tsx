"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Store, CreditCard, ScanLine, Loader2, LogOut, Home, Ban, CheckCircle2,
} from "lucide-react";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox } from "@/components/ui";
import { supabase, isSupabaseConfigured, NotConfiguredState } from "@/lib/adminHelpers";
import type { Profile, Restaurant, Subscription, SubscriptionPlan } from "@/lib/types";

interface SubRow extends Subscription { plan?: SubscriptionPlan | null; restaurantName?: string }

/**
 * Super Admin panel. Access requires profiles.role = 'super_admin' —
 * verified here against the DATABASE (and enforced again by RLS via
 * is_super_admin()). Hiding the link in the UI is not the security.
 */
export default function AdminPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "denied" | "ready">("checking");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    if (!supabase) return;
    const [rRes, sRes, pRes, scanRes] = await Promise.all([
      supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*, plan:subscription_plans(*)").order("created_at", { ascending: false }),
      supabase.from("subscription_plans").select("*").order("display_order", { ascending: true }),
      supabase.from("menu_scans").select("id", { count: "exact", head: true }),
    ]);
    if (rRes.error) setError(rRes.error.message);
    const rests = (rRes.data as Restaurant[]) ?? [];
    const nameById = new Map(rests.map((r) => [r.id, r.name]));
    setRestaurants(rests);
    setSubs(((sRes.data as SubRow[]) ?? []).map((s) => ({ ...s, restaurantName: nameById.get(s.restaurant_id) ?? s.restaurant_id })));
    setPlans((pRes.data as SubscriptionPlan[]) ?? []);
    setTotalScans(scanRes.count ?? 0);
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

  async function changePlan(sub: SubRow, planId: string) {
    if (!supabase || planId === sub.plan_id) return;
    setBusyId(sub.id); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("subscriptions").update({ plan_id: planId, status: "active" }).eq("id", sub.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    const planName = plans.find((p) => p.id === planId)?.name ?? "new plan";
    setSuccess(`${sub.restaurantName} moved to the ${planName} plan.`);
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

  const activeSubs = subs.filter((s) => s.status === "active" || s.status === "trialing").length;

  return (
    <div className="min-h-screen bg-appbg font-body text-slate-800">
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-ink"><ShieldCheck size={20} /></span>
          <div>
            <p className="font-heading text-base font-semibold leading-none">MenuQR Super Admin</p>
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
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <Card className="!p-4 text-center">
                <Store size={20} className="mx-auto text-brand" />
                <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{restaurants.length}</p>
                <p className="text-xs text-slate-500">Total restaurants</p>
              </Card>
              <Card className="!p-4 text-center">
                <CreditCard size={20} className="mx-auto text-brand" />
                <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{activeSubs}</p>
                <p className="text-xs text-slate-500">Active subscriptions</p>
              </Card>
              <Card className="!p-4 text-center">
                <ScanLine size={20} className="mx-auto text-brand" />
                <p className="mt-1.5 font-heading text-xl font-bold text-ink sm:text-2xl">{totalScans}</p>
                <p className="text-xs text-slate-500">Total menu scans</p>
              </Card>
            </div>

            <section>
              <h2 className="mb-3 font-heading text-lg font-semibold text-ink">All restaurants</h2>
              {restaurants.length === 0 ? (
                <EmptyState title="No restaurants yet" hint="Restaurants appear here as soon as owners register and create their profiles." />
              ) : (
                <div className="space-y-2">
                  {restaurants.map((r) => (
                    <Card key={r.id} className="flex flex-wrap items-center gap-3 !py-3.5">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate font-medium text-ink">{r.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          /menu/{r.slug} · <span className={`font-medium ${r.status === "suspended" ? "text-red-600" : r.status === "published" ? "text-emerald-600" : "text-slate-500"}`}>{r.status}</span>
                          {" "}· since {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <Link href={`/menu/${r.slug}`} target="_blank" className="text-sm font-medium text-brand underline">View menu</Link>
                      <button type="button" disabled={busyId === r.id} onClick={() => toggleSuspend(r)}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${r.status === "suspended" ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        {busyId === r.id ? <Loader2 size={16} className="animate-spin" /> : r.status === "suspended" ? <CheckCircle2 size={16} /> : <Ban size={16} />}
                        {r.status === "suspended" ? "Activate" : "Suspend"}
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-heading text-lg font-semibold text-ink">Subscriptions & plans</h2>
              <p className="mb-3 text-sm text-slate-500">Change a restaurant's plan here after verifying payment manually. Plans take effect immediately (item limits are read from the plan).</p>
              {subs.length === 0 ? (
                <EmptyState title="No subscriptions yet" hint="A free subscription is created automatically with every restaurant." />
              ) : (
                <div className="space-y-2">
                  {subs.map((s) => (
                    <Card key={s.id} className="flex flex-wrap items-center gap-3 !py-3.5">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate font-medium text-ink">{s.restaurantName}</p>
                        <p className="text-xs text-slate-500">
                          {s.plan?.name ?? "—"} · <span className="capitalize">{s.status}</span> · since {new Date(s.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        Plan
                        <select value={s.plan_id} disabled={busyId === s.id} onChange={(e) => changePlan(s, e.target.value)}
                          className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.currency} {Number(p.price_monthly).toLocaleString("en-US")}/mo</option>)}
                        </select>
                      </label>
                      {busyId === s.id && <Loader2 size={18} className="animate-spin text-brand" />}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-heading text-lg font-semibold text-ink">Subscription plans (platform config)</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {plans.map((p) => (
                  <Card key={p.id} className="!py-4">
                    <p className="font-heading font-semibold text-ink">{p.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{p.currency} {Number(p.price_monthly).toLocaleString("en-US")}/month</p>
                    <p className="mt-1 text-sm text-slate-500">{p.max_items == null ? "Unlimited items" : `${p.max_items} items`} · {p.max_restaurants == null ? "Unlimited restaurants" : `${p.max_restaurants} restaurant(s)`}</p>
                    <p className="mt-1 text-xs text-slate-400">Edit prices/limits in Supabase → Table Editor → subscription_plans.</p>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
