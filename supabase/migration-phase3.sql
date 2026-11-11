-- =====================================================================
-- Velora — Phase 3: customer database, coupons & gift cards, loyalty
--  * customers — auto-built from orders (one row per restaurant+phone),
--    with email + consent captured at checkout, order count, spend.
--  * coupons — percent/fixed codes with min-order, expiry, redemption
--    cap and first-order-only rules, all validated server-side.
--  * gift_cards — prepaid balances, debited server-side at order time.
--  * orders gains discount_amount / coupon_code / gift_card_id /
--    gift_card_amount. Tax/service are charged on the discounted
--    subtotal; gift cards reduce the amount due at the counter.
--  * restaurant_settings gains loyalty settings (stamps = completed
--    orders per phone; progress shows on the customer status page).
--  * winback_sends — one row per win-back email (30-day cooldown).
--  * place_customer_order replaced (new optional params — the old
--    8-param signature is dropped first so PostgREST stays unambiguous);
--    get_customer_order replaced to expose the money breakdown and the
--    loyalty progress. preview_discount() powers the cart's Apply button
--    (display only — the order RPC re-validates everything).
-- Run once in the Supabase SQL Editor, after migration-phase2-schedules.
-- =====================================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  phone text not null,
  name text,
  email text,
  email_consent boolean not null default false,
  first_order_at timestamptz not null default now(),
  last_order_at timestamptz not null default now(),
  order_count integer not null default 0,
  total_spent numeric not null default 0,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index if not exists idx_customers_restaurant on public.customers(restaurant_id, last_order_at desc);
alter table public.customers enable row level security;
drop policy if exists "members manage customers" on public.customers;
create policy "members manage customers" on public.customers
  for all to authenticated
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric not null check (value > 0),
  min_order_amount numeric not null default 0,
  max_redemptions integer,
  times_redeemed integer not null default 0,
  first_order_only boolean not null default false,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, code)
);
alter table public.coupons enable row level security;
drop policy if exists "paid plans manage coupons" on public.coupons;
create policy "paid plans manage coupons" on public.coupons
  for all to authenticated
  using (public.is_restaurant_member(restaurant_id)
         and public.restaurant_plan_slug(restaurant_id) in ('pro', 'business'))
  with check (public.is_restaurant_member(restaurant_id)
         and public.restaurant_plan_slug(restaurant_id) in ('pro', 'business'));

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null,
  initial_amount numeric not null check (initial_amount > 0),
  balance numeric not null check (balance >= 0),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, code)
);
alter table public.gift_cards enable row level security;
drop policy if exists "paid plans manage gift cards" on public.gift_cards;
create policy "paid plans manage gift cards" on public.gift_cards
  for all to authenticated
  using (public.is_restaurant_member(restaurant_id)
         and public.restaurant_plan_slug(restaurant_id) in ('pro', 'business'))
  with check (public.is_restaurant_member(restaurant_id)
         and public.restaurant_plan_slug(restaurant_id) in ('pro', 'business'));

alter table public.orders add column if not exists discount_amount numeric not null default 0;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists gift_card_id uuid references public.gift_cards(id) on delete set null;
alter table public.orders add column if not exists gift_card_amount numeric not null default 0;

alter table public.restaurant_settings add column if not exists loyalty_enabled boolean not null default false;
alter table public.restaurant_settings add column if not exists loyalty_buy_x integer not null default 6;
alter table public.restaurant_settings drop constraint if exists rs_loyalty_range;
alter table public.restaurant_settings add constraint rs_loyalty_range check (loyalty_buy_x >= 2 and loyalty_buy_x <= 50);

