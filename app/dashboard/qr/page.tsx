"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Download, FileImage, FileCode2, Printer, Store, ExternalLink, RefreshCw, Plus, Trash2, Armchair,
  Palette, Save, Loader2,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { menuUrlFor, qrUrlFor, supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import type { QrCode as QrRow } from "@/lib/types";

async function makeQr(url: string, color = "#101828", withLogoSpace = false) {
  const ec = withLogoSpace ? "H" : "M"; // H survives a logo covering the centre
  const [png, svg] = await Promise.all([
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: ec, color: { dark: color, light: "#FFFFFF" } }),
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: ec, color: { dark: color, light: "#FFFFFF" } }),
  ]);
  return { png, svg };
}

/** Draw the restaurant logo into the centre of a QR PNG (canvas). */
async function composeLogoPng(qrPng: string, logoUrl: string): Promise<string> {
  const load = (src: string, cors = true) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const qr = await load(qrPng, false);
  let logo: HTMLImageElement;
  try { logo = await load(logoUrl); } catch { logo = await load(logoUrl, false); }
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrPng;
  ctx.drawImage(qr, 0, 0, size, size);
  const box = 132; // white badge in the middle
  const x = (size - box) / 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(x - 8, x - 8, box + 16, box + 16, 24);
  ctx.fill();
  // Cover-fit the logo into the badge (clip to rounded rect).
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, x, box, box, 18);
  ctx.clip();
  const scale = Math.max(box / logo.width, box / logo.height);
  const w = logo.width * scale, h = logo.height * scale;
  ctx.drawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
  ctx.restore();
  try { return canvas.toDataURL("image/png"); } catch { return qrPng; }
}

const QR_SWATCHES = ["#101828", "#0F766E", "#B91C1C", "#1D4ED8", "#7C2D12", "#6D28D9", "#BE185D", "#92400E"];

