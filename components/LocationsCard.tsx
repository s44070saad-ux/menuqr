"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Card, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";

/**
 * Phase 6 — Multi-location menu tools (Items page).
 * This restaurant is the SOURCE (the "HQ" menu). Clone copies its
 * categories, dishes, options and translations into another of the
 * owner's restaurants (skipping names that already exist there);
 * Sync pushes prices + availability to name-matched dishes there.
 * Both run through SECURITY DEFINER RPCs that verify ownership and
 * require the source to be on the Business plan. Each location
 * keeps its own rows afterwards — per-location prices work by
 * editing the location's own menu after cloning.
 */
export default function LocationsCard({ restaurantId }: { restaurantId: string }) {
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<"clone" | "sync" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("restaurants").select("id, name")
      .eq("owner_id", u.user.id).neq("id", restaurantId).order("created_at", { ascending: true });
    const list = (data as { id: string; name: string }[] | null) ?? [];
    setOthers(list);
    if (list[0]) setTarget(list[0].id);
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  async function run(kind: "clone" | "sync") {
    if (!supabase || !target) return;
    setBusy(kind); setNote(null);
    const fn = kind === "clone" ? "clone_menu" : "sync_menu_by_name";
    const { data, error } = await supabase.rpc(fn, { p_source_id: restaurantId, p_target_id: target });
    setBusy(null);
    if (error) {
      setNote(
        error.message.includes("PLAN_NOT_ALLOWED")
          ? "Multi-location tools need this (source) restaurant on the Business plan."
          : error.message.includes("FORBIDDEN")
            ? "You can only copy between restaurants you own."
            : "Something went wrong. Please try again.",
      );
      return;
    }
    const d = data as { categories_created?: number; items_created?: number; items_updated?: number };
    setNote(
      kind === "clone"
        ? `Clone done: ${d.items_created ?? 0} dishes and ${d.categories_created ?? 0} categories copied (existing names were skipped, nothing was overwritten).`
        : `Sync done: prices and availability updated on ${d.items_updated ?? 0} matched dishes.`,
    );
  }

  if (others.length === 0) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <Building2 size={18} className="text-brand" /> Locations
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Run several branches from this menu. Clone it into another location once, then Sync to push
        price and availability changes there — each location keeps its own copy, so branch-specific
        prices are just edits on that location&apos;s menu. Needs this restaurant on Business.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <label className={labelCls} htmlFor="loc-target">Copy / sync into</label>
          <select id="loc-target" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button type="button" disabled={busy !== null || !target} onClick={() => run("clone")} className={btnPrimary}>
          {busy === "clone" ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />} Clone menu
        </button>
        <button type="button" disabled={busy !== null || !target} onClick={() => run("sync")} className={btnGhost}>
          {busy === "sync" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Sync prices
        </button>
      </div>
      {note && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{note}</p>}
    </Card>
  );
}
