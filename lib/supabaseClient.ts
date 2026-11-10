import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/** True when the two public Supabase env vars are present. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Browser Supabase client — plain supabase-js with client-side auth
 * (the pattern that worked for PharmaHub). Only the public anon /
 * publishable key is ever used here. The service_role key must NEVER
 * appear in this codebase.
 *
 * When env vars are missing the client is `null` and pages render a
 * clear "Supabase not connected — follow SETUP.md" state instead of
 * crashing or showing fake/demo data.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/** Permanent public menu URL for a restaurant slug. */
export function menuUrlFor(slug: string): string {
  const base = SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/menu/${slug}`;
}
