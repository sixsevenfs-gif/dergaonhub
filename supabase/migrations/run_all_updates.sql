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
drop function if exists public.packaging_fee(int); -- 015 changes its return type; recreated just below
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

/* ======== 011_privacy_spam.sql ======== */
-- Order page and bill by order number. Order numbers are easy to guess (DG-1001, DG-1002...), so
-- someone else only sees the status, items and amounts: no name, phone, address or notes.
-- The phone that placed the order, the admin and riders see everything.
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'total', o.total, 'payment_method', o.payment_method, 'cancel_reason', o.cancel_reason,
                    'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

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

  -- Against fake orders filling the evening: at most 3 open orders per phone browser and per number.
  if (select count(*) from orders where status in ('placed', 'confirmed') and (placed_by = auth.uid() or customer_phone = p_phone)) >= 3 then
    raise exception 'You already have 3 orders waiting for delivery. Please call us to order more.';
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


/* ======== 012_sale_price.sql ======== */
alter table public.products add column if not exists compare_price int;
do $$ begin
  alter table public.products add constraint products_compare_price_check check (compare_price is null or compare_price > price);
exception when duplicate_object then null;
end $$;

/* ======== 013_daily_cap.sql ======== */
alter table public.store_settings add column if not exists daily_order_cap int not null default 15;

-- The day the next order will be delivered: today before the cut-off, else tomorrow, and the next day
-- with room if that evening already has daily_order_cap orders. Checkout shows it before ordering.
create or replace function public.next_delivery_date() returns date
language plpgsql stable security definer set search_path = public as $$
declare
  s store_settings;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
begin
  select * into s from store_settings where id = 1;
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= greatest(s.daily_order_cap, 1) loop
    v_date := v_date + 1;
  end loop;
  return v_date;
end
$$;
grant execute on function public.next_delivery_date() to anon, authenticated;

-- place_order: no limit on open orders per person; the daily limit comes from Admin → Settings.
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
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
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

  -- Before the cut-off: today; after it: tomorrow. A full evening (daily_order_cap) moves to the next day.
  -- The lock makes two orders at the same moment take turns, so a day never goes over the limit.
  perform pg_advisory_xact_lock(4815162342);
  v_date := next_delivery_date();

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

/* ======== 014_private_cap.sql ======== */
-- Settings only the admin can read (customers must not see how many orders we take per evening).
create table if not exists public.private_settings (
  id int primary key default 1 check (id = 1),
  daily_order_cap int not null default 50 check (daily_order_cap > 0)
);
insert into public.private_settings (id) values (1) on conflict (id) do nothing;
alter table public.private_settings enable row level security;
drop policy if exists "admin manages private settings" on public.private_settings;
create policy "admin manages private settings" on public.private_settings for all using (is_admin()) with check (is_admin());

-- The limit moves here from store_settings (which everyone can read) and becomes 50.
update public.private_settings set daily_order_cap = 50 where id = 1;
alter table public.store_settings drop column if exists daily_order_cap;

-- The day the next order will be delivered: today before the cut-off, else tomorrow, and the next day
-- with room if that evening already has daily_order_cap orders. Checkout shows the day, never the limit.
create or replace function public.next_delivery_date() returns date
language plpgsql stable security definer set search_path = public as $$
declare
  s store_settings;
  v_cap int := coalesce((select daily_order_cap from private_settings where id = 1), 50);
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
begin
  select * into s from store_settings where id = 1;
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= greatest(v_cap, 1) loop
    v_date := v_date + 1;
  end loop;
  return v_date;
end
$$;
grant execute on function public.next_delivery_date() to anon, authenticated;

/* ======== 015_upi_pay_now.sql ======== */
-- Payments: "Pay now by UPI" to the store's own UPI ID. There is no gateway, so the customer
-- enters the UPI reference (UTR) and the admin or rider confirms it from the bank app.
-- payment_status: none (pay on delivery) · awaiting (UPI not done yet) · verifying (UTR given)
-- · paid · failed (not received). Orders above cod_limit must use "Pay now by UPI".
alter table public.store_settings
  add column if not exists upi_id text not null default '',
  add column if not exists upi_name text not null default '',
  add column if not exists cod_limit int not null default 350;

