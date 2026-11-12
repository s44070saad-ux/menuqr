"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Download, FileText, Loader2, Pencil, Plus, Search, SlidersHorizontal, Star, Store, Trash2, Upload } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import SchedulesCard from "@/components/SchedulesCard";
import LanguagesCard from "@/components/LanguagesCard";
import ImageField from "@/components/ImageField";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { Category, ItemOption, ItemOptionGroup, MenuItem } from "@/lib/types";
import { ALLERGENS, DIETARY } from "@/lib/allergens";
import { menuCsvTemplate, menuRowsToCsv, parseMenuCsv, type MenuCsvRow } from "@/lib/menuCsv";
import { useRef } from "react";

interface GroupWithOptions extends ItemOptionGroup { options: ItemOption[] }

interface ItemForm {
  name: string; description: string; price: string; discount_price: string;
  category_id: string; image_url: string; is_available: boolean; is_featured: boolean;
  calories: string; allergens: string[]; dietary: string[];
  suggested: string[];
  avail_from: string; avail_to: string;
}
const EMPTY: ItemForm = { name: "", description: "", price: "", discount_price: "", category_id: "", image_url: "", is_available: true, is_featured: false, calories: "", allergens: [], dietary: [], suggested: [], avail_from: "", avail_to: "" };

