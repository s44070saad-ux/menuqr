-- =====================================================================
-- Velora — Phase 6: reservations + catering, POS counter ordering,
-- multi-location menu clone/sync (US/EU pack)
-- Run once in the Supabase SQL editor (after migration-phase5-square.sql).
--
-- Reservations & catering: guests submit through SECURITY DEFINER
-- RPCs only (validation + rate limits + plan gate in the database);
-- owners manage rows under RLS. Guest status checks are token-gated
-- exactly like orders. POS: place_staff_order is owner-authenticated
-- (auth.uid membership) and prices everything server-side by id.
-- Multi-location: clone_menu / sync_menu_by_name copy between two
-- restaurants the caller owns; the SOURCE must be on Business
-- (the chain HQ plan) — checked against restaurant_plan_slug.
-- =====================================================================

alter table public.restaurant_settings
  add column if not exists reservations_enabled boolean not null default false,
  add column if not exists catering_enabled boolean not null default false;

alter table public.orders
  add column if not exists order_source text not null default 'customer'
    check (order_source in ('customer','pos'));

-- ---------------- reservations ----------------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size int not null check (party_size between 1 and 100),
  reserve_date date not null,
  reserve_time time not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','waitlisted','cancelled','completed','no_show')),
  customer_token text not null,
  created_at timestamptz not null default now()
);
create index if not exists reservations_rest_idx on public.reservations(restaurant_id, reserve_date, reserve_time);
alter table public.reservations enable row level security;
drop policy if exists "owners manage reservations" on public.reservations;
create policy "owners manage reservations"
  on public.reservations for all
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())));

create or replace function public.create_reservation(
  p_restaurant_id uuid, p_name text, p_phone text, p_email text,
  p_party_size int, p_date date, p_time time, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan text; v_enabled boolean; v_recent int; v_token text; v_id uuid;
begin
  select public.restaurant_plan_slug(p_restaurant_id) into v_plan;
  if v_plan not in ('pro','business') then raise exception 'PLAN_NOT_ALLOWED'; end if;
  select reservations_enabled into v_enabled from public.restaurant_settings where restaurant_id = p_restaurant_id;
  if coalesce(v_enabled, false) = false then raise exception 'RESERVATIONS_OFF'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'BAD_NAME'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 7 then raise exception 'BAD_PHONE'; end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 100 then raise exception 'BAD_PARTY'; end if;
  if p_date is null or p_date < current_date or p_date > current_date + 90 then raise exception 'BAD_DATE'; end if;
  select count(*) into v_recent from public.reservations
   where restaurant_id = p_restaurant_id and customer_phone = p_phone
     and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'TOO_MANY'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.reservations (restaurant_id, customer_name, customer_phone, customer_email, party_size, reserve_date, reserve_time, note, customer_token)
  values (p_restaurant_id, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''), p_party_size, p_date, p_time, nullif(trim(coalesce(p_note,'')), ''), v_token)
  returning id into v_id;
  return jsonb_build_object('reservation_id', v_id, 'customer_token', v_token, 'status', 'pending');
end $$;

create or replace function public.get_reservation(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.reservations%rowtype;
begin
  select * into v_row from public.reservations where id = p_id and customer_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_row.id, 'status', v_row.status, 'party_size', v_row.party_size,
    'reserve_date', v_row.reserve_date, 'reserve_time', v_row.reserve_time,
    'customer_name', v_row.customer_name);
end $$;

-- ---------------- catering enquiries ----------------
create table if not exists public.catering_enquiries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  event_date date,
  guests int check (guests is null or guests between 1 and 10000),
  budget_amount numeric(12,2),
  message text,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);
create index if not exists catering_rest_idx on public.catering_enquiries(restaurant_id, created_at desc);
alter table public.catering_enquiries enable row level security;
drop policy if exists "owners manage catering" on public.catering_enquiries;
create policy "owners manage catering"
  on public.catering_enquiries for all
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())));

