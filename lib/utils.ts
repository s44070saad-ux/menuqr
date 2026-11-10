// Small shared helpers.

/** "Royal Bites Café!" -> "royal-bites-cafe" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Format a price with the restaurant's currency code, e.g. "PKR 450". */
export function formatPrice(amount: number, currency = "PKR"): string {
  const n = Number(amount);
  const text = Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
  return `${currency} ${text}`;
}

/** Start-of-day ISO string (local time) for "scans today" queries. */
export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Start-of-month ISO string for "scans this month" queries. */
export function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Upload one image file to the public `menu-images` bucket under the
 *  owner's own folder: {userId}/{restaurantId}/{kind}-{timestamp}.{ext}
 *  (the storage RLS policies scope writes to that first folder segment).
 *  Returns the public URL. Throws on failure so callers can show an error. */
export async function uploadMenuImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  restaurantId: string,
  kind: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${restaurantId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("menu-images")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl as string;
}

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — enforced in UI + storage policy note

export function validateImageFile(file: File): string | null {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    return "Please choose a PNG, JPG, WEBP or GIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large — maximum 5 MB.";
  return null;
}
