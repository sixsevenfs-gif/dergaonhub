-- Update 060: a customer sees their orders on every login with their number, not only on the login
-- that placed them. The website and the apps start an anonymous login on each phone; after logging out
-- and in again it is a new login, and the database showed orders only to the login that placed them,
-- so the list said "No orders yet". Now a login that verified the number with OTP sees that number's
-- orders everywhere (list, tracking, cancel, UPI reference, complaints). The website and the apps need
-- no update for this.
-- Orders the owner deletes (Admin → Delete orders) now leave a short note, so the customer's list shows
-- them as "Deleted by Jholzo" (orders deleted before this update are gone for good).
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.

-- An order belongs to the number that placed it (when ordered for someone else), else to the receiver.
-- The login that placed it, or any login that verified that number with OTP, may see it.
create or replace function public.is_my_order(p_placed_by uuid, p_ordered_by_phone text, p_customer_phone text)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_placed_by = auth.uid()
    or exists (select 1 from verified_phones v where v.user_id = auth.uid()
               and v.phone = case when coalesce(p_ordered_by_phone, '') <> '' then p_ordered_by_phone else p_customer_phone end)
  )
$$;
-- Used by the rules below, so everyone must be able to call it (it only answers about the caller).
grant execute on function public.is_my_order(uuid, text, text) to anon, authenticated;

drop policy if exists "customer reads own orders" on public.orders;
create policy "customer reads own orders" on public.orders for select
  using (is_admin() or is_my_order(placed_by, ordered_by_phone, customer_phone));

drop policy if exists "read items of visible orders" on public.order_items;
create policy "read items of visible orders" on public.order_items for select
  using (exists (select 1 from orders o where o.id = order_id
                 and (is_admin() or is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone))));

drop policy if exists "read removed items of visible orders" on public.order_removed_items;
create policy "read removed items of visible orders" on public.order_removed_items for select
  using (is_desk() or exists (select 1 from orders o where o.id = order_id
                              and is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone)));

drop policy if exists "customer reports on own order" on public.complaints;
create policy "customer reports on own order" on public.complaints for insert
  with check (exists (select 1 from orders o where o.id = order_id
                      and is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone)));
drop policy if exists "customer reads own complaints" on public.complaints;
create policy "customer reads own complaints" on public.complaints for select
  using (placed_by = auth.uid() or is_admin()
         or exists (select 1 from orders o where o.id = order_id
                    and is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone)));

-- Cancel and UPI reference: same number, any login (copied from 038 and 051; only the lookup changed).
create or replace function public.customer_cancel_order(p_order_number text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_end time := (select slot_end from store_settings where id = 1);
begin
  select * into o from orders where upper(order_number) = upper(p_order_number)
    and is_my_order(placed_by, ordered_by_phone, customer_phone);
  if o.id is null then raise exception 'Order not found for this number. Log in with the number you ordered from.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.status = 'completed' then raise exception 'This order is already delivered.'; end if;
  if o.dispatch <> '' then raise exception 'Our rider is already on the way, so this order can''t be cancelled now.'; end if;
  update orders set status = 'cancelled', cancel_reason = 'Cancelled by customer' where id = o.id;
  -- Not counted when we were late: the order was carried over, or its evening has already ended.
  if o.payment_method <> 'upi_now' and o.delayed_from is null
     and not (o.delivery_date < v_now::date or (o.delivery_date = v_now::date and v_now::time >= v_end)) then
    update customers set cancel_count = cancel_count + 1 where id = coalesce(o.orderer_id, o.customer_id);
  end if;
end
$$;

create or replace function public.customer_submit_upi_ref(p_order_number text, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_ref text := regexp_replace(coalesce(p_ref, ''), '\s', '', 'g');
begin
  select * into o from orders where upper(order_number) = upper(p_order_number)
    and is_my_order(placed_by, ordered_by_phone, customer_phone);
  if o.id is null then raise exception 'Order not found for this number. Log in with the number you ordered from.'; end if;
  if o.payment_method <> 'upi_now' then raise exception 'This order is not paid online.'; end if;
  if o.payment_status = 'paid' then return; end if;
  if v_ref !~ '^[0-9A-Za-z]{6,30}$' then raise exception 'Enter the UPI Ref No. / UTR shown in your UPI app (usually 12 digits).'; end if;
  if o.status = 'cancelled' then
    if o.cancel_reason <> 'Not paid in time' then raise exception 'This order is cancelled. Please call us.'; end if;
    delete from wallet_entries where order_id = o.id and kind = 'refund';
    delete from wallet_gift_moves where order_id = o.id and kind = 'refund';
    update orders set status = 'placed', cancel_reason = '', upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
    return;
  end if;
  update orders set upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
end
$$;

-- Tracking page: the owner's full view for the number's logins too (copied from 058; "mine" changed).
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone) or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used, 'delivery_type', o.delivery_type, 'express_fee', o.express_fee, 'express_by', o.express_by,
                    'total', o.total, 'gift_wrap', o.gift_wrap, 'gift_wrap_fee', o.gift_wrap_fee, 'invite_discount', o.invite_discount, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name_snapshot', r.name_snapshot, 'quantity', r.quantity,
                                                             'line_total', r.line_total, 'reason', r.reason, 'removed_at', r.removed_at) order by r.removed_at), '[]')
                from order_removed_items r where r.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone) or is_admin())),
    'mine', is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone)
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

