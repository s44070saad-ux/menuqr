"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { Card, ErrorBox, SuccessBox, btnPrimary } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { fmtTime12 } from "@/lib/schedules";
import type { Category, MenuItem, PriceSchedule } from "@/lib/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Australia/Sydney", "UTC",
];

/**
 * Phase 2.4 — happy-hour price schedules + restaurant timezone.
 * Schedules are enforced server-side (place_customer_order applies the
 * best active discount and the DB only lets Pro/Business restaurants
 * write them); this card is the owner's editor. The public menu mirrors
 * the same rule for display via lib/schedules.ts.
 */
export default function SchedulesCard({
  restaurantId, categories, items,
}: {
  restaurantId: string;
  categories: Category[];
  items: MenuItem[];
}) {
  const [rows, setRows] = useState<PriceSchedule[]>([]);
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", days: [1, 2, 3, 4, 5] as number[], start: "17:00", end: "19:00",
    pct: "20", scope: "all", scopeId: "",
  });

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: sched }, { data: st }] = await Promise.all([
      supabase.from("price_schedules").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: true }),
      supabase.from("restaurant_settings").select("timezone").eq("restaurant_id", restaurantId).single(),
    ]);
    setRows((sched as PriceSchedule[]) ?? []);
    const tzz = (st as { timezone?: string } | null)?.timezone;
    if (tzz) setTimezone(tzz);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  async function saveTimezone(tz: string) {
    if (!supabase) return;
    setTimezone(tz); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ timezone: tz }).eq("restaurant_id", restaurantId);
    if (err) setError(err.message);
    else setSuccess("Timezone saved — availability windows and happy hours now follow it.");
  }

  async function addSchedule() {
    if (!supabase) return;
    const pct = parseFloat(form.pct);
    if (!form.name.trim()) { setError("Give the schedule a name, e.g. \"Happy hour\"."); return; }
    if (form.days.length === 0) { setError("Pick at least one day."); return; }
    if (!form.start || !form.end) { setError("Set a start and end time."); return; }
    if (Number.isNaN(pct) || pct <= 0 || pct > 90) { setError("Discount must be between 1% and 90%."); return; }
    if (form.scope !== "all" && !form.scopeId) { setError("Choose which category or dish this applies to."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("price_schedules").insert({
      restaurant_id: restaurantId,
      name: form.name.trim(),
      days: [...form.days].sort((a, b) => a - b),
      start_time: form.start, end_time: form.end,
      discount_percent: pct,
      category_id: form.scope === "category" ? form.scopeId : null,
      menu_item_id: form.scope === "item" ? form.scopeId : null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSuccess("Schedule added — the discount applies automatically during its window.");
    setForm((f) => ({ ...f, name: "" }));
    load();
  }

  async function toggleActive(row: PriceSchedule) {
    if (!supabase) return;
    const { error: err } = await supabase.from("price_schedules")
      .update({ is_active: !row.is_active }).eq("id", row.id);
    if (err) setError(err.message); else load();
  }

  async function remove(row: PriceSchedule) {
    if (!supabase) return;
    const { error: err } = await supabase.from("price_schedules").delete().eq("id", row.id);
    if (err) setError(err.message); else load();
  }

  const scopeLabel = (r: PriceSchedule) =>
    r.menu_item_id ? `Dish: ${items.find((i) => i.id === r.menu_item_id)?.name ?? "—"}`
      : r.category_id ? `Category: ${categories.find((c) => c.id === r.category_id)?.name ?? "—"}`
        : "Whole menu";

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <Card>
      <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
        <Clock3 size={17} className="text-brand" /> Happy-hour schedules & time-based pricing
      </p>
      <p className="mt-1 text-sm text-slate-500">
        During a schedule's window, its discount comes off automatically — on the guest menu and in the order total
        (the server applies it, never the guest's phone). If schedules overlap, the biggest discount wins. Discounts
        apply to dish prices, not to option add-ons.
      </p>
      <ErrorBox message={error} />
      <SuccessBox message={success} />

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls} htmlFor="tz-select">Restaurant timezone (windows & schedules use this)</label>
          <select id="tz-select" className={inputCls} value={timezone} onChange={(e) => saveTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="font-semibold text-ink">{r.name}</span>
              <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-bold text-teal-700">−{Number(r.discount_percent)}%</span>
              <span className="text-slate-500">{fmtTime12(r.start_time)} – {fmtTime12(r.end_time)}</span>
              <span className="text-slate-500">{(r.days ?? []).map((d) => DAY_LABELS[d]).join(" ")}</span>
              <span className="text-slate-500">· {scopeLabel(r)}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => toggleActive(r)} aria-label={r.is_active ? "Pause schedule" : "Activate schedule"}
                  className={`inline-flex min-h-[32px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {r.is_active ? "ON" : "OFF"}
                </button>
                <button type="button" onClick={() => remove(r)} aria-label="Delete schedule"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="sch-name">Schedule name</label>
          <input id="sch-name" className={inputCls} value={form.name} placeholder="e.g. Happy hour"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls} htmlFor="sch-pct">Discount % off</label>
          <input id="sch-pct" type="number" min="1" max="90" className={inputCls} value={form.pct}
            onChange={(e) => setForm((f) => ({ ...f, pct: e.target.value }))} />
        </div>
        <div>
          <span className={labelCls}>Days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, d) => (
              <button key={label} type="button" aria-pressed={form.days.includes(d)}
                onClick={() => setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }))}
                className={`min-h-[36px] rounded-full px-3 py-1.5 text-[13px] font-medium ${form.days.includes(d) ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="sch-start">From</label>
            <input id="sch-start" type="time" className={inputCls} value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} htmlFor="sch-end">To</label>
            <input id="sch-end" type="time" className={inputCls} value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="sch-scope">Applies to</label>
          <select id="sch-scope" className={inputCls} value={form.scope}
            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, scopeId: "" }))}>
            <option value="all">Whole menu</option>
            <option value="category">One category</option>
            <option value="item">One dish</option>
          </select>
        </div>
        {form.scope !== "all" && (
          <div>
            <label className={labelCls} htmlFor="sch-scope-id">{form.scope === "category" ? "Category" : "Dish"}</label>
            <select id="sch-scope-id" className={inputCls} value={form.scopeId}
              onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}>
              <option value="">Choose…</option>
              {(form.scope === "category" ? categories : items).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-end">
          <button type="button" onClick={addSchedule} disabled={busy} className={btnPrimary}>
            <Plus size={17} /> {busy ? "Adding…" : "Add schedule"}
          </button>
        </div>
      </div>
    </Card>
  );
}
