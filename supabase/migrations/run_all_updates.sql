-- ALL UPDATES IN ONE: 002 packaging + 003 riders/WhatsApp + 004 order for someone else + 005 free delivery + 006 customer cancel + 007 small orders and delivery photo + 008 no-shows, COD limit, product photos.
-- Paste all of this in Supabase → SQL Editor → New query → Run. Safe to run again; nothing is deleted.

/* ======== 002_packaging.sql ======== */
-- Update 002: packaging charge. Run once in Supabase → SQL Editor on a database created
-- from the first schema.sql. Safe to run again; nothing is deleted.

alter table public.store_settings
  add column if not exists pack_fee_low int not null default 5,
  add column if not exists pack_fee_mid int not null default 9,
  add column if not exists pack_fee_high int not null default 12,
  add column if not exists pack_mid_from int not null default 500,
  add column if not exists pack_high_from int not null default 1000;

alter table public.orders add column if not exists packaging_fee int not null default 0;

-- Packaging charge by items total (same rule as packagingFee in src/lib/delivery.js).
create or replace function public.packaging_fee(p_subtotal int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_subtotal >= s.pack_high_from then s.pack_fee_high
              when p_subtotal >= s.pack_mid_from then s.pack_fee_mid
              else s.pack_fee_low end
  from store_settings s where s.id = 1
$$;

-- p_lines: [{ "product_id": "...", "qty": 2, "note": "fresh wala" }, ...]
-- Returns the new order number. Errors are short messages shown to the customer.
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_total int;
  v_packaging int;
  v_completed int := 0;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
  v_order orders;
  first_order_limit constant int := 500;   -- CONFIG.FIRST_ORDER_LIMIT
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
  delivery_cap constant int := 15;         -- CONFIG.DELIVERY_CAP
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;

  select * into q from delivery_quote(p_lat, p_lng);
  if q.too_far then
    raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
  end if;

  select * into c from customers where phone = p_phone;
  if c.id is not null and (c.blocked or c.no_show_count >= no_show_limit) then
    raise exception 'Online ordering is blocked for this number. Please call us to order.';
  end if;

  -- Every line is priced from the products table, never from the browser.
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (line ->> 'qty')::int;
    select * into p from products where id = (line ->> 'product_id')::uuid and status = 'active' and available;
    if not found or v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Some items are no longer available. Please check your cart.';
    end if;
    v_subtotal := v_subtotal + p.price * v_qty;
  end loop;

  if v_subtotal < s.min_order then raise exception 'Minimum order is ₹%.', s.min_order; end if;
  v_packaging := packaging_fee(v_subtotal);
  v_total := v_subtotal + q.fee + v_packaging;
  if c.id is not null then
    select count(*) into v_completed from orders where customer_id = c.id and status = 'completed';
  end if;
  if v_completed = 0 and v_total > first_order_limit then
    raise exception 'The limit for a first order is ₹%. Remove a few items, or call us.', first_order_limit;
  end if;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening moves to the next day.
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= delivery_cap loop
    v_date := v_date + 1;
  end loop;

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, q.fee, v_packaging, v_total, p_payment, v_date)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  return v_order.order_number;
end
$$;

grant execute on function public.packaging_fee(int) to anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean) to authenticated;

/* ======== 003_partners.sql ======== */
-- Update 003: delivery partners (riders) and WhatsApp messages to customers.
-- Run once in Supabase → SQL Editor (after 002). Safe to run again; nothing is deleted.
--
-- Rider (delivery partner): email + password login listed in the riders table. On /partner a rider
-- sees the orders of a day (name, phone, address, items), marks "On the way", "Arriving" and
-- "Delivered", and sends the customer a WhatsApp message. A rider cannot see customers, money
-- reports, settings or products, and cannot change prices or totals.

/* ---------------- riders ---------------- */

create table if not exists public.riders (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_rider() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from riders where user_id = auth.uid() and active)
$$;

-- Admin or an active rider.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_rider()
$$;

alter table public.riders enable row level security;
drop policy if exists "admin manages riders" on public.riders;
create policy "admin manages riders" on public.riders for all using (is_admin()) with check (is_admin());
drop policy if exists "rider reads self" on public.riders;
create policy "rider reads self" on public.riders for select using (user_id = auth.uid());

/* ---------------- delivery progress on orders ---------------- */