alter table public.orders
  add column if not exists payment_status text not null default 'none',
  add column if not exists upi_ref text not null default '',
  add column if not exists paid_at timestamptz;
do $$ begin
  alter table public.orders add constraint orders_payment_status_check check (payment_status in ('none', 'awaiting', 'verifying', 'paid', 'failed'));
exception when duplicate_object then null;
end $$;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cash', 'upi', 'upi_now'));

-- Packaging charge with paise (₹3.80 / ₹7.80 / ₹13.60), so totals can have paise too.
alter table public.store_settings
  alter column pack_fee_low type numeric(8,2),
  alter column pack_fee_mid type numeric(8,2),
  alter column pack_fee_high type numeric(8,2);
alter table public.orders
  alter column packaging_fee type numeric(10,2),
  alter column total type numeric(10,2),
  alter column cash_collected type numeric(10,2);
update public.store_settings set pack_fee_low = 3.80, pack_fee_mid = 7.80, pack_fee_high = 13.60
where pack_fee_low = 5 and pack_fee_mid = 9 and pack_fee_high = 12;

drop function if exists public.packaging_fee(int);
create or replace function public.packaging_fee(p_subtotal int) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_subtotal >= s.pack_high_from then s.pack_fee_high
              when p_subtotal >= s.pack_mid_from then s.pack_fee_mid
              else s.pack_fee_low end
  from store_settings s where s.id = 1
$$;
grant execute on function public.packaging_fee(int) to anon, authenticated;

-- place_order: "Pay now by UPI", the cash limit, and paise in the total.
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
  v_total numeric;
  v_packaging numeric;
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi', 'upi_now') then raise exception 'Choose a payment method.'; end if;
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
  -- Big orders are paid first by UPI (no cash or UPI on delivery above cod_limit).
  if p_payment <> 'upi_now' and v_total > s.cod_limit then
    raise exception 'Orders above ₹% are paid by UPI before delivery. Please choose "Pay now by UPI".', s.cod_limit;
  end if;
  if p_payment = 'upi_now' and coalesce(s.upi_id, '') = '' then
    raise exception 'Online payment is not available right now. Please choose another payment method.';
  end if;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening (daily_order_cap) moves to the next day.
  -- The lock makes two orders at the same moment take turns, so a day never goes over the limit.
  perform pg_advisory_xact_lock(4815162342);
  v_date := next_delivery_date();

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end)
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

