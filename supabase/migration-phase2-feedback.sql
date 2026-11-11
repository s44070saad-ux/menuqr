-- =====================================================================
-- Velora — Phase 2.3: Google review prompt + private feedback inbox
--  * restaurant_settings.google_review_url — owner-set link shown to
--    customers after a completed order.
--  * feedback table — private customer feedback (never public). Owners
--    read their own via RLS; customers can only insert through the
--    token-gated submit_order_feedback() RPC (same pattern as orders:
--    no direct anon access to the table).
-- Run once in the Supabase SQL Editor, after migration-phase2-upsell.
-- =====================================================================

alter table public.restaurant_settings
  add column if not exists google_review_url text;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_name text,
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_feedback_restaurant on public.feedback(restaurant_id, created_at desc);
create unique index if not exists uq_feedback_order on public.feedback(order_id) where order_id is not null;

alter table public.feedback enable row level security;

drop policy if exists "members read feedback" on public.feedback;
create policy "members read feedback" on public.feedback
  for select to authenticated
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());
-- No insert/update/delete policies: customers write only via the RPC,
-- owners never edit feedback.

create or replace function public.submit_order_feedback(
  p_order_id uuid,
  p_token text,
  p_rating integer default null,
  p_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or v_order.customer_token is distinct from p_token then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'ORDER_NOT_COMPLETED';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'INVALID_RATING';
  end if;
  if v_msg is null or char_length(v_msg) < 3 then
    raise exception 'MESSAGE_TOO_SHORT';
  end if;
  if exists (select 1 from public.feedback where order_id = p_order_id) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into public.feedback (restaurant_id, order_id, customer_name, rating, message)
  values (v_order.restaurant_id, v_order.id, v_order.customer_name, p_rating, v_msg);
  return jsonb_build_object('ok', true, 'already', false);
end;
$$;
grant execute on function public.submit_order_feedback(uuid, text, integer, text) to anon, authenticated;

-- Verification: expect 3 rows.
select 'google_review_url' as check_name where exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'restaurant_settings' and column_name = 'google_review_url')
union all
select 'feedback table' where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'feedback')
union all
select 'submit_order_feedback fn' where exists (
  select 1 from pg_proc where proname = 'submit_order_feedback');
