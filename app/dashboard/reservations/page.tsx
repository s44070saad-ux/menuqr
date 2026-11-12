"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, Lock, MessageCircle, PartyPopper, Phone, Store } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { CateringEnquiry, Reservation } from "@/lib/types";

const RES_STATUSES = ["pending", "confirmed", "waitlisted", "completed", "no_show", "cancelled"] as const;
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  waitlisted: "bg-sky-100 text-sky-800",
  completed: "bg-slate-200 text-slate-700",
  no_show: "bg-slate-200 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-sky-100 text-sky-800",
  closed: "bg-slate-200 text-slate-700",
};

export default function ReservationsPage() {
  const { loading, restaurant } = useOwner();
  const [planSlug, setPlanSlug] = useState<string>("free");
  const [resOn, setResOn] = useState(false);
  const [catOn, setCatOn] = useState(false);
  const [savingToggle, setSavingToggle] = useState<string | null>(null);
  const [tab, setTab] = useState<"bookings" | "catering">("bookings");
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [enquiries, setEnquiries] = useState<CateringEnquiry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const planOk = planSlug === "pro" || planSlug === "business";

  const load = useCallback(async () => {
    if (!supabase || !restaurant) return;
    const [{ data: plan }, { data: settings }, { data: res }, { data: cat }] = await Promise.all([
      supabase.rpc("restaurant_plan_slug", { rid: restaurant.id }),
      supabase.from("restaurant_settings").select("reservations_enabled, catering_enabled").eq("restaurant_id", restaurant.id).maybeSingle(),
      supabase.from("reservations").select("*").eq("restaurant_id", restaurant.id)
        .order("reserve_date", { ascending: true }).order("reserve_time", { ascending: true }).limit(200),
      supabase.from("catering_enquiries").select("*").eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false }).limit(200),
    ]);
    if (typeof plan === "string") setPlanSlug(plan);
    const s = settings as { reservations_enabled?: boolean; catering_enabled?: boolean } | null;
    setResOn(Boolean(s?.reservations_enabled));
    setCatOn(Boolean(s?.catering_enabled));
    setBookings((res as Reservation[]) ?? []);
    setEnquiries((cat as CateringEnquiry[]) ?? []);
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(kind: "reservations_enabled" | "catering_enabled", next: boolean) {
    if (!supabase || !restaurant) return;
    setSavingToggle(kind); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings").update({ [kind]: next }).eq("restaurant_id", restaurant.id);
    setSavingToggle(null);
    if (err) { setError(err.message); return; }
    if (kind === "reservations_enabled") setResOn(next); else setCatOn(next);
    setSuccess(next ? "Switched on — the form is live on your public menu." : "Switched off — the form no longer shows on your public menu.");
  }

  async function setResStatus(r: Reservation, status: string) {
    if (!supabase) return;
    setBusyId(r.id); setError(null);
    const { error: err } = await supabase.from("reservations").update({ status }).eq("id", r.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setBookings((prev) => prev.map((b) => (b.id === r.id ? { ...b, status } : b)));
  }

  async function setCatStatus(e: CateringEnquiry, status: string) {
    if (!supabase) return;
    setBusyId(e.id); setError(null);
    const { error: err } = await supabase.from("catering_enquiries").update({ status }).eq("id", e.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setEnquiries((prev) => prev.map((c) => (c.id === e.id ? { ...c, status } : c)));
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.reserve_date >= today && b.status !== "cancelled");
  const past = bookings.filter((b) => b.reserve_date < today || b.status === "cancelled");

  return (
    <DashboardShell title="Reservations">
      {loading || fetching ? <Loading label="Loading reservations…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Reservations belong to a restaurant — create your restaurant profile first."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          <Card>
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-ink">
              <CalendarCheck size={19} className="text-brand" /> Bookings & events on your menu
            </h2>
            {!planOk ? (
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <Lock size={16} className="mt-0.5 shrink-0" />
                Table reservations and catering enquiries are Pro features. Your current plan is {planSlug} — upgrade from the Subscription page to switch them on.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Table reservations</span>
                    <span className="block text-xs text-slate-500">Guests book from your public menu; you confirm here. Guests see their status update on the menu page — email reminders arrive when email sending is connected.</span>
                  </span>
                  <input type="checkbox" checked={resOn} disabled={savingToggle === "reservations_enabled"}
                    onChange={(e) => toggle("reservations_enabled", e.target.checked)} className="h-5 w-5 shrink-0 accent-teal-700" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Catering & events</span>
                    <span className="block text-xs text-slate-500">A “Planning an event?” form on your menu for big orders — weddings, office dinners, parties.</span>
                  </span>
                  <input type="checkbox" checked={catOn} disabled={savingToggle === "catering_enabled"}
                    onChange={(e) => toggle("catering_enabled", e.target.checked)} className="h-5 w-5 shrink-0 accent-teal-700" />
                </label>
              </div>
            )}
          </Card>

          <div className="flex gap-2">
            <button type="button" onClick={() => setTab("bookings")} className={tab === "bookings" ? btnPrimary : btnGhost}>
              <CalendarCheck size={16} /> Bookings ({upcoming.length})
            </button>
            <button type="button" onClick={() => setTab("catering")} className={tab === "catering" ? btnPrimary : btnGhost}>
              <PartyPopper size={16} /> Catering ({enquiries.filter((e) => e.status === "new").length} new)
            </button>
          </div>

          {tab === "bookings" ? (
            bookings.length === 0 ? (
              <EmptyState title="No bookings yet" hint={resOn ? "When a guest books from your menu, it appears here for confirmation." : "Switch table reservations on above and your first booking will land here."} />
            ) : (
              <div className="space-y-3">
                {[...upcoming, ...past].map((b) => (
                  <Card key={b.id} className="!py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-sm font-bold text-ink">
                        {b.reserve_date} · {b.reserve_time.slice(0, 5)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{b.party_size} guests</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[b.status] ?? "bg-slate-100 text-slate-600"}`}>{b.status}</span>
                      {b.reserve_date < today && b.status !== "cancelled" && <span className="text-xs text-slate-400">(past)</span>}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">
                      <b className="text-ink">{b.customer_name}</b> · {b.customer_phone}
                      {b.note ? ` · “${b.note}”` : ""}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <a href={`tel:${b.customer_phone}`} className={btnGhost}><Phone size={14} /> Call</a>
                      <a href={`https://wa.me/${b.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={btnGhost}><MessageCircle size={14} /> WhatsApp</a>
                      {RES_STATUSES.filter((s) => s !== b.status).map((s) => (
                        <button key={s} type="button" disabled={busyId === b.id} onClick={() => setResStatus(b, s)} className={btnGhost}>
                          {busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : null} {s.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : enquiries.length === 0 ? (
            <EmptyState title="No catering enquiries yet" hint={catOn ? "Event enquiries from your menu will appear here." : "Switch catering on above and enquiries will land here."} />
          ) : (
            <div className="space-y-3">
              {enquiries.map((e) => (
                <Card key={e.id} className="!py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-sm font-bold text-ink">{e.customer_name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status] ?? "bg-slate-100 text-slate-600"}`}>{e.status}</span>
                    <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">
                    {e.customer_phone}
                    {e.event_date ? ` · Event: ${e.event_date}` : ""}
                    {e.guests ? ` · ${e.guests} guests` : ""}
                    {e.budget_amount ? ` · Budget ${formatPrice(Number(e.budget_amount), restaurant.currency)}` : ""}
                  </p>
                  {e.message && <p className="mt-1 text-sm text-slate-600">“{e.message}”</p>}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <a href={`tel:${e.customer_phone}`} className={btnGhost}><Phone size={14} /> Call</a>
                    <a href={`https://wa.me/${e.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={btnGhost}><MessageCircle size={14} /> WhatsApp</a>
                    {(["contacted", "closed"] as const).filter((s) => s !== e.status).map((s) => (
                      <button key={s} type="button" disabled={busyId === e.id} onClick={() => setCatStatus(e, s)} className={btnGhost}>
                        {busyId === e.id ? <Loader2 size={14} className="animate-spin" /> : null} Mark {s}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