-- What is left of a deleted order, for the customer's list.
create table if not exists public.deleted_orders (
  id uuid primary key,                         -- the deleted order's id
  order_number text not null,
  placed_at timestamptz,
  deleted_at timestamptz not null default now(),
  placed_by uuid,
  customer_phone text not null default '',
  ordered_by_phone text not null default '',
  status text not null default '',             -- what it was when deleted
  total numeric(10,2),
  item_count int not null default 0,
  items jsonb not null default '[]'::jsonb     -- [{"name": "Atta 5 kg", "quantity": 1}]
);
create index if not exists deleted_orders_customer_phone on public.deleted_orders (customer_phone);
create index if not exists deleted_orders_ordered_by_phone on public.deleted_orders (ordered_by_phone);
alter table public.deleted_orders enable row level security;
drop policy if exists "own deleted orders" on public.deleted_orders;
create policy "own deleted orders" on public.deleted_orders for select
  using (is_desk() or is_my_order(placed_by, ordered_by_phone, customer_phone));

-- Admin → Delete orders keeps that note first (copied from 030; the insert is new).
create or replace function public.admin_delete_orders(p_ids uuid[], p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_people uuid[];
  v_orders int;
  v_customers int;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not delete_code_ok(p_code) then raise exception 'Wrong delete code.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one order.'; end if;
  if cardinality(p_ids) > 200 then raise exception 'Delete at most 200 orders at a time.'; end if;

  -- The people on these orders (receiver and orderer), checked again once the orders are gone.
  select coalesce(array_agg(distinct pid), '{}') into v_people
  from (
    select customer_id as pid from orders where id = any(p_ids)
    union
    select orderer_id from orders where id = any(p_ids) and orderer_id is not null
  ) s;

  -- A no-show these orders added no longer counts against the number.
  update customers c set no_show_count = greatest(0, c.no_show_count - x.n)
  from (
    select customer_id, count(*)::int as n from orders
    where id = any(p_ids) and status = 'cancelled' and cancel_reason = 'No-show'
    group by customer_id
  ) x
  where c.id = x.customer_id;

  -- A short note stays, so the customer still sees the order in their list as "Deleted by Jholzo".
  insert into deleted_orders (id, order_number, placed_at, placed_by, customer_phone, ordered_by_phone, status, total, item_count, items)
  select o.id, o.order_number, o.created_at, o.placed_by, o.customer_phone, coalesce(o.ordered_by_phone, ''), o.status, o.total,
         coalesce((select sum(i.quantity) from order_items i where i.order_id = o.id), 0)::int,
         coalesce((select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'quantity', i.quantity) order by i.name_snapshot)
                   from order_items i where i.order_id = o.id), '[]'::jsonb)
  from orders o where o.id = any(p_ids)
  on conflict (id) do nothing;

  delete from wallet_entries where order_id = any(p_ids);
  delete from orders where id = any(p_ids);   -- items, complaints, messages go with it
  get diagnostics v_orders = row_count;

  if to_regclass('public.push_log') is not null then
    execute 'delete from public.push_log where order_id = any($1)' using p_ids;
  end if;

  -- Customers who only had these orders.
  delete from customers c
  where c.id = any(v_people)
    and not exists (select 1 from orders o where o.customer_id = c.id or o.orderer_id = c.id);
  get diagnostics v_customers = row_count;

  return jsonb_build_object('orders', v_orders, 'customers', v_customers);
end
$$;

-- Deleting an account also removes those notes (copied from 041; one line added).
create or replace function public.delete_my_account(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c customers;
  v_phone text;
  v_left numeric;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if not owns_phone(p_phone) then raise exception 'Log in with this number on this phone first.'; end if;
  if exists (select 1 from orders where (customer_phone = p_phone or ordered_by_phone = p_phone)
             and status in ('placed', 'confirmed')) then
    raise exception 'You have an order that is not delivered yet. You can delete your account once it is delivered or cancelled.';
  end if;

  select * into c from customers where phone = p_phone;
  if c.id is not null then
    v_phone := p_phone;
    if not c.blocked and c.cancel_count + c.no_show_count = 0 then
      -- No strikes: free the number. The row stays for its past orders, under a made-up number
      -- (real mobile numbers never start with 0).
      loop
        v_phone := '0' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
        exit when not exists (select 1 from customers where phone = v_phone);
      end loop;
    end if;
    update customers set phone = v_phone, name = 'Deleted customer', referral_code = null where id = c.id;
    v_left := wallet_balance(c.id);
    if v_left <> 0 then
      insert into wallet_entries (customer_id, amount, kind, note) values (c.id, -v_left, 'admin', 'Account deleted');
    end if;
  end if;

  update order_items set note = '' where order_id in (select id from orders where customer_phone = p_phone);
  update orders set customer_name = 'Deleted customer', customer_phone = '0000000000', address = '', area = '',
                    lat = null, lng = null, note = '', upi_ref = '', delivery_photo = '', cancel_reason = ''
    where customer_phone = p_phone;
  -- Orders they placed for someone else keep that person's details, without theirs.
  update orders set ordered_by_name = 'Deleted customer', ordered_by_phone = '0000000000' where ordered_by_phone = p_phone;
  update complaints set customer_name = 'Deleted customer', customer_phone = '', message = '' where customer_phone = p_phone;

  delete from deleted_orders where customer_phone = p_phone or ordered_by_phone = p_phone;
  delete from verified_phones where phone = p_phone;
  delete from otp_requests where phone = p_phone;
  delete from signups where phone = p_phone;
  delete from waitlist where phone = p_phone;
  -- These come with other updates (032 carts, 028 app notifications), so only when they are there.
  if to_regclass('public.carts') is not null then execute 'delete from public.carts where phone = $1' using p_phone; end if;
  if to_regclass('public.device_tokens') is not null then execute 'delete from public.device_tokens where phone = $1' using p_phone; end if;
end
$$;

-- Check: should say 1 and 1.
select (select count(*) from pg_proc where proname = 'is_my_order') as helper,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'deleted_orders') as deleted_orders_table;
