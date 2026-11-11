-- =====================================================================
-- MenuQR SaaS — Supabase database schema
-- =====================================================================
-- HOW TO RUN:
--   1. Create a free project at https://supabase.com
--   2. Open your project -> SQL Editor -> New query
--   3. Paste this ENTIRE file in and press Run (once). It is safe to
--      re-run: tables/policies use IF NOT EXISTS / drop-then-create.
--   4. Copy Project URL + Publishable/anon key (Project Settings -> API)
--      into Vercel as NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
--      and set NEXT_PUBLIC_SITE_URL to your deployed site URL.
--
-- WHAT THIS CREATES:
--   * Tables: profiles, subscription_plans, restaurants,
--     restaurant_members, restaurant_settings, categories, menu_items,
--     qr_codes, menu_scans, item_views, subscriptions
--   * Row Level Security on EVERY table (multi-tenant isolation)
--   * Helper functions: is_super_admin(), is_restaurant_member(),
--     owns_restaurant()
--   * Trigger on auth.users -> auto-create profile (role 'owner')
--   * Trigger on restaurants -> auto-create owner membership,
--     restaurant_settings, default qr_codes row and FREE subscription
--   * Public storage bucket `menu-images` (public read, owner-scoped write)
--   * Seed data: ONLY the 4 subscription plans (platform configuration).
--     No fake restaurants, categories or menu items are seeded.
--
-- PROMOTE YOURSELF TO SUPER ADMIN (after you register in the app):
--   update public.profiles set role = 'super_admin' where email = 'YOUR_EMAIL';
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- subscription_plans: platform configuration (seeded below).
-- max_items / max_restaurants: NULL means unlimited.
-- ---------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_monthly numeric not null default 0,
  currency text not null default 'PKR',
  max_items integer,
  max_restaurants integer,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- profiles: one row per Supabase Auth user.