create or replace function public.create_catering_enquiry(
  p_restaurant_id uuid, p_name text, p_phone text, p_email text,
  p_event_date date, p_guests int, p_budget numeric, p_message text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan text; v_enabled boolean; v_recent int; v_id uuid;
begin
  select public.restaurant_plan_slug(p_restaurant_id) into v_plan;
  if v_plan not in ('pro','business') then raise exception 'PLAN_NOT_ALLOWED'; end if;
  select catering_enabled into v_enabled from public.restaurant_settings where restaurant_id = p_restaurant_id;
  if coalesce(v_enabled, false) = false then raise exception 'CATERING_OFF'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'BAD_NAME'; end if;
  if p_phone is null or length(regexp_replace(p_phone, '\D', '', 'g')) < 7 then raise exception 'BAD_PHONE'; end if;
  select count(*) into v_recent from public.catering_enquiries
   where restaurant_id = p_restaurant_id and customer_phone = p_phone
     and created_at > now() - interval '60 minutes';
  if v_recent >= 3 then raise exception 'TOO_MANY'; end if;
  insert into public.catering_enquiries (restaurant_id, customer_name, customer_phone, customer_email, event_date, guests, budget_amount, message)
  values (p_restaurant_id, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''),
          p_event_date, p_guests, p_budget, nullif(trim(coalesce(p_message,'')), ''))
  returning id into v_id;
  return jsonb_build_object('enquiry_id', v_id);
end $$;

-- ---------------- POS counter ordering ----------------
-- Staff orders: the caller must own the restaurant (auth check),
-- prices are read server-side from menu_items / item_options by id
-- (client sends only ids + quantities). Coupons, gift cards, tips,
-- happy-hour schedules and min-order do not apply at the till in v1;
-- tax/service DO apply from the restaurant's settings, so till and
-- menu totals stay consistent.
create or replace function public.place_staff_order(
  p_restaurant_id uuid, p_order_type text, p_table_number text,
  p_customer_name text, p_customer_phone text,
  p_items jsonb, p_mark_paid boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan text; v_item jsonb; v_menu_item public.menu_items%rowtype;
  v_qty int; v_unit numeric(12,2); v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0; v_tax_pct numeric(6,2) := 0; v_svc_pct numeric(6,2) := 0;
  v_tax numeric(12,2) := 0; v_svc numeric(12,2) := 0; v_total numeric(12,2) := 0;
  v_order_id uuid; v_token text; v_opt_sum numeric(12,2); v_opt_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())) then
    raise exception 'FORBIDDEN';
  end if;
  select public.restaurant_plan_slug(p_restaurant_id) into v_plan;
  if v_plan not in ('pro','business') then raise exception 'PLAN_NOT_ALLOWED'; end if;
  if p_order_type not in ('dine_in','takeaway') then raise exception 'BAD_TYPE'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'TOO_MANY_ITEMS'; end if;

  select coalesce(tax_percent,0), coalesce(service_percent,0) into v_tax_pct, v_svc_pct
  from public.restaurant_settings where restaurant_id = p_restaurant_id;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.orders (
    restaurant_id, order_type, table_number, customer_name, customer_phone,
    status, total_amount, customer_token, order_source, payment_status
  ) values (
    p_restaurant_id, p_order_type, nullif(trim(coalesce(p_table_number,'')), ''),
    nullif(trim(coalesce(p_customer_name,'')), ''), nullif(trim(coalesce(p_customer_phone,'')), ''),
    'confirmed', 0, v_token, 'pos', case when p_mark_paid then 'paid' else 'counter' end
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu_item from public.menu_items
     where id = (v_item->>'item_id')::uuid and restaurant_id = p_restaurant_id;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then raise exception 'BAD_QTY'; end if;
    v_unit := coalesce(v_menu_item.discount_price, v_menu_item.price);
    if v_menu_item.discount_price is not null and v_menu_item.discount_price >= v_menu_item.price then
      v_unit := v_menu_item.price;
    end if;
    v_opt_sum := 0; v_opt_snapshot := '[]'::jsonb;
    if v_item ? 'option_ids' and jsonb_typeof(v_item->'option_ids') = 'array'
       and jsonb_array_length(v_item->'option_ids') > 0 then
      select coalesce(sum(o.price_delta), 0),
             coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'group_name', g.name, 'option_name', o.name,
               'price_delta', o.price_delta) order by g.display_order, o.display_order), '[]'::jsonb)
        into v_opt_sum, v_opt_snapshot
        from public.item_options o join public.item_option_groups g on g.id = o.group_id
       where o.id in (select (jsonb_array_elements_text(v_item->'option_ids'))::uuid)
         and g.menu_item_id = v_menu_item.id;
      v_unit := v_unit + coalesce(v_opt_sum, 0);
    end if;
    v_line_total := round(v_unit * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;
    insert into public.order_items (order_id, restaurant_id, menu_item_id, item_name, quantity, unit_price, subtotal, options_snapshot)
    values (v_order_id, p_restaurant_id, v_menu_item.id, v_menu_item.name, v_qty, v_unit, v_line_total, v_opt_snapshot);
  end loop;

  v_tax := round(v_subtotal * v_tax_pct / 100, 2);
  v_svc := round(v_subtotal * v_svc_pct / 100, 2);
  v_total := v_subtotal + v_tax + v_svc;
  update public.orders set total_amount = v_total,
         subtotal_amount = v_subtotal, tax_amount = v_tax, service_amount = v_svc
   where id = v_order_id;

  if p_customer_phone is not null and length(trim(p_customer_phone)) >= 7 then
    insert into public.customers (restaurant_id, phone, name, first_seen_at, last_seen_at, order_count, total_spent)
    values (p_restaurant_id, trim(p_customer_phone), nullif(trim(coalesce(p_customer_name,'')), ''), now(), now(), 1, v_total)
    on conflict (restaurant_id, phone) do update
      set last_seen_at = now(), order_count = public.customers.order_count + 1,
          total_spent = public.customers.total_spent + v_total,
          name = coalesce(excluded.name, public.customers.name);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total);
