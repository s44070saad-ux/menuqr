"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ACCEPTED_IMAGE_TYPES, uploadMenuImage, validateImageFile } from "@/lib/utils";
import { inputCls, labelCls } from "./ui";

/**
 * Image input with BOTH paths: upload a file to Supabase Storage
 * (bucket `menu-images`) or paste an image URL as a fallback.
 * Upload requires a saved restaurant (restaurantId) + signed-in user.
 */
export default function ImageField({
  label, value, onChange, userId, restaurantId, kind,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  userId: string | null;
  restaurantId: string | null;
  kind: string; // e.g. "logo" | "cover" | "item" | "category"
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const invalid = validateImageFile(file);
    if (invalid) { setError(invalid); return; }
    if (!supabase || !userId || !restaurantId) {
      setError("Save the restaurant first, then upload — or paste an image URL below.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadMenuImage(supabase, userId, restaurantId, kind, file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Check the storage bucket exists (run schema.sql) and try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
            <ImagePlus size={22} />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {busy ? "Uploading…" : "Upload image"}
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50">
                <X size={16} /> Remove
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <input className={inputCls} placeholder="…or paste an image URL (https://…)" value={value}
            onChange={(e) => onChange(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