-- role: 'owner' (restaurant owner) | 'super_admin' (platform owner)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'owner' check (role in ('owner','super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- restaurants: one row per restaurant (tenant).
-- ---------------------------------------------------------------------
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_url text,
  address text,
  phone text,
  whatsapp text,
  opening_hours text,
  currency text not null default 'PKR',
  default_language text not null default 'en',
  theme text not null default 'light' check (theme in ('light','dark')),
  accent_color text not null default '#0F766E',
  status text not null default 'published' check (status in ('published','draft','suspended')),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- restaurant_members: who may manage a restaurant (owner + future staff).
create table if not exists public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

-- restaurant_settings: 1:1 display/behaviour settings per restaurant.
create table if not exists public.restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light','dark')),
  primary_color text not null default '#0F766E',
  show_search boolean not null default true,
  show_featured boolean not null default true,
  enable_whatsapp boolean not null default true,
  footer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric not null default 0 check (price >= 0),
  discount_price numeric check (discount_price is null or discount_price >= 0),
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- qr_codes: one default row per restaurant (created by trigger).
-- The QR itself encodes the PERMANENT url /menu/[slug]; the row exists
-- so scans can be attributed and table-specific codes can be added later.
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null default 'Main QR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- menu_scans: one row per public-menu page load (a "scan"/visit).
-- NOTE: a scan is a menu view, NOT a purchase. Never present it as sales.
create table if not exists public.menu_scans (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- item_views: one row per menu-item tap/view on the public menu.
create table if not exists public.item_views (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'active' check (status in ('active','trialing','cancelled','expired','suspended')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_restaurants_owner on public.restaurants(owner_id);
create index if not exists idx_restaurants_slug on public.restaurants(slug);
create index if not exists idx_members_user on public.restaurant_members(user_id);
create index if not exists idx_members_restaurant on public.restaurant_members(restaurant_id);
create index if not exists idx_categories_restaurant on public.categories(restaurant_id, display_order);
create index if not exists idx_items_restaurant on public.menu_items(restaurant_id, display_order);
create index if not exists idx_items_category on public.menu_items(category_id);
create index if not exists idx_scans_restaurant_created on public.menu_scans(restaurant_id, created_at desc);
create index if not exists idx_views_restaurant_created on public.item_views(restaurant_id, created_at desc);
create index if not exists idx_views_item on public.item_views(menu_item_id);
create index if not exists idx_subscriptions_plan on public.subscriptions(plan_id);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$ declare t text; begin
  foreach t in array array['profiles','subscription_plans','restaurants','restaurant_settings','categories','menu_items','qr_codes','subscriptions'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER so policies don't recurse)
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_restaurant_member(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = rid and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.restaurants r where r.id = rid and r.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_restaurant(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.restaurants r where r.id = rid and r.owner_id = auth.uid());
$$;

create or replace function public.restaurant_is_public(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurants r
    where r.id = rid and r.is_published and r.status = 'published'
  );
$$;

-- ---------------------------------------------------------------------
-- Guard: nobody can change their OWN role (no self-elevation to
-- super_admin). Only an existing super_admin (or the SQL editor, which
-- bypasses RLS/triggers as table owner is NOT bypassed — run the
-- promotion BEFORE this matters, or temporarily: the trigger allows
-- changes when the caller is a super_admin; for the FIRST promotion use
-- the SQL editor while signed in as the project owner — Postgres role
-- bypasses triggers only if you disable it, so the promotion statement
-- in SETUP.md is run together with disabling this trigger briefly).
-- Simpler and safe: the trigger only blocks changes where the row being
-- changed belongs to the caller themselves AND caller is not super_admin.
-- The platform owner's first promotion is documented in SETUP.md using:
--   alter table public.profiles disable trigger trg_protect_profile_role;
--   update ... ; alter table ... enable trigger ...
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_super_admin() then
    -- Allow when there is no authenticated user (SQL editor / service ops).
    if auth.uid() is not null then
      raise exception 'Only a super admin can change roles';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_profile_role on public.profiles;
create trigger trg_protect_profile_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------
-- Auto-create profile on signup (trigger on auth.users).
-- The app ALSO inserts the profile as a fallback (see register page),
-- because with email-confirmation ON the trigger is the only reliable
-- path, and with it OFF both paths race — the insert is idempotent.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  )
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Auto-setup on restaurant creation: owner membership + settings +
-- default QR row + FREE subscription. SECURITY DEFINER so it works
-- regardless of the caller's RLS policies. Idempotent via unique keys.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_restaurant() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  free_plan_id uuid;
begin
  insert into public.restaurant_members (restaurant_id, user_id, member_role)
  values (new.id, new.owner_id, 'owner')
  on conflict (restaurant_id, user_id) do nothing;

  insert into public.restaurant_settings (restaurant_id, theme, primary_color)
  values (new.id, new.theme, new.accent_color)
  on conflict (restaurant_id) do nothing;

  insert into public.qr_codes (restaurant_id, label)
  values (new.id, 'Main QR');

  select id into free_plan_id from public.subscription_plans where slug = 'free' limit 1;
  if free_plan_id is not null then
    insert into public.subscriptions (restaurant_id, plan_id, status)
    values (new.id, free_plan_id, 'active')
    on conflict (restaurant_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists trg_handle_new_restaurant on public.restaurants;
create trigger trg_handle_new_restaurant after insert on public.restaurants
  for each row execute function public.handle_new_restaurant();

-- ---------------------------------------------------------------------
-- Row Level Security — enabled on ALL tables
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.qr_codes enable row level security;
alter table public.menu_scans enable row level security;
alter table public.item_views enable row level security;
alter table public.subscriptions enable row level security;

-- Drop existing policies if re-running this file
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---- profiles --------------------------------------------------------
-- Read: yourself or a super admin.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());
-- Insert (session present): your OWN row, role must be 'owner'.
create policy profiles_insert_own on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'owner');
-- Insert (signup trap — the exact PharmaHub lesson): when email
-- confirmation is ON, signUp returns NO session, so the app-side profile
-- insert arrives as ANON with auth.uid() = NULL. Allow that insert ONLY
-- in the safe signup shape: role forced to 'owner' (never super_admin).
-- The FK to auth.users means the id must be a real just-created user.
create policy profiles_insert_signup on public.profiles for insert
  to anon, authenticated
  with check (role = 'owner');
-- Update: yourself (role protected by trigger) or a super admin.
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
create policy profiles_admin_delete on public.profiles for delete
  using (public.is_super_admin());

-- ---- subscription_plans ----------------------------------------------
-- Public read (landing page + dashboards show plans); super admin writes.
create policy plans_select on public.subscription_plans for select
  using (true);
create policy plans_admin_write on public.subscription_plans for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- restaurants -------------------------------------------------------
-- Read: owner/member, super admin, OR anyone when the restaurant is
-- published (this powers the public /menu/[slug] page, signed-out OK).
create policy restaurants_select on public.restaurants for select
  using (
    owner_id = auth.uid()
    or public.is_restaurant_member(id)
    or public.is_super_admin()
    or (is_published and status = 'published')
  );
create policy restaurants_insert on public.restaurants for insert
  to authenticated
  with check (owner_id = auth.uid());
create policy restaurants_update on public.restaurants for update
  using (owner_id = auth.uid() or public.is_restaurant_member(id) or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_restaurant_member(id) or public.is_super_admin());
create policy restaurants_delete on public.restaurants for delete
  using (owner_id = auth.uid() or public.is_super_admin());

-- ---- restaurant_members --------------------------------------------------
create policy members_select on public.restaurant_members for select
  using (user_id = auth.uid() or public.is_restaurant_member(restaurant_id) or public.is_super_admin());
create policy members_insert on public.restaurant_members for insert
  to authenticated
  with check (public.owns_restaurant(restaurant_id) or public.is_super_admin());
create policy members_update on public.restaurant_members for update
  using (public.owns_restaurant(restaurant_id) or public.is_super_admin())
  with check (public.owns_restaurant(restaurant_id) or public.is_super_admin());
create policy members_delete on public.restaurant_members for delete
  using (public.owns_restaurant(restaurant_id) or public.is_super_admin());

-- ---- restaurant_settings ---------------------------------------------------
-- Read: members/super admin, or public when restaurant is published
-- (the public menu needs theme + toggles).
create policy settings_select on public.restaurant_settings for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin() or public.restaurant_is_public(restaurant_id));
create policy settings_write on public.restaurant_settings for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- categories --------------------------------------------------------------
create policy categories_select on public.categories for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin() or public.restaurant_is_public(restaurant_id));
create policy categories_write on public.categories for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- menu_items ----------------------------------------------------------------
create policy items_select on public.menu_items for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin() or public.restaurant_is_public(restaurant_id));
create policy items_write on public.menu_items for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- qr_codes ---------------------------------------------------------------------
create policy qr_select on public.qr_codes for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());
create policy qr_write on public.qr_codes for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- menu_scans ---------------------------------------------------------------------
-- INSERT: anyone (anon customers scanning a QR) — but ONLY for a
-- published restaurant, so scans can't be forged against private tenants.
create policy scans_insert on public.menu_scans for insert
  to anon, authenticated
  with check (public.restaurant_is_public(restaurant_id));
-- SELECT: only the restaurant's members or a super admin (analytics).
create policy scans_select on public.menu_scans for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- item_views -----------------------------------------------------------------------
create policy views_insert on public.item_views for insert
  to anon, authenticated
  with check (public.restaurant_is_public(restaurant_id));
create policy views_select on public.item_views for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---- subscriptions ---------------------------------------------------------------------
-- Read: restaurant members or super admin. Write: super admin only for
-- plan/status changes (payments are activated manually in the MVP);
-- owners may INSERT the initial row for their own restaurant as a
-- fallback if the creation trigger was not installed.
create policy subs_select on public.subscriptions for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());
create policy subs_insert_fallback on public.subscriptions for insert
  to authenticated
  with check (public.owns_restaurant(restaurant_id));
