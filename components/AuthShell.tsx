import Link from "next/link";
import type { ReactNode } from "react";
import { QrCode } from "lucide-react";
import { NotConfigured } from "./ui";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-appbg px-4 py-10 font-body">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><QrCode size={22} /></span>
          <span className="font-heading text-xl font-semibold text-ink">Velora</span>
        </Link>
        {!isSupabaseConfigured ? (
          <NotConfigured />
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-card sm:p-8">
            <h1 className="font-heading text-xl font-semibold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}
