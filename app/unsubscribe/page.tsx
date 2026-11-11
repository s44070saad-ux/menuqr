"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/** Phase 3 — win-back email unsubscribe landing (linked from emails). */
function UnsubscribeInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "invalid">("working");

  useEffect(() => {
    const c = params.get("c");
    const t = params.get("t");
    if (!supabase || !c || !t) { setState("invalid"); return; }
    (async () => {
      const { data } = await supabase.rpc("unsubscribe_customer", { p_customer_id: c, p_token: t });
      setState((data as { ok?: boolean } | null)?.ok ? "done" : "invalid");
    })();
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-card">
        {state === "working" && <p className="text-sm text-slate-500">Unsubscribing you…</p>}
        {state === "done" && (
          <>
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <h1 className="mt-3 font-heading text-lg font-bold text-ink">You're unsubscribed</h1>
            <p className="mt-1 text-sm text-slate-500">You won't receive win-back or offer emails from this restaurant anymore. Order updates are unaffected.</p>
          </>
        )}
        {state === "invalid" && (
          <>
            <XCircle size={40} className="mx-auto text-red-400" />
            <h1 className="mt-3 font-heading text-lg font-bold text-ink">Link not valid</h1>
            <p className="mt-1 text-sm text-slate-500">This unsubscribe link is incomplete or no longer matches our records.</p>
          </>
        )}
        <p className="mt-6 text-[11px] text-slate-400">Powered by Velora</p>
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-sm text-slate-500">Loading…</p></main>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