end $$;

-- ---------------- multi-location: clone + sync ----------------
create or replace function public.clone_menu(p_source_id uuid, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan text; v_cat record; v_new_cat uuid; v_item record; v_new_item uuid;
  v_group record; v_new_group uuid; v_cats int := 0; v_items int := 0; v_groups int := 0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_source_id = p_target_id then raise exception 'SAME_RESTAURANT'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_source_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_target_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())) then raise exception 'FORBIDDEN'; end if;
  select public.restaurant_plan_slug(p_source_id) into v_plan;
  if v_plan <> 'business' then raise exception 'PLAN_NOT_ALLOWED'; end if;

  for v_cat in select * from public.categories where restaurant_id = p_source_id order by display_order, created_at loop
    select id into v_new_cat from public.categories
     where restaurant_id = p_target_id and lower(name) = lower(v_cat.name) limit 1;
    if v_new_cat is null then
      insert into public.categories (restaurant_id, name, image_url, display_order, is_active)
      values (p_target_id, v_cat.name, v_cat.image_url, v_cat.display_order, v_cat.is_active)
      returning id into v_new_cat;
      v_cats := v_cats + 1;
    end if;
    insert into public.category_translations (category_id, lang, name, source)
    select v_new_cat, t.lang, t.name, t.source from public.category_translations t
     where t.category_id = v_cat.id
    on conflict (category_id, lang) do nothing;

    for v_item in select * from public.menu_items where restaurant_id = p_source_id and category_id = v_cat.id loop
      if exists (select 1 from public.menu_items where restaurant_id = p_target_id and lower(name) = lower(v_item.name)) then
        continue;
      end if;
      insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price,
        image_url, is_available, is_featured, display_order, allergens, dietary, calories,
        available_from, available_to)
      values (p_target_id, v_new_cat, v_item.name, v_item.description, v_item.price, v_item.discount_price,
        v_item.image_url, v_item.is_available, v_item.is_featured, v_item.display_order, v_item.allergens,
        v_item.dietary, v_item.calories, v_item.available_from, v_item.available_to)
      returning id into v_new_item;
      v_items := v_items + 1;
      insert into public.menu_item_translations (item_id, lang, name, description, source)
      select v_new_item, t.lang, t.name, t.description, t.source from public.menu_item_translations t
       where t.item_id = v_item.id
      on conflict (item_id, lang) do nothing;
      for v_group in select * from public.item_option_groups where menu_item_id = v_item.id loop
        insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
        values (p_target_id, v_new_item, v_group.name, v_group.selection_type, v_group.is_required, v_group.display_order)
        returning id into v_new_group;
        v_groups := v_groups + 1;
        insert into public.item_options (restaurant_id, group_id, name, price_delta, is_available, display_order)
        select p_target_id, v_new_group, o.name, o.price_delta, o.is_available, o.display_order
          from public.item_options o where o.group_id = v_group.id;
      end loop;
    end loop;
  end loop;

  -- Uncategorized items
  for v_item in select * from public.menu_items where restaurant_id = p_source_id and category_id is null loop
    if exists (select 1 from public.menu_items where restaurant_id = p_target_id and lower(name) = lower(v_item.name)) then
      continue;
    end if;
    insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price,
      image_url, is_available, is_featured, display_order, allergens, dietary, calories,
      available_from, available_to)
    values (p_target_id, null, v_item.name, v_item.description, v_item.price, v_item.discount_price,
      v_item.image_url, v_item.is_available, v_item.is_featured, v_item.display_order, v_item.allergens,
      v_item.dietary, v_item.calories, v_item.available_from, v_item.available_to)
    returning id into v_new_item;
    v_items := v_items + 1;
    insert into public.menu_item_translations (item_id, lang, name, description, source)
    select v_new_item, t.lang, t.name, t.description, t.source from public.menu_item_translations t
     where t.item_id = v_item.id
    on conflict (item_id, lang) do nothing;
    for v_group in select * from public.item_option_groups where menu_item_id = v_item.id loop
      insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
      values (p_target_id, v_new_item, v_group.name, v_group.selection_type, v_group.is_required, v_group.display_order)
      returning id into v_new_group;
      v_groups := v_groups + 1;
      insert into public.item_options (restaurant_id, group_id, name, price_delta, is_available, display_order)
      select p_target_id, v_new_group, o.name, o.price_delta, o.is_available, o.display_order
        from public.item_options o where o.group_id = v_group.id;
    end loop;
  end loop;

  return jsonb_build_object('categories_created', v_cats, 'items_created', v_items, 'option_groups_created', v_groups);