-- Customer: "I have paid" with the UPI reference number (UTR) from their UPI app.
create or replace function public.customer_submit_upi_ref(p_order_number text, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_ref text := regexp_replace(coalesce(p_ref, ''), '\s', '', 'g');
begin
  select * into o from orders where upper(order_number) = upper(p_order_number) and placed_by = auth.uid();
  if o.id is null then raise exception 'Order not found on this phone.'; end if;
  if o.payment_method <> 'upi_now' then raise exception 'This order is not paid online.'; end if;
  if o.payment_status = 'paid' then return; end if;
  if v_ref !~ '^[0-9A-Za-z]{6,30}$' then raise exception 'Enter the UPI Ref No. / UTR shown in your UPI app (usually 12 digits).'; end if;
  update orders set upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
end
$$;
revoke execute on function public.customer_submit_upi_ref(text, text) from public, anon;
grant execute on function public.customer_submit_upi_ref(text, text) to authenticated;

-- Admin or rider: the money is in the bank (paid), or it never came (failed). A small order that
-- failed becomes cash on delivery; a big one stays unpaid and is not handed over.
create or replace function public.staff_set_payment(p_order_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_limit int := (select cod_limit from store_settings where id = 1);
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_status not in ('paid', 'failed') then raise exception 'Unknown payment status.'; end if;
  select * into o from orders where id = p_order_id;
  if o.id is null or o.payment_method <> 'upi_now' then raise exception 'This order is not paid online.'; end if;
  if p_status = 'paid' then
    -- Money received: the order is confirmed too (no confirmation call needed).
    update orders set payment_status = 'paid', paid_at = now(),
      status = case when status = 'placed' then 'confirmed' else status end,
      confirmed_at = case when status = 'placed' then now() else confirmed_at end
    where id = o.id;
  elsif o.total <= v_limit then
    update orders set payment_status = 'none', payment_method = 'cash', upi_ref = '' where id = o.id;
  else
    update orders set payment_status = 'failed' where id = o.id;
  end if;
end
$$;
revoke execute on function public.staff_set_payment(uuid, text) from public, anon;
grant execute on function public.staff_set_payment(uuid, text) to authenticated;

-- Order page for strangers: also the payment status (still no names or phone numbers).
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

/* ======== 016_phone_otp.sql ======== */
-- Phone OTP (Message Central VerifyNow, sent by the phone-otp Edge Function). A number is verified once
-- per phone browser; after that no OTP is asked again on that phone. The admin switches it on in
-- Admin → Settings once the Edge Function is deployed.
alter table public.store_settings add column if not exists otp_required boolean not null default false;

create table if not exists public.verified_phones (
  user_id uuid not null references auth.users on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  verified_at timestamptz not null default now(),
  primary key (user_id, phone)
);
alter table public.verified_phones enable row level security;
drop policy if exists "own verified phones" on public.verified_phones;
create policy "own verified phones" on public.verified_phones for select using (user_id = auth.uid() or is_admin());
-- Rows are added only by the Edge Function (service key) after a correct OTP.

-- OTPs sent (the provider's verification id stays on the server; also limits how many are sent).
create table if not exists public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  phone text not null,
  verification_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists otp_requests_user_idx on public.otp_requests (user_id, created_at);
alter table public.otp_requests enable row level security;
-- No policies: only the Edge Function (service key) reads and writes it.

-- Is this number verified on this phone? (decides whether checkout asks for an OTP)
create or replace function public.phone_verified(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone)
$$;
grant execute on function public.phone_verified(text) to authenticated;

-- place_order: with OTP switched on, the ordering number must be verified on this phone.
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
  v_total numeric;
  v_packaging numeric;
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi', 'upi_now') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  -- OTP (when switched on): the number of the person ordering must be verified on this phone.
  if s.otp_required and not exists (
    select 1 from verified_phones where user_id = auth.uid() and phone = case when v_ob_phone <> '' then v_ob_phone else p_phone end
  ) then
    raise exception 'Please verify your phone number with the OTP first.';
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
  -- Big orders are paid first by UPI (no cash or UPI on delivery above cod_limit).
  if p_payment <> 'upi_now' and v_total > s.cod_limit then
    raise exception 'Orders above ₹% are paid by UPI before delivery. Please choose "Pay now by UPI".', s.cod_limit;
  end if;
  if p_payment = 'upi_now' and coalesce(s.upi_id, '') = '' then
    raise exception 'Online payment is not available right now. Please choose another payment method.';
  end if;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening (daily_order_cap) moves to the next day.
  -- The lock makes two orders at the same moment take turns, so a day never goes over the limit.
  perform pg_advisory_xact_lock(4815162342);
  v_date := next_delivery_date();

  insert into orders (customer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status)
  values (c.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end)
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

/* ======== 017_wallet_referral.sql ======== */
-- Update 017: Jholzo Money (wallet) and Refer & Earn. Run once in Supabase → SQL Editor (after 016).
-- Safe to run again; nothing is deleted.
--
-- How it works:
-- · Every customer gets an invite code after their first order (e.g. RAHUL482).
-- · A friend who is new (no orders yet) enters the code on their first order.
-- · When that first order is DELIVERED (and its items total is at least referral_min_order),
--   the inviter gets referrer_reward and the friend gets friend_reward in Jholzo Money.
-- · Jholzo Money is used at checkout: up to wallet_max_per_order per order.
-- · A cancelled order gives the used money back. If a delivered order is undone, its rewards are taken back.
-- · Only a phone that owns the number (verified by OTP, or has placed orders for it from this browser)
--   can see or spend its money, so typing someone else's number does nothing.
-- All amounts and the on/off switch are in Admin → Settings → Refer & earn.

alter table public.store_settings
  add column if not exists referral_on boolean not null default true,
  add column if not exists referrer_reward int not null default 30,
  add column if not exists friend_reward int not null default 20,
  add column if not exists referral_min_order int not null default 200,
  add column if not exists wallet_max_per_order int not null default 50;

alter table public.customers
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.customers on delete set null;

alter table public.orders
  add column if not exists orderer_id uuid references public.customers on delete set null,  -- whose wallet and referral
  add column if not exists wallet_used numeric(10,2) not null default 0;

-- The money book: one row per change. Balance = sum(amount).
create table if not exists public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers on delete cascade,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('referral_bonus', 'welcome_bonus', 'order_payment', 'refund', 'admin')),
  order_id uuid references public.orders on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wallet_entries_customer_idx on public.wallet_entries (customer_id, created_at desc);
create index if not exists wallet_entries_order_idx on public.wallet_entries (order_id);
alter table public.wallet_entries enable row level security;
drop policy if exists "admin reads wallet" on public.wallet_entries;
create policy "admin reads wallet" on public.wallet_entries for select using (is_admin());
-- No other policies: money only moves through the functions below.

create or replace function public.wallet_balance(p_customer_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from wallet_entries where customer_id = p_customer_id
$$;
revoke execute on function public.wallet_balance(uuid) from public, anon, authenticated;

-- Does this browser own the number? Verified by OTP here, or it placed orders for this number itself.
create or replace function public.owns_phone(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone)
    or exists (select 1 from orders where placed_by = auth.uid()
               and (ordered_by_phone = p_phone or (customer_phone = p_phone and ordered_by_phone = '')))
  )
$$;
revoke execute on function public.owns_phone(text) from public, anon, authenticated;

-- Invite code: up to 5 letters of the name + 3 digits (RAHUL482), or JHOL + digits.
create or replace function public.new_referral_code(p_name text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_base text := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 5));
  v_code text;
begin
  if length(v_base) < 3 then v_base := 'JHOL'; end if;
  loop
    v_code := v_base || (100 + floor(random() * 900))::int;
    exit when not exists (select 1 from customers where referral_code = v_code);
  end loop;
  return v_code;
end
$$;
revoke execute on function public.new_referral_code(text) from public, anon, authenticated;

-- "My Jholzo Money" page: balance, history, invite code and invited friends, for a number this browser owns.
create or replace function public.my_wallet(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c customers;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if not owns_phone(p_phone) then
    return jsonb_build_object('locked', true);
  end if;
  select * into c from customers where phone = p_phone;
  if c.id is null then
    -- Verified by OTP but never ordered: nothing yet. The invite code comes with the first order (with their name).
    return jsonb_build_object('locked', false, 'code', null, 'balance', 0, 'referred', false, 'has_orders', false,
                              'entries', '[]'::jsonb, 'friends', '[]'::jsonb);
  end if;
  if c.referral_code is null then
    update customers set referral_code = new_referral_code(c.name) where id = c.id returning * into c;
  end if;
  return jsonb_build_object(
    'locked', false,
    'code', c.referral_code,
    'balance', wallet_balance(c.id),
    'referred', c.referred_by is not null,
    'has_orders', exists (select 1 from orders where orderer_id = c.id or customer_id = c.id),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'amount', e.amount, 'kind', e.kind, 'note', e.note,
                                                             'created_at', e.created_at,
                                                             'order_number', (select order_number from orders where id = e.order_id))
                                          order by e.created_at desc), '[]')
                from (select * from wallet_entries where customer_id = c.id order by created_at desc limit 50) e),
    -- Invited friends: first name only, and whether the reward came.
    'friends', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', coalesce(nullif(split_part(f.name, ' ', 1), ''), 'Friend'),
                  'joined_at', f.created_at,
                  'earned', exists (select 1 from wallet_entries w join orders o on o.id = w.order_id
                                    where w.customer_id = c.id and w.kind = 'referral_bonus'
                                      and coalesce(o.orderer_id, o.customer_id) = f.id))
                order by f.created_at desc), '[]')
                from customers f where f.referred_by = c.id)
  );
