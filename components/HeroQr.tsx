"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/supabaseClient";

/**
 * A REAL, scannable QR code for the live Dubai Foods demo menu,
 * generated in the browser. Used on the homepage hero and the
 * live-demo section — visitors can scan it with their own phone.
 */
export default function HeroQr({ size = 112 }: { size?: number }) {
  const [src, setSrc] = useState("");
  const url = `${SITE_URL || "https://veloraqr.vercel.app"}/menu/dubai-foods?src=qr`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#FFFFFF" } })
      .then((d) => { if (!cancelled) setSrc(d); })
      .catch(() => { /* QR is decorative if generation fails */ });
    return () => { cancelled = true; };
  }, [url]);

  if (!src) return <div style={{ width: size, height: size }} className="rounded-xl bg-slate-100" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR code for the live Dubai Foods demo menu" style={{ width: size, height: size }} className="rounded-xl" />;
}
