-- =====================================================================
-- Velora — Phase A+B migration (design + quick-win features)
-- Run AFTER migration-ordering.sql and migration-admin-v2.sql.
-- Idempotent: safe to run more than once.
--
-- Adds:
--  * restaurant_settings.menu_theme / qr_color / card_style
--  * item_option_groups + item_options (variations & add-ons)
--  * order_items.options_snapshot
--  * place_customer_order: validates + prices chosen options server-side
--  * get_customer_order: returns the chosen options per item
--  * plan features refreshed for Starter / Pro / Business
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Appearance settings (menu themes, QR colour, table-card style)
-- ---------------------------------------------------------------------
alter table public.restaurant_settings
  add column if not exists menu_theme text not null default 'classic';
alter table public.restaurant_settings
  add column if not exists qr_color text not null default '#101828';
alter table public.restaurant_settings
  add column if not exists card_style text not null default 'classic';

-- ---------------------------------------------------------------------
-- 2. Item option groups & options (variations / add-ons)
--    e.g. group "Size" (single, required): Small +0 / Large +150
--         group "Extras" (multi): Extra cheese +100, Raita +50
-- ---------------------------------------------------------------------
create table if not exists public.item_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multi')),
  is_required boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.item_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.item_option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric not null default 0,
  is_available boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_opt_groups_item on public.item_option_groups(menu_item_id);
create index if not exists idx_opt_groups_restaurant on public.item_option_groups(restaurant_id);
create index if not exists idx_options_group on public.item_options(group_id);
create index if not exists idx_options_restaurant on public.item_options(restaurant_id);

alter table public.item_option_groups enable row level security;
alter table public.item_options enable row level security;

drop policy if exists opt_groups_select on public.item_option_groups;
create policy opt_groups_select on public.item_option_groups for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin()
         or public.restaurant_is_public(restaurant_id));

drop policy if exists opt_groups_write on public.item_option_groups;
create policy opt_groups_write on public.item_option_groups for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists options_select on public.item_options;
create policy options_select on public.item_options for select
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin()
         or public.restaurant_is_public(restaurant_id));

drop policy if exists options_write on public.item_options;
create policy options_write on public.item_options for all
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ---------------------------------------------------------------------
-- 3. Snapshot of chosen options on each order item
-- ---------------------------------------------------------------------
alter table public.order_items
  add column if not exists options_snapshot jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 4. place_customer_order — now understands options.
--    p_items entries: {"menu_item_id":"<uuid>","quantity":2,
--                      "option_ids":["<uuid>", ...]}   (option_ids optional)
--    All option prices are recomputed from the database; required
--    groups must be satisfied and single-choice groups take at most 1.
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
  v_opt_ids uuid[];
  v_opt_count int;
  v_opt_sum numeric;
  v_snapshot jsonb;
  v_group record;
  v_in_group int;
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

    v_price := v_price + v_opt_sum;

    insert into public.order_items (
      order_id, restaurant_id, menu_item_id, item_name, unit_price, quantity, subtotal, options_snapshot
    ) values (
      v_order_id, p_restaurant_id, v_item_id, v_name, v_price, v_qty, v_price * v_qty, v_snapshot
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
-- 5. get_customer_order — include chosen options per item
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
           'subtotal', oi.subtotal,
           'options', coalesce(oi.options_snapshot, '[]'::jsonb)
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
-- 6. Plan features — reflect the new capabilities
-- ---------------------------------------------------------------------
update public.subscription_plans
set features = '["Unlimited menu items","Custom restaurant branding","QR code download (PNG + SVG)","Menu themes & styled QR codes","Basic analytics"]'::jsonb
where slug = 'starter';

update public.subscription_plans
set features = '["Everything in Starter","Advanced analytics","Direct ordering (dine-in + takeaway)","Table QR codes","Live order dashboard","Kitchen display (KDS)","Item variations & add-ons","WhatsApp order alerts","Extra menu customization"]'::jsonb
where slug = 'pro';

update public.subscription_plans
set features = '["Everything in Pro","Multiple restaurant branches","Branch management","Advanced analytics","Priority support"]'::jsonb
where slug = 'business';
