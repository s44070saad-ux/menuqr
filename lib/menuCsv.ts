// Menu CSV import/export — one format for owners migrating a menu in,
// and for Velora's done-for-you onboarding (menu photo -> CSV -> import).
//
// Columns:
//   name, category, description, price, discount_price, is_available,
//   is_featured, calories, allergens, dietary, display_order
// - allergens / dietary are ";" separated keys from lib/allergens.ts
//   (labels are also accepted on import, case-insensitive).
// - Booleans accept true/false, yes/no, 1/0.
// - Import is an UPSERT BY NAME: a row whose name matches an existing
//   item updates it; otherwise a new item is created. Categories named
//   in the file are matched by name or created by the caller.
import { ALLERGENS, DIETARY } from "./allergens";

export interface MenuCsvRow {
  name: string;
  category: string;
  description: string;
  price: number;
  discount_price: number | null;
  is_available: boolean;
  is_featured: boolean;
  calories: number | null;
  allergens: string[];
  dietary: string[];
  display_order: number;
}

export const CSV_HEADERS = [
  "name", "category", "description", "price", "discount_price",
  "is_available", "is_featured", "calories", "allergens", "dietary",
  "display_order",
] as const;

function escapeCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function menuRowsToCsv(rows: MenuCsvRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      r.name,
      r.category,
      r.description,
      String(r.price),
      r.discount_price == null ? "" : String(r.discount_price),
      r.is_available ? "true" : "false",
      r.is_featured ? "true" : "false",
      r.calories == null ? "" : String(r.calories),
      r.allergens.join(";"),
      r.dietary.join(";"),
      String(r.display_order),
    ].map((c) => escapeCell(String(c))).join(","));
  }
  return lines.join("\n") + "\n";
}

export function menuCsvTemplate(): string {
  return CSV_HEADERS.join(",") + "\n";
}

/** Split CSV text into a grid of cells (handles quotes, commas, CRLF). */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const push = () => { row.push(cell); cell = ""; };
  const pushRow = () => { push(); rows.push(row); row = []; };
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      push();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // handled by \n
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALLERGEN_KEYS = new Map<string, string>();
ALLERGENS.forEach((a) => { ALLERGEN_KEYS.set(a.key, a.key); ALLERGEN_KEYS.set(a.label.toLowerCase(), a.key); });
const DIETARY_KEYS = new Map<string, string>();
DIETARY.forEach((d) => { DIETARY_KEYS.set(d.key, d.key); DIETARY_KEYS.set(d.label.toLowerCase(), d.key); });

function parseKeyList(raw: string, map: Map<string, string>): string[] {
  const out: string[] = [];
  raw.split(/[;|]/).map((x) => x.trim()).filter(Boolean).forEach((x) => {
    const k = map.get(x) ?? map.get(x.toLowerCase());
    if (k && !out.includes(k)) out.push(k);
  });
  return out;
}

function parseBool(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(v)) return true;
  if (["false", "no", "0", "n"].includes(v)) return false;
  return fallback;
}

export function parseMenuCsv(text: string): { rows: MenuCsvRow[]; errors: string[] } {
  const grid = splitCsv(text);
  const errors: string[] = [];
  if (grid.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    name: col("name"), category: col("category"), description: col("description"),
    price: col("price"), discount_price: col("discount_price"),
    is_available: col("is_available"), is_featured: col("is_featured"),
    calories: col("calories"), allergens: col("allergens"), dietary: col("dietary"),
    display_order: col("display_order"),
  };
  if (idx.name < 0 || idx.price < 0) {
    return { rows: [], errors: ["The CSV must have at least 'name' and 'price' columns. Use Export or the template to get the exact format."] };
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows: MenuCsvRow[] = [];
  grid.slice(1).forEach((r, n) => {
    const line = n + 2; // 1-based + header
    const name = get(r, idx.name);
    const price = parseFloat(get(r, idx.price));
    if (!name) { errors.push(`Row ${line}: skipped — no name.`); return; }
    if (Number.isNaN(price) || price < 0) { errors.push(`Row ${line} ("${name}"): skipped — price is not a valid number.`); return; }
    const discRaw = get(r, idx.discount_price);
    const disc = discRaw === "" ? null : parseFloat(discRaw);
    if (disc !== null && (Number.isNaN(disc) || disc < 0)) { errors.push(`Row ${line} ("${name}"): skipped — discount price is invalid.`); return; }
    const calRaw = get(r, idx.calories);
    const cal = calRaw === "" ? null : parseInt(calRaw, 10);
    if (cal !== null && (Number.isNaN(cal) || cal < 0 || cal > 10000)) { errors.push(`Row ${line} ("${name}"): skipped — calories must be 0–10000.`); return; }
    const ord = parseInt(get(r, idx.display_order), 10);
    rows.push({
      name,
      category: get(r, idx.category),
      description: get(r, idx.description),
      price,
      discount_price: disc,
      is_available: parseBool(get(r, idx.is_available), true),
      is_featured: parseBool(get(r, idx.is_featured), false),
      calories: cal,
      allergens: parseKeyList(get(r, idx.allergens), ALLERGEN_KEYS),
      dietary: parseKeyList(get(r, idx.dietary), DIETARY_KEYS),
      display_order: Number.isNaN(ord) ? rows.length : ord,
    });
  });
  return { rows, errors };
}
