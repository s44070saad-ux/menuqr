-- =====================================================================
-- MenuQR migration: Admin v2 — payments log + subscription expiry
-- Run AFTER schema.sql and migration-ordering.sql. Safe to re-run.
--
-- What it adds:
--  * payments table — one row per manual payment the Super Admin
--    confirms (JazzCash / EasyPaisa / bank / cash), with amount,
--    method, reference and the period it paid for. Super Admin has
--    full access; a restaurant's members can READ their own history.
--  * Expiry enforcement — restaurant_plan_slug() now returns 'free'
--    when a paid subscription's ends_at (due date) has passed, so an
--    expired plan stops unlocking ordering (ordering_available uses
--    this function). The owner app applies the same rule client-side
--    for item limits and plan display (see lib/useOwner.ts).
-- =====================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'PKR',
  method text not null default 'jazzcash'
    check (method in ('jazzcash','easypaisa','bank','cash','other')),
  reference text,
  months integer not null default 1 check (months >= 1 and months <= 36),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_restaurant_created
  on public.payments (restaurant_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Expiry-aware plan slug: an overdue paid plan behaves as Free until
-- the Super Admin confirms a new payment and sets a new due date.
-- ---------------------------------------------------------------------
create or replace function public.restaurant_plan_slug(rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
           when s.ends_at is not null and s.ends_at <= now() then 'free'
           else p.slug
         end
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.restaurant_id = rid and s.status in ('active','trialing')
  limit 1;
$$;

grant execute on function public.restaurant_plan_slug(uuid) to anon, authenticated;
