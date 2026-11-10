"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ImageField from "@/components/ImageField";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const { loading, userId, restaurant } = useOwner();
  const [categories, setCategories] = useState<Category[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  async function load() {
    if (!supabase || !restaurant) { setFetching(false); return; }
    const { data, error: err } = await supabase.from("categories").select("*")
      .eq("restaurant_id", restaurant.id).order("display_order", { ascending: true }).order("created_at", { ascending: true });
    if (err) setError(err.message);
    setCategories((data as Category[]) ?? []);
    setFetching(false);
  }

  useEffect(() => { if (restaurant) load(); else if (!loading) setFetching(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [restaurant, loading]);

  function resetForm() { setEditing(null); setName(""); setImageUrl(""); setIsActive(true); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !restaurant || !name.trim()) return;
    setBusy(true); setError(null); setSuccess(null);
    const payload = { name: name.trim(), image_url: imageUrl.trim() || null, is_active: isActive };
    const { error: err } = editing
      ? await supabase.from("categories").update(payload).eq("id", editing.id)
      : await supabase.from("categories").insert({ ...payload, restaurant_id: restaurant.id, display_order: categories.length });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSuccess(editing ? "Category updated." : "Category added.");
    resetForm();
    load();
  }

  async function remove(cat: Category) {
    if (!supabase) return;
    if (!window.confirm(`Delete category "${cat.name}"? Items in it will become uncategorised, not deleted.`)) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", cat.id);
    if (err) { setError(err.message); return; }
    if (editing?.id === cat.id) resetForm();
    load();
  }

  async function move(cat: Category, dir: -1 | 1) {
    if (!supabase) return;
    const idx = categories.findIndex((c) => c.id === cat.id);
    const swap = categories[idx + dir];
    if (!swap) return;
    setError(null);
    const a = supabase.from("categories").update({ display_order: swap.display_order }).eq("id", cat.id);
    const b = supabase.from("categories").update({ display_order: cat.display_order }).eq("id", swap.id);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.error || rb.error) { setError((ra.error || rb.error)?.message ?? "Reorder failed."); return; }
    load();
  }

  return (
    <DashboardShell title="Categories">
      {loading || fetching ? <Loading label="Loading categories…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Categories belong to a restaurant — create your restaurant profile first."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />
          <Card>
            <h2 className="font-heading text-base font-semibold text-ink">{editing ? "Edit category" : "Add a category"}</h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <label className={labelCls} htmlFor="catname">Category name *</label>
                <input id="catname" className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Burgers, Pizza, Drinks, Desserts" />
              </div>
              <ImageField label="Category image (optional)" kind="category" value={imageUrl} onChange={setImageUrl} userId={userId} restaurantId={restaurant.id} />
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5 accent-teal-700" />
                Visible on the public menu
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {editing ? "Save changes" : "Add category"}
                </button>
                {editing && <button type="button" onClick={resetForm} className={btnGhost}>Cancel edit</button>}
              </div>
            </form>
          </Card>

          {categories.length === 0 ? (
            <EmptyState title="No categories yet" hint="Add your first category above — for example Burgers, Pizza or Drinks — then add dishes into it from Menu Items." />
          ) : (
            <div className="space-y-2">
              {categories.map((cat, i) => (
                <Card key={cat.id} className="flex items-center gap-3 !py-3">
                  {cat.image_url
                    ? // eslint-disable-next-line @next/next/no-img-element
                      <img src={cat.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-light/60 font-heading text-sm font-semibold text-brand-dark">{cat.name.charAt(0).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{cat.name}</p>
                    <p className="text-xs text-slate-500">{cat.is_active ? "Visible on menu" : "Hidden from menu"} · position {i + 1}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(cat, -1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={18} /></button>
                    <button type="button" aria-label="Move down" disabled={i === categories.length - 1} onClick={() => move(cat, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={18} /></button>
                    <button type="button" aria-label="Edit" onClick={() => { setEditing(cat); setName(cat.name); setImageUrl(cat.image_url ?? ""); setIsActive(cat.is_active); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Pencil size={18} /></button>
                    <button type="button" aria-label="Delete" onClick={() => remove(cat)} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={18} /></button>
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
