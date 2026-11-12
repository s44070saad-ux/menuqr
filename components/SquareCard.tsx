"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Store } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Card, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";

/**
 * Phase 5 — Square POS connect card (Orders page).
 * The restaurant connects its own Square account (OAuth); Velora
 * can then push orders into Square so staff stop double-entering.
 * Platform state is probed honestly: until Velora's Square app
 * credentials exist in the platform env, the card says setup is
 * pending instead of showing a dead Connect button.
 */
export default function SquareCard({ restaurantId, squareEnabled, locationName, merchantId, onChanged }: {
  restaurantId: string;
  squareEnabled: boolean;
  locationName: string | null;
  merchantId: string | null;
  onChanged: () => void;
}) {
  const [platformReady, setPlatformReady] = useState<boolean | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const connected = Boolean(merchantId);

  const token = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) { setPlatformReady(false); return; }
      try {
        const res = await fetch("/api/square/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ restaurantId }),
        });
        if (res.status === 501) { setPlatformReady(false); return; }
        setPlatformReady(true);
        if (res.ok) {
          const json = (await res.json()) as { locations?: { id: string; name: string }[] };
          setLocations(json.locations ?? []);
          if (json.locations?.[0]) setPick(json.locations[0].id);
        }
      } catch { setPlatformReady(false); }
      try {
        const q = new URLSearchParams(window.location.search).get("square");
        if (q === "connected") setNote("Square connected — now choose which location receives Velora orders.");
        else if (q === "error") setNote("Square connection didn't finish. Please try Connect again.");
        else if (q === "not_configured") setNote("Square isn't configured on the platform yet.");
      } catch { /* ignore */ }
    })();
  }, [restaurantId, token]);

  async function connect() {
    const t = await token();
    if (!t) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/square/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ restaurantId }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (res.ok && json.url) { window.location.href = json.url; return; }
      setNote(json.error === "PLATFORM_NOT_CONFIGURED" ? "Square isn't configured on the platform yet." : "Could not start the Square connection. Please try again.");
    } catch { setNote("Could not start the Square connection. Please try again."); }
    setBusy(false);
  }

  async function saveLocation() {
    const t = await token();
    if (!t || !pick) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/square/locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ restaurantId, locationId: pick, locationName: locations?.find((l) => l.id === pick)?.name ?? null }),
      });
      if (res.ok) { setNote("Saved — new orders can now be sent to Square from this page."); onChanged(); }
      else setNote("Could not save the location. Please try again.");
    } catch { setNote("Could not save the location. Please try again."); }
    setBusy(false);
  }

  async function disconnect() {
    const t = await token();
    if (!t) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/square/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ restaurantId }),
      });
      if (res.ok) { setNote("Square disconnected."); onChanged(); }
      else setNote("Could not disconnect. Please try again.");
    } catch { setNote("Could not disconnect. Please try again."); }
    setBusy(false);
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-heading text-base font-bold text-ink">
        <Store size={19} className="text-brand" /> Square POS
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Connect your own Square account and send Velora orders straight into Square — no more
        double-entering orders at the till. Velora never touches your Square payments.
      </p>

      {platformReady === false && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          Platform setup pending — Square connection opens as soon as Velora&apos;s Square app is
          configured. Nothing you need to do here yet.
        </p>
      )}

      {platformReady && !connected && (
        <div className="mt-3">
          <button type="button" onClick={connect} disabled={busy} className={btnPrimary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Store size={16} />} Connect Square
          </button>
        </div>
      )}

      {platformReady && connected && (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <CheckCircle2 size={16} /> Connected{locationName && squareEnabled ? ` — sending to ${locationName}` : ""}
          </p>
          {locations && locations.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="sq-loc">Square location for Velora orders</label>
              <div className="flex gap-2">
                <select id="sq-loc" className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button type="button" onClick={saveLocation} disabled={busy} className={btnPrimary}>Save</button>
              </div>
            </div>
          )}
          <button type="button" onClick={disconnect} disabled={busy} className={btnGhost}>Disconnect Square</button>
        </div>
      )}

      {note && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{note}</p>}
    </Card>
  );
}
