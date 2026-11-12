import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Square POS — server helpers (Phase 5).
 * Velora's Square developer application credentials live in Vercel
 * env (SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET). Each
 * restaurant connects its OWN Square account by OAuth; tokens are
 * stored in restaurant_secrets and only ever read through the
 * service-role client created here. When the env is missing the
 * routes answer 501 PLATFORM_NOT_CONFIGURED and the dashboard says
 * so honestly.
 */

export const SQUARE_BASE =
  process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

/** OAuth state: restaurantId.timestamp.hmac (10-minute validity). */
export function signSquareState(restaurantId: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", process.env.SQUARE_APPLICATION_SECRET ?? "")
    .update(`${restaurantId}.${ts}`)
    .digest("hex")
    .slice(0, 32);
  return `${restaurantId}.${ts}.${sig}`;
}

export function verifySquareState(state: string): string | null {
  const [restaurantId, ts, sig] = state.split(".");
  if (!restaurantId || !ts || !sig) return null;
  if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;
  const expected = createHmac("sha256", process.env.SQUARE_APPLICATION_SECRET ?? "")
    .update(`${restaurantId}.${ts}`)
    .digest("hex")
    .slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return restaurantId;
}

export function squareConfigured(): boolean {
  return Boolean(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET);
}

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface SquareTokens {
  access_token: string;
  refresh_token?: string;
  merchant_id?: string;
  expires_at?: string;
}

export async function exchangeSquareCode(code: string, redirectUri: string): Promise<SquareTokens | null> {
  const res = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": "2024-12-18" },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as SquareTokens;
}

export async function refreshSquareToken(refreshToken: string): Promise<SquareTokens | null> {
  const res = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": "2024-12-18" },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as SquareTokens;
}

export interface StoredSquare {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/** Reads the restaurant's stored Square tokens; refreshes first when expired. */
export async function getSquareTokens(restaurantId: string): Promise<StoredSquare | null> {
  const svc = getServiceClient();
  if (!svc) return null;
  const { data } = await svc
    .from("restaurant_secrets")
    .select("square_access_token, square_refresh_token, square_token_expires_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = data as { square_access_token: string | null; square_refresh_token: string | null; square_token_expires_at: string | null } | null;
  if (!row?.square_access_token) return null;
  const expired = row.square_token_expires_at ? new Date(row.square_token_expires_at).getTime() < Date.now() + 60_000 : false;
  if (expired && row.square_refresh_token) {
    const fresh = await refreshSquareToken(row.square_refresh_token);
    if (fresh?.access_token) {
      await svc.from("restaurant_secrets").update({
        square_access_token: fresh.access_token,
        square_refresh_token: fresh.refresh_token ?? row.square_refresh_token,
        square_token_expires_at: fresh.expires_at ?? null,
      }).eq("restaurant_id", restaurantId);
      return { accessToken: fresh.access_token, refreshToken: fresh.refresh_token ?? row.square_refresh_token, expiresAt: fresh.expires_at ?? null };
    }
    return null; // expired and refresh failed — owner must reconnect
  }
  return { accessToken: row.square_access_token, refreshToken: row.square_refresh_token, expiresAt: row.square_token_expires_at };
}

export async function squareFetch(token: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-12-18",
      ...(init?.headers ?? {}),
    },
  });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, json };
}