export default function MenuItemsPage() {
  const { loading, userId, restaurant, subscription } = useOwner();
  const plan = subscription?.plan ?? null;
  const maxItems = plan?.max_items ?? null; // null = unlimited (Free plan sets 5 in the DB)

  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");

  async function load() {
    if (!supabase || !restaurant) { setFetching(false); return; }
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("restaurant_id", restaurant.id)
        .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("categories").select("*").eq("restaurant_id", restaurant.id)
        .order("display_order", { ascending: true }),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    setItems((itemsRes.data as MenuItem[]) ?? []);
    setCategories((catsRes.data as Category[]) ?? []);
    setFetching(false);
  }

  useEffect(() => { if (restaurant) load(); else if (!loading) setFetching(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [restaurant, loading]);

  const atLimit = !editing && maxItems !== null && items.length >= maxItems;

  const visible = useMemo(() => items.filter((it) => {
    if (filterCat && it.category_id !== filterCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, search, filterCat]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const toggleSuggested = (id: string) =>
    setForm((f) => ({ ...f, suggested: f.suggested.includes(id) ? f.suggested.filter((x) => x !== id) : (f.suggested.length >= 3 ? f.suggested : [...f.suggested, id]) }));
  const toggleArr = (field: "allergens" | "dietary", key: string) =>
    setForm((f) => ({ ...f, [field]: f[field].includes(key) ? f[field].filter((x) => x !== key) : [...f[field], key] }));
  const set = (k: keyof ItemForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function resetForm() { setEditing(null); setForm(EMPTY); }

  // ---------- Menu CSV import / export (Phase 1.3) -------------------
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  function downloadFile(name: string, text: string) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!restaurant) return;
    const rows: MenuCsvRow[] = items.map((it) => ({
      name: it.name,
      category: it.category_id ? (categories.find((c) => c.id === it.category_id)?.name ?? "") : "",
      description: it.description ?? "",
      price: Number(it.price),
      discount_price: it.discount_price == null ? null : Number(it.discount_price),
      is_available: it.is_available,
      is_featured: it.is_featured,
      calories: it.calories ?? null,
      allergens: it.allergens ?? [],
      dietary: it.dietary ?? [],
      display_order: it.display_order,
    }));
    downloadFile(`${restaurant.slug}-menu.csv`, menuRowsToCsv(rows));
  }

  async function importCsv(file: File) {
    if (!supabase || !restaurant) return;
    setImporting(true); setError(null); setSuccess(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseMenuCsv(text);
      if (rows.length === 0) {
        setError(errors[0] ?? "No importable rows found in that file.");
        return;
      }
      // Plan limit: count only NEW items (upsert by name).
      const existingByName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
      const newCount = rows.filter((r) => !existingByName.has(r.name.trim().toLowerCase())).length;
      if (maxItems !== null && items.length + newCount > maxItems) {
        setError(`This import would take you to ${items.length + newCount} items, over your ${plan?.name ?? "Free"} plan limit of ${maxItems}. Upgrade the plan or import fewer new dishes. Nothing was imported.`);
        return;
      }
      // Resolve categories by name, creating missing ones.
      const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const wantedCats = [...new Set(rows.map((r) => r.category.trim()).filter(Boolean))];
      for (const name of wantedCats) {
        if (catByName.has(name.toLowerCase())) continue;
        const { data, error: cErr } = await supabase.from("categories")
          .insert({ restaurant_id: restaurant.id, name, display_order: categories.length + wantedCats.indexOf(name) })
          .select("id").single();
        if (cErr || !data) { setError(`Could not create category "${name}": ${cErr?.message ?? "unknown error"}`); return; }
        catByName.set(name.toLowerCase(), data.id as string);
      }
      let added = 0; let updated = 0;
      for (const r of rows) {
        const payload = {
          name: r.name, description: r.description || null,
          price: r.price, discount_price: r.discount_price,
          category_id: r.category ? (catByName.get(r.category.trim().toLowerCase()) ?? null) : null,
          is_available: r.is_available, is_featured: r.is_featured,
          calories: r.calories, allergens: r.allergens, dietary: r.dietary,
          display_order: r.display_order,
        };
        const existing = existingByName.get(r.name.trim().toLowerCase());
        const { error: iErr } = existing
          ? await supabase.from("menu_items").update(payload).eq("id", existing.id)
          : await supabase.from("menu_items").insert({ ...payload, restaurant_id: restaurant.id });
        if (iErr) { errors.push(`"${r.name}": ${iErr.message}`); continue; }
        if (existing) updated++; else added++;
      }
      await load();
      setSuccess(`Import complete: ${added} dish${added === 1 ? "" : "es"} added, ${updated} updated. Your public menu is already showing the changes.`);
      if (errors.length > 0) {
        setError(`${errors.length} row${errors.length === 1 ? "" : "s"} skipped: ${errors.slice(0, 4).join(" ")}${errors.length > 4 ? " …" : ""}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !restaurant) return;
    if (atLimit) {
      setError(`Your ${plan?.name ?? "Free"} plan allows ${maxItems} menu items. Delete an item or ask the platform admin to upgrade your plan.`);
      return;
    }
    const price = parseFloat(form.price);
    if (!form.name.trim() || Number.isNaN(price) || price < 0) { setError("Give the item a name and a valid price (0 or more)."); return; }
    const discount = form.discount_price.trim() === "" ? null : parseFloat(form.discount_price);
    if (discount !== null && (Number.isNaN(discount) || discount < 0)) { setError("Discount price must be a valid number."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const calories = form.calories.trim() === "" ? null : parseInt(form.calories, 10);
    if (calories !== null && (Number.isNaN(calories) || calories < 0 || calories > 10000)) { setError("Calories must be a whole number between 0 and 10,000 — or leave it empty."); return; }
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      price, discount_price: discount,
      category_id: form.category_id || null,
      image_url: form.image_url.trim() || null,
      is_available: form.is_available, is_featured: form.is_featured,
      calories, allergens: form.allergens, dietary: form.dietary,
      suggested_item_ids: form.suggested,
      available_from: form.avail_from || null,
      available_to: form.avail_to || null,
    };
    const { error: err } = editing
      ? await supabase.from("menu_items").update(payload).eq("id", editing.id)
      : await supabase.from("menu_items").insert({ ...payload, restaurant_id: restaurant.id, display_order: items.length });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSuccess(editing ? "Item updated — live on your public menu." : "Item added — live on your public menu.");
    resetForm();
    load();
  }

  async function toggle(item: MenuItem, field: "is_available" | "is_featured") {
    if (!supabase) return;
    const { error: err } = await supabase.from("menu_items").update({ [field]: !item[field] }).eq("id", item.id);
    if (err) { setError(err.message); return; }
    load();
  }

  async function remove(item: MenuItem) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${item.name}" from your menu?`)) return;
    const { error: err } = await supabase.from("menu_items").delete().eq("id", item.id);
    if (err) { setError(err.message); return; }
    if (editing?.id === item.id) resetForm();
    load();
  }

  async function move(item: MenuItem, dir: -1 | 1) {
    if (!supabase) return;
    const idx = items.findIndex((i) => i.id === item.id);
    const swap = items[idx + dir];
    if (!swap) return;
    const [ra, rb] = await Promise.all([
      supabase.from("menu_items").update({ display_order: swap.display_order }).eq("id", item.id),
      supabase.from("menu_items").update({ display_order: item.display_order }).eq("id", swap.id),
    ]);
    if (ra.error || rb.error) { setError((ra.error || rb.error)?.message ?? "Reorder failed."); return; }
    load();
  }

  function startEdit(item: MenuItem) {
    setEditing(item);
    setForm({
      name: item.name, description: item.description ?? "", price: String(item.price),
      discount_price: item.discount_price == null ? "" : String(item.discount_price),
      category_id: item.category_id ?? "", image_url: item.image_url ?? "",
      is_available: item.is_available, is_featured: item.is_featured,
      calories: item.calories == null ? "" : String(item.calories),
      allergens: item.allergens ?? [], dietary: item.dietary ?? [],
      suggested: item.suggested_item_ids ?? [],
      avail_from: item.available_from ? item.available_from.slice(0, 5) : "",
      avail_to: item.available_to ? item.available_to.slice(0, 5) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Variations & add-ons (option groups) -------------------
  const [optFor, setOptFor] = useState<MenuItem | null>(null);
  const [optGroups, setOptGroups] = useState<GroupWithOptions[]>([]);
  const [optLoading, setOptLoading] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", selection_type: "single" as "single" | "multi", is_required: false });
  const [optionForms, setOptionForms] = useState<Record<string, { name: string; price: string }>>({});

  async function loadOptions(item: MenuItem) {
    if (!supabase) return;
    setOptLoading(true);
    const { data: groups, error: gErr } = await supabase.from("item_option_groups")
      .select("*").eq("menu_item_id", item.id)
      .order("display_order", { ascending: true }).order("created_at", { ascending: true });
    if (gErr) { setError(gErr.message); setOptLoading(false); return; }
    const gs = (groups as ItemOptionGroup[]) ?? [];
    let all: ItemOption[] = [];
    if (gs.length > 0) {
      const { data: opts } = await supabase.from("item_options")
        .select("*").in("group_id", gs.map((g) => g.id))
        .order("display_order", { ascending: true }).order("created_at", { ascending: true });
      all = (opts as ItemOption[]) ?? [];
    }
    setOptGroups(gs.map((g) => ({ ...g, options: all.filter((o) => o.group_id === g.id) })));
    setOptLoading(false);
  }

  function toggleOptionsPanel(item: MenuItem) {
    if (optFor?.id === item.id) { setOptFor(null); return; }
    setOptFor(item);
    setGroupForm({ name: "", selection_type: "single", is_required: false });
    loadOptions(item);
  }

  async function addGroup() {
    if (!supabase || !restaurant || !optFor) return;
    if (!groupForm.name.trim()) { setError("Give the option group a name, e.g. Size or Extras."); return; }
    setError(null);
    const { error: err } = await supabase.from("item_option_groups").insert({
      restaurant_id: restaurant.id, menu_item_id: optFor.id,
      name: groupForm.name.trim(), selection_type: groupForm.selection_type,
      is_required: groupForm.is_required, display_order: optGroups.length,
    });
    if (err) { setError(err.message); return; }
    setGroupForm({ name: "", selection_type: "single", is_required: false });
    loadOptions(optFor);
  }

  async function updateGroup(group: GroupWithOptions, patch: Partial<ItemOptionGroup>) {
    if (!supabase || !optFor) return;
    const { error: err } = await supabase.from("item_option_groups").update(patch).eq("id", group.id);
    if (err) { setError(err.message); return; }
    loadOptions(optFor);
  }

  async function deleteGroup(group: GroupWithOptions) {
    if (!supabase || !optFor) return;
    if (!window.confirm(`Delete the "${group.name}" group and all its options?`)) return;
    const { error: err } = await supabase.from("item_option_groups").delete().eq("id", group.id);
    if (err) { setError(err.message); return; }
    loadOptions(optFor);
  }

  async function addOption(group: GroupWithOptions) {
    if (!supabase || !restaurant || !optFor) return;
    const f = optionForms[group.id] ?? { name: "", price: "" };
    if (!f.name.trim()) { setError("Give the option a name, e.g. Large or Extra cheese."); return; }
    const delta = f.price.trim() === "" ? 0 : parseFloat(f.price);
    if (Number.isNaN(delta) || delta < 0) { setError("Extra price must be 0 or more."); return; }
    setError(null);
    const { error: err } = await supabase.from("item_options").insert({
      restaurant_id: restaurant.id, group_id: group.id,
      name: f.name.trim(), price_delta: delta, display_order: group.options.length,
    });
    if (err) { setError(err.message); return; }
    setOptionForms((m) => ({ ...m, [group.id]: { name: "", price: "" } }));
    loadOptions(optFor);
  }

  async function deleteOption(group: GroupWithOptions, opt: ItemOption) {
    if (!supabase || !optFor) return;
    const { error: err } = await supabase.from("item_options").delete().eq("id", opt.id);
    if (err) { setError(err.message); return; }
    loadOptions(optFor);
  }

  async function toggleOptionAvail(group: GroupWithOptions, opt: ItemOption) {
    if (!supabase || !optFor) return;
    const { error: err } = await supabase.from("item_options").update({ is_available: !opt.is_available }).eq("id", opt.id);
    if (err) { setError(err.message); return; }
    loadOptions(optFor);
  }

  return (
    <DashboardShell title="Menu Items">
      {loading || fetching ? <Loading label="Loading menu items…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Menu items belong to a restaurant — create your restaurant profile first."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          <Card className="flex flex-wrap items-center gap-2 !py-3">
            <span className="font-heading text-sm font-semibold text-ink">Menu file (CSV)</span>
            <span className="min-w-40 flex-1 text-xs leading-snug text-slate-500">
              Export your menu, edit it in Excel or Google Sheets, and import it back — or import a whole new menu at once. Importing updates dishes with the same name and adds new ones.
            </span>
            <button type="button" onClick={exportCsv} className={btnGhost}><Download size={16} /> Export CSV</button>
            <button type="button" onClick={() => downloadFile("velora-menu-template.csv", menuCsvTemplate())} className={btnGhost}><FileText size={16} /> Template</button>
            <button type="button" disabled={importing} onClick={() => fileRef.current?.click()} className={btnPrimary}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); }} />
          </Card>

          <LanguagesCard restaurantId={restaurant.id} itemCount={items.length} />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 shadow-card">
              {items.length} item{items.length === 1 ? "" : "s"}
              {maxItems !== null ? ` of ${maxItems} on the ${plan?.name ?? "Free"} plan` : " · unlimited plan"}
            </span>
            {atLimit && <span className="rounded-full bg-amber-100 px-3 py-1.5 font-medium text-amber-800">Plan limit reached — upgrade to add more</span>}
          </div>

          <Card>
            <h2 className="font-heading text-base font-semibold text-ink">{editing ? "Edit item" : "Add a menu item"}</h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="iname">Item name *</label>
                  <input id="iname" className={inputCls} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Zinger Burger" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="icat">Category</label>
                  <select id="icat" className={inputCls} value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                    <option value="">Uncategorised</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {categories.length === 0 && <p className="mt-1 text-xs text-slate-500">No categories yet — <Link href="/dashboard/categories" className="text-brand underline">create one first</Link> for a tidy menu.</p>}
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="idesc">Description</label>
                <textarea id="idesc" className={inputCls} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Crispy fried chicken, signature sauce, fresh bun…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="iprice">Price ({restaurant.currency}) *</label>
                  <input id="iprice" type="number" min="0" step="0.01" className={inputCls} required value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="450" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="idisc">Discount price (optional)</label>
                  <input id="idisc" type="number" min="0" step="0.01" className={inputCls} value={form.discount_price} onChange={(e) => set("discount_price", e.target.value)} placeholder="e.g. 380" />
                </div>
              </div>
              <ImageField label="Food photo" kind="item" value={form.image_url} onChange={(v) => set("image_url", v)} userId={userId} restaurantId={restaurant.id} />
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={form.is_available} onChange={(e) => set("is_available", e.target.checked)} className="h-5 w-5 accent-teal-700" /> Available
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="h-5 w-5 accent-teal-700" /> Featured (shown in the Featured section)
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="text-sm font-semibold text-ink">Dietary, allergens & calories</p>
                <p className="mt-0.5 text-xs text-slate-500">Shown on your public menu. Guests can filter by dietary need and hide dishes containing an allergen. Allergens follow the EU list of 14 — tick everything the dish contains.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div>
                    <label className={labelCls} htmlFor="ical">Calories (kcal)</label>
                    <input id="ical" type="number" min="0" max="10000" step="1" className={inputCls} value={form.calories}
                      onChange={(e) => set("calories", e.target.value)} placeholder="e.g. 520" />
                  </div>
                  <div>
                    <span className={labelCls}>Dietary flags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DIETARY.map((d) => (
                        <button key={d.key} type="button" onClick={() => toggleArr("dietary", d.key)} aria-pressed={form.dietary.includes(d.key)}
                          className={`min-h-[36px] rounded-full px-3 py-1.5 text-[13px] font-medium ${form.dietary.includes(d.key) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <span className={labelCls}>Contains these allergens</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGENS.map((a) => (
                      <button key={a.key} type="button" onClick={() => toggleArr("allergens", a.key)} aria-pressed={form.allergens.includes(a.key)}
                        className={`min-h-[36px] rounded-full px-3 py-1.5 text-[13px] font-medium ${form.allergens.includes(a.key) ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="text-sm font-semibold text-ink">Availability window (optional)</p>
                <p className="mt-0.5 text-xs text-slate-500">Show and sell this dish only between these times, restaurant-local — e.g. a breakfast dish from 8:00 AM to 12:00 PM. Outside the window it appears as unavailable and cannot be ordered. Leave both empty for all day. A window past midnight (22:00 – 02:00) works too.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="av-from">Available from</label>
                    <input id="av-from" type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" value={form.avail_from}
                      onChange={(e) => set("avail_from", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="av-to">Until</label>
                    <input id="av-to" type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" value={form.avail_to}
                      onChange={(e) => set("avail_to", e.target.value)} />
                  </div>
                </div>
                {(form.avail_from && !form.avail_to) || (!form.avail_from && form.avail_to) ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">Set both times (or clear both) — a single time is ignored.</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="text-sm font-semibold text-ink">Pairs well with (upselling)</p>
                <p className="mt-0.5 text-xs text-slate-500">Pick up to 3 items to suggest when a guest views or orders this dish — they appear in the dish options and in the cart with one-tap add. Suggestions show on Pro and Business plans.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {items.filter((x) => x.id !== editing?.id).map((x) => (
                    <button key={x.id} type="button" onClick={() => toggleSuggested(x.id)} aria-pressed={form.suggested.includes(x.id)}
                      className={`min-h-[36px] rounded-full px-3 py-1.5 text-[13px] font-medium ${form.suggested.includes(x.id) ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {x.name}
                    </button>
                  ))}
                  {items.length <= 1 && <span className="text-xs text-slate-400">Add more items first — suggestions need other dishes to point to.</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy || atLimit} className={btnPrimary}>
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {editing ? "Save changes" : "Add item"}
                </button>
                {editing && <button type="button" onClick={resetForm} className={btnGhost}>Cancel edit</button>}
              </div>
              {atLimit && <p className="text-sm text-amber-700">You have reached the {maxItems}-item limit of the {plan?.name ?? "Free"} plan. Paid plans are activated manually by the platform admin — see Subscription.</p>}
            </form>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} !pl-10`} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={`${inputCls} sm:w-56`} value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {items.length === 0 ? (
            <EmptyState title="No menu items yet" hint="Add your first dish above. It appears on your public menu and QR page instantly." />
          ) : visible.length === 0 ? (
            <EmptyState title="Nothing matches" hint="No items match your search/filter. Clear them to see the full menu." />
          ) : (
            <div className="space-y-2">
              {visible.map((item) => {
                const idx = items.findIndex((i) => i.id === item.id);
                return (
                  <div key={item.id} className="space-y-2">
                  <Card className={`flex items-center gap-3 !py-3 ${item.is_available ? "" : "opacity-70"}`}>
                    {item.image_url
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-heading text-sm font-semibold text-slate-500">{item.name.charAt(0).toUpperCase()}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                        {item.name}
                        {item.is_featured && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {catName(item.category_id)} · {item.discount_price != null
                          ? <><span className="font-semibold text-brand-dark">{formatPrice(Number(item.discount_price), restaurant.currency)}</span> <span className="line-through">{formatPrice(Number(item.price), restaurant.currency)}</span></>
                          : formatPrice(Number(item.price), restaurant.currency)}
                        {" "}· {item.is_available ? "Available" : "Unavailable"}
                        {item.available_from && item.available_to && (
                          <> · {item.available_from.slice(0, 5)}–{item.available_to.slice(0, 5)} only</>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => move(item, -1)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={17} /></button>
                      <button type="button" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => move(item, 1)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={17} /></button>
                      <button type="button" aria-label={item.is_available ? "Mark unavailable" : "Mark available"} onClick={() => toggle(item, "is_available")}
                        className={`mx-1 inline-flex min-h-[36px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {item.is_available ? "ON" : "OFF"}
                      </button>
                      <button type="button" aria-label="Variations and add-ons" title="Variations & add-ons" onClick={() => toggleOptionsPanel(item)}
                        className={`flex h-10 w-9 items-center justify-center rounded-lg hover:bg-slate-100 ${optFor?.id === item.id ? "text-brand" : "text-slate-500"}`}><SlidersHorizontal size={17} /></button>
                      <button type="button" aria-label="Edit" onClick={() => startEdit(item)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Pencil size={17} /></button>
                      <button type="button" aria-label="Delete" onClick={() => remove(item)} className="flex h-10 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={17} /></button>
                    </div>
                  </Card>
                  {optFor?.id === item.id && (
                    <Card className="!py-4">
                      <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
                        <SlidersHorizontal size={16} className="text-brand" /> Variations & add-ons for “{item.name}”
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Groups like <strong>Size</strong> (customer picks one) or <strong>Extras</strong> (customer picks any).
                        Customers see these when ordering — a Pro feature. Prices are always rechecked by the server at order time.
                      </p>

                      {optLoading ? (
                        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading options…</p>
                      ) : (
                        <>
                          {optGroups.length === 0 && (
                            <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-400">
                              No option groups yet. Add your first group below — e.g. “Size”.
                            </p>
                          )}
                          <div className="mt-3 space-y-4">
                            {optGroups.map((g) => (
                              <div key={g.id} className="rounded-2xl border border-slate-200 p-3.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-heading text-sm font-bold text-ink">{g.name}</p>
                                  <select value={g.selection_type} aria-label="Selection type"
                                    onChange={(e) => updateGroup(g, { selection_type: e.target.value as "single" | "multi" })}
                                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                                    <option value="single">Pick one</option>
                                    <option value="multi">Pick any</option>
                                  </select>
                                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                                    <input type="checkbox" checked={g.is_required} onChange={(e) => updateGroup(g, { is_required: e.target.checked })} className="h-4 w-4 accent-teal-700" />
                                    Required
                                  </label>
                                  <button type="button" onClick={() => deleteGroup(g)}
                                    className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600">
                                    <Trash2 size={13} /> Group
                                  </button>
                                </div>

                                <ul className="mt-2.5 space-y-1.5">
                                  {g.options.map((o) => (
                                    <li key={o.id} className={`flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ${o.is_available ? "" : "opacity-55"}`}>
                                      <span className="flex-1 font-medium text-slate-700">{o.name}</span>
                                      <span className="text-xs text-slate-500">
                                        {Number(o.price_delta) > 0 ? `+ ${formatPrice(Number(o.price_delta), restaurant.currency)}` : "Included"}
                                      </span>
                                      <button type="button" onClick={() => toggleOptionAvail(g, o)}
                                        className={`inline-flex min-h-[28px] items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                                        {o.is_available ? "ON" : "OFF"}
                                      </button>
                                      <button type="button" aria-label={`Delete option ${o.name}`} onClick={() => deleteOption(g, o)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                                    </li>
                                  ))}
                                  {g.options.length === 0 && <li className="text-xs text-slate-400">No options in this group yet.</li>}
                                </ul>

                                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                                  <input value={(optionForms[g.id] ?? { name: "", price: "" }).name}
                                    onChange={(e) => setOptionForms((m) => ({ ...m, [g.id]: { name: e.target.value, price: (m[g.id] ?? { price: "" }).price } }))}
                                    placeholder="Option name, e.g. Large" className={`${inputCls} !py-2 text-sm`} />
                                  <input value={(optionForms[g.id] ?? { name: "", price: "" }).price} inputMode="decimal"
                                    onChange={(e) => setOptionForms((m) => ({ ...m, [g.id]: { name: (m[g.id] ?? { name: "" }).name, price: e.target.value } }))}
                                    placeholder="Extra price (0 = free)" className={`${inputCls} !py-2 text-sm sm:w-48`} />
                                  <button type="button" onClick={() => addOption(g)} className={`${btnPrimary} shrink-0 !py-2 text-sm`}>
                                    <Plus size={15} /> Add option
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 rounded-2xl bg-slate-50 p-3.5">
                            <p className="text-sm font-semibold text-ink">Add a group</p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Group name, e.g. Size" className={`${inputCls} !py-2 text-sm`} />
                              <select value={groupForm.selection_type} aria-label="New group selection type"
                                onChange={(e) => setGroupForm((f) => ({ ...f, selection_type: e.target.value as "single" | "multi" }))}
                                className={`${inputCls} !py-2 text-sm sm:w-40`}>
                                <option value="single">Pick one</option>
                                <option value="multi">Pick any</option>
                              </select>
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
                                <input type="checkbox" checked={groupForm.is_required} onChange={(e) => setGroupForm((f) => ({ ...f, is_required: e.target.checked }))} className="h-4 w-4 accent-teal-700" />
                                Required
                              </label>
                              <button type="button" onClick={addGroup} className={`${btnPrimary} shrink-0 !py-2 text-sm`}>
                                <Plus size={15} /> Add group
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </Card>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {restaurant && (plan?.slug === "pro" || plan?.slug === "business") && (
        <div className="mt-4">
          <SchedulesCard restaurantId={restaurant.id} categories={categories} items={items} />
        </div>
      )}
    </DashboardShell>
  );
}
