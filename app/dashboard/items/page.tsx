"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Search, Star, Store, Trash2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ImageField from "@/components/ImageField";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { formatPrice } from "@/lib/utils";
import type { Category, MenuItem } from "@/lib/types";

interface ItemForm {
  name: string; description: string; price: string; discount_price: string;
  category_id: string; image_url: string; is_available: boolean; is_featured: boolean;
}
const EMPTY: ItemForm = { name: "", description: "", price: "", discount_price: "", category_id: "", image_url: "", is_available: true, is_featured: false };

export default function MenuItemsPage() {
  const { loading, userId, restaurant, subscription } = useOwner();
  const plan = subscription?.plan ?? null;
  const maxItems = plan?.max_items ?? null; // null = unlimited (FREE default plan sets 15 in schema)

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
  const set = (k: keyof ItemForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function resetForm() { setEditing(null); setForm(EMPTY); }

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
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      price, discount_price: discount,
      category_id: form.category_id || null,
      image_url: form.image_url.trim() || null,
      is_available: form.is_available, is_featured: form.is_featured,
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
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
                  <Card key={item.id} className={`flex items-center gap-3 !py-3 ${item.is_available ? "" : "opacity-70"}`}>
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
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => move(item, -1)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={17} /></button>
                      <button type="button" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => move(item, 1)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={17} /></button>
                      <button type="button" aria-label={item.is_available ? "Mark unavailable" : "Mark available"} onClick={() => toggle(item, "is_available")}
                        className={`mx-1 inline-flex min-h-[36px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {item.is_available ? "ON" : "OFF"}
                      </button>
                      <button type="button" aria-label="Edit" onClick={() => startEdit(item)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Pencil size={17} /></button>
                      <button type="button" aria-label="Delete" onClick={() => remove(item)} className="flex h-10 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={17} /></button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
