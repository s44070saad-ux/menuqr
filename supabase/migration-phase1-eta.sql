-- =====================================================================
-- Velora — Phase 1.5: preparation time for order-tracking ETA
-- One per-restaurant setting: the typical minutes from confirmation to
-- ready. The customer status page computes the ETA from the order's
-- confirmation time (orders.updated_at) + this setting. No RPC change:
-- the public menu already reads restaurant_settings.
-- Run once in the Supabase SQL Editor, after migration-phase1-charges.
-- =====================================================================

alter table public.restaurant_settings
  add column if not exists prep_time_minutes integer not null default 20;

alter table public.restaurant_settings drop constraint if exists rs_prep_range;
alter table public.restaurant_settings
  add constraint rs_prep_range check (prep_time_minutes >= 1 and prep_time_minutes <= 240);

-- Verification: expect 1 row.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'restaurant_settings'
  and column_name = 'prep_time_minutes';