-- dispatch: '' (not left yet), 'on_the_way' (rider has left), 'arriving' (next stop, about to arrive)
alter table public.orders
  add column if not exists dispatch text not null default '',
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_by uuid references auth.users on delete set null;
do $$ begin
  alter table public.orders add constraint orders_dispatch_check check (dispatch in ('', 'on_the_way', 'arriving'));
exception when duplicate_object then null;
end $$;

-- Turned on by the admin once the WhatsApp Cloud API is connected (see supabase/README.md).
alter table public.store_settings add column if not exists whatsapp_auto boolean not null default false;

/* ---------------- WhatsApp messages sent to customers ---------------- */

-- channel: 'auto' = sent by the notify-whatsapp Edge Function, 'tap' = sent by hand from WhatsApp.
create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  kind text not null check (kind in ('placed', 'on_the_way', 'arriving', 'delivered')),
  channel text not null check (channel in ('auto', 'tap')),
  ok boolean not null default true,
  error text not null default '',
  sent_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_messages_order_idx on public.order_messages (order_id);

alter table public.order_messages enable row level security;
drop policy if exists "staff reads messages" on public.order_messages;
create policy "staff reads messages" on public.order_messages for select using (is_staff());
-- Written only by log_order_message() and by the Edge Function (service role).

/* ---------------- partner functions ---------------- */

-- One day's orders for the delivery run, with items and the messages already sent.
create or replace function public.partner_orders(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(
      (to_jsonb(o) - array['placed_by', 'customer_id']) || jsonb_build_object(
        'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name_snapshot), '[]') from order_items i where i.order_id = o.id),
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'channel', m.channel, 'ok', m.ok, 'at', m.created_at) order by m.created_at), '[]')
                     from order_messages m where m.order_id = o.id)
      ) order by o.area, o.created_at), '[]')
    from orders o
    where o.delivery_date = p_date and o.status <> 'cancelled'
  );
end
$$;