end $$;

create or replace function public.sync_menu_by_name(p_source_id uuid, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan text; v_updated int := 0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_source_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.restaurants r where r.id = p_target_id
                 and (r.owner_id = auth.uid() or public.is_super_admin())) then raise exception 'FORBIDDEN'; end if;
  select public.restaurant_plan_slug(p_source_id) into v_plan;
  if v_plan <> 'business' then raise exception 'PLAN_NOT_ALLOWED'; end if;

  update public.menu_items t
     set price = s.price, discount_price = s.discount_price, is_available = s.is_available
    from public.menu_items s
   where s.restaurant_id = p_source_id and t.restaurant_id = p_target_id
     and lower(t.name) = lower(s.name)
     and (t.price, t.discount_price, t.is_available) is distinct from (s.price, s.discount_price, s.is_available);
  get diagnostics v_updated = row_count;
  return jsonb_build_object('items_updated', v_updated);
end $$;

grant execute on function public.create_reservation(uuid, text, text, text, int, date, time, text) to anon, authenticated;
grant execute on function public.get_reservation(uuid, text) to anon, authenticated;
grant execute on function public.create_catering_enquiry(uuid, text, text, text, date, int, numeric, text) to anon, authenticated;
grant execute on function public.place_staff_order(uuid, text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.clone_menu(uuid, uuid) to authenticated;
grant execute on function public.sync_menu_by_name(uuid, uuid) to authenticated;
