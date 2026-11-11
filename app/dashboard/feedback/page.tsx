"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Lock, MessageSquareHeart, Star, Store } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import type { Feedback } from "@/lib/types";

const ORDERING_PLANS = ["pro", "business"];

/**
 * Phase 2.3 — Feedback inbox + Google review link setting.
 * After a completed order, the customer's status page shows the
 * restaurant's Google review button and a private feedback form; the
 * private feedback lands here (never public). The review link lives in
 * restaurant_settings.google_review_url.
 */
export default function FeedbackPage() {
  const { loading, restaurant, subscription } = useOwner();
  const planSlug = subscription?.plan?.slug ?? "free";
  const planAllows = ORDERING_PLANS.includes(planSlug);

  const [fetching, setFetching] = useState(true);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [reviewUrl, setReviewUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !restaurant) return;
    setFetching(true);
    const [{ data: fb }, { data: st }] = await Promise.all([
      supabase.from("feedback").select("*").eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("restaurant_settings").select("google_review_url").eq("restaurant_id", restaurant.id).single(),
    ]);
    setRows((fb as Feedback[]) ?? []);
    setReviewUrl((st as { google_review_url?: string | null } | null)?.google_review_url ?? "");
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { if (planAllows) load(); else setFetching(false); }, [load, planAllows]);

  async function saveReviewUrl() {
    if (!supabase || !restaurant) return;
    const url = reviewUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) { setError("The review link must start with https:// — copy it from your Google Business profile (\"Ask for reviews\" link)."); return; }
    setSavingUrl(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ google_review_url: url || null }).eq("restaurant_id", restaurant.id);
    setSavingUrl(false);
    if (err) setError(err.message);
    else setSuccess(url ? "Review link saved — customers will see the Google review button after their order completes." : "Review link removed.");
  }

  const avg = rows.length && rows.some((r) => r.rating != null)
    ? (rows.filter((r) => r.rating != null).reduce((n, r) => n + Number(r.rating), 0) / rows.filter((r) => r.rating != null).length)
    : null;

  return (
    <DashboardShell title="Feedback & reviews">
      {loading || fetching ? <Loading label="Loading feedback…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Customer feedback and your Google review link live here once your restaurant exists."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planAllows ? (
        <EmptyState title="Feedback & reviews are a Pro feature"
          hint="On Pro and Business, every completed order invites the customer to rate you on Google — and unhappy customers get a private feedback form instead, so problems land in this inbox, not in public reviews. Paid plans are activated manually by the platform admin."
          action={<Link href="/dashboard/subscription" className={btnPrimary}><Lock size={18} /> See my subscription</Link>} />
      ) : (
        <div className="space-y-4">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <Star size={17} className="fill-amber-400 text-amber-400" /> Your Google review link
            </p>
            <p className="mt-1 text-sm text-slate-500">
              After a customer's order is completed, their tracking page shows a "Rate us on Google" button pointing here,
              next to the private feedback option. Get the link from your Google Business Profile → "Ask for reviews".
              Leave empty to hide the button.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input type="url" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)}
                placeholder="https://g.page/r/… or your Google review link"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
              <button type="button" onClick={saveReviewUrl} disabled={savingUrl} className={btnPrimary}>
                {savingUrl ? "Saving…" : "Save link"}
              </button>
              {reviewUrl.trim() && (
                <a href={reviewUrl.trim()} target="_blank" rel="noreferrer" className={btnGhost}>
                  <ExternalLink size={16} /> Open
                </a>
              )}
            </div>
          </Card>

          <Card>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <MessageSquareHeart size={17} className="text-brand" /> Private feedback inbox
              {avg != null && <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-ink"><Star size={15} className="fill-amber-400 text-amber-400" /> {avg.toFixed(1)} average · {rows.length} received</span>}
            </p>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nothing yet. When a customer chooses "Send private feedback" after their order completes, it appears here — visible only to you.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {rows.map((f) => (
                  <li key={f.id} className="py-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      {f.rating != null && (
                        <span className="inline-flex items-center gap-0.5" aria-label={`${f.rating} of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={14} className={n <= Number(f.rating) ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                          ))}
                        </span>
                      )}
                      <span className="font-medium text-ink">{f.customer_name || "A customer"}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(f.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {new Date(f.created_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{f.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
