"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Download, FileImage, FileCode2, Printer, Store, ExternalLink, RefreshCw, Plus, Trash2, Armchair,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, SuccessBox, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { menuUrlFor, qrUrlFor, supabase } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";
import type { QrCode as QrRow } from "@/lib/types";

async function makeQr(url: string) {
  const [png, svg] = await Promise.all([
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#FFFFFF" } }),
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#FFFFFF" } }),
  ]);
  return { png, svg };
}

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

  const plainUrl = restaurant ? menuUrlFor(restaurant.slug) : "";
  const mainQrUrl = restaurant ? qrUrlFor(restaurant.slug) : "";

  useEffect(() => {
    if (!restaurant || !mainQrUrl) return;
    (async () => {
      try {
        const { png, svg } = await makeQr(mainQrUrl);
        setPngUrl(png);
        setSvgText(svg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate the QR code.");
      }
    })();
  }, [restaurant, mainQrUrl]);

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
      const { png } = await makeQr(qrUrlFor(restaurant.slug, row.table_number));
      imgs[row.id] = png;
    }
    setTableImages(imgs);
  }, [restaurant]);

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

          {/* Printable card — only this area prints (see globals.css @media print) */}
          <div>
            <h2 className="mb-3 font-heading text-base font-semibold text-ink">Printable table card preview</h2>
            <div className="print-area mx-auto max-w-sm rounded-3xl border-2 border-ink bg-white px-6 py-8 text-center shadow-card">
              {restaurant.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logo_url} alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" />
              )}
              <p className="font-heading text-2xl font-bold text-ink">{restaurant.name}</p>
              <p className="mt-1 text-sm tracking-wide text-slate-500">SCAN TO VIEW OUR MENU</p>
              {pngUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pngUrl} alt={`QR code for ${restaurant.name}`} className="mx-auto mt-4 h-52 w-52" />
              )}
              <p className="mt-4 break-all text-xs text-slate-500">{plainUrl}</p>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-400">Powered by MenuQR</p>
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