create table if not exists public.winback_sends (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  subject text not null,
  sent_at timestamptz not null default now()
);
create index if not exists idx_winback_customer on public.winback_sends(customer_id, sent_at desc);
alter table public.winback_sends enable row level security;
drop policy if exists "members manage winback" on public.winback_sends;
create policy "members manage winback" on public.winback_sends
  for all to authenticated
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- Discount preview for the cart's Apply button (display only).
create or replace function public.preview_discount(
  p_restaurant_id uuid,
  p_code text,
  p_kind text,
  p_subtotal numeric,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_coupon public.coupons%rowtype;
  v_gc record;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'EMPTY');
  end if;
  if p_kind = 'gift_card' then
    select * into v_gc from public.gift_cards gc
    where gc.restaurant_id = p_restaurant_id and upper(gc.code) = upper(btrim(p_code)) and gc.is_active;
    if v_gc.id is null then return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_INVALID'); end if;
    if v_gc.balance <= 0 then return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_EMPTY'); end if;
    return jsonb_build_object('ok', true, 'kind', 'gift_card', 'balance', v_gc.balance);
  end if;
  select * into v_coupon from public.coupons c
  where c.restaurant_id = p_restaurant_id and upper(c.code) = upper(btrim(p_code)) and c.is_active;
  if v_coupon.id is null then return jsonb_build_object('ok', false, 'error', 'COUPON_INVALID'); end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED'); end if;
  if coalesce(p_subtotal, 0) < coalesce(v_coupon.min_order_amount, 0) then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MIN_ORDER'); end if;
  if v_coupon.max_redemptions is not null and v_coupon.times_redeemed >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_USED_UP'); end if;
  if v_coupon.first_order_only and p_phone is not null and exists (
    select 1 from public.orders o where o.restaurant_id = p_restaurant_id
      and o.customer_phone = p_phone and o.status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'error', 'COUPON_FIRST_ORDER_ONLY'); end if;
  return jsonb_build_object('ok', true, 'kind', 'coupon',
    'discount', case when v_coupon.kind = 'percent'
                     then round(coalesce(p_subtotal, 0) * v_coupon.value / 100, 2)
                     else least(v_coupon.value, coalesce(p_subtotal, 0)) end,
    'coupon_kind', v_coupon.kind, 'value', v_coupon.value);
end;
$$;
grant execute on function public.preview_discount(uuid, text, text, numeric, text) to anon, authenticated;

