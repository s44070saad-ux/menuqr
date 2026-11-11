// Shared database row types — mirrors supabase/schema.sql exactly.

export type Role = "owner" | "super_admin";
export type RestaurantStatus = "published" | "draft" | "suspended";
export type ThemeMode = "light" | "dark";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  slug: "free" | "starter" | "pro" | "business" | string;
  name: string;
  price_monthly: number; // in plan currency units (PKR by default config)
  currency: string;
  max_items: number | null; // null = unlimited
  max_restaurants: number | null; // null = unlimited
  features: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Restaurant {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  opening_hours: string | null;
  currency: string;
  trial_plan_slug?: string | null;
  default_language: string;
  theme: ThemeMode;
  accent_color: string;
  status: RestaurantStatus;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type MenuTheme = "classic" | "midnight" | "fresh" | "royal";

export interface RestaurantSettings {
  id: string;
  restaurant_id: string;
  theme: ThemeMode;
  primary_color: string;
  show_search: boolean;
  show_featured: boolean;
  enable_whatsapp: boolean;
  enable_ordering: boolean;
  footer_text: string | null;
  menu_theme: MenuTheme | string;
  /** Phase 1.4 charges (percent of items subtotal; 0 = off). */
  tax_percent?: number;
  service_percent?: number;
  min_order_amount?: number;
  /** Phase 1.5: typical minutes from confirmation to ready (ETA). */
  prep_time_minutes?: number;
  /** Phase 2.3: owner-set Google review link shown after completed orders. */
  google_review_url?: string | null;
  /** Phase 2.4: IANA timezone for availability windows and schedules. */
  timezone?: string;
  /** Phase 3: loyalty stamps (completed orders per target = reward). */
  loyalty_enabled?: boolean;
  loyalty_buy_x?: number;
  qr_color: string;
  card_style: "classic" | "dark" | "accent" | string;
  created_at: string;
  updated_at: string;
}

export interface ItemOptionGroup {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  name: string;
  selection_type: "single" | "multi";
  is_required: boolean;
  display_order: number;
  created_at: string;
}

export interface ItemOption {
  id: string;
  restaurant_id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  display_order: number;
  created_at: string;
}

/** One chosen option as snapshotted onto an order item at order time. */
export interface ChosenOption {
  group_name: string;
  option_name: string;
  price_delta: number;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  display_order: number;
  /** EU-14 allergen keys (lib/allergens.ts). Optional: rows predate the column. */
  allergens?: string[];
  /** Dietary flag keys: vegan | vegetarian | gluten_free | halal. */
  dietary?: string[];
  calories?: number | null;
  /** Phase 2.1: owner-picked "pairs well with" item ids for upselling. */
  suggested_item_ids?: string[];
  /** Phase 2.4: daily availability window (restaurant-local "HH:MM:SS"). */
  available_from?: string | null;
  available_to?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QrCode {
  id: string;
  restaurant_id: string;
  label: string;
  kind: "main" | "table";
  table_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderType = "dine_in" | "takeaway";
export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Order {
  id: string;
  restaurant_id: string;
  qr_code_id: string | null;
  order_type: OrderType;
  table_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  status: OrderStatus;
  total_amount: number;
  subtotal_amount?: number | null;
  tax_amount?: number;
  service_amount?: number;
  /** Phase 3: coupon / gift card applied at checkout (server-validated). */
  discount_amount?: number;
  coupon_code?: string | null;
  gift_card_amount?: number;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  via_upsell?: boolean;
  options_snapshot?: ChosenOption[];
  created_at: string;
}

export interface PriceSchedule {
  id: string;
  restaurant_id: string;
  name: string;
  /** Weekday numbers, 0 = Sunday … 6 = Saturday (SQL extract(dow)). */
  days: number[];
  start_time: string;
  end_time: string;
  discount_percent: number;
  category_id: string | null;
  menu_item_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Feedback {
  id: string;
  restaurant_id: string;
  order_id: string | null;
  customer_name: string | null;
  rating: number | null;
  message: string;
  created_at: string;
}

export type PaymentMethod = "jazzcash" | "easypaisa" | "bank" | "cash" | "other";

export interface Payment {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  months: number;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

/** Shape returned by the get_customer_order RPC (customer's own view). */
export interface CustomerOrder {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  table_number: string | null;
  total_amount: number;
  subtotal_amount?: number | null;
  tax_amount?: number;
  service_amount?: number;
  /** Phase 3 additions returned by get_customer_order. */
  discount_amount?: number;
  coupon_code?: string | null;
  gift_card_amount?: number;
  /** Present only when loyalty is enabled for the restaurant. */
  loyalty?: { stamps: number; cycle: number; buy_x: number; reward_ready: boolean } | null;
  created_at: string;
  updated_at: string;
  items: { item_name: string; unit_price: number; quantity: number; subtotal: number; options?: ChosenOption[] }[];
}

export interface Subscription {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "active" | "trialing" | "cancelled" | "expired" | "suspended";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan | null;
}

export interface MenuScan {
  id: string;
  restaurant_id: string;
  qr_code_id: string | null;
  user_agent: string | null;
  source: "qr" | "link";
  table_number: string | null;
  visitor_id: string | null;
  created_at: string;
}

export interface ItemView {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  category_id: string | null;
  created_at: string;
}

/** Phase 3 — customer database row (auto-built from orders, keyed by phone). */
export interface Customer {
  id: string;
  restaurant_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  email_consent: boolean;
  unsubscribe_token: string;
  first_order_at: string;
  last_order_at: string;
  order_count: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

/** Phase 3 — discount coupon (validated server-side at order time). */
export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_order_amount: number;
  max_redemptions: number | null;
  times_redeemed: number;
  first_order_only: boolean;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

/** Phase 3 — prepaid gift card (balance debited server-side at order time). */
export interface GiftCard {
  id: string;
  restaurant_id: string;
  code: string;
  initial_amount: number;
  balance: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
