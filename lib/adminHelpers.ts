// Re-exports used by the Super Admin page (kept separate so the admin
// bundle's imports read clearly).
export { supabase, isSupabaseConfigured } from "./supabaseClient";
export { NotConfigured as NotConfiguredState } from "@/components/ui";
