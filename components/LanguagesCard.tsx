"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Languages, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Card, btnGhost, btnPrimary } from "@/components/ui";

/**
 * Phase 5 — Menu languages (dashboard).
 * The owner enables languages; guests then get a language switcher
 * on the public menu (auto-detected from their phone). Dish and
 * category names come from stored translations: machine-translated
 * once via /api/translate (free tier, cached forever) and editable.
 * Spanish also translates the menu's buttons/labels; for French,
 * German and Italian the dish text translates and the interface
 * stays in English for now.
 */
const LANGS: { key: string; label: string; chrome: boolean }[] = [
  { key: "es", label: "Spanish (Español)", chrome: true },
  { key: "fr", label: "French (Français)", chrome: false },
  { key: "de", label: "German (Deutsch)", chrome: false },
  { key: "it", label: "Italian (Italiano)", chrome: false },
];

export default function LanguagesCard({ restaurantId, itemCount }: { restaurantId: string; itemCount: number }) {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: s }, { data: mine }] = await Promise.all([
      supabase.from("restaurant_settings").select("menu_languages").eq("restaurant_id", restaurantId).maybeSingle(),
      supabase.from("menu_items").select("id").eq("restaurant_id", restaurantId),
    ]);
    setEnabled(((s as { menu_languages?: string[] } | null)?.menu_languages) ?? []);
    const ids = ((mine as { id: string }[] | null) ?? []).map((r) => r.id);
    if (ids.length === 0) { setCounts({}); return; }
    // Translations are publicly readable, so scope the count to my items.
    const { data: tr } = await supabase.from("menu_item_translations").select("lang, item_id").in("item_id", ids);
    const c: Record<string, number> = {};
    (tr as { lang: string }[] | null ?? []).forEach((r) => { c[r.lang] = (c[r.lang] ?? 0) + 1; });
    setCounts(c);
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(lang: string, on: boolean) {
    if (!supabase) return;
    const next = on ? [...enabled, lang] : enabled.filter((l) => l !== lang);
    setSaving(true); setNote(null);
    const { error } = await supabase.from("restaurant_settings")
      .update({ menu_languages: next }).eq("restaurant_id", restaurantId);
    setSaving(false);
    if (error) { setNote(error.message); return; }
    setEnabled(next);
  }

  async function translate(lang: string) {
    if (!supabase) return;
    setBusy(lang); setNote(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setNote("Your session expired — sign in again."); return; }
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, lang }),
      });
      const json = (await res.json()) as { translated?: number; remaining?: number; note?: string; error?: string };
      if (!res.ok) { setNote(json.error === "PLATFORM_NOT_CONFIGURED" ? "Translation is not configured on the platform yet." : "Translation failed — please try again."); return; }
      setNote(
        (json.translated ? `Translated ${json.translated} more item${json.translated === 1 ? "" : "s"}. ` : "Nothing new to translate. ") +
        (json.remaining ? `${json.remaining} remaining — press Translate again to continue. ` : "Everything is translated. ") +
        (json.note ?? ""),
      );
      await load();
    } catch {
      setNote("Translation failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <Languages size={18} className="text-brand" /> Menu languages
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Write your menu once — guests see it in their language. Their phone language is detected
        automatically, and they can switch with the language button on your menu. Translations are
        machine-generated once and saved; ask us if you spot one you want corrected.
      </p>
      <div className="mt-3 space-y-2">
        {LANGS.map((l) => {
          const on = enabled.includes(l.key);
          const done = counts[l.key] ?? 0;
          return (
            <div key={l.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
              <label className="flex min-w-44 flex-1 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={on} disabled={saving} onChange={(e) => toggle(l.key, e.target.checked)} className="h-4 w-4 accent-teal-700" />
                {l.label}
              </label>
              {on && (
                <>
                  <span className="text-xs text-slate-500">
                    {done >= itemCount && itemCount > 0 ? <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><Check size={13} /> All {itemCount} dishes translated</span> : `${done} of ${itemCount} dishes translated`}
                    {!l.chrome && " · dish text only"}
                  </span>
                  <button type="button" disabled={busy === l.key} onClick={() => translate(l.key)} className={done >= itemCount && itemCount > 0 ? btnGhost : btnPrimary}>
                    {busy === l.key ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
                    {done === 0 ? "Auto-translate" : "Translate more"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {note && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{note}</p>}
    </Card>
  );
}
