import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Phase 5 — machine translation for menu text (free tier).
 * Uses the MyMemory translation API (no key required; anonymous
 * quota is small, so results are CACHED in the *_translations
 * tables forever — each string is only ever translated once, and
 * TRANSLATE_EMAIL in the Vercel env raises the daily quota if set).
 * Writes go through the owner's own session + RLS, so no service
 * key is needed here. Translates at most MAX_STRINGS strings per
 * call and reports how many remain, so the dashboard can simply
 * call again ("Translate more").
 */

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MAX_STRINGS = 40;
const LANGS = ["es", "fr", "de", "it"] as const;

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Provider order (both free, no account): MyMemory first (with
 * TRANSLATE_EMAIL set its quota is 10,000 words/day per email —
 * a full menu is a few hundred words; anonymous shared-IP quota
 * is often exhausted), Google Translate's public gtx endpoint as
 * fallback. Any "quota warning" text is rejected — a warning must
 * never be saved as a translation.
 */
async function viaGoogle(q: string, lang: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(q.slice(0, 480))}`;
    const res = await fetch(url, { headers: { "User-Agent": "Velora/1.0" } });
    if (!res.ok) return null;
    const json = (await res.json()) as [Array<[string]> | null, ...unknown[]];
    const parts = json?.[0];
    if (!Array.isArray(parts)) return null;
    const out = parts.map((p) => (Array.isArray(p) ? String(p[0] ?? "") : "")).join("").trim();
    return out || null;
  } catch {
    return null;
  }
}

async function viaMyMemory(q: string, lang: string): Promise<string | null> {
  try {
    const email = process.env.TRANSLATE_EMAIL;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q.slice(0, 480))}&langpair=en|${lang}${email ? `&de=${encodeURIComponent(email)}` : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": "Velora/1.0" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: string | number };
    const out = json?.responseData?.translatedText;
    if (!out || Number(json?.responseStatus) !== 200) return null;
    if (/MYMEMORY WARNING|AVAILABLE FREE TRANSLATIONS|INVALID EMAIL/i.test(out)) return null;
    return decodeEntities(out).trim();
  } catch {
    return null;
  }
}

async function translateOne(text: string, lang: string): Promise<string | null> {
  const q = text.trim();
  if (!q) return "";
  const out = (await viaMyMemory(q, lang)) ?? (await viaGoogle(q, lang));
  return out;
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.json({ error: "PLATFORM_NOT_CONFIGURED" }, { status: 501 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  let body: { restaurantId?: string; lang?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const restaurantId = body.restaurantId ?? "";
  const lang = body.lang ?? "";
  if (!restaurantId || !(LANGS as readonly string[]).includes(lang)) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  // RLS proves membership: owners only see their own restaurant.
  const { data: rest } = await db.from("restaurants").select("id").eq("id", restaurantId).maybeSingle();
  if (!rest) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [{ data: items }, { data: cats }, { data: itemTr }, { data: catTr }] = await Promise.all([
    db.from("menu_items").select("id,name,description").eq("restaurant_id", restaurantId),
    db.from("categories").select("id,name").eq("restaurant_id", restaurantId),
    db.from("menu_item_translations").select("item_id,name,description").eq("lang", lang),
    db.from("category_translations").select("category_id").eq("lang", lang),
  ]);
  // An item counts as done only when its description is translated
  // too (when it has one) — a name-only row must stay in the queue.
  const itemDescDone = new Map((itemTr ?? []).map((r) => {
    const row = r as { item_id: string; description: string | null };
    return [row.item_id, row.description] as const;
  }));
  const itemNameDone = new Map((itemTr ?? []).map((r) => {
    const row = r as { item_id: string; name: string };
    return [row.item_id, row.name] as const;
  }));
  const doneItems = new Set(
    ((items as { id: string; description: string | null }[] | null) ?? [])
      .filter((i) => itemDescDone.has(i.id) && (!i.description || itemDescDone.get(i.id)))
      .map((i) => i.id),
  );
  const doneCats = new Set((catTr ?? []).map((r) => (r as { category_id: string }).category_id));

  interface Job { kind: "item" | "category"; id: string; name: string; description: string | null }
  const jobs: Job[] = [];
  (cats ?? []).forEach((c) => {
    const row = c as { id: string; name: string };
    if (!doneCats.has(row.id)) jobs.push({ kind: "category", id: row.id, name: row.name, description: null });
  });
  (items ?? []).forEach((i) => {
    const row = i as { id: string; name: string; description: string | null };
    if (!doneItems.has(row.id)) jobs.push({ kind: "item", id: row.id, name: row.name, description: row.description });
  });

  let translated = 0;
  let stringsUsed = 0;
  let quotaHit = false;
  for (const job of jobs) {
    if (stringsUsed >= MAX_STRINGS) break;
    // Reuse an existing translated name (it may be a manual
    // correction) — only the missing description needs the API.
    const existingName = job.kind === "item" ? itemNameDone.get(job.id) : undefined;
    let name: string | null;
    if (existingName) {
      name = existingName;
    } else {
      name = await translateOne(job.name, lang);
      if (name === null) { quotaHit = true; break; }
      stringsUsed += 1;
    }
    let description: string | null = null;
    if (job.kind === "item" && job.description && stringsUsed < MAX_STRINGS) {
      description = await translateOne(job.description, lang);
      if (description === null) { quotaHit = true; break; }
      stringsUsed += 1;
    }
    if (job.kind === "category") {
      const { error } = await db.from("category_translations")
        .upsert({ category_id: job.id, lang, name, source: "machine", updated_at: new Date().toISOString() }, { onConflict: "category_id,lang" });
      if (!error) translated += 1;
    } else {
      const { error } = await db.from("menu_item_translations")
        .upsert({ item_id: job.id, lang, name, description, source: "machine", updated_at: new Date().toISOString() }, { onConflict: "item_id,lang" });
      if (!error) translated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    translated,
    remaining: Math.max(0, jobs.length - translated),
    quotaHit,
    note: quotaHit
      ? "The free translation service reached its limit for now — everything translated so far is saved. Try again later; it never re-charges for strings already done."
      : undefined,
  });
}