create policy subs_admin_update on public.subscriptions for update
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy subs_admin_delete on public.subscriptions for delete
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Storage: bucket `menu-images` — PUBLIC read (menu photos must load
-- fast for signed-out customers), owner-scoped writes.
-- Upload path convention: {userId}/{restaurantId}/{file}
-- The first folder segment MUST be the uploader's auth user id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images', 'menu-images', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

do $$ declare r record; begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'menuqr_%' loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy menuqr_images_read on storage.objects for select
  using (bucket_id = 'menu-images');
create policy menuqr_images_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy menuqr_images_update on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'menu-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy menuqr_images_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

-- ---------------------------------------------------------------------
-- Seed: subscription plans ONLY (platform configuration).
-- Prices are in PKR/month and can be edited by the super admin later.
-- max_items NULL = unlimited.
-- ---------------------------------------------------------------------
insert into public.subscription_plans (slug, name, price_monthly, currency, max_items, max_restaurants, features, display_order) values
  ('free',     'Free',     0,    'PKR', 5,   1,    '["5 menu items","1 restaurant","Basic QR code","Basic menu design","Platform branding"]'::jsonb, 1),
  ('starter',  'Starter',  999,  'PKR', null, 1,    '["Unlimited menu items","Custom restaurant branding","QR code download (PNG + SVG)","Basic analytics"]'::jsonb, 2),
  ('pro',      'Pro',      2499, 'PKR', null, 1,    '["Everything in Starter","Advanced analytics","Multiple menus (coming with plan)","Multiple QR codes","Extra menu customization"]'::jsonb, 3),
  ('business', 'Business', 4999, 'PKR', null, null, '["Multiple restaurant branches","Branch management","Advanced analytics","Priority support"]'::jsonb, 4)
on conflict (slug) do update set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  currency = excluded.currency,
  max_items = excluded.max_items,
  max_restaurants = excluded.max_restaurants,
  features = excluded.features,
  display_order = excluded.display_order;
