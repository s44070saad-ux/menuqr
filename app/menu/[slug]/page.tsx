"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, MapPin, Phone, Clock, MessageCircle, Star, Moon, Sun, UtensilsCrossed,
  Plus, Minus, ShoppingBag, X, CheckCircle2, Clock3, ChefHat, Ban, ClipboardList,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { formatPrice } from "@/lib/utils";
import type { Category, CustomerOrder, MenuItem, Restaurant, RestaurantSettings } from "@/lib/types";

/**
 * PUBLIC digital menu — the flagship page.
 * - Works fully signed-out (Supabase anon role + RLS public policies).
 * - Analytics (fixed): a visit is recorded at most once per visitor per
 *   30 minutes (localStorage), the restaurant owner is never counted,
 *   and `source` separates a true QR scan (?src=qr, set by printed QR
 *   codes) from a direct/shared link visit. Table QRs also carry
 *   ?table=N, which attributes the visit AND pre-fills dine-in orders.
 * - Item views count at most once per item per page session.
 * - Ordering (Pro/Business only, enforced in the database by the
 *   place_customer_order RPC — prices are recomputed server-side):
 *   cart -> dine-in (table number) or takeaway (name + phone) ->
 *   order status polled live via get_customer_order (order_id + secret
 *   token), so the customer sees the owner's Confirm instantly while
 *   this page is open.
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
  const viewedItems = useRef<Set<string>>(new Set());
  const isOwnerRef = useRef(false);

  // URL params (read once): ?src=qr and ?table=N come from printed QRs.
  const [qrTable] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("table") : null);
  const [qrSource] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("src") : null);
  const [qrId, setQrId] = useState<string | null>(null);

  // Ordering state
  const [ordering, setOrdering] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">(qrTable ? "dine_in" : "takeaway");
  const [tableNumber, setTableNumber] = useState(qrTable ?? "");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [myOrder, setMyOrder] = useState<CustomerOrder | null>(null);
  const [myOrderCreds, setMyOrderCreds] = useState<{ id: string; token: string } | null>(null);

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

      // Is the signed-in viewer the owner? Owners are never analytics.
      try {
        const { data: u } = await supabase.auth.getUser();
        isOwnerRef.current = Boolean(u.user && u.user.id === r.owner_id);
      } catch { /* anon is the normal case */ }

      // ---------- Analytics: one visit per visitor per 30 minutes ----
      if (!scanRecorded.current && !isOwnerRef.current) {
        scanRecorded.current = true;
        try {
          const now = Date.now();
          const key = `menuqr_last_visit_${r.id}`;
          const last = Number(localStorage.getItem(key) ?? 0);
          if (!last || now - last > 30 * 60 * 1000) {
            localStorage.setItem(key, String(now));
            let visitorId = localStorage.getItem("menuqr_visitor");
            if (!visitorId) {
              visitorId = `${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
              localStorage.setItem("menuqr_visitor", visitorId);
            }
            // Resolve which QR code this was (public-read policy exists
            // for published restaurants); failure just means unattributed.
            let resolvedQrId: string | null = null;
            const qrQuery = supabase.from("qr_codes").select("id")
              .eq("restaurant_id", r.id).eq("is_active", true);
            const { data: qr } = qrTable
              ? await qrQuery.eq("kind", "table").eq("table_number", qrTable).limit(1).single()
              : await qrQuery.eq("kind", "main").limit(1).single();
            resolvedQrId = (qr as { id: string } | null)?.id ?? null;
            setQrId(resolvedQrId);
            await supabase.from("menu_scans").insert({
              restaurant_id: r.id,
              qr_code_id: resolvedQrId,
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
              source: qrSource === "qr" ? "qr" : "link",
              table_number: qrTable,
              visitor_id: visitorId,
            });
          }
        } catch { /* analytics must never break the menu */ }
      }

      // ---------- Ordering availability (server-side gate) -----------
      try {
        const { data: avail } = await supabase.rpc("ordering_available", { rid: r.id });
        if (!cancelled) setOrdering(Boolean(avail));
      } catch { if (!cancelled) setOrdering(false); }

      // ---------- Resume tracking a previously placed order ----------
      try {
        const saved = localStorage.getItem(`menuqr_order_${r.id}`);
        if (saved) {
          const creds = JSON.parse(saved) as { id: string; token: string };
          if (creds.id && creds.token) setMyOrderCreds(creds);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ---------- Live order status polling (customer "notification") ----
  const refreshMyOrder = useCallback(async () => {
    if (!supabase || !myOrderCreds) return;
    const { data } = await supabase.rpc("get_customer_order", {
      p_order_id: myOrderCreds.id, p_token: myOrderCreds.token,
    });
    if (data) {
      const ord = data as CustomerOrder;
      setMyOrder((prev) => {
        if (prev && prev.status !== ord.status && ord.status === "confirmed") {
          try { navigator.vibrate?.(200); } catch { /* no-op */ }
        }
        return ord;
      });
    }
  }, [myOrderCreds]);

  useEffect(() => {
    if (!myOrderCreds) return;
    refreshMyOrder();
    const t = setInterval(refreshMyOrder, 5000);
    return () => clearInterval(t);
  }, [myOrderCreds, refreshMyOrder]);

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

  const priceOf = (it: MenuItem) =>
    it.discount_price != null && Number(it.discount_price) < Number(it.price)
      ? Number(it.discount_price) : Number(it.price);

  const cartEntries = useMemo(
    () => Object.entries(cart).map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty })).filter((e) => e.item),
    [cart, items]);
  const cartCount = cartEntries.reduce((n, e) => n + e.qty, 0);
  const cartTotal = cartEntries.reduce((n, e) => n + priceOf(e.item) * e.qty, 0);

  function setQty(item: MenuItem, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[item.id]; else next[item.id] = Math.min(qty, 50);
      return next;
    });
  }

  async function onItemTap(item: MenuItem) {
    setExpandedId((cur) => (cur === item.id ? null : item.id));
    if (supabase && restaurant && !isOwnerRef.current && !viewedItems.current.has(item.id)) {
      viewedItems.current.add(item.id);
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

  async function placeOrder() {
    if (!supabase || !restaurant || placing) return;
    setOrderError(null);
    if (cartEntries.length === 0) { setOrderError("Your cart is empty."); return; }
    if (orderType === "dine_in" && !tableNumber.trim()) { setOrderError("Please enter your table number."); return; }
    if (orderType === "takeaway") {
      if (!custName.trim()) { setOrderError("Please enter your name for the takeaway order."); return; }
      if (custPhone.replace(/[^0-9]/g, "").length < 10) { setOrderError("Please enter a valid phone number (at least 10 digits) so the restaurant can reach you."); return; }
    }
    setPlacing(true);
    try {
      const { data, error } = await supabase.rpc("place_customer_order", {
        p_restaurant_id: restaurant.id,
        p_order_type: orderType,
        p_table_number: orderType === "dine_in" ? tableNumber.trim() : null,
        p_customer_name: custName.trim() || null,
        p_customer_phone: orderType === "takeaway" ? custPhone.trim() : (custPhone.trim() || null),
        p_note: note.trim() || null,
        p_qr_code_id: qrId,
        p_items: cartEntries.map((e) => ({ menu_item_id: e.item.id, quantity: e.qty })),
      });
      if (error) throw error;
      const res = data as { order_id: string; customer_token: string };
      const creds = { id: res.order_id, token: res.customer_token };
      try { localStorage.setItem(`menuqr_order_${restaurant.id}`, JSON.stringify(creds)); } catch { /* ignore */ }
      setMyOrderCreds(creds);
      setCart({});
      setNote("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not place the order.";
      if (msg.includes("ORDERING_NOT_AVAILABLE")) setOrderError("Ordering is not available for this restaurant right now.");
      else if (msg.includes("ITEM_UNAVAILABLE")) setOrderError("One of the items just became unavailable. Please review your cart and try again.");
      else if (msg.includes("TOO_MANY_ORDERS")) setOrderError("Too many orders in a short time. Please wait a few minutes or ask the staff for help.");
      else if (msg.includes("TABLE_REQUIRED")) setOrderError("Please enter your table number.");
      else if (msg.includes("PHONE_REQUIRED")) setOrderError("Please enter a valid phone number.");
      else if (msg.includes("NAME_REQUIRED")) setOrderError("Please enter your name.");
      else setOrderError("Could not place the order. Please try again or order at the counter.");
    } finally {
      setPlacing(false);
    }
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
  const cartBarVisible = ordering && cartCount > 0 && !sheetOpen;

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
              {qrTable && (
                <span className="mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: accent }}>
                  Table {qrTable}
                </span>
              )}
            </div>
          </div>
          <div className={`mt-3.5 space-y-1.5 text-[13px] ${dark ? "text-neutral-400" : "text-slate-500"}`}>
            {restaurant.address && <p className="flex items-center gap-2"><MapPin size={14} className="shrink-0" /> {restaurant.address}</p>}
            {restaurant.opening_hours && <p className="flex items-center gap-2"><Clock size={14} className="shrink-0" /> {restaurant.opening_hours}</p>}
            {restaurant.phone && <p className="flex items-center gap-2"><Phone size={14} className="shrink-0" /> {restaurant.phone}</p>}
          </div>
        </div>

        {/* Track-order banner */}
        {myOrderCreds && !sheetOpen && (
          <button type="button" onClick={() => setSheetOpen(true)}
            className={`mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-card ${dark ? "bg-neutral-900" : "bg-white"}`}>
            <ClipboardList size={20} style={{ color: accent }} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Your order</span>
              <span className={`block text-xs ${dark ? "text-neutral-400" : "text-slate-500"}`}>
                {myOrder ? statusLabel(myOrder.status) : "Tap to check its status"}
                {myOrder ? ` · ${formatPrice(Number(myOrder.total_amount), currency)}` : ""}
              </span>
            </span>
            <StatusDot status={myOrder?.status} />
          </button>
        )}

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
          <div className="pb-36 pt-2">
            {showFeatured && featured.length > 0 && (
              <section id="cat-featured" className="scroll-mt-20">
                <h2 className="mb-3 flex items-center gap-1.5 font-heading text-lg font-semibold">
                  <Star size={18} className="fill-amber-400 text-amber-400" /> Featured
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {featured.map((item) => (
                    <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark}
                      expanded={expandedId === item.id} featured onTap={() => onItemTap(item)}
                      ordering={ordering} qty={cart[item.id] ?? 0} onQty={(q) => setQty(item, q)} />
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
                        expanded={expandedId === item.id} onTap={() => onItemTap(item)}
                        ordering={ordering} qty={cart[item.id] ?? 0} onQty={(q) => setQty(item, q)} />
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
                      expanded={expandedId === item.id} onTap={() => onItemTap(item)}
                      ordering={ordering} qty={cart[item.id] ?? 0} onQty={(q) => setQty(item, q)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {settings?.footer_text && (
          <p className={`pb-36 text-center text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>{settings.footer_text}</p>
        )}
      </div>

      {/* Cart bar */}
      {cartBarVisible && (
        <button type="button" onClick={() => setSheetOpen(true)}
          className="fixed inset-x-4 bottom-5 z-40 mx-auto flex min-h-[56px] w-auto max-w-2xl items-center gap-3 rounded-2xl px-5 py-3 font-semibold text-white shadow-pop"
          style={{ background: accent }}>
          <ShoppingBag size={21} />
          <span className="flex-1 text-left">{cartCount} item{cartCount === 1 ? "" : "s"} · {formatPrice(cartTotal, currency)}</span>
          <span className="text-sm">View cart & order</span>
        </button>
      )}

      {/* WhatsApp floating button */}
      {whatsappEnabled && waNumber && !cartBarVisible && (
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
          className="fixed bottom-5 right-4 z-40 flex min-h-[52px] items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-white shadow-pop">
          <MessageCircle size={21} /> WhatsApp us
        </a>
      )}

      {/* Cart / checkout / order-status sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Your order">
          <button type="button" aria-label="Close" onClick={() => setSheetOpen(false)} className="absolute inset-0 h-full w-full bg-black/55" />
          <div className={`relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${dark ? "bg-neutral-900 text-white" : "bg-white text-ink"}`}>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="flex-1 font-heading text-lg font-semibold">
                {myOrderCreds && cartEntries.length === 0 ? "Your order" : "Your cart"}
              </h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close"
                className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
                <X size={19} />
              </button>
            </div>

            {/* Order status view */}
            {myOrderCreds && cartEntries.length === 0 ? (
              <div>
                {!myOrder ? (
                  <p className={`text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>Loading your order status…</p>
                ) : (
                  <div>
                    <div className={`rounded-2xl p-4 text-center ${myOrder.status === "confirmed" ? "bg-emerald-50 text-emerald-900" : myOrder.status === "cancelled" ? "bg-red-50 text-red-800" : myOrder.status === "completed" ? "bg-slate-100 text-slate-800" : "bg-amber-50 text-amber-900"}`}>
                      {myOrder.status === "pending" && <Clock3 size={30} className="mx-auto text-amber-500" />}
                      {myOrder.status === "confirmed" && <ChefHat size={30} className="mx-auto text-emerald-600" />}
                      {myOrder.status === "completed" && <CheckCircle2 size={30} className="mx-auto text-slate-500" />}
                      {myOrder.status === "cancelled" && <Ban size={30} className="mx-auto text-red-500" />}
                      <p className="mt-2 font-heading text-base font-bold">{statusLabel(myOrder.status)}</p>
                      <p className="mt-1 text-sm">
                        {myOrder.status === "pending" && "The restaurant has received your order. Keep this page open — it updates automatically when they confirm."}
                        {myOrder.status === "confirmed" && "Good news — the restaurant confirmed your order and is preparing it."}
                        {myOrder.status === "completed" && "This order is complete. Thank you!"}
                        {myOrder.status === "cancelled" && "The restaurant could not accept this order. Please speak to the staff or try again."}
                      </p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      {myOrder.items.map((oi, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="flex-1">{oi.item_name} <span className="text-slate-400">× {oi.quantity}</span></span>
                          <span className="font-medium">{formatPrice(Number(oi.subtotal), currency)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={`mt-3 flex items-center justify-between border-t pt-3 font-heading font-bold ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                      <span>Total {myOrder.order_type === "dine_in" && myOrder.table_number ? `· Table ${myOrder.table_number}` : myOrder.order_type === "takeaway" ? "· Takeaway" : ""}</span>
                      <span>{formatPrice(Number(myOrder.total_amount), currency)}</span>
                    </div>
                    <p className={`mt-3 text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>Pay at the counter. This page checks for updates every few seconds while it is open.</p>
                    {(myOrder.status === "completed" || myOrder.status === "cancelled") && (
                      <button type="button" className="mt-4 w-full rounded-xl border px-4 py-3 text-sm font-medium"
                        onClick={() => { setMyOrderCreds(null); setMyOrder(null); try { localStorage.removeItem(`menuqr_order_${restaurant.id}`); } catch { /* ignore */ } }}>
                        Start a new order
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Cart + checkout view */
              <div>
                {cartEntries.length === 0 ? (
                  <p className={`text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>Your cart is empty. Tap + on any dish to add it.</p>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {cartEntries.map(({ item, qty }) => (
                        <li key={item.id} className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="text-xs" style={{ color: accent }}>{formatPrice(priceOf(item), currency)}</p>
                          </div>
                          <QtyStepper qty={qty} accent={accent} dark={dark} onQty={(q) => setQty(item, q)} />
                        </li>
                      ))}
                    </ul>
                    <div className={`mt-4 flex items-center justify-between border-t pt-3 font-heading font-bold ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                      <span>Total</span><span>{formatPrice(cartTotal, currency)}</span>
                    </div>

                    {/* Order type */}
                    <div className={`mt-4 grid grid-cols-2 gap-2 rounded-2xl p-1.5 ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
                      {(["dine_in", "takeaway"] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setOrderType(t)}
                          className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-semibold ${orderType === t ? "text-white" : dark ? "text-neutral-300" : "text-slate-600"}`}
                          style={orderType === t ? { background: accent } : undefined}>
                          {t === "dine_in" ? "Dine-in (at table)" : "Takeaway"}
                        </button>
                      ))}
                    </div>

                    {orderType === "dine_in" ? (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="ord-table">Table number *</label>
                        <input id="ord-table" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} inputMode="numeric"
                          placeholder="e.g. 5" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-name1">Your name (optional)</label>
                        <input id="ord-name1" value={custName} onChange={(e) => setCustName(e.target.value)}
                          placeholder="Name" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                      </div>
                    ) : (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="ord-name2">Your name *</label>
                        <input id="ord-name2" value={custName} onChange={(e) => setCustName(e.target.value)}
                          placeholder="Name" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-phone">Phone number *</label>
                        <input id="ord-phone" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} inputMode="tel"
                          placeholder="03xx xxxxxxx" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <p className={`mt-1.5 text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>The restaurant uses this only to contact you about this order.</p>
                      </div>
                    )}

                    <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-note">Note (optional)</label>
                    <textarea id="ord-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      placeholder="e.g. Less spicy, extra raita…"
                      className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />

                    {orderError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{orderError}</p>}

                    <button type="button" onClick={placeOrder} disabled={placing}
                      className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50"
                      style={{ background: accent }}>
                      <ShoppingBag size={19} /> {placing ? "Placing order…" : `Place order · ${formatPrice(cartTotal, currency)}`}
                    </button>
                    <p className={`mt-2.5 text-center text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>No online payment — pay at the counter. The restaurant must confirm your order.</p>

                    {myOrderCreds && (
                      <button type="button" onClick={() => setCart({})} className="mt-3 w-full text-center text-sm font-medium underline">
                        Track my previous order instead
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "pending": return "Waiting for confirmation";
    case "confirmed": return "Confirmed — being prepared";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled by the restaurant";
    default: return "Order placed";
  }
}

function StatusDot({ status }: { status?: string | null }) {
  const color = status === "confirmed" ? "bg-emerald-500" : status === "cancelled" ? "bg-red-500"
    : status === "completed" ? "bg-slate-400" : "bg-amber-400";
  return <span className={`h-3 w-3 shrink-0 rounded-full ${color}`} />;
}

function QtyStepper({ qty, accent, dark, onQty }: { qty: number; accent: string; dark: boolean; onQty: (q: number) => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full p-1 ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
      <button type="button" aria-label="Decrease quantity" onClick={(e) => { e.stopPropagation(); onQty(qty - 1); }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
        <Minus size={15} />
      </button>
      <span className="w-6 text-center text-sm font-bold">{qty}</span>
      <button type="button" aria-label="Increase quantity" onClick={(e) => { e.stopPropagation(); onQty(qty + 1); }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm" style={{ background: accent }}>
        <Plus size={15} />
      </button>
    </span>
  );
}

function Shell({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-h-screen font-body ${dark ? "bg-neutral-950 text-white" : "bg-[#F6F7F9] text-ink"}`}>
      {children}
      <p className={`pb-6 text-center text-[11px] ${dark ? "text-neutral-600" : "text-slate-400"}`}>Powered by Velora</p>
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

function ItemCard({ item, currency, accent, dark, expanded, onTap, featured = false, ordering, qty, onQty }: {
  item: MenuItem; currency: string; accent: string; dark: boolean;
  expanded: boolean; onTap: () => void; featured?: boolean;
  ordering: boolean; qty: number; onQty: (q: number) => void;
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

  const addControl = ordering && item.is_available ? (
    qty > 0 ? (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <QtyStepper qty={qty} accent={accent} dark={dark} onQty={onQty} />
      </div>
    ) : (
      <button type="button" onClick={(e) => { e.stopPropagation(); onQty(1); }}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: accent }}>
        <Plus size={15} /> Add
      </button>
    )
  ) : null;

  if (featured) {
    return (
      <div onClick={onTap} role="button" tabIndex={0}
        className={`fade-up cursor-pointer overflow-hidden rounded-2xl text-left shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
        {item.image_url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="h-28 w-full object-cover" loading="lazy" />
          : <div className="flex h-28 w-full items-center justify-center" style={{ background: `${accent}22` }}><UtensilsCrossed size={26} style={{ color: accent }} /></div>}
        <div className="p-3">
          <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
          {expanded && item.description && <p className={`mt-1 text-xs leading-relaxed ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.description}</p>}
          <div className="mt-1.5">{priceBlock}</div>
          {!item.is_available && <span className="mt-1.5 inline-block rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Unavailable</span>}
          {addControl}
        </div>
      </div>
    );
  }

  return (
    <div onClick={onTap} role="button" tabIndex={0}
      className={`fade-up flex w-full cursor-pointer gap-3 rounded-2xl p-3 text-left shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
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
        {addControl}
      </div>
      {item.image_url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-[92px] w-[92px] shrink-0 rounded-xl object-cover" loading="lazy" />
        : <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}18` }}><UtensilsCrossed size={24} style={{ color: accent }} /></div>}
    </div>
  );
}
