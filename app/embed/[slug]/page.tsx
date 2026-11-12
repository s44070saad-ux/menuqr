"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Clock, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { supabase, isSupabaseConfigured, SITE_URL } from "@/lib/supabaseClient";
import { formatPrice } from "@/lib/utils";
import { allergenLabel, dietaryLabel } from "@/lib/allergens";
import type { Category, MenuItem, Restaurant } from "@/lib/types";

/**
 * Phase 5 — "One menu everywhere": the embeddable widget.
 * A chrome-light, view-only rendering of the same live menu data,
 * meant to be iframed into the restaurant's own website:
 *   <iframe src="https://veloraqr.vercel.app/embed/<slug>" ...>
 * Price or availability changes in the dashboard show up here
 * automatically — it reads the same tables as the QR menu.
 * View-only by design (ordering stays on the full menu page, which
 * the header name links to).
 */
export default function EmbedMenuPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    (async () => {
      if (!supabase || !slug) { setLoading(false); return; }
      const { data: r } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      setRestaurant(r as Restaurant);
      const [{ data: cats }, { data: its }] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("menu_items").select("*").eq("restaurant_id", r.id)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      ]);
      setCategories((cats as Category[]) ?? []);
      setItems((its as MenuItem[]) ?? []);
      setLoading(false);
    })();
  }, [slug]);

  if (!isSupabaseConfigured || loading) {
    return <main className="mx-auto max-w-2xl animate-pulse px-4 py-8"><div className="h-24 rounded-2xl bg-slate-200" /><div className="mt-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}</div></main>;
  }
  if (!restaurant) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={32} />
        <p className="font-heading text-lg font-semibold text-ink">Menu not found</p>
      </main>
    );
  }

  const fullMenuUrl = `${SITE_URL}/menu/${restaurant.slug}`;
  const byCategory = new Map<string, MenuItem[]>();
  categories.forEach((c) => byCategory.set(c.id, []));
  items.forEach((it) => {
    const key = it.category_id && byCategory.has(it.category_id) ? it.category_id : "__none__";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(it);
  });
  const sections: { id: string; name: string | null; list: MenuItem[] }[] = [
    ...categories.map((c) => ({ id: c.id, name: c.name as string | null, list: byCategory.get(c.id) ?? [] })),
    { id: "__none__", name: null, list: byCategory.get("__none__") ?? [] },
  ].filter((s) => s.list.length > 0);

  return (
    <main className="mx-auto w-full max-w-2xl bg-white px-4 py-5 font-body text-ink">
      <header className="flex items-start gap-3">
        {restaurant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.logo_url} alt="" className="h-12 w-12 rounded-xl border border-black/5 object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 font-heading text-lg font-bold text-white">
            {restaurant.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <a href={fullMenuUrl} target="_blank" rel="noreferrer" className="font-heading text-xl font-bold leading-tight hover:underline">
            {restaurant.name}
          </a>
          {restaurant.description && <p className="mt-0.5 text-sm text-slate-500">{restaurant.description}</p>}
          <div className="mt-1.5 space-y-0.5 text-xs text-slate-500">
            {restaurant.address && <p className="flex items-center gap-1.5"><MapPin size={12} /> {restaurant.address}</p>}
            {restaurant.opening_hours && <p className="flex items-center gap-1.5"><Clock size={12} /> {restaurant.opening_hours}</p>}
            {restaurant.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {restaurant.phone}</p>}
          </div>
        </div>
      </header>

      {sections.map((s) => (
        <section key={s.id} className="mt-6">
          {s.name && <h2 className="font-heading text-base font-bold">{s.name}</h2>}
          <ul className="mt-2 divide-y divide-slate-100">
            {s.list.map((it) => {
              const price = it.discount_price != null && Number(it.discount_price) < Number(it.price) ? Number(it.discount_price) : Number(it.price);
              return (
                <li key={it.id} className={`flex gap-3 py-3 ${it.is_available ? "" : "opacity-55"}`}>
                  {it.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{it.name}</span>
                      {!it.is_available && <span className="text-xs font-semibold text-red-500">Currently unavailable</span>}
                    </p>
                    {it.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-slate-500">{it.description}</p>}
                    <p className="mt-1 flex flex-wrap gap-1">
                      {(it.dietary ?? []).map((d) => (
                        <span key={d} className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">{dietaryLabel(d)}</span>
                      ))}
                      {it.calories != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{it.calories} kcal</span>}
                    </p>
                    {(it.allergens ?? []).length > 0 && (
                      <p className="mt-0.5 text-[11px] text-slate-400">Contains: {(it.allergens ?? []).map((a) => allergenLabel(a)).join(", ")}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-right">
                    {Number(it.discount_price) > 0 && Number(it.discount_price) < Number(it.price) && (
                      <span className="block text-xs text-slate-400 line-through">{formatPrice(Number(it.price), restaurant.currency)}</span>
                    )}
                    <span className="font-heading font-bold">{formatPrice(price, restaurant.currency)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="mt-8 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
        <a href={fullMenuUrl} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 hover:underline">Open the full menu</a>
        {" · "}Powered by Velora
      </footer>
    </main>
  );
}
