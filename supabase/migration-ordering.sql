-- =====================================================================
-- MenuQR migration: Ordering (Pro/Business) + Analytics fix
-- Run AFTER schema.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- What it adds:
--  * qr_codes.kind / table_number        -> per-table QR codes
--  * restaurant_settings.enable_ordering -> owner on/off toggle
--  * menu_scans.source / table_number / visitor_id
--      source 'qr' only when the menu was opened via a QR URL,
--      'link' for direct/shared links (previously both were "scans").
--  * orders + order_items                -> customer orders
--  * ordering_available(rid)             -> TRUE only when the restaurant
--      is published, ordering is toggled on, the subscription is active
--      and the plan is Pro or Business. This is the server-side gate:
--      hiding a button in the UI is never the enforcement.
--  * place_customer_order(...) RPC       -> the ONLY way an anonymous
--      customer can create an order. Recomputes every price from the
--      database (client prices are never trusted), validates dine-in
--      table number / takeaway name+phone, snapshots item names+prices.
--  * get_customer_order(...) RPC         -> customer checks their own
--      order status with order_id + a secret customer_token. Anon users
--      get NO direct table access to orders (names/phones stay private).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.qr_codes
  add column if not exists kind text not null default 'main'
    check (kind in ('main','table'));
alter table public.qr_codes
  add column if not exists table_number text;

create unique index if not exists idx_qr_table_unique
  on public.qr_codes (restaurant_id, table_number)
  where kind = 'table' and table_number is not null;

alter table public.restaurant_settings
  add column if not exists enable_ordering boolean not null default true;

alter table public.menu_scans
  add column if not exists source text not null default 'link'
    check (source in ('qr','link'));
alter table public.menu_scans
  add column if not exists table_number text;
alter table public.menu_scans
  add column if not exists visitor_id text;

-- ---------------------------------------------------------------------
-- 2. Orders tables
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  order_type text not null check (order_type in ('dine_in','takeaway')),
  table_number text,
  customer_name text,
  customer_phone text,
  note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','completed','cancelled')),
  total_amount numeric not null default 0 check (total_amount >= 0),
  customer_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  unit_price numeric not null check (unit_price >= 0),
  quantity integer not null check (quantity >= 1 and quantity <= 50),
  subtotal numeric not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant_created
  on public.orders (restaurant_id, created_at desc);
create index if not exists idx_orders_restaurant_status
  on public.orders (restaurant_id, status);
create index if not exists idx_order_items_order
  on public.order_items (order_id);
create index if not exists idx_scans_restaurant_source
  on public.menu_scans (restaurant_id, source, created_at desc);

drop trigger if exists trg_touch_orders on public.orders;
create trigger trg_touch_orders before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Plan gate helpers
-- ---------------------------------------------------------------------
create or replace function public.restaurant_plan_slug(rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.slug
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.restaurant_id = rid and s.status in ('active','trialing')
  limit 1;
$$;

create or replace function public.ordering_available(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.restaurant_is_public(rid)
    and coalesce(
      (select st.enable_ordering from public.restaurant_settings st
       where st.restaurant_id = rid), false)
    and coalesce(public.restaurant_plan_slug(rid) in ('pro','business'), false);
$$;

grant execute on function public.ordering_available(uuid) to anon, authenticated;
grant execute on function public.restaurant_plan_slug(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Place an order (anonymous, via RPC only)
--    p_items: [{"menu_item_id":"<uuid>","quantity":2}, ...]
-- ---------------------------------------------------------------------
create or replace function public.place_customer_order(
  p_restaurant_id uuid,
  p_order_type text,
  p_table_number text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note text default null,
  p_qr_code_id uuid default null,
  p_items jsonb default '[]'::jsonb
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
begin
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

  -- Basic abuse guard: at most 5 orders in 10 minutes from the same
  -- phone (takeaway) or for the same table (dine-in) per restaurant.
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
      and mi.is_available;
    if v_name is null then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    insert into public.order_items (
      order_id, restaurant_id, menu_item_id, item_name, unit_price, quantity, subtotal
    ) values (
      v_order_id, p_restaurant_id, v_item_id, v_name, v_price, v_qty, v_price * v_qty
    );
    v_total := v_total + (v_price * v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  update public.orders set total_amount = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'customer_token', v_token,
    'total_amount', v_total,
    'status', 'pending'
  );
end; $$;

grant execute on function public.place_customer_order(
  uuid, text, text, text, text, text, uuid, jsonb
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Customer order-status lookup (order_id + secret token only)
-- ---------------------------------------------------------------------
create or replace function public.get_customer_order(
  p_order_id uuid,
  p_token text
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
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
           'subtotal', oi.subtotal
         ) order by oi.created_at), '[]'::jsonb)
    into v_items
  from public.order_items oi where oi.order_id = v_order.id;
  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'order_type', v_order.order_type,
    'table_number', v_order.table_number,
    'total_amount', v_order.total_amount,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'items', v_items
  );
end; $$;

grant execute on function public.get_customer_order(uuid, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS for orders — members/admin read+update; NO anon direct access
--    (anonymous flow goes through the two RPCs above).
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders for delete
  using (public.is_super_admin());

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists order_items_delete on public.order_items;
create policy order_items_delete on public.order_items for delete
  using (public.is_super_admin());

-- Public menu needs to resolve which QR code was scanned (previously
-- qr_codes was member-only, so anon scans could never be attributed).
drop policy if exists qr_select_public on public.qr_codes;
create policy qr_select_public on public.qr_codes for select
  using (public.restaurant_is_public(restaurant_id));

-- Realtime for the owner dashboard (polling fallback exists in the UI,
-- so this is best-effort).
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 7. Plan features — ordering is now a real Pro/Business feature
-- ---------------------------------------------------------------------
update public.subscription_plans
set features = '["Everything in Starter","Advanced analytics","Direct ordering (dine-in + takeaway)","Table QR codes","Live order dashboard","Extra menu customization"]'::jsonb
where slug = 'pro';

update public.subscription_plans
set features = '["Everything in Pro","Multiple restaurant branches","Branch management","Advanced analytics","Priority support"]'::jsonb
where slug = 'business';