end
$$;
revoke execute on function public.my_wallet(text) from public, anon;
grant execute on function public.my_wallet(text) to authenticated;

-- Admin: add or take back money by hand (a goodwill credit for a complaint, say).
create or replace function public.admin_wallet_adjust(p_customer_id uuid, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Enter an amount.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Write a short reason.'; end if;
  insert into wallet_entries (customer_id, amount, kind, note) values (p_customer_id, round(p_amount, 2), 'admin', trim(p_note));
end
$$;
revoke execute on function public.admin_wallet_adjust(uuid, numeric, text) from public, anon;
grant execute on function public.admin_wallet_adjust(uuid, numeric, text) to authenticated;

-- Money follows the order status, whichever screen changes it (admin, rider, customer, expiry).
create or replace function public.orders_wallet_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  me customers;
  v_me uuid := coalesce(new.orderer_id, new.customer_id);
begin
  if new.status = old.status then return new; end if;
  select * into s from store_settings where id = 1;

  -- Cancelled: the Jholzo Money used on it comes back (once).
  if new.status = 'cancelled' and new.wallet_used > 0
     and not exists (select 1 from wallet_entries where order_id = new.id and kind = 'refund') then
    insert into wallet_entries (customer_id, amount, kind, order_id, note)
    values (v_me, new.wallet_used, 'refund', new.id, 'Order ' || new.order_number || ' cancelled');
  end if;

  -- Delivered: first delivered order of an invited friend pays both rewards.
  if new.status = 'completed' and s.referral_on then
    select * into me from customers where id = v_me;
    if me.referred_by is not null
       and new.subtotal >= s.referral_min_order
       and not exists (select 1 from orders o where o.id <> new.id and o.status = 'completed'
                       and coalesce(o.orderer_id, o.customer_id) = v_me)
       and not exists (select 1 from wallet_entries where customer_id = v_me and kind = 'welcome_bonus') then
      if s.referrer_reward > 0 then
        insert into wallet_entries (customer_id, amount, kind, order_id, note)
        values (me.referred_by, s.referrer_reward, 'referral_bonus', new.id,
                coalesce(nullif(split_part(me.name, ' ', 1), ''), 'Your friend') || '''s first order was delivered');
      end if;
      if s.friend_reward > 0 then
        insert into wallet_entries (customer_id, amount, kind, order_id, note)
        values (v_me, s.friend_reward, 'welcome_bonus', new.id, 'Welcome reward for joining with an invite');
      end if;
    end if;
  end if;

  -- A delivered order was undone: its rewards are taken back (they come again when it is delivered).
  if old.status = 'completed' then
    delete from wallet_entries where order_id = new.id and kind in ('referral_bonus', 'welcome_bonus');
  end if;
  return new;
end
$$;
drop trigger if exists orders_wallet_on_status on public.orders;
create trigger orders_wallet_on_status after update of status on public.orders
  for each row execute function public.orders_wallet_on_status();

-- Order page for strangers: also the Jholzo Money used (the bill shows it).
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used,
                    'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

-- place_order: + use Jholzo Money (p_use_wallet) and an invite code on the first order (p_ref_code).
drop function if exists public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text);
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default '',
  p_use_wallet boolean default false, p_ref_code text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  ob customers;
  me customers;
  r customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
  v_ref text := upper(regexp_replace(coalesce(p_ref_code, ''), '\s', '', 'g'));
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_fee int;
  v_total numeric;
  v_packaging numeric;
  v_wallet numeric := 0;
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi', 'upi_now') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  -- OTP (when switched on): the number of the person ordering must be verified on this phone.
  if s.otp_required and not exists (
    select 1 from verified_phones where user_id = auth.uid() and phone = case when v_ob_phone <> '' then v_ob_phone else p_phone end
  ) then
    raise exception 'Please verify your phone number with the OTP first.';
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
  -- The person ordering (their wallet, their invite code): the orderer when ordering for someone else.
  if v_ob_phone <> '' then
    if ob.id is null then
      insert into customers (phone, name) values (v_ob_phone, v_ob_name) returning * into ob;
    end if;
    me := ob;
  else
    me := c;
  end if;
  -- Lock the wallet so two orders at once cannot spend the same money.
  select * into me from customers where id = me.id for update;

  -- Invite code: only on the very first order of a new number, never your own, never from the inviter's phone.
  if v_ref <> '' and s.referral_on then
    select * into r from customers where referral_code = v_ref;
    if r.id is null then raise exception 'This invite code is not valid. Check it or remove it.'; end if;
    if r.id = me.id then raise exception 'You cannot use your own invite code.'; end if;
    if me.referred_by is not null or exists (select 1 from orders where coalesce(orderer_id, customer_id) = me.id or customer_id = me.id) then
      raise exception 'Invite codes work only on your first order. Please remove the code.';
    end if;
    if exists (select 1 from orders where placed_by = auth.uid()
               and (coalesce(orderer_id, customer_id) = r.id or customer_phone = r.phone or ordered_by_phone = r.phone)) then
      raise exception 'This invite code cannot be used from this phone.';
    end if;
    update customers set referred_by = r.id where id = me.id;
  end if;

  -- Jholzo Money: only from a phone that owns the number, up to the per-order limit.
  if p_use_wallet then
    if not owns_phone(me.phone) then raise exception 'Jholzo Money can be used only from your own phone.'; end if;
    v_wallet := least(greatest(wallet_balance(me.id), 0), s.wallet_max_per_order, v_total);
    v_total := v_total - v_wallet;
  end if;

  -- Big orders are paid first by UPI (no cash or UPI on delivery above cod_limit).
  if p_payment <> 'upi_now' and v_total > s.cod_limit then
    raise exception 'Orders above ₹% are paid by UPI before delivery. Please choose "Pay now by UPI".', s.cod_limit;
  end if;
  if p_payment = 'upi_now' and coalesce(s.upi_id, '') = '' then
    raise exception 'Online payment is not available right now. Please choose another payment method.';
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening (daily_order_cap) moves to the next day.
  -- The lock makes two orders at the same moment take turns, so a day never goes over the limit.
  perform pg_advisory_xact_lock(4815162342);
  v_date := next_delivery_date();

  insert into orders (customer_id, orderer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, wallet_used, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  if v_wallet > 0 then
    insert into wallet_entries (customer_id, amount, kind, order_id, note)
    values (me.id, -v_wallet, 'order_payment', v_order.id, 'Used on order ' || v_order.order_number);
  end if;
  -- After the first order the customer gets their own invite code.
  if me.referral_code is null then
    update customers set referral_code = new_referral_code(case when v_ob_phone <> '' then v_ob_name else trim(p_name) end) where id = me.id;
  end if;

  return v_order.order_number;
end
$$;

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text) to authenticated;

/* ======== 018_delivery_express.sql ======== */
-- Update 018: evening delivery charge by order value, and Express delivery. Run once in Supabase → SQL Editor
-- (after 017). Safe to run again; nothing is deleted.
--
-- Evening delivery (5–8 PM), by items total:
--   below small_order_below (₹99)            → small_order_fee (₹40)
--   ₹99 up to free_delivery_above − 1 (₹298) → mid_order_fee (₹11)
--   free_delivery_above (₹299) and more      → FREE
-- "Free delivery (launch offer)" still makes the ₹11 slab free; small orders always pay.
-- Express: delivered within express_minutes (60) for express_fee (₹40) extra, while express_on is switched on,
-- from opening time until express_minutes before closing. Distance only decides whether we deliver at all.
-- All numbers are in Admin → Settings → Delivery charges.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'store_settings' and column_name = 'mid_order_fee') then
    alter table public.store_settings
      add column mid_order_fee int not null default 11 check (mid_order_fee >= 0),
      add column free_delivery_above int not null default 299 check (free_delivery_above >= 0),
      add column express_on boolean not null default false,
      add column express_fee int not null default 40 check (express_fee >= 0),
      add column express_minutes int not null default 60 check (express_minutes between 15 and 240);
    -- First run only: the new evening slabs (later changes in Admin → Settings are kept).
    update public.store_settings set small_order_below = 99, small_order_fee = 40 where id = 1;
  end if;
end
$$;

alter table public.orders
  add column if not exists delivery_type text not null default 'evening' check (delivery_type in ('evening', 'express')),
  add column if not exists express_fee int not null default 0,
  add column if not exists express_by timestamptz;   -- Express: deliver before this time

-- Evening delivery charge for an items total (same rule as deliveryQuote in src/lib/delivery.js).
create or replace function public.evening_delivery_fee(p_subtotal int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_subtotal < s.small_order_below then s.small_order_fee
              when s.free_delivery then 0
              when p_subtotal < s.free_delivery_above then s.mid_order_fee
              else 0 end
  from store_settings s where s.id = 1
$$;
grant execute on function public.evening_delivery_fee(int) to anon, authenticated;

-- Order page for strangers: also Express or evening.
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used, 'delivery_type', o.delivery_type, 'express_fee', o.express_fee, 'express_by', o.express_by,
                    'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

-- place_order: + Express delivery (p_express).
drop function if exists public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text);
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default '',
  p_use_wallet boolean default false, p_ref_code text default '', p_express boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  c customers;
  ob customers;
  me customers;
  r customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
  v_ref text := upper(regexp_replace(coalesce(p_ref_code, ''), '\s', '', 'g'));
  q record;
  p products;
  line jsonb;
  v_qty int;
  v_subtotal int := 0;
  v_fee int;
  v_total numeric;
  v_packaging numeric;
  v_wallet numeric := 0;
  v_express int := 0;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
  v_order orders;
  no_show_limit constant int := 2;         -- CONFIG.NO_SHOW_LIMIT
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.'; end if;
  select * into s from store_settings where id = 1;
  if s.paused then raise exception 'The store is not taking orders right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi', 'upi_now') then raise exception 'Choose a payment method.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Set your home location on the map.'; end if;
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' then raise exception 'Enter your name.'; end if;
  end if;

  -- OTP (when switched on): the number of the person ordering must be verified on this phone.
  if s.otp_required and not exists (
    select 1 from verified_phones where user_id = auth.uid() and phone = case when v_ob_phone <> '' then v_ob_phone else p_phone end
  ) then
    raise exception 'Please verify your phone number with the OTP first.';
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
  -- Evening delivery by items total; Express (within an hour) adds express_fee. Same rule as deliveryQuote in src/lib/delivery.js.
  v_fee := evening_delivery_fee(v_subtotal);
  if p_express then
    if not s.express_on then raise exception 'Express delivery is not available right now. Please choose evening delivery.'; end if;
    if v_now::time < s.open_time or v_now::time > s.close_time - make_interval(mins => s.express_minutes) then
      raise exception 'Express delivery works from % to %. Please choose evening delivery.',
        to_char(s.open_time, 'HH12:MI AM'), to_char(s.close_time - make_interval(mins => s.express_minutes), 'HH12:MI AM');
    end if;
    v_express := s.express_fee;
  end if;
  v_packaging := packaging_fee(v_subtotal);
  v_total := v_subtotal + v_fee + v_express + v_packaging;

  if c.id is null then
    insert into customers (phone, name) values (p_phone, trim(p_name)) returning * into c;
  else
    update customers set name = trim(p_name) where id = c.id;
  end if;
  -- The person ordering (their wallet, their invite code): the orderer when ordering for someone else.
  if v_ob_phone <> '' then
    if ob.id is null then
      insert into customers (phone, name) values (v_ob_phone, v_ob_name) returning * into ob;
    end if;
    me := ob;
  else
    me := c;
  end if;
  -- Lock the wallet so two orders at once cannot spend the same money.
  select * into me from customers where id = me.id for update;

  -- Invite code: only on the very first order of a new number, never your own, never from the inviter's phone.
  if v_ref <> '' and s.referral_on then
    select * into r from customers where referral_code = v_ref;
    if r.id is null then raise exception 'This invite code is not valid. Check it or remove it.'; end if;
    if r.id = me.id then raise exception 'You cannot use your own invite code.'; end if;
    if me.referred_by is not null or exists (select 1 from orders where coalesce(orderer_id, customer_id) = me.id or customer_id = me.id) then
      raise exception 'Invite codes work only on your first order. Please remove the code.';
    end if;
    if exists (select 1 from orders where placed_by = auth.uid()
               and (coalesce(orderer_id, customer_id) = r.id or customer_phone = r.phone or ordered_by_phone = r.phone)) then
      raise exception 'This invite code cannot be used from this phone.';
    end if;
    update customers set referred_by = r.id where id = me.id;
  end if;

  -- Jholzo Money: only from a phone that owns the number, up to the per-order limit.
  if p_use_wallet then
    if not owns_phone(me.phone) then raise exception 'Jholzo Money can be used only from your own phone.'; end if;
    v_wallet := least(greatest(wallet_balance(me.id), 0), s.wallet_max_per_order, v_total);
    v_total := v_total - v_wallet;
  end if;

  -- Big orders are paid first by UPI (no cash or UPI on delivery above cod_limit).
  if p_payment <> 'upi_now' and v_total > s.cod_limit then
    raise exception 'Orders above ₹% are paid by UPI before delivery. Please choose "Pay now by UPI".', s.cod_limit;
  end if;
  if p_payment = 'upi_now' and coalesce(s.upi_id, '') = '' then
    raise exception 'Online payment is not available right now. Please choose another payment method.';
  end if;

  -- Before the cut-off: today; after it: tomorrow. A full evening (daily_order_cap) moves to the next day.
  -- The lock makes two orders at the same moment take turns, so a day never goes over the limit.
  perform pg_advisory_xact_lock(4815162342);
  -- Express is always today; evening orders go to the next free evening.
  v_date := case when p_express then v_now::date else next_delivery_date() end;

  insert into orders (customer_id, orderer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, wallet_used, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status, delivery_type, express_fee, express_by)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end,
          case when p_express then 'express' else 'evening' end, v_express,
          case when p_express then now() + make_interval(mins => s.express_minutes) end)
  returning * into v_order;

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, note, line_total)
  select v_order.id, pr.id, trim(pr.name || ' ' || pr.size), pr.price, (l ->> 'qty')::int,
         coalesce(l ->> 'note', ''), pr.price * (l ->> 'qty')::int
  from jsonb_array_elements(p_lines) l
  join products pr on pr.id = (l ->> 'product_id')::uuid;

  if v_wallet > 0 then
    insert into wallet_entries (customer_id, amount, kind, order_id, note)
    values (me.id, -v_wallet, 'order_payment', v_order.id, 'Used on order ' || v_order.order_number);
  end if;
  -- After the first order the customer gets their own invite code.
  if me.referral_code is null then
    update customers set referral_code = new_referral_code(case when v_ob_phone <> '' then v_ob_name else trim(p_name) end) where id = me.id;
  end if;

  return v_order.order_number;
end
$$;

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text, boolean) to authenticated;

-- Tell the API about the new columns right away.
notify pgrst, 'reload schema';