-- Unsubscribe from win-back emails (link token; idempotent).
create or replace function public.unsubscribe_customer(p_customer_id uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.customers set email_consent = false, updated_at = now()
  where id = p_customer_id and unsubscribe_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.unsubscribe_customer(uuid, uuid) to anon, authenticated;

drop function if exists public.place_customer_order(uuid, text, text, text, text, text, uuid, jsonb);

create or replace function public.place_customer_order(
  p_restaurant_id uuid,
  p_order_type text,
  p_table_number text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note text default null,
  p_qr_code_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_coupon_code text default null,
  p_gift_card_code text default null,
  p_customer_email text default null,
  p_email_consent boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_token text;
  v_total numeric := 0;
  v_count int := 0;
  v_elem jsonb;
  v_item_id uuid;
  v_qty int;
  v_price numeric;
  v_name text;
  v_recent int;
  v_opt_ids uuid[];
  v_opt_count int;
  v_opt_sum numeric;
  v_snapshot jsonb;
  v_group record;
  v_in_group int;
  v_tax_pct numeric := 0;
  v_svc_pct numeric := 0;
  v_min_order numeric := 0;
  v_tax_amt numeric := 0;
  v_svc_amt numeric := 0;
  v_tz text := 'Asia/Karachi';
  v_local_time time;
  v_local_dow int;
  v_disc numeric := 0;
  v_base numeric := 0;
  v_coupon public.coupons%rowtype;
  v_discount numeric := 0;
  v_after numeric := 0;
  v_payable numeric := 0;
  v_gc_id uuid;
  v_gc_balance numeric := 0;
  v_gc_apply numeric := 0;
  v_phone_norm text;
  v_email_norm text;
begin
  select coalesce(s.timezone, 'Asia/Karachi') into v_tz
  from public.restaurant_settings s where s.restaurant_id = p_restaurant_id;
  v_local_time := (now() at time zone v_tz)::time;
  v_local_dow := extract(dow from (now() at time zone v_tz))::int;
  if not public.ordering_available(p_restaurant_id) then
    raise exception 'ORDERING_NOT_AVAILABLE';
  end if;
  if p_order_type not in ('dine_in','takeaway') then
    raise exception 'INVALID_ORDER_TYPE';
  end if;
  if p_order_type = 'dine_in'
     and (p_table_number is null or btrim(p_table_number) = '') then
    raise exception 'TABLE_REQUIRED';
  end if;
  if p_order_type = 'takeaway' then
    if p_customer_name is null or btrim(p_customer_name) = '' then
      raise exception 'NAME_REQUIRED';
    end if;
    if p_customer_phone is null
       or length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 10 then
      raise exception 'PHONE_REQUIRED';
    end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'TOO_MANY_ITEMS';
  end if;

  select count(*) into v_recent
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.created_at > now() - interval '10 minutes'
    and (
      (p_order_type = 'takeaway' and o.customer_phone = p_customer_phone)
      or (p_order_type = 'dine_in' and o.table_number = p_table_number)
    );
  if v_recent >= 5 then
    raise exception 'TOO_MANY_ORDERS';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '');

  insert into public.orders (
    restaurant_id, qr_code_id, order_type, table_number,
    customer_name, customer_phone, note, status, total_amount, customer_token
  ) values (
    p_restaurant_id,
    p_qr_code_id,
    p_order_type,
    nullif(btrim(coalesce(p_table_number, '')), ''),
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    'pending', 0, v_token
  ) returning id into v_order_id;

  for v_elem in select * from jsonb_array_elements(p_items) loop
    v_item_id := (v_elem ->> 'menu_item_id')::uuid;
    v_qty := coalesce((v_elem ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'INVALID_QUANTITY';
    end if;
    select mi.name,
           case when mi.discount_price is not null
                     and mi.discount_price < mi.price
                then mi.discount_price else mi.price end
      into v_name, v_price
    from public.menu_items mi
    where mi.id = v_item_id
      and mi.restaurant_id = p_restaurant_id
      and mi.is_available
      and (mi.available_from is null or mi.available_to is null
           or (case when mi.available_from <= mi.available_to
                    then v_local_time >= mi.available_from and v_local_time < mi.available_to
                    else v_local_time >= mi.available_from or v_local_time < mi.available_to end));
    if v_name is null then
      raise exception 'ITEM_UNAVAILABLE';
    end if;

    -- ---- options for this line ------------------------------------
    select coalesce(array_agg(distinct x::uuid), '{}')
      into v_opt_ids
    from jsonb_array_elements_text(coalesce(v_elem -> 'option_ids', '[]'::jsonb)) as x;
    if v_opt_ids is null then v_opt_ids := '{}'; end if;

    v_opt_sum := 0;
    v_snapshot := '[]'::jsonb;
    if coalesce(array_length(v_opt_ids, 1), 0) > 0 then
      select count(*), coalesce(sum(io.price_delta), 0)
        into v_opt_count, v_opt_sum
      from public.item_options io
      join public.item_option_groups g on g.id = io.group_id
      where io.id = any(v_opt_ids)
        and g.menu_item_id = v_item_id
        and io.is_available;
      if v_opt_count <> coalesce(array_length(v_opt_ids, 1), 0) then
        raise exception 'INVALID_OPTION';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
               'group_name', g.name,
               'option_name', io.name,
               'price_delta', io.price_delta
             ) order by g.display_order, io.display_order), '[]'::jsonb)
        into v_snapshot
      from public.item_options io
      join public.item_option_groups g on g.id = io.group_id
      where io.id = any(v_opt_ids);
    end if;

    -- Required groups satisfied? Single-choice groups respected?
    for v_group in
      select g.id, g.selection_type, g.is_required
      from public.item_option_groups g
      where g.menu_item_id = v_item_id
    loop
      select count(*) into v_in_group
      from public.item_options io
      where io.group_id = v_group.id and io.id = any(v_opt_ids);
      if v_group.is_required and v_in_group < 1 then
        raise exception 'OPTION_REQUIRED';
      end if;
      if v_group.selection_type = 'single' and v_in_group > 1 then
        raise exception 'INVALID_OPTION';
      end if;
    end loop;

    -- ---- Phase 2.4: happy-hour schedule discount (base price only) --
    v_base := v_price;
    select coalesce(max(ps.discount_percent), 0) into v_disc
    from public.price_schedules ps
    where ps.restaurant_id = p_restaurant_id
      and ps.is_active
      and v_local_dow = any(ps.days)
      and (case when ps.start_time <= ps.end_time
                then v_local_time >= ps.start_time and v_local_time < ps.end_time
                else v_local_time >= ps.start_time or v_local_time < ps.end_time end)
      and (ps.menu_item_id = v_item_id
           or (ps.menu_item_id is null and ps.category_id is not null and ps.category_id = (select mi.category_id from public.menu_items mi where mi.id = v_item_id))
           or (ps.menu_item_id is null and ps.category_id is null));
    if v_disc > 0 then
      v_price := round(v_base * (100 - v_disc) / 100, 2);
    end if;

    v_price := v_price + v_opt_sum;

    insert into public.order_items (
      order_id, restaurant_id, menu_item_id, item_name, unit_price, quantity, subtotal, options_snapshot, via_upsell
    ) values (
      v_order_id, p_restaurant_id, v_item_id, v_name, v_price, v_qty, v_price * v_qty, v_snapshot,
      coalesce((v_elem ->> 'via_upsell')::boolean, false)
    );
    v_total := v_total + (v_price * v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- ---- Phase 1.4 charges + Phase 3 coupons / gift cards -----------
  select coalesce(s.tax_percent, 0), coalesce(s.service_percent, 0),
         coalesce(s.min_order_amount, 0)
    into v_tax_pct, v_svc_pct, v_min_order
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;

  if v_min_order > 0 and v_total < v_min_order then
    raise exception 'MIN_ORDER';
  end if;

  v_phone_norm := nullif(btrim(coalesce(p_customer_phone, '')), '');

  -- Coupon (validated here; the client preview is display-only).
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon
    from public.coupons c
    where c.restaurant_id = p_restaurant_id
      and upper(c.code) = upper(btrim(p_coupon_code))
      and c.is_active;
    if v_coupon.id is null then
      raise exception 'COUPON_INVALID';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
      raise exception 'COUPON_EXPIRED';
    end if;
    if v_total < coalesce(v_coupon.min_order_amount, 0) then
      raise exception 'COUPON_MIN_ORDER';
    end if;
    if v_coupon.max_redemptions is not null and v_coupon.times_redeemed >= v_coupon.max_redemptions then
      raise exception 'COUPON_USED_UP';
    end if;
    if v_coupon.first_order_only then
      if v_phone_norm is null or exists (
        select 1 from public.orders o
        where o.restaurant_id = p_restaurant_id
          and o.customer_phone = v_phone_norm
          and o.status <> 'cancelled'
          and o.id <> v_order_id
      ) then
        raise exception 'COUPON_FIRST_ORDER_ONLY';
      end if;
    end if;
    if v_coupon.kind = 'percent' then
      v_discount := round(v_total * v_coupon.value / 100, 2);
    else
      v_discount := least(v_coupon.value, v_total);
    end if;
    if v_discount > v_total then v_discount := v_total; end if;
  end if;

  v_after := v_total - v_discount;
  v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_svc_amt := round(v_after * v_svc_pct / 100, 2);
  v_payable := v_after + v_tax_amt + v_svc_amt;

  -- Gift card (applied after charges; reduces what is due at counter).
  if p_gift_card_code is not null and btrim(p_gift_card_code) <> '' then
    select gc.id, gc.balance into v_gc_id, v_gc_balance
    from public.gift_cards gc
    where gc.restaurant_id = p_restaurant_id
      and upper(gc.code) = upper(btrim(p_gift_card_code))
      and gc.is_active;
    if v_gc_id is null then
      raise exception 'GIFT_CARD_INVALID';
    end if;
    if v_gc_balance <= 0 then
      raise exception 'GIFT_CARD_EMPTY';
    end if;
    v_gc_apply := least(v_gc_balance, v_payable);
    update public.gift_cards set balance = balance - v_gc_apply where id = v_gc_id;
  end if;

  update public.orders
     set total_amount = v_payable - v_gc_apply,
         subtotal_amount = v_total,
         tax_amount = v_tax_amt,
         service_amount = v_svc_amt,
         discount_amount = v_discount,
         coupon_code = case when v_discount > 0 then upper(btrim(p_coupon_code)) else null end,
         gift_card_id = v_gc_id,
         gift_card_amount = v_gc_apply
   where id = v_order_id;

  -- v_discount > 0 only when a coupon row was found and applied
  -- (v_coupon is assigned on that path only — never touch it here
  -- without the discount guard: an unassigned record raises 55000).
  if v_discount > 0 then
    update public.coupons set times_redeemed = times_redeemed + 1 where id = v_coupon.id;
  end if;

  -- ---- Phase 3: customer database upsert ---------------------------
  v_email_norm := nullif(btrim(coalesce(p_customer_email, '')), '');
  if v_email_norm is not null and position('@' in v_email_norm) = 0 then
    v_email_norm := null;
  end if;
  if v_phone_norm is not null then
    insert into public.customers (
      restaurant_id, phone, name, email, email_consent,
      first_order_at, last_order_at, order_count, total_spent
    ) values (
      p_restaurant_id, v_phone_norm,
      nullif(btrim(coalesce(p_customer_name, '')), ''),
      v_email_norm, coalesce(p_email_consent, false) and v_email_norm is not null,
      now(), now(), 1, v_payable - v_gc_apply
    )
    on conflict (restaurant_id, phone) do update set
      name = coalesce(excluded.name, customers.name),
      email = coalesce(excluded.email, customers.email),
      email_consent = customers.email_consent or excluded.email_consent,
      last_order_at = now(),
      order_count = customers.order_count + 1,
      total_spent = customers.total_spent + excluded.total_spent,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'customer_token', v_token,
    'subtotal_amount', v_total,
    'discount_amount', v_discount,
    'tax_amount', v_tax_amt,
    'service_amount', v_svc_amt,
    'gift_card_amount', v_gc_apply,
    'total_amount', v_payable - v_gc_apply,
    'status', 'pending'
  );