function download(href: string, filename: string, isBlob = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  if (isBlob) setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export default function QrPage() {
  const { loading, restaurant } = useOwner();
  const [pngUrl, setPngUrl] = useState("");
  const [svgText, setSvgText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Table QRs
  const [tableCodes, setTableCodes] = useState<QrRow[]>([]);
  const [tableImages, setTableImages] = useState<Record<string, string>>({});
  const [tableCount, setTableCount] = useState("10");
  const [customTable, setCustomTable] = useState("");
  const [busyTables, setBusyTables] = useState(false);

  // QR styling (saved on restaurant_settings)
  const [qrColor, setQrColor] = useState("#101828");
  const [cardStyle, setCardStyle] = useState<"classic" | "dark" | "accent">("classic");
  const [logoCenter, setLogoCenter] = useState(true);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);

  const plainUrl = restaurant ? menuUrlFor(restaurant.slug) : "";
  const mainQrUrl = restaurant ? qrUrlFor(restaurant.slug) : "";
  const accent = restaurant?.accent_color || "#0F766E";

  useEffect(() => {
    if (!supabase || !restaurant) return;
    (async () => {
      const { data } = await supabase.from("restaurant_settings")
        .select("qr_color, card_style").eq("restaurant_id", restaurant.id).single();
      const s = data as { qr_color?: string; card_style?: string } | null;
      if (s?.qr_color) setQrColor(s.qr_color);
      if (s?.card_style === "dark" || s?.card_style === "accent" || s?.card_style === "classic") {
        setCardStyle(s.card_style);
      }
      setStyleLoaded(true);
    })();
  }, [restaurant]);

  useEffect(() => {
    if (!restaurant || !mainQrUrl || !styleLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const wantLogo = logoCenter && Boolean(restaurant.logo_url);
        const { png, svg } = await makeQr(mainQrUrl, qrColor, wantLogo);
        let finalPng = png;
        if (wantLogo) {
          try { finalPng = await composeLogoPng(png, restaurant.logo_url!); }
          catch { finalPng = png; /* logo overlay is cosmetic — plain QR still scans */ }
        }
        if (!cancelled) { setPngUrl(finalPng); setSvgText(svg); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not generate the QR code.");
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant, mainQrUrl, qrColor, logoCenter, styleLoaded]);

  async function saveStyle() {
    if (!supabase || !restaurant || savingStyle) return;
    setSavingStyle(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("restaurant_settings")
      .update({ qr_color: qrColor, card_style: cardStyle }).eq("restaurant_id", restaurant.id);
    if (err) setError(err.message);
    else setSuccess("QR style saved. Table QR codes below now use your colour too.");
    setSavingStyle(false);
  }

  const loadTables = useCallback(async () => {
    if (!supabase || !restaurant) return;
    const { data } = await supabase.from("qr_codes").select("*")
      .eq("restaurant_id", restaurant.id).eq("kind", "table").eq("is_active", true)
      .order("created_at", { ascending: true });
    const rows = (data as QrRow[]) ?? [];
    rows.sort((a, b) => (parseInt(a.table_number ?? "0", 10) || 999) - (parseInt(b.table_number ?? "0", 10) || 999));
    setTableCodes(rows);
    // Generate images for any new rows.
    const imgs: Record<string, string> = {};
    for (const row of rows) {
      const { png } = await makeQr(qrUrlFor(restaurant.slug, row.table_number), qrColor);
      imgs[row.id] = png;
    }
    setTableImages(imgs);
  }, [restaurant, qrColor]);

  useEffect(() => { loadTables(); }, [loadTables]);

  async function generateTables() {
    if (!supabase || !restaurant || busyTables) return;
    const n = parseInt(tableCount, 10);
    if (!n || n < 1 || n > 100) { setError("Enter a number of tables between 1 and 100."); return; }
    setBusyTables(true); setError(null); setSuccess(null);
    const existing = new Set(tableCodes.map((t) => t.table_number));
    const toCreate = [];
    for (let i = 1; i <= n; i++) {
      if (!existing.has(String(i))) toCreate.push({ restaurant_id: restaurant.id, label: `Table ${i}`, kind: "table", table_number: String(i) });
    }
    if (toCreate.length === 0) { setSuccess(`Tables 1–${n} already have QR codes.`); setBusyTables(false); return; }
    const { error: err } = await supabase.from("qr_codes").insert(toCreate);
    if (err) setError(err.message);
    else { setSuccess(`${toCreate.length} table QR code${toCreate.length === 1 ? "" : "s"} created.`); await loadTables(); }
    setBusyTables(false);
  }

  async function addCustomTable() {
    if (!supabase || !restaurant || busyTables) return;
    const t = customTable.trim();
    if (!t) { setError("Enter a table number or name, e.g. 7 or Counter."); return; }
    setBusyTables(true); setError(null); setSuccess(null);
    const { error: err } = await supabase.from("qr_codes")
      .insert({ restaurant_id: restaurant.id, label: `Table ${t}`, kind: "table", table_number: t });
    if (err) setError(err.message.includes("duplicate") || err.message.includes("unique") ? `Table ${t} already has a QR code.` : err.message);
    else { setCustomTable(""); setSuccess(`QR code for Table ${t} created.`); await loadTables(); }
    setBusyTables(false);
  }

  async function removeTable(row: QrRow) {
    if (!supabase || busyTables) return;
    if (!window.confirm(`Remove the QR code for Table ${row.table_number}? Printed copies of it will stop being recognised as that table.`)) return;
    setBusyTables(true); setError(null);
    const { error: err } = await supabase.from("qr_codes").delete().eq("id", row.id);
    if (err) setError(err.message); else await loadTables();
    setBusyTables(false);
  }

  return (
    <DashboardShell title="QR Code">
      {loading ? <Loading label="Loading your QR code…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Your permanent QR code is created automatically with your restaurant."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <SuccessBox message={success} />

          {/* ---------- Main QR ---------- */}
          <Card className="text-center">
            <p className="text-sm text-slate-500">Your permanent menu link</p>
            <a href={plainUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all font-heading text-base font-semibold text-brand-dark hover:underline">
              {plainUrl} <ExternalLink size={16} className="shrink-0" />
            </a>
            <div className="mx-auto mt-5 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
              {pngUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={pngUrl} alt={`QR code for ${restaurant.name}`} className="h-56 w-56" />
                : <div className="flex h-56 w-56 items-center justify-center text-sm text-slate-400">Generating…</div>}
            </div>
            <p className="mx-auto mt-4 flex max-w-md items-start justify-center gap-1.5 text-sm text-slate-500">
              <RefreshCw size={16} className="mt-0.5 shrink-0 text-brand" />
              This main QR code never changes. Update prices or dishes anytime — the same printed code keeps working.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => pngUrl && download(pngUrl, `${restaurant.slug}-qr.png`)} disabled={!pngUrl} className={btnPrimary}><FileImage size={18} /> Download PNG</button>
              <button type="button" onClick={() => svgText && download(URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" })), `${restaurant.slug}-qr.svg`, true)} disabled={!svgText} className={btnGhost}><FileCode2 size={18} /> Download SVG</button>
              <button type="button" onClick={() => window.print()} disabled={!pngUrl} className={btnGhost}><Printer size={18} /> Print table card</button>
            </div>
            <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-slate-400">
              New downloads of this code now mark visits as true QR scans in Analytics. Codes you printed
              earlier keep working exactly the same — they are simply counted as link visits.
            </p>
          </Card>

          {/* ---------- QR style ---------- */}
          <Card>
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
              <Palette size={19} className="text-brand" /> QR style
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              Make the code yours — pick a colour, put your logo in the centre (it still scans perfectly),
              and choose a table-card design. Colours apply to table QR codes too.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>QR colour</label>
                <div className="flex flex-wrap items-center gap-2">
                  {QR_SWATCHES.map((c) => (
                    <button key={c} type="button" aria-label={`QR colour ${c}`} onClick={() => setQrColor(c)}
                      className={`h-10 w-10 rounded-full border-2 ${qrColor === c ? "ring-2 ring-brand ring-offset-2" : "border-black/10"}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={qrColor} onChange={(e) => setQrColor(e.target.value)} aria-label="Custom QR colour"
                    className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
                  <span className="text-sm text-slate-600">{qrColor}</span>
                </div>
                <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={logoCenter} disabled={!restaurant.logo_url}
                    onChange={(e) => setLogoCenter(e.target.checked)} className="h-5 w-5 accent-teal-700" />
                  Logo in the centre of the main QR{restaurant.logo_url ? "" : " (add a logo in Restaurant Profile first)"}
                </label>
                <p className="text-xs leading-relaxed text-slate-400">
                  Tip: SVG downloads stay logo-free (best for print shops); the PNG carries your logo.
                </p>
              </div>
              <div>
                <label className={labelCls}>Table card design</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "classic", label: "Classic", cls: "border-ink bg-white text-ink" },
                    { id: "dark", label: "Midnight", cls: "border-ink bg-ink text-white" },
                    { id: "accent", label: "Brand band", cls: "border-slate-300 bg-white text-ink" },
                  ] as const).map((s) => (
                    <button key={s.id} type="button" onClick={() => setCardStyle(s.id)}
                      className={`rounded-2xl border-2 px-2 py-3 text-center ${s.cls} ${cardStyle === s.id ? "ring-2 ring-brand ring-offset-2" : ""}`}>
                      {s.id === "accent" && <span className="mx-auto mb-1.5 block h-2.5 w-10 rounded-full" style={{ background: accent }} />}
                      <span className="block font-heading text-xs font-bold">{restaurant.name.slice(0, 12)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-70">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" onClick={saveStyle} disabled={savingStyle} className={`${btnPrimary} mt-4`}>
              {savingStyle ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Save QR style
            </button>
          </Card>

          {/* Printable card — only this area prints (see globals.css @media print) */}
          <div>
            <h2 className="mb-3 font-heading text-base font-semibold text-ink">Printable table card preview</h2>
            <div className={`print-area mx-auto max-w-sm overflow-hidden rounded-3xl border-2 text-center shadow-card ${
              cardStyle === "dark" ? "border-ink bg-ink text-white" : "border-ink bg-white text-ink"}`}
              style={cardStyle === "accent" ? { borderColor: accent } : undefined}>
              {cardStyle === "accent" && <div className="h-3.5 w-full" style={{ background: accent }} />}
              <div className="px-6 py-8">
              {restaurant.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logo_url} alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" />
              )}
              <p className="font-heading text-2xl font-bold">{restaurant.name}</p>
              <p className={`mt-1 text-sm tracking-wide ${cardStyle === "dark" ? "text-slate-300" : "text-slate-500"}`}>SCAN TO VIEW OUR MENU</p>
              {pngUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pngUrl} alt={`QR code for ${restaurant.name}`} className="mx-auto mt-4 h-52 w-52 rounded-xl bg-white p-1.5" />
              )}
              <p className={`mt-4 break-all text-xs ${cardStyle === "dark" ? "text-slate-300" : "text-slate-500"}`}>{plainUrl}</p>
              <p className={`mt-2 text-[11px] uppercase tracking-widest ${cardStyle === "dark" ? "text-slate-400" : "text-slate-400"}`}>Powered by Velora</p>
              </div>
            </div>
          </div>

          {/* ---------- Table QRs ---------- */}
          <Card>
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
              <Armchair size={19} className="text-brand" /> Table QR codes
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              One QR per table. When a customer scans their table's code, the menu knows their table —
              dine-in orders arrive in your Orders page with the table number attached, and scans are
              counted per table in Analytics.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="tbl-count">Generate tables 1 to…</label>
                <div className="flex gap-2">
                  <input id="tbl-count" type="number" min={1} max={100} value={tableCount}
                    onChange={(e) => setTableCount(e.target.value)} className={inputCls} />
                  <button type="button" onClick={generateTables} disabled={busyTables} className={`${btnPrimary} shrink-0`}>
                    <Plus size={17} /> Generate
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="tbl-custom">Add one table / spot</label>
                <div className="flex gap-2">
                  <input id="tbl-custom" value={customTable} onChange={(e) => setCustomTable(e.target.value)}
                    placeholder="e.g. 11 or Counter" className={inputCls} />
                  <button type="button" onClick={addCustomTable} disabled={busyTables} className={`${btnGhost} shrink-0`}>
                    <Plus size={17} /> Add
                  </button>
                </div>
              </div>
            </div>

            {tableCodes.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {tableCodes.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                    <p className="font-heading text-sm font-bold text-ink">Table {row.table_number}</p>
                    {tableImages[row.id]
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img src={tableImages[row.id]} alt={`QR code for table ${row.table_number}`} className="mx-auto mt-2 h-28 w-28" />
                      : <div className="mx-auto mt-2 flex h-28 w-28 items-center justify-center text-xs text-slate-400">Generating…</div>}
                    <div className="mt-2 flex justify-center gap-1.5">
                      <button type="button" disabled={!tableImages[row.id]}
                        onClick={() => download(tableImages[row.id], `${restaurant.slug}-table-${row.table_number}-qr.png`)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50">
                        <Download size={13} /> PNG
                      </button>
                      <button type="button" disabled={busyTables} onClick={() => removeTable(row)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="flex items-center gap-3">
            <Download size={20} className="shrink-0 text-brand" />
            <p className="text-sm text-slate-600">
              PNG is best for printing and sharing on WhatsApp. SVG is best for large banners and professional print shops — it stays sharp at any size.
            </p>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
