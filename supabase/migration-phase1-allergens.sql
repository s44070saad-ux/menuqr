-- =====================================================================
-- Velora — Phase 1.1: allergen / dietary / calorie fields on menu items
-- EU 14 major allergens (Reg. (EU) 1169/2011 Annex II) as text[] keys,
-- dietary flags as text[] keys, calories as a plain integer.
-- Available on ALL plans: allergen information is a legal requirement
-- for the restaurant, not a premium feature. No RLS or function changes.
-- Run once in the Supabase SQL Editor.
-- =====================================================================

alter table public.menu_items
  add column if not exists allergens text[] not null default '{}',
  add column if not exists dietary   text[] not null default '{}',
  add column if not exists calories  integer;

alter table public.menu_items drop constraint if exists menu_items_calories_nonneg;
alter table public.menu_items
  add constraint menu_items_calories_nonneg
  check (calories is null or (calories >= 0 and calories <= 10000));

-- Verification: expect 3 rows.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'menu_items'
  and column_name in ('allergens', 'dietary', 'calories')
order by column_name;
