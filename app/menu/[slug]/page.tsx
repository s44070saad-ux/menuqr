"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, MapPin, Phone, Clock, MessageCircle, Star, Moon, Sun, UtensilsCrossed,
  Plus, Minus, ShoppingBag, X, CheckCircle2, Clock3, ChefHat, Ban, ClipboardList, Check, Type,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { formatPrice } from "@/lib/utils";
import type {
  Category, CustomerOrder, ItemOption, ItemOptionGroup, MenuItem, Restaurant, RestaurantSettings,
} from "@/lib/types";
import { ALLERGENS, DIETARY, allergenLabel, dietaryLabel } from "@/lib/allergens";

/**
 * PUBLIC digital menu — the flagship page.
 * - Works fully signed-out (Supabase anon role + RLS public policies).
 * - Analytics: one visit per visitor per 30 minutes (localStorage),
 *   owner never counted, `source` separates QR scans (?src=qr) from
 *   link visits; table QRs (?table=N) attribute the visit and
 *   pre-fill dine-in orders.
 * - Ordering (Pro/Business, enforced in the DB by place_customer_order;
 *   prices incl. option deltas are recomputed server-side): cart lines
 *   may carry variations/add-ons chosen in the options sheet; status is
 *   polled via get_customer_order (order_id + secret token).
 * - Privacy/GDPR: this page loads NO third-party trackers and sets NO
 *   cookies; visit analytics are first-party rows counted from a
 *   localStorage timestamp only. Accessibility: big-text toggle
 *   (root font-size), aria labels/live regions, keyboard-operable cards.
 * - Menu themes (Starter+): classic / midnight / fresh / royal from
 *   restaurant_settings.menu_theme; Free restaurants always render
 *   classic. EN/Urdu chrome toggle; dish text stays owner-entered.
 */

type Lang = "en" | "ur";

const STR: Record<Lang, Record<string, string>> = {
  en: {
    search: "Search dishes…", all: "All", featured: "Featured", moreDishes: "More dishes",
    menuSoon: "Menu coming soon", menuSoonHint: "This restaurant is still adding its dishes. Please check back shortly.",
    noMatch: "No dishes match your search", noMatchHint: "Try a different search.",
    add: "Add", unavailable: "Currently unavailable", unavailableShort: "Unavailable", inCart: "in cart",
    viewCart: "View cart & order", item: "item", items: "items",
    yourCart: "Your cart", yourOrder: "Your order",
    cartEmpty: "Your cart is empty. Tap + on any dish to add it.",
    total: "Total", subtotal: "Subtotal", tax: "Tax", serviceCharge: "Service charge", minOrderMsg: "Minimum order {min} — add {more} more to order.",
    dineIn: "Dine-in (at table)", takeaway: "Takeaway",
    tableNumber: "Table number", yourName: "Your name", yourNameOpt: "Your name (optional)",
    namePh: "Name", phone: "Phone number", phoneHint: "The restaurant uses this only to contact you about this order.",
    note: "Note (optional)", notePh: "e.g. Less spicy, extra raita…",
    placeOrder: "Place order", placing: "Placing order…",
    payNote: "No online payment — pay at the counter. The restaurant must confirm your order.",
    trackPrev: "Track my previous order instead", table: "Table", whatsappUs: "WhatsApp us",
    payCounter: "Pay at the counter. This page checks for updates every few seconds while it is open.",
    newOrder: "Start a new order", loadingStatus: "Loading your order status…", tapStatus: "Tap to check its status",
    notifyWa: "Send order to restaurant on WhatsApp", customize: "Customize your dish",
    required: "Required", chooseOne: "Choose one", chooseMany: "Choose any",
    statusPending: "Waiting for confirmation", statusConfirmed: "Confirmed — being prepared",
    statusCompleted: "Completed", statusCancelled: "Cancelled by the restaurant",
    pendingMsg: "The restaurant has received your order. Keep this page open — it updates automatically when they confirm.",
    confirmedMsg: "Good news — the restaurant confirmed your order and is preparing it.",
    completedMsg: "This order is complete. Thank you!",
    cancelledMsg: "The restaurant could not accept this order. Please speak to the staff or try again.",
    contains: "Contains", avoidAllergen: "Avoid allergen:", anyAllergen: "None — show all",
    bigText: "Bigger text", privacyNote: "This menu uses no tracking cookies.",
    orderPlaced: "Order placed", menuNotFound: "Menu not found",
    notFoundMsg: "This restaurant menu is not published or the link is wrong. Please check the QR code and try again.",
    menuUnavailable: "Menu unavailable", unavailableMsg: "This menu service is not connected yet. Please check back shortly.",
  },
  ur: {
    search: "ڈشز تلاش کریں…", all: "تمام", featured: "نمایاں", moreDishes: "مزید ڈشز",
    menuSoon: "مینیو جلد آ رہا ہے", menuSoonHint: "یہ ریسٹورنٹ ابھی ڈشز شامل کر رہا ہے۔ براہ کرم کچھ دیر بعد دوبارہ دیکھیں۔",
    noMatch: "کوئی ڈش نہیں ملی", noMatchHint: "کوئی اور لفظ تلاش کریں۔",
    add: "شامل کریں", unavailable: "فی الحال دستیاب نہیں", unavailableShort: "دستیاب نہیں", inCart: "کارٹ میں",
    viewCart: "کارٹ دیکھیں اور آرڈر کریں", item: "آئٹم", items: "آئٹمز",
    yourCart: "آپ کا کارٹ", yourOrder: "آپ کا آرڈر",
    cartEmpty: "آپ کا کارٹ خالی ہے۔ کسی ڈش پر + دبائیں۔",
    total: "کل رقم", subtotal: "ذیلی رقم", tax: "ٹیکس", serviceCharge: "سروس چارج", minOrderMsg: "کم از کم آرڈر {min} ہے — آرڈر کے لیے مزید {more} شامل کریں۔",
    dineIn: "یہیں کھائیں (ٹیبل)", takeaway: "ٹیک اوے",
    tableNumber: "ٹیبل نمبر", yourName: "آپ کا نام", yourNameOpt: "آپ کا نام (اختیاری)",
    namePh: "نام", phone: "فون نمبر", phoneHint: "ریسٹورنٹ یہ نمبر صرف اس آرڈر کے لیے استعمال کرے گا۔",
    note: "نوٹ (اختیاری)", notePh: "مثلاً کم مرچ، اضافی رائتہ…",
    placeOrder: "آرڈر کریں", placing: "آرڈر بھیجا جا رہا ہے…",
    payNote: "آن لائن ادائیگی نہیں — کاؤنٹر پر ادا کریں۔ ریسٹورنٹ آپ کے آرڈر کی تصدیق کرے گا۔",
    trackPrev: "اس کے بجائے میرا پچھلا آرڈر دیکھیں", table: "ٹیبل", whatsappUs: "واٹس ایپ کریں",
    payCounter: "کاؤنٹر پر ادائیگی کریں۔ یہ صفحہ کھلا رہنے تک خود بخود اپڈیٹ ہوتا ہے۔",
    newOrder: "نیا آرڈر شروع کریں", loadingStatus: "آپ کے آرڈر کی صورتحال لوڈ ہو رہی ہے…", tapStatus: "صورتحال دیکھنے کے لیے دبائیں",
    notifyWa: "آرڈر ریسٹورنٹ کو واٹس ایپ پر بھیجیں", customize: "اپنی پسند منتخب کریں",
    required: "لازمی", chooseOne: "ایک منتخب کریں", chooseMany: "کوئی بھی منتخب کریں",
    statusPending: "تصدیق کا انتظار ہے", statusConfirmed: "تصدیق ہو گئی — تیار کیا جا رہا ہے",
    statusCompleted: "مکمل ہو گیا", statusCancelled: "ریسٹورنٹ نے منسوخ کر دیا",
    pendingMsg: "ریسٹورنٹ کو آپ کا آرڈر مل گیا ہے۔ یہ صفحہ کھلا رکھیں — تصدیق ہوتے ہی اپڈیٹ ہو جائے گا۔",
    confirmedMsg: "خوشخبری — ریسٹورنٹ نے آپ کے آرڈر کی تصدیق کر دی ہے اور تیاری شروع ہے۔",
    completedMsg: "یہ آرڈر مکمل ہو گیا ہے۔ شکریہ!",
    cancelledMsg: "ریسٹورنٹ یہ آرڈر قبول نہیں کر سکا۔ براہ کرم عملے سے بات کریں یا دوبارہ کوشش کریں۔",
    contains: "شامل ہے", avoidAllergen: "الرجین سے بچیں:", anyAllergen: "کوئی نہیں — سب دکھائیں",
    bigText: "بڑا متن", privacyNote: "اس مینیو میں کوئی ٹریکنگ کوکیز استعمال نہیں ہوتیں۔",
    orderPlaced: "آرڈر ہو گیا", menuNotFound: "مینیو نہیں ملا",
    notFoundMsg: "یہ مینیو شائع نہیں ہے یا لنک غلط ہے۔ QR کوڈ چیک کر کے دوبارہ کوشش کریں۔",
    menuUnavailable: "مینیو دستیاب نہیں", unavailableMsg: "یہ سروس ابھی منسلک نہیں ہے۔ براہ کرم کچھ دیر بعد دیکھیں۔",
  },
};

