-- =====================================================================
-- Velora — Phase 2.1: upselling engine data
--  * menu_items.suggested_item_ids — owner-picked "pairs well with"
--    items shown in the options sheet and the cart (Pro/Business).
--  * order_items.via_upsell — set when a line was added from a
--    suggestion; powers the "Velora made you $X" upsell attribution.
--  * popular_item_ids() — real order counts (last 30 days, confirmed
--    or completed orders) behind the "Popular" badge.
--  * place_customer_order replaced to store via_upsell per line
--    (body otherwise identical to Phase 1.4).
-- Run once in the Supabase SQL Editor, after migration-phase1-eta.
-- =====================================================================

alter table public.menu_items
  add column if not exists suggested_item_ids uuid[] not null default '{}';

alter table public.order_items
  add column if not exists via_upsell boolean not null default false;

create or replace function public.popular_item_ids(p_restaurant_id uuid)
returns table(menu_item_id uuid, order_count bigint)
language sql security definer set search_path = public stable as $$
  select oi.menu_item_id, sum(oi.quantity)::bigint as order_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.restaurant_id = p_restaurant_id
    and oi.menu_item_id is not null
    and o.status in ('confirmed', 'completed')
    and o.created_at >= now() - interval '30 days'
  group by oi.menu_item_id
  having sum(oi.quantity) >= 3
  order by order_count desc
  limit 8;
$$;
grant execute on function public.popular_item_ids(uuid) to anon, authenticated;

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
  v_tax_pct numeric := 0;
  v_svc_pct numeric := 0;
  v_min_order numeric := 0;
  v_tax_amt numeric := 0;
  v_svc_amt numeric := 0;
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

  -- ---- Phase 1.4: tax / service charge / minimum order ------------
  select coalesce(s.tax_percent, 0), coalesce(s.service_percent, 0),
         coalesce(s.min_order_amount, 0)
    into v_tax_pct, v_svc_pct, v_min_order
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;

  if v_min_order > 0 and v_total < v_min_order then
    raise exception 'MIN_ORDER';
  end if;

  v_tax_amt := round(v_total * v_tax_pct / 100, 2);
  v_svc_amt := round(v_total * v_svc_pct / 100, 2);

  update public.orders
     set total_amount = v_total + v_tax_amt + v_svc_amt,
         subtotal_amount = v_total,
         tax_amount = v_tax_amt,
         service_amount = v_svc_amt
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'customer_token', v_token,
    'subtotal_amount', v_total,
    'tax_amount', v_tax_amt,
    'service_amount', v_svc_amt,
    'total_amount', v_total + v_tax_amt + v_svc_amt,
    'status', 'pending'
  );
end; $$;

grant execute on function public.place_customer_order(
  uuid, text, text, text, text, text, uuid, jsonb
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. get_customer_order — include chosen options per item
-- ---------------------------------------------------------------------

-- Verification: expect 3 rows.
select column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'menu_items' and column_name = 'suggested_item_ids')
    or (table_name = 'order_items' and column_name = 'via_upsell'))
union all
select 'popular_item_ids fn' where exists (
  select 1 from pg_proc where proname = 'popular_item_ids');
