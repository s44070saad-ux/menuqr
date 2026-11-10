"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

/** Shown instead of any fake/demo data when Supabase env vars are missing. */
export function NotConfigured() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center shadow-card">
      <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
      <h2 className="font-heading text-lg font-semibold text-ink">Supabase not connected</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        This app needs a real Supabase project before it can store restaurants, menus or accounts.
        No demo data is shown — follow <strong>SETUP.md</strong>: create a free Supabase project,
        run <code className="rounded bg-amber-100 px-1">supabase/schema.sql</code>, then set
        <code className="rounded bg-amber-100 px-1"> NEXT_PUBLIC_SUPABASE_URL</code> and
        <code className="rounded bg-amber-100 px-1"> NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel
        (or <code className="rounded bg-amber-100 px-1">.env.local</code>) and redeploy.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand underline">Back to home</Link>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Loader2 size={20} className="animate-spin text-brand" /> {label}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-card sm:p-5 ${className}`}>{children}</div>;
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <Card className="py-10 text-center">
      <p className="font-heading font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

export function SuccessBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>;
}

// Shared form classes (16px text on mobile via globals.css; 44px targets).
export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate-400 focus:border-brand";
export const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";
export const btnPrimary =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
export const btnDanger =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50";

export { isSupabaseConfigured };
