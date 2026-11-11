-- =====================================================================
-- Velora — free trial of ANY paid plan (owner picks at restaurant setup)
-- Run AFTER migration-trial.sql. Idempotent.
--
-- Adds restaurants.trial_plan_slug, written by the setup form when a
-- restaurant is created, and teaches the creation trigger to honour it:
--   starter / pro / business -> that plan, status 'trialing', +3 days
--   free / null / anything else -> Pro trial (the default), except an
--   explicit 'free' which starts on Free with no trial.
-- Expiry behaviour is unchanged: restaurant_plan_slug() falls back to
-- 'free' once ends_at passes, and paying during a trial stacks paid
-- time on top of the remaining trial days.
-- =====================================================================

alter table public.restaurants
  add column if not exists trial_plan_slug text;

create or replace function public.handle_new_restaurant() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_slug     text := coalesce(nullif(new.trial_plan_slug, ''), 'pro');
  v_plan_id  uuid;
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

  if v_slug not in ('starter', 'pro', 'business', 'free') then
    v_slug := 'pro';
  end if;

  select id into v_plan_id from public.subscription_plans where slug = v_slug limit 1;
  if v_plan_id is null then
    select id into v_plan_id from public.subscription_plans where slug = 'free' limit 1;
  end if;
  -- A trial is any resolved plan that is not Free.
  if v_plan_id is not null then
    v_is_trial := exists (
      select 1 from public.subscription_plans p
      where p.id = v_plan_id and p.slug <> 'free'
    );
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
