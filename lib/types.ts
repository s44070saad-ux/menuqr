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
  default_language: string;
  theme: ThemeMode;
  accent_color: string;
  status: RestaurantStatus;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestaurantSettings {
  id: string;
  restaurant_id: string;
  theme: ThemeMode;
  primary_color: string;
  show_search: boolean;
  show_featured: boolean;
  enable_whatsapp: boolean;
  footer_text: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface QrCode {
  id: string;
  restaurant_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface ItemView {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  category_id: string | null;
  created_at: string;
}
