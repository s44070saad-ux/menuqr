"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, FileImage, FileCode2, Printer, Store, ExternalLink, RefreshCw } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Card, EmptyState, ErrorBox, Loading, btnGhost, btnPrimary } from "@/components/ui";
import { menuUrlFor } from "@/lib/supabaseClient";
import { useOwner } from "@/lib/useOwner";

export default function QrPage() {
  const { loading, restaurant } = useOwner();
  const [pngUrl, setPngUrl] = useState<string>("");
  const [svgText, setSvgText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const generatedFor = useRef<string>("");

  const url = restaurant ? menuUrlFor(restaurant.slug) : "";

  useEffect(() => {
    if (!restaurant || !url || generatedFor.current === url) return;
    generatedFor.current = url;
    (async () => {
      try {
        const [png, svg] = await Promise.all([
          QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#FFFFFF" } }),
          QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#FFFFFF" } }),
        ]);
        setPngUrl(png);
        setSvgText(svg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate the QR code.");
      }
    })();
  }, [restaurant, url]);

  function downloadPng() {
    if (!pngUrl || !restaurant) return;
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `${restaurant.slug}-qr.png`;
    a.click();
  }

  function downloadSvg() {
    if (!svgText || !restaurant) return;
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${restaurant.slug}-qr.svg`;
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <DashboardShell title="QR Code">
      {loading ? <Loading label="Loading your QR code…" /> : !restaurant ? (
        <EmptyState title="Set up your restaurant first" hint="Your permanent QR code is created automatically with your restaurant."
          action={<Link href="/dashboard/restaurant" className={btnPrimary}><Store size={18} /> Set up my restaurant</Link>} />
      ) : (
        <div className="space-y-5">
          <ErrorBox message={error} />
          <Card className="text-center">
            <p className="text-sm text-slate-500">Your permanent menu link</p>
            <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all font-heading text-base font-semibold text-brand-dark hover:underline">
              {url} <ExternalLink size={16} className="shrink-0" />
            </a>
            <div className="mx-auto mt-5 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
              {pngUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={pngUrl} alt={`QR code for ${restaurant.name}`} className="h-56 w-56" />
                : <div className="flex h-56 w-56 items-center justify-center text-sm text-slate-400">Generating…</div>}
            </div>
            <p className="mx-auto mt-4 flex max-w-md items-start justify-center gap-1.5 text-sm text-slate-500">
              <RefreshCw size={16} className="mt-0.5 shrink-0 text-brand" />
              This QR code never changes. Update prices or dishes anytime — the same printed code keeps working.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={downloadPng} disabled={!pngUrl} className={btnPrimary}><FileImage size={18} /> Download PNG</button>
              <button type="button" onClick={downloadSvg} disabled={!svgText} className={btnGhost}><FileCode2 size={18} /> Download SVG</button>
              <button type="button" onClick={() => window.print()} disabled={!pngUrl} className={btnGhost}><Printer size={18} /> Print table card</button>
            </div>
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
              <p className="mt-4 break-all text-xs text-slate-500">{url}</p>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-400">Powered by MenuQR</p>
            </div>
            <p className="no-print mx-auto mt-3 max-w-sm text-center text-sm text-slate-500">
              Use “Print table card” above — only this card prints. Print one per table; they all use the same permanent code.
              Table-specific QR codes can be added later without changing this one.
            </p>
          </div>

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
