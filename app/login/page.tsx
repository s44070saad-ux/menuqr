"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { ErrorBox, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err || !data.user) {
      setBusy(false);
      setError(err?.message ?? "Login failed. Check your email and password.");
      return;
    }
    // Route super admins to /admin, everyone else to the owner dashboard.
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    router.replace(profile?.role === "super_admin" ? "/admin" : "/dashboard");
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage your restaurant menu and QR code.">
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBox message={error} />
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className={inputCls}
            placeholder="you@restaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className={inputCls}
            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy && <Loader2 size={18} className="animate-spin" />} Log in
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        New to MenuQR? <Link href="/register" className="font-medium text-brand underline">Create a free account</Link>
      </p>
    </AuthShell>
  );
}
