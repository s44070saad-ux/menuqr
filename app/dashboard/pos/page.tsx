"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, Minus, MonitorSmartphone, Plus, Store, Trash2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { Category, ItemOption, ItemOptionGroup, MenuItem } from "@/lib/types";

interface GroupWithOptions extends ItemOptionGroup { options: ItemOption[] }
interface CartOption { id: string; group_name: string; option_name: string; price_delta: number }
interface Line { key: string; item: MenuItem; qty: number; options: CartOption[]; unitPrice: number }

function sellPrice(it: MenuItem): number {
  return it.discount_price != null && Number(it.discount_price) < Number(it.price) ? Number(it.discount_price) : Number(it.price);
}

export default function PosPage() {
  const { loading, restaurant } = useOwner();
  const [planSlug, setPlanSlug] = useState<string>("free");
  const [fetching, setFetching] = useState(true);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groupsByItem, setGroupsByItem] = useState<Map<string, GroupWithOptions[]>>(new Map());
  const [activeCat, setActiveCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [optItem, setOptItem] = useState<MenuItem | null>(null);
  const [optSel, setOptSel] = useState<Map<string, Set<string>>>(new Map());
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [table, setTable] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [markPaid, setMarkPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const planOk = planSlug === "pro" || planSlug === "business";
  const currency = restaurant?.currency ?? "PKR";

  const load = useCallback(async () => {
    if (!supabase || !restaurant) return;
    const [{ data: plan }, { data: its }, { data: cats }, { data: groups }] = await Promise.all([
      supabase.rpc("restaurant_plan_slug", { rid: restaurant.id }),
      supabase.from("menu_items").select("*").eq("restaurant_id", restaurant.id)
        .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("categories").select("*").eq("restaurant_id", restaurant.id).eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase.from("item_option_groups").select("*").eq("restaurant_id", restaurant.id)
        .order("display_order", { ascending: true }),
    ]);
    if (typeof plan === "string") setPlanSlug(plan);
    setItems((its as MenuItem[]) ?? []);
    setCategories((cats as Category[]) ?? []);
    const gs = (groups as ItemOptionGroup[]) ?? [];
    if (gs.length > 0) {
      const { data: opts } = await supabase.from("item_options").select("*")
        .in("group_id", gs.map((g) => g.id)).order("display_order", { ascending: true });
      const all = (opts as ItemOption[]) ?? [];
      const map = new Map<string, GroupWithOptions[]>();
      gs.forEach((g) => {
        const withOpts: GroupWithOptions = { ...g, options: all.filter((o) => o.group_id === g.id) };
        const arr = map.get(g.menu_item_id) ?? [];
        arr.push(withOpts);
        map.set(g.menu_item_id, arr);
      });
      setGroupsByItem(map);
    }
    setFetching(false);
  }, [restaurant]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(
    () => items.filter((i) => activeCat === "all" || i.category_id === activeCat),
    [items, activeCat],
  );
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

  function addLine(item: MenuItem, options: CartOption[]) {
    const unitPrice = sellPrice(item) + options.reduce((s, o) => s + o.price_delta, 0);
    const key = item.id + "|" + options.map((o) => o.id).sort().join(",");
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key, item, qty: 1, options, unitPrice }];
    });
  }

  function tapItem(item: MenuItem) {
    const groups = groupsByItem.get(item.id) ?? [];
    if (groups.length === 0) { addLine(item, []); return; }
    const initial = new Map<string, Set<string>>();
    groups.forEach((g) => {
      if (g.selection_type === "single" && g.is_required && g.options.length > 0) {
        initial.set(g.id, new Set([g.options[0].id]));
      } else {
        initial.set(g.id, new Set());
      }
    });
    setOptSel(initial);
    setOptItem(item);
  }

  function confirmOptions() {
    if (!optItem) return;
    const groups = groupsByItem.get(optItem.id) ?? [];
    for (const g of groups) {
      if (g.is_required && (optSel.get(g.id)?.size ?? 0) === 0) {
        setError(`Choose an option for “${g.name}”.`);
        return;
      }
    }
    const chosen: CartOption[] = [];
    groups.forEach((g) => {
      (optSel.get(g.id) ?? new Set<string>()).forEach((oid) => {
        const o = g.options.find((x) => x.id === oid);
        if (o) chosen.push({ id: o.id, group_name: g.name, option_name: o.name, price_delta: Number(o.price_delta) });
      });
    });
    addLine(optItem, chosen);
    setOptItem(null);
    setError(null);
  }

  async function placeOrder() {
    if (!supabase || !restaurant || lines.length === 0) return;
    setBusy(true); setError(null); setSuccess(null);
    const { data, error: err } = await supabase.rpc("place_staff_order", {
      p_restaurant_id: restaurant.id,
      p_order_type: orderType,
      p_table_number: orderType === "dine_in" ? table : "",
      p_customer_name: custName,
      p_customer_phone: custPhone,
      p_items: lines.map((l) => ({ item_id: l.item.id, quantity: l.qty, option_ids: l.options.map((o) => o.id) })),
      p_mark_paid: markPaid,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("PLAN_NOT_ALLOWED") ? "Counter ordering needs a Pro or Business plan."
        : err.message.includes("ITEM_NOT_FOUND") ? "One of the items no longer exists on the menu. Refresh and try again."
        : "Could not place the order. Please try again.",
      );
      return;
    }
    const res = data as { total_amount: number };
    setSuccess(`Order placed — ${formatPrice(Number(res.total_amount), currency)}. It is confirmed and already on the Kitchen screen.`);
    setLines([]);
    setTable(""); setCustName(""); setCustPhone("");
  }

  return (
    <DashboardShell title="Counter (POS)">
      {loading || fetching ? <Loading label="Loading counter…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="The counter belongs to a restaurant — create your restaurant profile first."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : !planOk ? (
        <Card>
          <p className="flex items-start gap-2 text-sm text-amber-800">
            <Lock size={16} className="mt-0.5 shrink-0" />
            Counter ordering is a Pro feature — it lets your staff take walk-in and phone orders that land straight on the Kitchen screen. Your current plan is {planSlug}; upgrade from the Subscription page.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setActiveCat("all")}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${activeCat === "all" ? "bg-ink text-white" : "bg-white text-slate-600 shadow-card"}`}>All</button>
                {categories.map((c) => (
                  <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${activeCat === c.id ? "bg-ink text-white" : "bg-white text-slate-600 shadow-card"}`}>{c.name}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {visibleItems.map((it) => (
                  <button key={it.id} type="button" disabled={!it.is_available} onClick={() => tapItem(it)}
                    className="rounded-2xl bg-white p-3 text-start shadow-card transition hover:ring-2 hover:ring-teal-600/40 disabled:opacity-45">
                    <span className="block truncate text-sm font-semibold text-ink">{it.name}</span>
                    <span className="mt-0.5 block text-sm font-bold text-teal-700">{formatPrice(sellPrice(it), currency)}</span>
                    {!it.is_available && <span className="text-xs font-medium text-red-500">Unavailable</span>}
                    {(groupsByItem.get(it.id) ?? []).length > 0 && <span className="block text-xs text-slate-400">Has options</span>}
                  </button>
                ))}
              </div>
              {visibleItems.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No items here yet.</p>}
            </div>

            <Card className="h-fit lg:sticky lg:top-4">
              <h2 className="flex items-center gap-2 font-heading text-base font-bold text-ink">
                <MonitorSmartphone size={18} className="text-brand" /> New counter order
              </h2>
              {lines.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Tap dishes to add them. The order goes straight to the Kitchen screen as confirmed.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {lines.map((l) => (
                    <li key={l.key} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{l.item.name}</p>
                        {l.options.length > 0 && <p className="truncate text-xs text-slate-400">{l.options.map((o) => o.option_name).join(", ")}</p>}
                        <p className="text-xs text-slate-500">{formatPrice(l.unitPrice, currency)}</p>
                      </div>
                      <button type="button" aria-label="Less" onClick={() => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, qty: Math.max(0, x.qty - 1) } : x)).filter((x) => x.qty > 0))} className="rounded-lg border border-slate-200 p-1.5"><Minus size={14} /></button>
                      <span className="w-5 text-center text-sm font-semibold">{l.qty}</span>
                      <button type="button" aria-label="More" onClick={() => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))} className="rounded-lg border border-slate-200 p-1.5"><Plus size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["dine_in", "takeaway"] as const).map((tp) => (
                  <button key={tp} type="button" onClick={() => setOrderType(tp)}
                    className={`min-h-[42px] rounded-xl px-3 py-2 text-sm font-semibold ${orderType === tp ? "bg-ink text-white" : "bg-slate-100 text-slate-600"}`}>
                    {tp === "dine_in" ? "Dine-in" : "Takeaway"}
                  </button>
                ))}
              </div>
              {orderType === "dine_in" && (
                <div className="mt-3">
                  <label className={labelCls} htmlFor="pos-table">Table number</label>
                  <input id="pos-table" className={inputCls} value={table} onChange={(e) => setTable(e.target.value)} placeholder="e.g. 4" />
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls} htmlFor="pos-name">Name (optional)</label>
                  <input id="pos-name" className={inputCls} value={custName} onChange={(e) => setCustName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pos-phone">Phone (optional)</label>
                  <input id="pos-phone" className={inputCls} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} inputMode="tel" />
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} className="h-4 w-4 accent-teal-700" />
                Already paid at the till
              </label>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="font-heading font-bold text-ink">Total (before any tax/service)</span>
                <span className="font-heading text-lg font-bold text-ink">{formatPrice(total, currency)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Tax and service charges from your Orders settings are added by the server — the saved total is the official one.</p>
              <button type="button" disabled={busy || lines.length === 0} onClick={placeOrder} className={`${btnPrimary} mt-3 w-full justify-center`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Place order
              </button>
              {lines.length > 0 && (
                <button type="button" onClick={() => setLines([])} className={`${btnGhost} mt-2 w-full justify-center`}>
                  <Trash2 size={15} /> Clear
                </button>
              )}
            </Card>
          </div>
        </div>
      )}

      {optItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-ink">{optItem.name}</h2>
              <button type="button" onClick={() => setOptItem(null)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><X size={20} /></button>
            </div>
            {(groupsByItem.get(optItem.id) ?? []).map((g) => (
              <div key={g.id} className="mb-4">
                <p className="text-sm font-semibold text-ink">{g.name} {g.is_required && <span className="text-xs font-medium text-red-500">Required</span>}</p>
                <div className="mt-2 space-y-1.5">
                  {g.options.map((o) => {
                    const selected = optSel.get(g.id)?.has(o.id) ?? false;
                    return (
                      <button key={o.id} type="button" disabled={!o.is_available}
                        onClick={() => setOptSel((prev) => {
                          const next = new Map(prev);
                          const set = new Set(next.get(g.id) ?? []);
                          if (g.selection_type === "single") { set.clear(); set.add(o.id); }
                          else if (set.has(o.id)) set.delete(o.id); else set.add(o.id);
                          next.set(g.id, set);
                          return next;
                        })}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${selected ? "border-teal-600 bg-teal-50 font-semibold" : "border-slate-200"} disabled:opacity-45`}>
                        <span>{o.name}</span>
                        <span>{Number(o.price_delta) > 0 ? `+${formatPrice(Number(o.price_delta), currency)}` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button type="button" onClick={confirmOptions} className={`${btnPrimary} w-full justify-center`}>Add to order</button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
