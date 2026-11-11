-- =====================================================================
-- Velora — 3-day free Pro trial for every new restaurant
-- Run AFTER migration-phase-ab.sql. Idempotent (function replace).
--
-- Changes ONLY the restaurant-creation trigger: instead of starting on
-- the Free plan, a new restaurant starts on Pro with status 'trialing'
-- and ends_at = now() + 3 days. Everything downstream already handles
-- this correctly:
--  * restaurant_plan_slug() (Admin v2 version) counts 'trialing' and
--    returns 'free' once ends_at has passed — ordering locks itself.
--  * The owner UI mirrors the same expiry rule.
--  * The Super Admin "Confirm payment & activate" flow extends the
--    due date from the current ends_at, so paying during the trial
--    stacks paid time on top of the remaining trial days.
-- Existing restaurants are NOT touched — the trial is a signup offer.
-- =====================================================================

create or replace function public.handle_new_restaurant() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan_id uuid;
  v_is_trial boolean := false;
begin
  insert into public.restaurant_members (restaurant_id, user_id, member_role)
  values (new.id, new.owner_id, 'owner')
  on conflict (restaurant_id, user_id) do nothing;

  insert into public.restaurant_settings (restaurant_id, theme, primary_color)
  values (new.id, new.theme, new.accent_color)
  on conflict (restaurant_id) do nothing;

  insert into public.qr_codes (restaurant_id, label)
  values (new.id, 'Main QR');

  -- 3-day free Pro trial for every new restaurant (falls back to Free
  -- only if the Pro plan row somehow does not exist).
  select id into v_plan_id from public.subscription_plans where slug = 'pro' limit 1;
  if v_plan_id is not null then
    v_is_trial := true;
  else
    select id into v_plan_id from public.subscription_plans where slug = 'free' limit 1;
  end if;

  if v_plan_id is not null then
    insert into public.subscriptions (restaurant_id, plan_id, status, starts_at, ends_at)
    values (
      new.id,
      v_plan_id,
      case when v_is_trial then 'trialing' else 'active' end,
      now(),
      case when v_is_trial then now() + interval '3 days' else null end
    )
    on conflict (restaurant_id) do nothing;
  end if;
  return new;
end; $$;
