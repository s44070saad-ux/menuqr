"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ImageField from "@/components/ImageField";
import { Card, ErrorBox, Loading, SuccessBox, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import { slugify } from "@/lib/utils";

const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "INR", "BDT"];
const LANGUAGES = [
  { code: "en", label: "English" }, { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" }, { code: "hi", label: "Hindi" },
];

export default function RestaurantProfilePage() {
  const { loading, userId, restaurant, refresh } = useOwner();
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const [form, setForm] = useState({
    name: "", slug: "", description: "", address: "", phone: "", whatsapp: "",
    opening_hours: "", currency: "PKR", default_language: "en",
    theme: "light", accent_color: "#0F766E", logo_url: "", cover_url: "",
    is_published: true,
  });

  useEffect(() => {
    setWelcome(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1");
  }, []);

  useEffect(() => {
    if (restaurant) {
      setSlugTouched(true);
      setForm({
        name: restaurant.name, slug: restaurant.slug,
        description: restaurant.description ?? "", address: restaurant.address ?? "",
        phone: restaurant.phone ?? "", whatsapp: restaurant.whatsapp ?? "",
        opening_hours: restaurant.opening_hours ?? "", currency: restaurant.currency,
        default_language: restaurant.default_language, theme: restaurant.theme,
        accent_color: restaurant.accent_color, logo_url: restaurant.logo_url ?? "",
        cover_url: restaurant.cover_url ?? "", is_published: restaurant.is_published,
      });
    }
  }, [restaurant]);

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "name" && !slugTouched) next.slug = slugify(String(v));
      return next;
    });
    if (k === "slug") setSlugTouched(true);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId) return;
    setBusy(true); setError(null); setSuccess(null);
    const slug = slugify(form.slug || form.name);
    if (!form.name.trim()) { setBusy(false); setError("Restaurant name is required."); return; }
    if (!slug) { setBusy(false); setError("Please give your menu a valid URL slug (letters and numbers)."); return; }

    const payload = {
      name: form.name.trim(), slug,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      opening_hours: form.opening_hours.trim() || null,
      currency: form.currency, default_language: form.default_language,
      theme: form.theme, accent_color: form.accent_color,
      logo_url: form.logo_url.trim() || null, cover_url: form.cover_url.trim() || null,
      is_published: form.is_published,
      status: form.is_published ? "published" : "draft",
    };

    const { data, error: err } = restaurant
      ? await supabase.from("restaurants").update(payload).eq("id", restaurant.id).select("*").single()
      : await supabase.from("restaurants").insert({ ...payload, owner_id: userId }).select("*").single();

    if (err) {
      setBusy(false);
      setError(/slug|duplicate|unique/i.test(err.message)
        ? "That menu URL is already taken. Try a different slug."
        : err.message);
      return;
    }

    // Keep restaurant_settings theme/colour in sync (the public menu reads
    // the restaurant row, but settings stay consistent for future features).
    if (data) {
      await supabase.from("restaurant_settings")
        .update({ theme: form.theme, primary_color: form.accent_color })
        .eq("restaurant_id", data.id);
    }
    setBusy(false);
    setSuccess(restaurant ? "Restaurant profile saved. Your public menu is updated instantly." : "Restaurant created! Your public menu and QR code are ready — now add categories and dishes.");
    refresh();
  }

  return (
    <DashboardShell title="Restaurant Profile">
      {welcome && !restaurant && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand-light/40 px-4 py-3 text-sm text-brand-dark">
          Welcome to MenuQR! Step 1: set up your restaurant below. Your menu page and permanent QR code are created automatically.
        </div>
      )}
      {loading ? <Loading label="Loading restaurant profile…" /> : (
        <form onSubmit={onSubmit} className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />
          <Card className="space-y-4">
            <h2 className="font-heading text-base font-semibold text-ink">Basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="name">Restaurant name *</label>
                <input id="name" className={inputCls} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Royal Bites" />
              </div>
              <div>
                <label className={labelCls} htmlFor="slug">Menu URL slug *</label>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-sm text-slate-400">/menu/</span>
                  <input id="slug" className={inputCls} required value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="royal-bites" />
                </div>
                <p className="mt-1 text-xs text-slate-500">This is your permanent link — it is printed inside your QR code. Changing it later changes the QR target.</p>
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="description">Description</label>
              <textarea id="description" className={inputCls} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short line about your food, e.g. Wood-fired pizza and desi BBQ in the heart of the city." />
            </div>
            <ImageField label="Logo" kind="logo" value={form.logo_url} onChange={(v) => set("logo_url", v)} userId={userId} restaurantId={restaurant?.id ?? null} />
            <ImageField label="Cover / banner image" kind="cover" value={form.cover_url} onChange={(v) => set("cover_url", v)} userId={userId} restaurantId={restaurant?.id ?? null} />
            {!restaurant && <p className="-mt-2 text-xs text-slate-500">Tip: save the restaurant once, then come back to upload logo/cover files (uploads need the saved restaurant). Pasting image URLs works right away.</p>}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-heading text-base font-semibold text-ink">Contact & location</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="address">Address</label>
                <input id="address" className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Main Bazaar Road, Chowk Azam" />
              </div>
              <div>
                <label className={labelCls} htmlFor="hours">Opening hours</label>
                <input id="hours" className={inputCls} value={form.opening_hours} onChange={(e) => set("opening_hours", e.target.value)} placeholder="e.g. Mon–Sun · 11:00 AM – 11:00 PM" />
              </div>
              <div>
                <label className={labelCls} htmlFor="phone">Phone number</label>
                <input id="phone" type="tel" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0300 1234567" />
              </div>
              <div>
                <label className={labelCls} htmlFor="whatsapp">WhatsApp number</label>
                <input id="whatsapp" type="tel" className={inputCls} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="923001234567 (with country code)" />
                <p className="mt-1 text-xs text-slate-500">Shown as a WhatsApp button on your public menu.</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-heading text-base font-semibold text-ink">Menu appearance</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="currency">Currency</label>
                <select id="currency" className={inputCls} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="lang">Default language</label>
                <select id="lang" className={inputCls} value={form.default_language} onChange={(e) => set("default_language", e.target.value)}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="theme">Menu theme</label>
                <select id="theme" className={inputCls} value={form.theme} onChange={(e) => set("theme", e.target.value)}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="accent">Accent colour</label>
                <div className="flex items-center gap-3">
                  <input id="accent" type="color" value={form.accent_color} onChange={(e) => set("accent_color", e.target.value)}
                    className="h-11 w-16 cursor-pointer rounded-xl border border-slate-300 bg-white p-1" />
                  <span className="text-sm text-slate-600">{form.accent_color}</span>
                </div>
              </div>
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_published} onChange={(e) => set("is_published", e.target.checked)} className="h-5 w-5 accent-teal-700" />
              Menu is published (customers can open it via the QR code)
            </label>
          </Card>

          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {restaurant ? "Save changes" : "Create restaurant"}
          </button>
        </form>
      )}
    </DashboardShell>
  );
}
