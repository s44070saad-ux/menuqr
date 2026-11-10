"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, MapPin, Phone, Clock, MessageCircle, Star, Moon, Sun, UtensilsCrossed,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { formatPrice } from "@/lib/utils";
import type { Category, MenuItem, Restaurant, RestaurantSettings } from "@/lib/types";

/**
 * PUBLIC digital menu — the flagship page.
 * - Works fully signed-out (Supabase anon role + RLS public policies).
 * - On load, records one row in `menu_scans` (a menu visit, not a sale).
 * - Tapping a dish records one row in `item_views` and expands the card.
 * - Only published restaurants resolve; drafts/suspended show a notice.
 * - Light/dark follows the restaurant's own theme setting.
 */
export default function PublicMenuPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const scanRecorded = useRef(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: rest } = await supabase.from("restaurants").select("*")
        .eq("slug", slug).eq("is_published", true).eq("status", "published").single();
      if (cancelled) return;
      if (!rest) { setNotFound(true); setLoading(false); return; }
      const r = rest as Restaurant;
      setRestaurant(r);
      setDark(r.theme === "dark");

      const [settingsRes, catsRes, itemsRes] = await Promise.all([
        supabase.from("restaurant_settings").select("*").eq("restaurant_id", r.id).single(),
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("menu_items").select("*").eq("restaurant_id", r.id)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const s = (settingsRes.data as RestaurantSettings) ?? null;
      setSettings(s);
      if (s) setDark(s.theme === "dark");
      setCategories((catsRes.data as Category[]) ?? []);
      setItems((itemsRes.data as MenuItem[]) ?? []);
      setLoading(false);

      // Record the scan exactly once per page load (StrictMode-safe).
      if (!scanRecorded.current) {
        scanRecorded.current = true;
        const { data: qr } = await supabase.from("qr_codes").select("id")
          .eq("restaurant_id", r.id).eq("is_active", true)
          .order("created_at", { ascending: true }).limit(1).single();
        await supabase.from("menu_scans").insert({
          restaurant_id: r.id,
          qr_code_id: qr?.id ?? null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const accent = settings?.primary_color || restaurant?.accent_color || "#0F766E";
  const showSearch = settings?.show_search ?? true;
  const showFeatured = settings?.show_featured ?? true;
  const whatsappEnabled = (settings?.enable_whatsapp ?? true) && restaurant?.whatsapp;

  const filtered = useMemo(() => items.filter((it) => {
    if (search && !(it.name + " " + (it.description ?? "")).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, search]);

  const featured = useMemo(() => filtered.filter((i) => i.is_featured), [filtered]);
  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    categories.forEach((c) => map.set(c.id, []));
    filtered.forEach((it) => {
      const key = it.category_id && map.has(it.category_id) ? it.category_id : "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return map;
  }, [filtered, categories]);

  async function onItemTap(item: MenuItem) {
    setExpandedId((cur) => (cur === item.id ? null : item.id));
    if (supabase && restaurant) {
      await supabase.from("item_views").insert({
        restaurant_id: restaurant.id, menu_item_id: item.id, category_id: item.category_id,
      });
    }
  }

  function scrollToCategory(id: string) {
    setActiveCat(id);
    if (id === "all") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- states ----------
  if (!isSupabaseConfigured) {
    return (
      <Shell dark={false}>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={36} />
          <h1 className="font-heading text-xl font-semibold">Menu unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">This menu service is not connected yet. Please check back shortly.</p>
        </div>
      </Shell>
    );
  }
  if (loading) {
    return (
      <Shell dark={false}>
        <div className="mx-auto max-w-md animate-pulse px-4 py-10">
          <div className="h-40 rounded-3xl bg-slate-200" />
          <div className="mx-auto mt-4 h-6 w-48 rounded bg-slate-200" />
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-200" />)}
          </div>
        </div>
      </Shell>
    );
  }
  if (notFound || !restaurant) {
    return (
      <Shell dark={false}>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={36} />
          <h1 className="font-heading text-xl font-semibold">Menu not found</h1>
          <p className="mt-2 text-sm text-slate-500">This restaurant menu is not published or the link is wrong. Please check the QR code and try again.</p>
        </div>
      </Shell>
    );
  }

  const waNumber = (restaurant.whatsapp ?? "").replace(/[^0-9]/g, "");
  const currency = restaurant.currency;

  return (
    <Shell dark={dark}>
      {/* Cover */}
      <div className="relative">
        {restaurant.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.cover_url} alt="" className="h-44 w-full object-cover sm:h-56" />
        ) : (
          <div className="h-32 w-full sm:h-40" style={{ background: `linear-gradient(135deg, ${accent}, #101828)` }} />
        )}
        <button type="button" onClick={() => setDark((d) => !d)} aria-label="Toggle theme"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4">
        {/* Header card */}
        <div className={`relative z-10 -mt-10 rounded-3xl p-5 shadow-pop ${dark ? "bg-neutral-900" : "bg-white"}`}>
          <div className="flex items-start gap-3.5">
            {restaurant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="h-16 w-16 shrink-0 rounded-2xl border border-black/5 object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-heading text-2xl font-bold text-white" style={{ background: accent }}>
                {restaurant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-heading text-[22px] font-bold leading-tight">{restaurant.name}</h1>
              {restaurant.description && <p className={`mt-0.5 text-sm leading-snug ${dark ? "text-neutral-400" : "text-slate-500"}`}>{restaurant.description}</p>}
            </div>
          </div>
          <div className={`mt-3.5 space-y-1.5 text-[13px] ${dark ? "text-neutral-400" : "text-slate-500"}`}>
            {restaurant.address && <p className="flex items-center gap-2"><MapPin size={14} className="shrink-0" /> {restaurant.address}</p>}
            {restaurant.opening_hours && <p className="flex items-center gap-2"><Clock size={14} className="shrink-0" /> {restaurant.opening_hours}</p>}
            {restaurant.phone && <p className="flex items-center gap-2"><Phone size={14} className="shrink-0" /> {restaurant.phone}</p>}
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="relative mt-4">
            <Search size={18} className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-neutral-500" : "text-slate-400"}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes…"
              className={`w-full rounded-2xl border py-3 pl-11 pr-4 text-[15px] shadow-card ${dark ? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-500" : "border-slate-200 bg-white placeholder:text-slate-400"}`} />
          </div>
        )}

        {/* Sticky category chips */}
        <div className={`sticky top-0 z-30 -mx-4 mt-4 px-4 py-2.5 backdrop-blur ${dark ? "bg-neutral-950/90" : "bg-[#F6F7F9]/90"}`}>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <Chip label="All" active={activeCat === "all"} accent={accent} dark={dark} onClick={() => scrollToCategory("all")} />
            {showFeatured && featured.length > 0 && (
              <Chip label="★ Featured" active={activeCat === "featured"} accent={accent} dark={dark} onClick={() => scrollToCategory("featured")} />
            )}
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} active={activeCat === c.id} accent={accent} dark={dark} onClick={() => scrollToCategory(c.id)} />
            ))}
          </div>
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <div className="py-14 text-center">
            <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={34} />
            <p className="font-heading font-medium">Menu coming soon</p>
            <p className={`mt-1 text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>This restaurant is still adding its dishes. Please check back shortly.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Search className="mx-auto mb-3 text-slate-300" size={34} />
            <p className="font-heading font-medium">No dishes match “{search}”</p>
            <p className={`mt-1 text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>Try a different search.</p>
          </div>
        ) : (
          <div className="pb-28 pt-2">
            {showFeatured && featured.length > 0 && (
              <section id="cat-featured" className="scroll-mt-20">
                <h2 className="mb-3 flex items-center gap-1.5 font-heading text-lg font-semibold">
                  <Star size={18} className="fill-amber-400 text-amber-400" /> Featured
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {featured.map((item) => (
                    <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark}
                      expanded={expandedId === item.id} featured onTap={() => onItemTap(item)} />
                  ))}
                </div>
              </section>
            )}

            {categories.map((cat) => {
              const list = byCategory.get(cat.id) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={cat.id} id={`cat-${cat.id}`} className="mt-8 scroll-mt-20">
                  <h2 className="mb-3 font-heading text-lg font-semibold">{cat.name}</h2>
                  <div className="space-y-3">
                    {list.map((item) => (
                      <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark}
                        expanded={expandedId === item.id} onTap={() => onItemTap(item)} />
                    ))}
                  </div>
                </section>
              );
            })}

            {(byCategory.get("__none__") ?? []).length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 font-heading text-lg font-semibold">More dishes</h2>
                <div className="space-y-3">
                  {(byCategory.get("__none__") ?? []).map((item) => (
                    <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark}
                      expanded={expandedId === item.id} onTap={() => onItemTap(item)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {settings?.footer_text && (
          <p className={`pb-28 text-center text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>{settings.footer_text}</p>
        )}
      </div>

      {/* WhatsApp floating button */}
      {whatsappEnabled && waNumber && (
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
          className="fixed bottom-5 right-4 z-40 flex min-h-[52px] items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-white shadow-pop">
          <MessageCircle size={21} /> WhatsApp us
        </a>
      )}
    </Shell>
  );
}

function Shell({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-h-screen font-body ${dark ? "bg-neutral-950 text-white" : "bg-[#F6F7F9] text-ink"}`}>
      {children}
      <p className={`pb-6 text-center text-[11px] ${dark ? "text-neutral-600" : "text-slate-400"}`}>Powered by MenuQR</p>
    </div>
  );
}

function Chip({ label, active, accent, dark, onClick }: { label: string; active: boolean; accent: string; dark: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-[40px] shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${active ? "text-white" : dark ? "bg-neutral-900 text-neutral-300" : "bg-white text-slate-600 shadow-card"}`}
      style={active ? { background: accent } : undefined}>
      {label}
    </button>
  );
}

function ItemCard({ item, currency, accent, dark, expanded, onTap, featured = false }: {
  item: MenuItem; currency: string; accent: string; dark: boolean;
  expanded: boolean; onTap: () => void; featured?: boolean;
}) {
  const hasDiscount = item.discount_price != null && Number(item.discount_price) < Number(item.price);
  const priceBlock = (
    <div className="flex items-baseline gap-1.5">
      <span className="font-heading text-[15px] font-bold" style={{ color: accent }}>
        {formatPrice(Number(hasDiscount ? item.discount_price : item.price), currency)}
      </span>
      {hasDiscount && <span className={`text-xs line-through ${dark ? "text-neutral-500" : "text-slate-400"}`}>{formatPrice(Number(item.price), currency)}</span>}
    </div>
  );

  if (featured) {
    return (
      <button type="button" onClick={onTap}
        className={`fade-up overflow-hidden rounded-2xl text-left shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
        {item.image_url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="h-28 w-full object-cover" loading="lazy" />
          : <div className="flex h-28 w-full items-center justify-center" style={{ background: `${accent}22` }}><UtensilsCrossed size={26} style={{ color: accent }} /></div>}
        <div className="p-3">
          <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
          {expanded && item.description && <p className={`mt-1 text-xs leading-relaxed ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.description}</p>}
          <div className="mt-1.5">{priceBlock}</div>
          {!item.is_available && <span className="mt-1.5 inline-block rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Unavailable</span>}
        </div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onTap}
      className={`fade-up flex w-full gap-3 rounded-2xl p-3 text-left shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug">
          {item.name}
          {item.is_featured && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />}
        </p>
        {item.description && (
          <p className={`mt-1 text-[13px] leading-relaxed ${expanded ? "" : "line-clamp-2"} ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.description}</p>
        )}
        <div className="mt-2">{priceBlock}</div>
        {!item.is_available && <span className="mt-1.5 inline-block rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Currently unavailable</span>}
      </div>
      {item.image_url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-[92px] w-[92px] shrink-0 rounded-xl object-cover" loading="lazy" />
        : <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}18` }}><UtensilsCrossed size={24} style={{ color: accent }} /></div>}
    </button>
  );
}
