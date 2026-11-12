-- =====================================================================
-- Velora — Phase 5.19: Square POS integration (framework)
-- Run once in the Supabase SQL editor (after migration-phase5-i18n.sql).
--
-- Model mirrors Phase 4/Stripe: the RESTAURANT connects its own
-- Square account via OAuth (Velora's developer application, whose
-- id/secret live in Vercel env). Velora never takes Square payments;
-- it only pushes orders into the restaurant's Square so staff stop
-- double-entering. Tokens live in restaurant_secrets (service-role
-- API routes only); public flags live in restaurant_settings.
-- =====================================================================

alter table public.restaurant_settings
  add column if not exists square_enabled boolean not null default false,
  add column if not exists square_location_id text,
  add column if not exists square_location_name text,
  add column if not exists square_merchant_id text;

alter table public.restaurant_secrets
  add column if not exists square_access_token text,
  add column if not exists square_refresh_token text,
  add column if not exists square_token_expires_at timestamptz;

alter table public.orders
  add column if not exists square_order_id text;