create or replace function public.partner_set_dispatch(p_order_id uuid, p_dispatch text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_dispatch not in ('', 'on_the_way', 'arriving') then raise exception 'Unknown delivery step.'; end if;
  update orders set dispatch = p_dispatch, dispatched_at = case when p_dispatch = '' then null else now() end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can go out for delivery.'; end if;
end
$$;

-- Delivered and paid. Cash is what the rider actually collected (UPI orders: 0).
create or replace function public.partner_complete(p_order_id uuid, p_cash int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(),
    cash_collected = case when payment_method = 'cash' then greatest(coalesce(p_cash, total), 0) else 0 end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

-- Undo "Delivered" (tapped by mistake). A rider can only undo their own.
create or replace function public.partner_undo_delivered(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set status = 'confirmed', completed_at = null, cash_collected = 0, delivered_by = null
  where id = p_order_id and status = 'completed' and (is_admin() or delivered_by = auth.uid());
  if not found then raise exception 'This delivery cannot be undone.'; end if;
end
$$;

-- A message sent by hand (WhatsApp opened with the text ready).
create or replace function public.log_order_message(p_order_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  insert into order_messages (order_id, kind, channel) values (p_order_id, p_kind, 'tap');
end
$$;

-- Admin: riders with their login email.
create or replace function public.admin_list_riders() returns table (user_id uuid, email text, name text, phone text, active boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, u.email::text, r.name, r.phone, r.active
  from riders r join auth.users u on u.id = r.user_id
  where is_admin()
  order by r.active desc, r.name
$$;

-- Admin: make an existing login (Supabase → Authentication → Users) a rider.
create or replace function public.admin_add_rider(p_email text, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No login with this email yet. First create it in Supabase → Authentication → Users → Add user.';
  end if;
  insert into riders (user_id, name, phone) values (v_id, trim(p_name), coalesce(trim(p_phone), ''))
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, active = true;
end
$$;

revoke execute on function public.partner_orders(date), public.partner_set_dispatch(uuid, text), public.partner_complete(uuid, int),
  public.partner_undo_delivered(uuid), public.log_order_message(uuid, text), public.admin_list_riders(),
  public.admin_add_rider(text, text, text) from public, anon;
grant execute on function public.is_rider(), public.is_staff() to anon, authenticated;
grant execute on function public.partner_orders(date), public.partner_set_dispatch(uuid, text), public.partner_complete(uuid, int),
  public.partner_undo_delivered(uuid), public.log_order_message(uuid, text), public.admin_list_riders(),
  public.admin_add_rider(text, text, text) to authenticated;

/* ======== 004_order_for_someone.sql ======== */
-- Update 004: "Order for someone else". Run once in Supabase → SQL Editor (after 003).
-- Safe to run again; nothing is deleted.
-- Someone outside Dergaon can order for family: the receiver's name, phone and address go on the
-- order (the rider calls them), and the person who ordered is kept in ordered_by_name / ordered_by_phone.

alter table public.orders
  add column if not exists ordered_by_name text not null default '',
  add column if not exists ordered_by_phone text not null default '';

-- place_order gets two more arguments (with defaults, so the old call still works).
drop function if exists public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean);

-- p_lines: [{ "product_id": "...", "qty": 2, "note": "fresh wala" }, ...]
-- Returns the new order number. Errors are short messages shown to the customer.
-- Ordering for someone else: p_name / p_phone / address are the receiver's (the rider calls them),
-- p_orderer_name / p_orderer_phone are the person who placed the order (updates, "My orders").
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  ob customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_total int;
  v_packaging int;
  v_completed int := 0;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
  v_order orders;
  first_order_limit constant int := 500;   -- CONFIG.FIRST_ORDER_LIMIT
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
  delivery_cap constant int := 15;         -- CONFIG.DELIVERY_CAP
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  select * into q from delivery_quote(p_lat, p_lng);
  if q.too_far then
    raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
  end if;

  select * into c from customers where phone = p_phone;
  if c.id is not null and (c.blocked or c.no_show_count >= no_show_limit) then
    raise exception 'Online ordering is blocked for this number. Please call us to order.';
  end if;
  if v_ob_phone <> '' then
    select * into ob from customers where phone = v_ob_phone;
    if ob.id is not null and (ob.blocked or ob.no_show_count >= no_show_limit) then
      raise exception 'Online ordering is blocked for this number. Please call us to order.';
    end if;
  end if;

  -- Every line is priced from the products table, never from the browser.
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (line ->> 'qty')::int;
    select * into p from products where id = (line ->> 'product_id')::uuid and status = 'active' and available;
    if not found or v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Some items are no longer available. Please check your cart.';
    end if;
    v_subtotal := v_subtotal + p.price * v_qty;
  end loop;

  if v_subtotal < s.min_order then raise exception 'Minimum order is ₹%.', s.min_order; end if;
  v_packaging := packaging_fee(v_subtotal);
  v_total := v_subtotal + q.fee + v_packaging;
  if c.id is not null then
    select count(*) into v_completed from orders where customer_id = c.id and status = 'completed';
  end if;
  if v_completed = 0 and v_total > first_order_limit then
    raise exception 'The limit for a first order is ₹%. Remove a few items, or call us.', first_order_limit;
  end if;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening moves to the next day.
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= delivery_cap loop
    v_date := v_date + 1;
  end loop;

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, q.fee, v_packaging, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  return v_order.order_number;
end
$$;

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text) to authenticated;

/* ======== 005_free_delivery.sql ======== */
-- Update 005: free delivery switch (launch offer). Run once in Supabase → SQL Editor.
-- Safe to run again; nothing is deleted. Turn it on/off in Admin → Settings.

alter table public.store_settings add column if not exists free_delivery boolean not null default false;

-- Road distance ≈ straight line × 1.3; every started km costs per_km_fee, never below min_delivery_fee.
-- free_delivery (launch offer, Admin → Settings) makes the fee 0 inside the delivery area.
create or replace function public.delivery_quote(p_lat double precision, p_lng double precision)
returns table (km numeric, fee int, too_far boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from store_settings where id = 1),
  d as (
    select s.*, round((2 * 6371 * asin(sqrt(
      power(sin(radians(p_lat - s.lat) / 2), 2) +
      cos(radians(s.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.lng) / 2), 2)
    )) * 1.3)::numeric, 1) as dist
    from s
  )
  select d.dist,
         case when d.dist > d.max_delivery_km then null
              when d.free_delivery then 0
              else greatest(d.min_delivery_fee, ceil(d.dist)::int * d.per_km_fee) end,
         d.dist > d.max_delivery_km
  from d
$$;


/* ======== 006_customer_cancel.sql ======== */
-- Update 006: customers can cancel their own order until the rider taps "On the way".
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.

create or replace function public.customer_cancel_order(p_order_number text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  select * into o from orders where upper(order_number) = upper(p_order_number) and placed_by = auth.uid();
  if o.id is null then raise exception 'Order not found on this phone.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.status = 'completed' then raise exception 'This order is already delivered.'; end if;
  if o.dispatch <> '' then raise exception 'Our rider is already on the way, so this order can''t be cancelled now.'; end if;
  update orders set status = 'cancelled', cancel_reason = 'Cancelled by customer' where id = o.id;
end
$$;

revoke execute on function public.customer_cancel_order(text) from public, anon;
grant execute on function public.customer_cancel_order(text) to authenticated;

/* ======== 007_small_orders_photos.sql ======== */
-- Update 007: small-order delivery fee, no first-order limit, delivery photo by the rider.
-- Run once in Supabase → SQL Editor (after 006). Safe to run again; nothing is deleted.
--
-- Small orders: if the items total is below small_order_below (₹149), delivery costs a flat
-- small_order_fee (₹40), or the normal distance fee if that is higher, so a far-away small order never
-- pays less than a normal one. Free delivery (launch offer) only covers orders from ₹149 up.
-- There is no minimum order any more (min_order 200 → 0), and no ₹500 limit on a first order.

alter table public.store_settings
  add column if not exists small_order_below int not null default 149,
  add column if not exists small_order_fee int not null default 40;
update public.store_settings set min_order = 0 where min_order = 200;

alter table public.orders add column if not exists delivery_photo text not null default '';

/* ---------------- placing an order ---------------- */

-- p_lines: [{ "product_id": "...", "qty": 2, "note": "fresh wala" }, ...]
-- Returns the new order number. Errors are short messages shown to the customer.
-- Ordering for someone else: p_name / p_phone / address are the receiver's (the rider calls them),
-- p_orderer_name / p_orderer_phone are the person who placed the order (updates, "My orders").
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  ob customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_fee int;
  v_total int;
  v_packaging int;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
  delivery_cap constant int := 15;         -- CONFIG.DELIVERY_CAP
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  select * into q from delivery_quote(p_lat, p_lng);
  if q.too_far then
    raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
  end if;

  select * into c from customers where phone = p_phone;
  if c.id is not null and (c.blocked or c.no_show_count >= no_show_limit) then
    raise exception 'Online ordering is blocked for this number. Please call us to order.';
  end if;
  if v_ob_phone <> '' then
    select * into ob from customers where phone = v_ob_phone;
    if ob.id is not null and (ob.blocked or ob.no_show_count >= no_show_limit) then
      raise exception 'Online ordering is blocked for this number. Please call us to order.';
    end if;
  end if;

  -- Every line is priced from the products table, never from the browser.
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (line ->> 'qty')::int;
    select * into p from products where id = (line ->> 'product_id')::uuid and status = 'active' and available;
    if not found or v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Some items are no longer available. Please check your cart.';
    end if;
    v_subtotal := v_subtotal + p.price * v_qty;
  end loop;

  if v_subtotal < s.min_order then raise exception 'Minimum order is ₹%.', s.min_order; end if;
  -- Same rule as deliveryQuote in src/lib/delivery.js.
  if v_subtotal < s.small_order_below then
    v_fee := greatest(s.small_order_fee, s.min_delivery_fee, ceil(q.km)::int * s.per_km_fee);
  else
    v_fee := q.fee;
  end if;
  v_packaging := packaging_fee(v_subtotal);
  v_total := v_subtotal + v_fee + v_packaging;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening moves to the next day.
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= delivery_cap loop
    v_date := v_date + 1;
  end loop;

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  return v_order.order_number;
end
$$;

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text) to authenticated;

/* ---------------- delivery photo ---------------- */

-- Private bucket: only the admin and riders can upload or see delivery photos.
insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false) on conflict (id) do nothing;
drop policy if exists "staff uploads delivery photos" on storage.objects;
create policy "staff uploads delivery photos" on storage.objects for insert with check (bucket_id = 'deliveries' and is_staff());
drop policy if exists "staff views delivery photos" on storage.objects;
create policy "staff views delivery photos" on storage.objects for select using (bucket_id = 'deliveries' and is_staff());

-- Delivered and paid. The rider must first photograph the items at the door (p_photo = storage path).
-- Cash is what the rider actually collected (UPI orders: 0).
drop function if exists public.partner_complete(uuid, int);
create or replace function public.partner_complete(p_order_id uuid, p_cash int, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if coalesce(trim(p_photo), '') = '' then raise exception 'Take a photo of the items at the door first.'; end if;
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(), delivery_photo = p_photo,
    cash_collected = case when payment_method = 'cash' then greatest(coalesce(p_cash, total), 0) else 0 end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

revoke execute on function public.partner_complete(uuid, int, text) from public, anon;
grant execute on function public.partner_complete(uuid, int, text) to authenticated;


/* ======== 008_no_show_cod_photos.sql ======== */
-- Update 008: no-shows by the rider, cash on delivery restricted after repeated no-shows,
-- several photos per product. Run once in Supabase → SQL Editor (after 007). Safe to run again.

alter table public.products add column if not exists photos text[] not null default '{}';  -- extra photos (photo_url is the first)

-- Can this number pay cash on delivery? Not after 2 no-shows (CONFIG.NO_SHOW_LIMIT). Shown at checkout.
create or replace function public.cod_allowed(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from customers where phone = p_phone and no_show_count >= 2)
$$;
grant execute on function public.cod_allowed(text) to anon, authenticated;

-- Rider: the customer did not answer 4-5 calls at the door. Cancels the order and counts a no-show.
create or replace function public.partner_no_show(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set status = 'cancelled', cancel_reason = 'No-show'
  where id = p_order_id and status = 'confirmed'
  returning * into o;
  if o.id is null then raise exception 'Only confirmed orders can be marked as a no-show.'; end if;
  update customers set no_show_count = no_show_count + 1 where id = o.customer_id;
end
$$;
revoke execute on function public.partner_no_show(uuid) from public, anon;
grant execute on function public.partner_no_show(uuid) to authenticated;

/* ---------------- placing an order: repeated no-shows lose cash on delivery ---------------- */

-- p_lines: [{ "product_id": "...", "qty": 2, "note": "fresh wala" }, ...]
-- Returns the new order number. Errors are short messages shown to the customer.
-- Ordering for someone else: p_name / p_phone / address are the receiver's (the rider calls them),
-- p_orderer_name / p_orderer_phone are the person who placed the order (updates, "My orders").
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  ob customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_fee int;
  v_total int;
  v_packaging int;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
  delivery_cap constant int := 15;         -- CONFIG.DELIVERY_CAP
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  select * into q from delivery_quote(p_lat, p_lng);
  if q.too_far then
    raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
  end if;

  -- Blocked by the admin: no online orders. Repeated no-shows: no cash on delivery (cod_allowed()).
  select * into c from customers where phone = p_phone;
  if v_ob_phone <> '' then select * into ob from customers where phone = v_ob_phone; end if;
  if coalesce(c.blocked, false) or coalesce(ob.blocked, false) then
    raise exception 'Online ordering is blocked for this number. Please call us to order.';
  end if;
  if p_payment = 'cash' and (coalesce(c.no_show_count, 0) >= no_show_limit or coalesce(ob.no_show_count, 0) >= no_show_limit) then
    raise exception 'Due to misuse of cash on delivery, we have temporarily restricted it for this number. Please choose UPI.';
  end if;

  -- Every line is priced from the products table, never from the browser.
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (line ->> 'qty')::int;
    select * into p from products where id = (line ->> 'product_id')::uuid and status = 'active' and available;
    if not found or v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Some items are no longer available. Please check your cart.';
    end if;
    v_subtotal := v_subtotal + p.price * v_qty;
  end loop;

  if v_subtotal < s.min_order then raise exception 'Minimum order is ₹%.', s.min_order; end if;
  -- Same rule as deliveryQuote in src/lib/delivery.js.
  if v_subtotal < s.small_order_below then
    v_fee := greatest(s.small_order_fee, s.min_delivery_fee, ceil(q.km)::int * s.per_km_fee);
  else
    v_fee := q.fee;
  end if;
  v_packaging := packaging_fee(v_subtotal);
  v_total := v_subtotal + v_fee + v_packaging;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening moves to the next day.
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= delivery_cap loop
    v_date := v_date + 1;
  end loop;

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  return v_order.order_number;
end
$$;

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text) to authenticated;


/* ======== 009_fixed_cash.sql ======== */
create or replace function public.partner_complete(p_order_id uuid, p_cash int, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if coalesce(trim(p_photo), '') = '' then raise exception 'Take a photo of the items at the door first.'; end if;
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(), delivery_photo = p_photo,
    cash_collected = case when payment_method = 'cash' then total else 0 end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

/* ======== 010_powered_by.sql ======== */
alter table public.store_settings add column if not exists show_powered_by boolean not null default true;

-- Tell the API about the new columns right away.
notify pgrst, 'reload schema';
