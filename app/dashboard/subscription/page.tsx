"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, CreditCard, Info, Store } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import type { SubscriptionPlan } from "@/lib/types";

export default function SubscriptionPage() {
  const { loading, restaurant, subscription } = useOwner();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data, error: err } = await supabase.from("subscription_plans")
        .select("*").eq("is_active", true).order("display_order", { ascending: true });
      if (err) setError(err.message);
      setPlans((data as SubscriptionPlan[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!supabase || !restaurant) return;
    (async () => {
      const { count } = await supabase.from("menu_items")
        .select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id);
      setItemCount(count ?? 0);
    })();
  }, [restaurant]);

  const currentPlan = subscription?.plan ?? plans.find((p) => p.slug === "free") ?? null;
  const isTrial = subscription?.status === "trialing" && Boolean(subscription?.ends_at);
  const trialDaysLeft = isTrial
    ? Math.max(0, Math.ceil((new Date(subscription!.ends_at!).getTime() - Date.now()) / 86400000))
    : 0;
  const statusLabel = subscription?.status === "trialing" ? "free trial"
    : subscription?.status === "expired" ? "expired — on Free plan limits"
    : (subscription?.status ?? "active");

  return (
    <DashboardShell title="Subscription">
      {loading ? <Loading label="Loading subscription…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Your free subscription is created automatically with your restaurant."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          {isTrial && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
              <p className="font-heading text-base font-bold">🎉 You're on a free Pro trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</p>
              <p className="mt-1 text-sm leading-relaxed">
                Every Pro feature is unlocked right now: ordering, kitchen display, variations & add-ons and advanced analytics.
                Your trial ends {new Date(subscription!.ends_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} —
                after that your restaurant continues on the Free plan (your menu and QR keep working) until you upgrade.
                Pay for Pro before the trial ends and your paid time stacks on top of the remaining trial days.
              </p>
            </div>
          )}
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light/60 text-brand-dark"><CreditCard size={22} /></span>
              <div>
                <p className="font-heading text-lg font-semibold text-ink">
                  Current plan: {currentPlan?.name ?? "Free"}
                  <span className="ml-2 align-middle"><BadgeCheck size={18} className="inline text-brand" /></span>
                </p>
                <p className="text-sm text-slate-500">
                  Status: <span className="font-medium capitalize text-ink">{statusLabel}</span>
                  {isTrial && subscription?.ends_at && <> · trial ends {new Date(subscription.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}
                  {subscription?.starts_at && <> · since {new Date(subscription.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-appbg px-4 py-3">
                <p className="text-slate-500">Menu items</p>
                <p className="mt-0.5 font-heading text-base font-semibold text-ink">
                  {currentPlan?.max_items == null ? `${itemCount} used · unlimited` : `${itemCount} / ${currentPlan.max_items} used`}
                </p>
              </div>
              <div className="rounded-xl bg-appbg px-4 py-3">
                <p className="text-slate-500">Restaurants</p>
                <p className="mt-0.5 font-heading text-base font-semibold text-ink">
                  {currentPlan?.max_restaurants == null ? "1 used · unlimited" : `1 / ${currentPlan.max_restaurants} used`}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            <p>
              Online payments are not connected yet. To upgrade, contact the Velora team, complete your
              payment, and the platform admin will activate your plan manually — usually the same day.
              A plan is never marked paid without a verified payment.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => {
              const isCurrent = currentPlan?.id === p.id;
              return (
                <div key={p.id} className={`flex flex-col rounded-2xl bg-white p-5 shadow-card ${isCurrent ? "ring-2 ring-brand" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-base font-semibold text-ink">{p.name}</h3>
                    {isCurrent
                      ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">CURRENT</span>
                      : p.slug === "pro" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">MOST POPULAR</span>}
                  </div>
                  <p className="mt-2">
                    <span className="font-heading text-2xl font-bold text-ink">{p.currency} {Number(p.price_monthly).toLocaleString("en-US")}</span>
                    <span className="text-sm text-slate-500"> /month</span>
                  </p>
                  <ul className="mt-3 flex-1 space-y-1.5">
                    <li className="flex items-start gap-2 text-sm text-slate-600">
                      <Check size={15} className="mt-0.5 shrink-0 text-brand" />
                      {p.max_items == null ? "Unlimited menu items" : `${p.max_items} menu items`}
                    </li>
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-600"><Check size={15} className="mt-0.5 shrink-0 text-brand" /> {f}</li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                      Activation is manual by the platform admin after payment.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