interface GroupWithOptions extends ItemOptionGroup { options: ItemOption[] }
interface CartOption { id: string; group_name: string; option_name: string; price_delta: number }
interface CartLine { key: string; item: MenuItem; qty: number; options: CartOption[]; unitPrice: number }

const THEMES: Record<string, { bg: string; dark: boolean | null }> = {
  classic: { bg: "", dark: null },
  midnight: { bg: "#0A0A0B", dark: true },
  fresh: { bg: "#EDF5EF", dark: false },
  royal: { bg: "#FAF4E8", dark: false },
};

export default function PublicMenuPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [groupsByItem, setGroupsByItem] = useState<Map<string, GroupWithOptions[]>>(new Map());
  const [planSlug, setPlanSlug] = useState<string>("free");
  const [search, setSearch] = useState("");
  const [dietFilter, setDietFilter] = useState<string | null>(null);
  const [avoidAllergen, setAvoidAllergen] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [darkPref, setDarkPref] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [bigText, setBigText] = useState<boolean>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("velora_big_text") === "1");

  // Accessibility: big-text mode scales every rem-based size on the page
  // by raising the root font size (16px -> 18px), and remembers the
  // guest's choice on this device. Reset on unmount so the rest of the
  // app is unaffected.
  useEffect(() => {
    document.documentElement.style.fontSize = bigText ? "18px" : "";
    try { window.localStorage.setItem("velora_big_text", bigText ? "1" : "0"); } catch { /* private mode */ }
    return () => { document.documentElement.style.fontSize = ""; };
  }, [bigText]);
  const scanRecorded = useRef(false);
  const viewedItems = useRef<Set<string>>(new Set());
  const isOwnerRef = useRef(false);

  const [qrTable] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("table") : null);
  const [qrSource] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("src") : null);
  const [qrId, setQrId] = useState<string | null>(null);

  // Ordering state — cart is a list of lines; a line is one item in one
  // option configuration, so the same dish can appear twice (e.g.
  // Large + Extra cheese, and Small plain).
  const [ordering, setOrdering] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
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

  // Options-sheet state
  const [optItem, setOptItem] = useState<MenuItem | null>(null);
  const [optSel, setOptSel] = useState<Record<string, string[]>>({});

  const t = STR[lang];
  const rtl = lang === "ur";

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
      setDarkPref(r.theme === "dark");
      if (r.default_language === "ur") setLang("ur");

      const [settingsRes, catsRes, itemsRes, groupsRes, planRes] = await Promise.all([
        supabase.from("restaurant_settings").select("*").eq("restaurant_id", r.id).single(),
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("menu_items").select("*").eq("restaurant_id", r.id)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("item_option_groups").select("*").eq("restaurant_id", r.id)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.rpc("restaurant_plan_slug", { rid: r.id }),
      ]);
      if (cancelled) return;
      const s = (settingsRes.data as RestaurantSettings) ?? null;
      setSettings(s);
      if (s) setDarkPref(s.theme === "dark");
      setCategories((catsRes.data as Category[]) ?? []);
      setItems((itemsRes.data as MenuItem[]) ?? []);
      if (typeof planRes.data === "string") setPlanSlug(planRes.data);

      // Attach options to their groups, grouped by item.
      const groups = (groupsRes.data as ItemOptionGroup[]) ?? [];
      if (groups.length > 0) {
        const { data: opts } = await supabase.from("item_options").select("*")
          .in("group_id", groups.map((g) => g.id)).eq("is_available", true)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true });
        if (!cancelled) {
          const allOpts = (opts as ItemOption[]) ?? [];
          const map = new Map<string, GroupWithOptions[]>();
          groups.forEach((g) => {
            const withOpts: GroupWithOptions = { ...g, options: allOpts.filter((o) => o.group_id === g.id) };
            const arr = map.get(g.menu_item_id) ?? [];
            arr.push(withOpts);
            map.set(g.menu_item_id, arr);
          });
          setGroupsByItem(map);
        }
      }
      setLoading(false);

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

      try {
        const { data: avail } = await supabase.rpc("ordering_available", { rid: r.id });
        if (!cancelled) setOrdering(Boolean(avail));
      } catch { if (!cancelled) setOrdering(false); }

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

  // ---------- Live order status polling ----------------------------
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
    const tmr = setInterval(refreshMyOrder, 5000);
    return () => clearInterval(tmr);
  }, [myOrderCreds, refreshMyOrder]);

  // ---------- Theme -------------------------------------------------
  const themeName = planSlug === "free" ? "classic" : (settings?.menu_theme ?? "classic");
  const themeCfg = THEMES[themeName] ?? THEMES.classic;
  const dark = themeCfg.dark ?? darkPref;

  const accent = settings?.primary_color || restaurant?.accent_color || "#0F766E";
  const showSearch = settings?.show_search ?? true;
  const showFeatured = settings?.show_featured ?? true;
  const whatsappEnabled = (settings?.enable_whatsapp ?? true) && restaurant?.whatsapp;

  const hasAllergenData = useMemo(
    () => items.some((it) => (it.dietary?.length ?? 0) > 0 || (it.allergens?.length ?? 0) > 0),
    [items]);

  const filtered = useMemo(() => items.filter((it) => {
    if (search && !(it.name + " " + (it.description ?? "")).toLowerCase().includes(search.toLowerCase())) return false;
    if (dietFilter && !(it.dietary ?? []).includes(dietFilter)) return false;
    if (avoidAllergen && (it.allergens ?? []).includes(avoidAllergen)) return false;
    return true;
  }), [items, search, dietFilter, avoidAllergen]);

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

  const cartCount = lines.reduce((n, l) => n + l.qty, 0);
  const cartTotal = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  // Phase 1.4 charges — a PREVIEW only; place_customer_order recomputes
  // the same figures server-side and its totals are the real ones.
  const taxPct = Number(settings?.tax_percent ?? 0);
  const svcPct = Number(settings?.service_percent ?? 0);
  const minOrder = Number(settings?.min_order_amount ?? 0);
  const taxAmt = Math.round(cartTotal * taxPct) / 100;
  const svcAmt = Math.round(cartTotal * svcPct) / 100;
  const grandTotal = cartTotal + taxAmt + svcAmt;
  const belowMin = minOrder > 0 && lines.length > 0 && cartTotal < minOrder;
  const minOrderText = t.minOrderMsg
    .replace("{min}", formatPrice(minOrder, restaurant?.currency ?? "PKR"))
    .replace("{more}", formatPrice(minOrder - cartTotal, restaurant?.currency ?? "PKR"));
  const itemQty = (itemId: string) => lines.filter((l) => l.item.id === itemId).reduce((n, l) => n + l.qty, 0);

  function addLine(item: MenuItem, options: CartOption[], qty = 1) {
    const key = item.id + "|" + options.map((o) => o.id).sort().join(",");
    const unitPrice = priceOf(item) + options.reduce((n, o) => n + Number(o.price_delta), 0);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + qty, 50) } : l));
      return [...prev, { key, item, qty, options, unitPrice }];
    });
  }

  function setLineQty(key: string, qty: number) {
    setLines((prev) => qty <= 0 ? prev.filter((l) => l.key !== key)
      : prev.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, 50) } : l)));
  }

  // Simple +/- for items without options (keeps the original fast flow).
  function setSimpleQty(item: MenuItem, qty: number) {
    const key = item.id + "|";
    const existing = lines.find((l) => l.key === key);
    if (!existing) { if (qty > 0) addLine(item, [], qty); return; }
    setLineQty(key, qty);
  }

  function openOptions(item: MenuItem) {
    const groups = groupsByItem.get(item.id) ?? [];
    const initial: Record<string, string[]> = {};
    groups.forEach((g) => {
      // Pre-select the first option of required single-choice groups.
      if (g.selection_type === "single" && g.is_required && g.options.length > 0) initial[g.id] = [g.options[0].id];
      else initial[g.id] = [];
    });
    setOptSel(initial);
    setOptItem(item);
  }

  function toggleOption(group: GroupWithOptions, opt: ItemOption) {
    setOptSel((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.selection_type === "single") return { ...prev, [group.id]: [opt.id] };
      return { ...prev, [group.id]: cur.includes(opt.id) ? cur.filter((x) => x !== opt.id) : [...cur, opt.id] };
    });
  }

  const optGroups = optItem ? (groupsByItem.get(optItem.id) ?? []) : [];
  const optSelected: CartOption[] = optGroups.flatMap((g) =>
    (optSel[g.id] ?? []).map((oid) => {
      const o = g.options.find((x) => x.id === oid)!;
      return { id: o.id, group_name: g.name, option_name: o.name, price_delta: Number(o.price_delta) };
    }).filter(Boolean));
  const optValid = optGroups.every((g) => !g.is_required || (optSel[g.id] ?? []).length > 0);
  const optUnitPrice = optItem ? priceOf(optItem) + optSelected.reduce((n, o) => n + o.price_delta, 0) : 0;

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
    if (lines.length === 0) { setOrderError("Your cart is empty."); return; }
    if (belowMin) { setOrderError(minOrderText); return; }
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
        p_items: lines.map((l) => ({
          menu_item_id: l.item.id, quantity: l.qty,
          option_ids: l.options.map((o) => o.id),
        })),
      });
      if (error) throw error;
      const res = data as { order_id: string; customer_token: string };
      const creds = { id: res.order_id, token: res.customer_token };
      try { localStorage.setItem(`menuqr_order_${restaurant.id}`, JSON.stringify(creds)); } catch { /* ignore */ }
      setMyOrderCreds(creds);
      setLines([]);
      setNote("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not place the order.";
      if (msg.includes("ORDERING_NOT_AVAILABLE")) setOrderError("Ordering is not available for this restaurant right now.");
      else if (msg.includes("ITEM_UNAVAILABLE")) setOrderError("One of the items just became unavailable. Please review your cart and try again.");
      else if (msg.includes("OPTION_REQUIRED")) setOrderError("One of your dishes needs a required choice (like a size). Please reopen it and choose.");
      else if (msg.includes("INVALID_OPTION")) setOrderError("One of the chosen options is no longer available. Please review your cart and try again.");
      else if (msg.includes("TOO_MANY_ORDERS")) setOrderError("Too many orders in a short time. Please wait a few minutes or ask the staff for help.");
      else if (msg.includes("MIN_ORDER")) setOrderError(minOrderText);
      else if (msg.includes("TABLE_REQUIRED")) setOrderError("Please enter your table number.");
      else if (msg.includes("PHONE_REQUIRED")) setOrderError("Please enter a valid phone number.");
      else if (msg.includes("NAME_REQUIRED")) setOrderError("Please enter your name.");
      else setOrderError("Could not place the order. Please try again or order at the counter.");
    } finally {
      setPlacing(false);
    }
  }

  // ---------- early states ------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <Shell dark={false} rtl={rtl}>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={36} />
          <h1 className="font-heading text-xl font-semibold">{t.menuUnavailable}</h1>
          <p className="mt-2 text-sm text-slate-500">{t.unavailableMsg}</p>
        </div>
      </Shell>
    );
  }
  if (loading) {
    return (
      <Shell dark={false} rtl={rtl}>
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
      <Shell dark={false} rtl={rtl}>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={36} />
          <h1 className="font-heading text-xl font-semibold">{t.menuNotFound}</h1>
          <p className="mt-2 text-sm text-slate-500">{t.notFoundMsg}</p>
        </div>
      </Shell>
    );
  }

  const waNumber = (restaurant.whatsapp ?? "").replace(/[^0-9]/g, "");
  const currency = restaurant.currency;
  const cartBarVisible = ordering && cartCount > 0 && !sheetOpen && !optItem;

  const waOrderText = myOrder ? encodeURIComponent(
    `${t.orderPlaced} — ${restaurant.name}\n` +
    (myOrder.order_type === "dine_in" ? `${t.table} ${myOrder.table_number ?? ""}` : t.takeaway) + "\n" +
    myOrder.items.map((i) =>
      `• ${i.item_name} ×${i.quantity}` +
      (i.options && i.options.length ? ` (${i.options.map((o) => o.option_name).join(", ")})` : "") +
      ` — ${formatPrice(Number(i.subtotal), currency)}`).join("\n") +
    `\n${t.total}: ${formatPrice(Number(myOrder.total_amount), currency)}`
  ) : "";

  return (
    <Shell dark={dark} rtl={rtl} bg={themeCfg.bg} note={t.privacyNote}>
      {/* Cover */}
      <div className="relative">
        {restaurant.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.cover_url} alt="" className="h-44 w-full object-cover sm:h-56" />
        ) : (
          <div className="h-32 w-full sm:h-40" style={{ background: `linear-gradient(135deg, ${accent}, #101828)` }} />
        )}
        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" onClick={() => setLang((l) => (l === "en" ? "ur" : "en"))}
            aria-label="Switch language"
            className="flex h-10 items-center justify-center rounded-full bg-black/35 px-3.5 text-sm font-semibold text-white backdrop-blur">
            {lang === "en" ? "اردو" : "EN"}
          </button>
          {themeCfg.dark === null && (
            <button type="button" onClick={() => setDarkPref((d) => !d)} aria-label="Toggle theme"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          <button type="button" onClick={() => setBigText((b) => !b)} aria-label={t.bigText} aria-pressed={bigText}
            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur ${bigText ? "bg-white text-slate-900" : "bg-black/35 text-white"}`}>
            <Type size={18} />
          </button>
        </div>
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
                  {t.table} {qrTable}
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
            className={`mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start shadow-card ${dark ? "bg-neutral-900" : "bg-white"}`}>
            <ClipboardList size={20} style={{ color: accent }} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.yourOrder}</span>
              <span className={`block text-xs ${dark ? "text-neutral-400" : "text-slate-500"}`}>
                {myOrder ? statusLabel(t, myOrder.status) : t.tapStatus}
                {myOrder ? ` · ${formatPrice(Number(myOrder.total_amount), currency)}` : ""}
              </span>
            </span>
            <StatusDot status={myOrder?.status} />
          </button>
        )}

        {/* Search */}
        {showSearch && (
          <div className="relative mt-4">
            <Search size={18} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${rtl ? "right-3.5" : "left-3.5"} ${dark ? "text-neutral-500" : "text-slate-400"}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} type="search"
              className={`w-full rounded-2xl border py-3 text-[15px] shadow-card ${rtl ? "pl-4 pr-11" : "pl-11 pr-4"} ${dark ? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-500" : "border-slate-200 bg-white placeholder:text-slate-400"}`} />
          </div>
        )}

        {/* Dietary filters + allergen avoidance (shown only when the
            restaurant has filled in dietary/allergen data) */}
        {hasAllergenData && (
          <div className="mt-3 space-y-2">
            <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Dietary filters">
              {DIETARY.map((d) => (
                <Chip key={d.key} label={dietaryLabel(d.key, lang)} active={dietFilter === d.key} accent={accent} dark={dark}
                  onClick={() => setDietFilter(dietFilter === d.key ? null : d.key)} />
              ))}
            </div>
            <label className={`flex items-center gap-2 text-xs font-medium ${dark ? "text-neutral-400" : "text-slate-500"}`}>
              {t.avoidAllergen}
              <select value={avoidAllergen ?? ""} aria-label={t.avoidAllergen}
                onChange={(e) => setAvoidAllergen(e.target.value || null)}
                className={`min-h-[38px] flex-1 rounded-xl border px-2.5 py-2 text-[13px] ${dark ? "border-neutral-800 bg-neutral-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                <option value="">{t.anyAllergen}</option>
                {ALLERGENS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Sticky category chips */}
        <div className="sticky top-0 z-30 -mx-4 mt-4 px-4 py-2.5 backdrop-blur"
          style={{ backgroundColor: dark ? "rgba(10,10,11,0.9)" : `${themeCfg.bg || "#F6F7F9"}E6` }}>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <Chip label={t.all} active={activeCat === "all"} accent={accent} dark={dark} onClick={() => scrollToCategory("all")} />
            {showFeatured && featured.length > 0 && (
              <Chip label={`★ ${t.featured}`} active={activeCat === "featured"} accent={accent} dark={dark} onClick={() => scrollToCategory("featured")} />
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
            <p className="font-heading font-medium">{t.menuSoon}</p>
            <p className={`mt-1 text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>{t.menuSoonHint}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Search className="mx-auto mb-3 text-slate-300" size={34} />
            <p className="font-heading font-medium">{t.noMatch}</p>
            <p className={`mt-1 text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>{t.noMatchHint}</p>
          </div>
        ) : (
          <div className="pb-36 pt-2">
            {showFeatured && featured.length > 0 && (
              <section id="cat-featured" className="scroll-mt-20">
                <h2 className="mb-3 flex items-center gap-1.5 font-heading text-lg font-semibold">
                  <Star size={18} className="fill-amber-400 text-amber-400" /> {t.featured}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {featured.map((item) => (
                    <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark} t={t} lang={lang}
                      expanded={expandedId === item.id} featured onTap={() => onItemTap(item)}
                      ordering={ordering} qty={itemQty(item.id)}
                      hasOptions={(groupsByItem.get(item.id) ?? []).length > 0}
                      onSimpleQty={(q) => setSimpleQty(item, q)} onOptions={() => openOptions(item)} />
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
                      <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark} t={t} lang={lang}
                        expanded={expandedId === item.id} onTap={() => onItemTap(item)}
                        ordering={ordering} qty={itemQty(item.id)}
                        hasOptions={(groupsByItem.get(item.id) ?? []).length > 0}
                        onSimpleQty={(q) => setSimpleQty(item, q)} onOptions={() => openOptions(item)} />
                    ))}
                  </div>
                </section>
              );
            })}

            {(byCategory.get("__none__") ?? []).length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 font-heading text-lg font-semibold">{t.moreDishes}</h2>
                <div className="space-y-3">
                  {(byCategory.get("__none__") ?? []).map((item) => (
                    <ItemCard key={item.id} item={item} currency={currency} accent={accent} dark={dark} t={t} lang={lang}
                      expanded={expandedId === item.id} onTap={() => onItemTap(item)}
                      ordering={ordering} qty={itemQty(item.id)}
                      hasOptions={(groupsByItem.get(item.id) ?? []).length > 0}
                      onSimpleQty={(q) => setSimpleQty(item, q)} onOptions={() => openOptions(item)} />
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
          <span className="flex-1 text-start">{cartCount} {cartCount === 1 ? t.item : t.items} · {formatPrice(cartTotal, currency)}</span>
          <span className="text-sm">{t.viewCart}</span>
        </button>
      )}

      {/* WhatsApp floating button */}
      {whatsappEnabled && waNumber && !cartBarVisible && (
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
          className={`fixed bottom-5 z-40 flex min-h-[52px] items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-white shadow-pop ${rtl ? "left-4" : "right-4"}`}>
          <MessageCircle size={21} /> {t.whatsappUs}
        </a>
      )}

      {/* Options sheet (variations & add-ons) */}
      {optItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t.customize}>
          <button type="button" aria-label="Close" onClick={() => setOptItem(null)} className="absolute inset-0 h-full w-full bg-black/55" />
          <div className={`relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${dark ? "bg-neutral-900 text-white" : "bg-white text-ink"}`}>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="flex-1 font-heading text-lg font-semibold">{optItem.name}</h2>
              <button type="button" onClick={() => setOptItem(null)} aria-label="Close"
                className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
                <X size={19} />
              </button>
            </div>
            <p className={`text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>{t.customize} · {formatPrice(priceOf(optItem), currency)}</p>

            {optGroups.map((g) => (
              <div key={g.id} className="mt-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {g.name}
                  {g.is_required
                    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{t.required}</span>
                    : <span className={`text-xs font-normal ${dark ? "text-neutral-500" : "text-slate-400"}`}>{g.selection_type === "single" ? t.chooseOne : t.chooseMany}</span>}
                </p>
                <div className="mt-2 space-y-2">
                  {g.options.map((o) => {
                    const selected = (optSel[g.id] ?? []).includes(o.id);
                    return (
                      <button key={o.id} type="button" onClick={() => toggleOption(g, o)}
                        className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm transition ${selected ? "font-semibold" : ""}`}
                        style={selected ? { borderColor: accent, background: `${accent}14` } : { borderColor: dark ? "#333" : "#E2E8F0" }}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${g.selection_type === "single" ? "rounded-full" : "rounded-md"}`}
                          style={selected ? { background: accent, borderColor: accent } : { borderColor: dark ? "#555" : "#CBD5E1" }}>
                          {selected && <Check size={13} className="text-white" />}
                        </span>
                        <span className="flex-1">{o.name}</span>
                        {Number(o.price_delta) !== 0 && (
                          <span style={{ color: accent }}>+{formatPrice(Number(o.price_delta), currency)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button type="button" disabled={!optValid}
              onClick={() => { addLine(optItem, optSelected); setOptItem(null); }}
              className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-40"
              style={{ background: accent }}>
              <Plus size={18} /> {t.add} · {formatPrice(optUnitPrice, currency)}
            </button>
          </div>
        </div>
      )}

      {/* Cart / checkout / order-status sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t.yourOrder}>
          <button type="button" aria-label="Close" onClick={() => setSheetOpen(false)} className="absolute inset-0 h-full w-full bg-black/55" />
          <div className={`relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${dark ? "bg-neutral-900 text-white" : "bg-white text-ink"}`}>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="flex-1 font-heading text-lg font-semibold">
                {myOrderCreds && lines.length === 0 ? t.yourOrder : t.yourCart}
              </h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close"
                className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
                <X size={19} />
              </button>
            </div>

            {/* Order status view */}
            {myOrderCreds && lines.length === 0 ? (
              <div>
                {!myOrder ? (
                  <p className={`text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>{t.loadingStatus}</p>
                ) : (
                  <div>
                    <div aria-live="polite" className={`rounded-2xl p-4 text-center ${myOrder.status === "confirmed" ? "bg-emerald-50 text-emerald-900" : myOrder.status === "cancelled" ? "bg-red-50 text-red-800" : myOrder.status === "completed" ? "bg-slate-100 text-slate-800" : "bg-amber-50 text-amber-900"}`}>
                      {myOrder.status === "pending" && <Clock3 size={30} className="mx-auto text-amber-500" />}
                      {myOrder.status === "confirmed" && <ChefHat size={30} className="mx-auto text-emerald-600" />}
                      {myOrder.status === "completed" && <CheckCircle2 size={30} className="mx-auto text-slate-500" />}
                      {myOrder.status === "cancelled" && <Ban size={30} className="mx-auto text-red-500" />}
                      <p className="mt-2 font-heading text-base font-bold">{statusLabel(t, myOrder.status)}</p>
                      <p className="mt-1 text-sm">
                        {myOrder.status === "pending" && t.pendingMsg}
                        {myOrder.status === "confirmed" && t.confirmedMsg}
                        {myOrder.status === "completed" && t.completedMsg}
                        {myOrder.status === "cancelled" && t.cancelledMsg}
                      </p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      {myOrder.items.map((oi, i) => (
                        <li key={i}>
                          <div className="flex items-center gap-2">
                            <span className="flex-1">{oi.item_name} <span className="text-slate-500">× {oi.quantity}</span></span>
                            <span className="font-medium">{formatPrice(Number(oi.subtotal), currency)}</span>
                          </div>
                          {oi.options && oi.options.length > 0 && (
                            <p className={`mt-0.5 text-xs ${dark ? "text-neutral-400" : "text-slate-500"}`}>
                              {oi.options.map((o) => `${o.group_name}: ${o.option_name}`).join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {(Number(myOrder.tax_amount ?? 0) > 0 || Number(myOrder.service_amount ?? 0) > 0) && myOrder.subtotal_amount != null && (
                      <div className={`mt-3 space-y-1.5 border-t pt-3 text-sm ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                        <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.subtotal}</span><span>{formatPrice(Number(myOrder.subtotal_amount), currency)}</span></div>
                        {Number(myOrder.tax_amount ?? 0) > 0 && <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.tax}</span><span>{formatPrice(Number(myOrder.tax_amount), currency)}</span></div>}
                        {Number(myOrder.service_amount ?? 0) > 0 && <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.serviceCharge}</span><span>{formatPrice(Number(myOrder.service_amount), currency)}</span></div>}
                      </div>
                    )}
                    <div className={`mt-3 flex items-center justify-between border-t pt-3 font-heading font-bold ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                      <span>{t.total} {myOrder.order_type === "dine_in" && myOrder.table_number ? `· ${t.table} ${myOrder.table_number}` : myOrder.order_type === "takeaway" ? `· ${t.takeaway}` : ""}</span>
                      <span>{formatPrice(Number(myOrder.total_amount), currency)}</span>
                    </div>
                    <p className={`mt-3 text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>{t.payCounter}</p>
                    {waNumber && (myOrder.status === "pending" || myOrder.status === "confirmed") && (
                      <a href={`https://wa.me/${waNumber}?text=${waOrderText}`} target="_blank" rel="noreferrer"
                        className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white">
                        <MessageCircle size={19} /> {t.notifyWa}
                      </a>
                    )}
                    {(myOrder.status === "completed" || myOrder.status === "cancelled") && (
                      <button type="button" className="mt-4 w-full rounded-xl border px-4 py-3 text-sm font-medium"
                        onClick={() => { setMyOrderCreds(null); setMyOrder(null); try { localStorage.removeItem(`menuqr_order_${restaurant.id}`); } catch { /* ignore */ } }}>
                        {t.newOrder}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Cart + checkout view */
              <div>
                {lines.length === 0 ? (
                  <p className={`text-sm ${dark ? "text-neutral-400" : "text-slate-500"}`}>{t.cartEmpty}</p>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {lines.map((l) => (
                        <li key={l.key} className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{l.item.name}</p>
                            {l.options.length > 0 && (
                              <p className={`truncate text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>
                                {l.options.map((o) => o.option_name).join(", ")}
                              </p>
                            )}
                            <p className="text-xs" style={{ color: accent }}>{formatPrice(l.unitPrice, currency)}</p>
                          </div>
                          <QtyStepper qty={l.qty} accent={accent} dark={dark} onQty={(q) => setLineQty(l.key, q)} />
                        </li>
                      ))}
                    </ul>
                    {(taxAmt > 0 || svcAmt > 0) ? (
                      <div className={`mt-4 space-y-1.5 border-t pt-3 text-sm ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                        <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.subtotal}</span><span>{formatPrice(cartTotal, currency)}</span></div>
                        {taxAmt > 0 && <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.tax} ({taxPct}%)</span><span>{formatPrice(taxAmt, currency)}</span></div>}
                        {svcAmt > 0 && <div className="flex items-center justify-between"><span className={dark ? "text-neutral-400" : "text-slate-500"}>{t.serviceCharge} ({svcPct}%)</span><span>{formatPrice(svcAmt, currency)}</span></div>}
                        <div className="flex items-center justify-between pt-1 font-heading text-base font-bold"><span>{t.total}</span><span>{formatPrice(grandTotal, currency)}</span></div>
                      </div>
                    ) : (
                      <div className={`mt-4 flex items-center justify-between border-t pt-3 font-heading font-bold ${dark ? "border-neutral-800" : "border-slate-100"}`}>
                        <span>{t.total}</span><span>{formatPrice(cartTotal, currency)}</span>
                      </div>
                    )}

                    {/* Order type */}
                    <div className={`mt-4 grid grid-cols-2 gap-2 rounded-2xl p-1.5 ${dark ? "bg-neutral-800" : "bg-slate-100"}`}>
                      {(["dine_in", "takeaway"] as const).map((tp) => (
                        <button key={tp} type="button" onClick={() => setOrderType(tp)}
                          className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-semibold ${orderType === tp ? "text-white" : dark ? "text-neutral-300" : "text-slate-600"}`}
                          style={orderType === tp ? { background: accent } : undefined}>
                          {tp === "dine_in" ? t.dineIn : t.takeaway}
                        </button>
                      ))}
                    </div>

                    {orderType === "dine_in" ? (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="ord-table">{t.tableNumber} *</label>
                        <input id="ord-table" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} inputMode="numeric"
                          placeholder="e.g. 5" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-name1">{t.yourNameOpt}</label>
                        <input id="ord-name1" value={custName} onChange={(e) => setCustName(e.target.value)}
                          placeholder={t.namePh} className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                      </div>
                    ) : (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="ord-name2">{t.yourName} *</label>
                        <input id="ord-name2" value={custName} onChange={(e) => setCustName(e.target.value)}
                          placeholder={t.namePh} className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-phone">{t.phone} *</label>
                        <input id="ord-phone" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} inputMode="tel"
                          placeholder="03xx xxxxxxx" className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />
                        <p className={`mt-1.5 text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>{t.phoneHint}</p>
                      </div>
                    )}

                    <label className="mb-1.5 mt-4 block text-sm font-medium" htmlFor="ord-note">{t.note}</label>
                    <textarea id="ord-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      placeholder={t.notePh}
                      className={`w-full rounded-xl border px-3.5 py-3 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white"}`} />

                    {belowMin && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{minOrderText}</p>}
                    {orderError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{orderError}</p>}

                    <button type="button" onClick={placeOrder} disabled={placing || belowMin}
                      className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50"
                      style={{ background: accent }}>
                      <ShoppingBag size={19} /> {placing ? t.placing : `${t.placeOrder} · ${formatPrice(grandTotal, currency)}`}
                    </button>
                    <p className={`mt-2.5 text-center text-xs ${dark ? "text-neutral-500" : "text-slate-400"}`}>{t.payNote}</p>

                    {myOrderCreds && (
                      <button type="button" onClick={() => setLines([])} className="mt-3 w-full text-center text-sm font-medium underline">
                        {t.trackPrev}
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

function statusLabel(t: Record<string, string>, status?: string | null): string {
  switch (status) {
    case "pending": return t.statusPending;
    case "confirmed": return t.statusConfirmed;
    case "completed": return t.statusCompleted;
    case "cancelled": return t.statusCancelled;
    default: return t.orderPlaced;
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

function Shell({ dark, rtl, bg, note, children }: { dark: boolean; rtl?: boolean; bg?: string; note?: string; children: React.ReactNode }) {
  return (
    <div dir={rtl ? "rtl" : "ltr"}
      className={`min-h-screen font-body ${dark ? "bg-neutral-950 text-white" : "text-ink"}`}
      style={!dark ? { backgroundColor: bg || "#F6F7F9" } : { backgroundColor: bg || undefined }}>
      {children}
      <p className={`pb-6 text-center text-[11px] ${dark ? "text-neutral-400" : "text-slate-500"}`}>
        Powered by Velora
        {note && <span className="mt-0.5 block">{note}</span>}
      </p>
    </div>
  );
}

function Chip({ label, active, accent, dark, onClick }: { label: string; active: boolean; accent: string; dark: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-[40px] shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${active ? "text-white" : dark ? "bg-neutral-900 text-neutral-300" : "bg-white text-slate-600 shadow-card"}`}
      style={active ? { background: accent } : undefined}>
      {label}
    </button>
  );
}

function ItemCard({ item, currency, accent, dark, t, lang, expanded, onTap, featured = false, ordering, qty, hasOptions, onSimpleQty, onOptions }: {
  item: MenuItem; currency: string; accent: string; dark: boolean; t: Record<string, string>; lang: Lang;
  expanded: boolean; onTap: () => void; featured?: boolean;
  ordering: boolean; qty: number; hasOptions: boolean;
  onSimpleQty: (q: number) => void; onOptions: () => void;
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

  const metaBlock = ((item.dietary?.length ?? 0) > 0 || item.calories != null || (item.allergens?.length ?? 0) > 0) ? (
    <div className="mt-1.5 space-y-1">
      {((item.dietary?.length ?? 0) > 0 || item.calories != null) && (
        <div className="flex flex-wrap items-center gap-1">
          {(item.dietary ?? []).map((k) => (
            <span key={k} className={`rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold ${dark ? "text-emerald-400" : "text-emerald-700"}`}>{dietaryLabel(k, lang)}</span>
          ))}
          {item.calories != null && <span className={`text-[11px] font-medium ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.calories} kcal</span>}
        </div>
      )}
      {(item.allergens?.length ?? 0) > 0 && (
        <p className={`text-[11px] leading-snug ${dark ? "text-neutral-400" : "text-slate-500"}`}>
          {t.contains}: {(item.allergens ?? []).map(allergenLabel).join(", ")}
        </p>
      )}
    </div>
  ) : null;

  const addControl = ordering && item.is_available ? (
    hasOptions ? (
      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onOptions}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: accent }}>
          <Plus size={15} /> {t.add}
        </button>
        {qty > 0 && <span className={`text-xs font-medium ${dark ? "text-neutral-400" : "text-slate-500"}`}>{qty} {t.inCart}</span>}
      </div>
    ) : qty > 0 ? (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <QtyStepper qty={qty} accent={accent} dark={dark} onQty={onSimpleQty} />
      </div>
    ) : (
      <button type="button" onClick={(e) => { e.stopPropagation(); onSimpleQty(1); }}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: accent }}>
        <Plus size={15} /> {t.add}
      </button>
    )
  ) : null;

  if (featured) {
    return (
      <div onClick={onTap} role="button" tabIndex={0}
        aria-label={`${item.name}, ${formatPrice(Number(hasDiscount ? item.discount_price : item.price), currency)}${item.is_available ? "" : `, ${t.unavailableShort}`}`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        className={`fade-up cursor-pointer overflow-hidden rounded-2xl text-start shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
        {item.image_url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name} className="h-28 w-full object-cover" loading="lazy" />
          : <div className="flex h-28 w-full items-center justify-center" style={{ background: `${accent}22` }}><UtensilsCrossed size={26} style={{ color: accent }} /></div>}
        <div className="p-3">
          <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
          {expanded && item.description && <p className={`mt-1 text-xs leading-relaxed ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.description}</p>}
          <div className="mt-1.5">{priceBlock}</div>
          {metaBlock}
          {!item.is_available && <span className="mt-1.5 inline-block rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t.unavailableShort}</span>}
          {addControl}
        </div>
      </div>
    );
  }

  return (
    <div onClick={onTap} role="button" tabIndex={0}
      aria-label={`${item.name}, ${formatPrice(Number(hasDiscount ? item.discount_price : item.price), currency)}${item.is_available ? "" : `, ${t.unavailable}`}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className={`fade-up flex w-full cursor-pointer gap-3 rounded-2xl p-3 text-start shadow-card ${dark ? "bg-neutral-900" : "bg-white"} ${item.is_available ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug">
          {item.name}
          {item.is_featured && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />}
        </p>
        {item.description && (
          <p className={`mt-1 text-[13px] leading-relaxed ${expanded ? "" : "line-clamp-2"} ${dark ? "text-neutral-400" : "text-slate-500"}`}>{item.description}</p>
        )}
        <div className="mt-2">{priceBlock}</div>
        {metaBlock}
        {!item.is_available && <span className="mt-1.5 inline-block rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t.unavailable}</span>}
        {addControl}
      </div>
      {item.image_url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-[92px] w-[92px] shrink-0 rounded-xl object-cover" loading="lazy" />
        : <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}18` }}><UtensilsCrossed size={24} style={{ color: accent }} /></div>}
    </div>
  );
}
