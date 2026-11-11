import type { MenuItem, PriceSchedule } from "./types";

/**
 * Phase 2.4 — time-based menus & happy-hour pricing (display mirror).
 * The server (place_customer_order) is the authority and implements
 * the identical rules in SQL; this module keeps the guest's displayed
 * prices and availability in step. All times are restaurant-local
 * (restaurant_settings.timezone).
 */

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Window check in minutes-of-day; from > to means overnight. */
export function inWindow(mins: number, from: number, to: number): boolean {
  if (from <= to) return mins >= from && mins < to;
  return mins >= from || mins < to;
}

export function localParts(tz: string, date = new Date()): { minutes: number; dow: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10),
      dow: dowMap[parts.weekday] ?? 0,
    };
  } catch {
    return { minutes: date.getHours() * 60 + date.getMinutes(), dow: date.getDay() };
  }
}

export function itemWithinWindow(item: MenuItem, tz: string): boolean {
  if (!item.available_from || !item.available_to) return true;
  const { minutes } = localParts(tz);
  return inWindow(minutes, timeToMinutes(item.available_from), timeToMinutes(item.available_to));
}

export function scheduleApplies(s: PriceSchedule, item: MenuItem, tz: string): boolean {
  if (!s.is_active) return false;
  const { minutes, dow } = localParts(tz);
  if (!(s.days ?? []).includes(dow)) return false;
  if (!inWindow(minutes, timeToMinutes(s.start_time), timeToMinutes(s.end_time))) return false;
  if (s.menu_item_id) return s.menu_item_id === item.id;
  if (s.category_id) return s.category_id === item.category_id;
  return true;
}

export function bestDiscountPct(schedules: PriceSchedule[], item: MenuItem, tz: string): number {
  let best = 0;
  for (const s of schedules) {
    if (scheduleApplies(s, item, tz)) best = Math.max(best, Number(s.discount_percent) || 0);
  }
  return best;
}

export function basePriceOf(item: MenuItem): number {
  return item.discount_price != null && Number(item.discount_price) < Number(item.price)
    ? Number(item.discount_price)
    : Number(item.price);
}

/** Base selling price with the best active happy-hour discount applied. */
export function effectivePrice(item: MenuItem, schedules: PriceSchedule[], tz: string): number {
  const base = basePriceOf(item);
  const pct = bestDiscountPct(schedules, item, tz);
  return pct > 0 ? Math.round(base * (100 - pct)) / 100 : base;
}

/** "13:30:00" → "1:30 PM" for availability-window labels. */
export function fmtTime12(t: string): string {
  const mins = timeToMinutes(t);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}
