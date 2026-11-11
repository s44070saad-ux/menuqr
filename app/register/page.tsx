"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { ErrorBox, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null);
    const cleanEmail = email.trim();

    const { data, error: err } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (err || !data.user) {
      setBusy(false);
      setError(err?.message ?? "Registration failed. Please try again.");
      return;
    }

    // Profile fallback insert. The DB trigger (handle_new_user) normally
    // creates the profile, but we also try here so registration works even
    // if the trigger is missing. Two shapes are covered by schema.sql RLS:
    //  - session present  -> profiles_insert_own (id = auth.uid(), role owner)
    //  - email-confirm ON -> signUp returns NO session, insert arrives as
    //    anon -> profiles_insert_signup (role must be 'owner').
    // ON CONFLICT is handled by ignoring the duplicate error.
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      email: cleanEmail,
      full_name: fullName.trim() || cleanEmail.split("@")[0],
      role: "owner",
    });
    if (profileError && !/duplicate|already exists|conflict/i.test(profileError.message)) {
      // Not fatal: the trigger likely created it, or it will exist at login.
      console.warn("Profile fallback insert:", profileError.message);
    }

    setBusy(false);
    if (!data.session) {
      // Email confirmation is enabled in Supabase Auth settings.
      setNeedsConfirm(true);
      return;
    }
    router.replace("/dashboard/restaurant?welcome=1");
  }

  if (needsConfirm) {
    return (
      <AuthShell title="Check your email" subtitle="One last step to activate your account.">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <CheckCircle2 size={20} className="mb-2 text-emerald-600" />
          We sent a confirmation link to <strong>{email.trim()}</strong>. Open it, then{" "}
          <Link href="/login" className="font-medium underline">log in</Link> to set up your restaurant.
          Your profile has already been created — you will land straight in your dashboard.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your free account" subtitle="Start with the Free plan: 5 menu items, 1 restaurant, permanent QR code.">
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBox message={error} />
        <div>
          <label className={labelCls} htmlFor="name">Your name</label>
          <input id="name" type="text" required autoComplete="name" className={inputCls}
            placeholder="e.g. Ahmed Khan" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className={inputCls}
            placeholder="you@restaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={6} autoComplete="new-password" className={inputCls}
            placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy && <Loader2 size={18} className="animate-spin" />} Create account
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account? <Link href="/login" className="font-medium text-brand underline">Log in</Link>
      </p>
    </AuthShell>
  );
}