end; $$;

-- ---------------------------------------------------------------------
-- get_customer_order — money breakdown + loyalty progress
-- ---------------------------------------------------------------------

grant execute on function public.place_customer_order(
  uuid, text, text, text, text, text, uuid, jsonb, text, text, text, boolean
) to anon, authenticated;

create or replace function public.get_customer_order(
  p_order_id uuid,
  p_token text
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
  v_loyalty jsonb := null;
  v_buy_x integer;
  v_enabled boolean;
  v_stamps integer := 0;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_token = p_token;
  if v_order.id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_name', oi.item_name,
           'unit_price', oi.unit_price,
           'quantity', oi.quantity,
           'subtotal', oi.subtotal,
           'options', coalesce(oi.options_snapshot, '[]'::jsonb)
         ) order by oi.created_at), '[]'::jsonb)
    into v_items
  from public.order_items oi where oi.order_id = v_order.id;

  select s.loyalty_enabled, s.loyalty_buy_x into v_enabled, v_buy_x
  from public.restaurant_settings s where s.restaurant_id = v_order.restaurant_id;
  if coalesce(v_enabled, false) and v_order.customer_phone is not null then
    select count(*) into v_stamps from public.orders o
    where o.restaurant_id = v_order.restaurant_id
      and o.customer_phone = v_order.customer_phone
      and o.status = 'completed';
    v_loyalty := jsonb_build_object(
      'buy_x', coalesce(v_buy_x, 6),
      'stamps', v_stamps,
      'cycle', case when coalesce(v_buy_x, 6) > 0 then v_stamps % coalesce(v_buy_x, 6) else 0 end,
      'reward_ready', v_stamps > 0 and coalesce(v_buy_x, 6) > 0 and (v_stamps % coalesce(v_buy_x, 6)) = 0
    );
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'order_type', v_order.order_type,
    'table_number', v_order.table_number,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'total_amount', v_order.total_amount,
    'subtotal_amount', v_order.subtotal_amount,
    'tax_amount', v_order.tax_amount,
    'service_amount', v_order.service_amount,
    'discount_amount', v_order.discount_amount,
    'coupon_code', v_order.coupon_code,
    'gift_card_amount', v_order.gift_card_amount,
    'loyalty', v_loyalty,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'items', v_items
  );
end; $$;

grant execute on function public.get_customer_order(uuid, text) to anon, authenticated;


-- Verification: expect 6 rows.
select 'customers' as check_name where exists (select 1 from information_schema.tables where table_schema='public' and table_name='customers')
union all select 'coupons' where exists (select 1 from information_schema.tables where table_schema='public' and table_name='coupons')
union all select 'gift_cards' where exists (select 1 from information_schema.tables where table_schema='public' and table_name='gift_cards')
union all select 'orders.discount_amount' where exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount')
union all select 'loyalty_enabled' where exists (select 1 from information_schema.columns where table_schema='public' and table_name='restaurant_settings' and column_name='loyalty_enabled')
union all select 'preview_discount fn' where exists (select 1 from pg_proc where proname = 'preview_discount');
