-- =====================================================================
-- Velora — Phase 5.18: auto multi-language menus (US/EU pack)
-- Run once in the Supabase SQL editor (after migration-phase4.sql).
--
-- Translations are stored per item/category and cached forever —
-- a string is translated once (machine, via the free MyMemory API
-- from /api/translate), then owners can correct it by hand. Guests
-- see a language switcher for every language the owner enabled in
-- restaurant_settings.menu_languages; item text falls back to the
-- base (English) text wherever a translation is missing.
-- =====================================================================

alter table public.restaurant_settings
  add column if not exists menu_languages text[] not null default '{}';

create table if not exists public.menu_item_translations (
  item_id uuid not null references public.menu_items(id) on delete cascade,
  lang text not null check (lang in ('es','fr','de','it')),
  name text not null default '',
  description text,
  source text not null default 'machine' check (source in ('machine','manual')),
  updated_at timestamptz not null default now(),
  primary key (item_id, lang)
);

create table if not exists public.category_translations (
  category_id uuid not null references public.categories(id) on delete cascade,
  lang text not null check (lang in ('es','fr','de','it')),
  name text not null default '',
  source text not null default 'machine' check (source in ('machine','manual')),
  updated_at timestamptz not null default now(),
  primary key (category_id, lang)
);

create index if not exists menu_item_translations_item_idx on public.menu_item_translations(item_id);
create index if not exists category_translations_cat_idx on public.category_translations(category_id);

alter table public.menu_item_translations enable row level security;
alter table public.category_translations enable row level security;

drop policy if exists "item translations are public" on public.menu_item_translations;
create policy "item translations are public"
  on public.menu_item_translations for select using (true);
drop policy if exists "owners manage item translations" on public.menu_item_translations;
create policy "owners manage item translations"
  on public.menu_item_translations for all
  using (exists (select 1 from public.menu_items i join public.restaurants r on r.id = i.restaurant_id
                 where i.id = item_id and (r.owner_id = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.menu_items i join public.restaurants r on r.id = i.restaurant_id
                 where i.id = item_id and (r.owner_id = auth.uid() or public.is_super_admin())));

drop policy if exists "category translations are public" on public.category_translations;
create policy "category translations are public"
  on public.category_translations for select using (true);
drop policy if exists "owners manage category translations" on public.category_translations;
create policy "owners manage category translations"
  on public.category_translations for all
  using (exists (select 1 from public.categories c join public.restaurants r on r.id = c.restaurant_id
                 where c.id = category_id and (r.owner_id = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.categories c join public.restaurants r on r.id = c.restaurant_id
                 where c.id = category_id and (r.owner_id = auth.uid() or public.is_super_admin())));
