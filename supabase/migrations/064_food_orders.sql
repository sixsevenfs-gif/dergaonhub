-- Update 064: Jholzo Food orders.
-- Customers order from the apps (place_food_order). The desk (owner or executive) calls the restaurant and
-- confirms, gives the order to a rider, and the rider marks it picked up and delivered. Order numbers are JF-1001…
-- Prices always come from the database (the Food Desk menu + the deal's markup, update 062), never from the app.
-- Bill: dishes + the restaurant's packing charge + delivery fee (free above a limit) + platform fee + GST %.
-- Payment: cash or UPI on delivery. Also: food in the rider alerts, sales numbers for the admin, and payouts
-- (what each restaurant is owed for delivered orders, and what was paid).
-- Run once in Supabase → SQL Editor, after 061–063. Safe to run again; nothing is deleted.

-- Food settings (Admin → Food → Settings).
alter table public.store_settings
  add column if not exists food_on boolean not null default true,
  add column if not exists food_delivery_fee int not null default 30,
  add column if not exists food_free_delivery_above int not null default 199,
  add column if not exists food_platform_fee int not null default 5,
  add column if not exists food_gst_percent numeric(5,2) not null default 5;

create sequence if not exists public.food_order_number_seq start 1001;

create table if not exists public.food_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('JF-' || nextval('public.food_order_number_seq')),
  created_at timestamptz not null default now(),
  placed_by uuid default auth.uid(),
  restaurant_id uuid references public.food_restaurants on delete set null,
  restaurant_name text not null default '',
  restaurant_address text not null default '',
  customer_name text not null,
  customer_phone text not null check (customer_phone ~ '^[6-9][0-9]{9}$'),
  address text not null,
  area text not null default '',
  lat double precision,
  lng double precision,
  distance_km numeric(6,2),
  note text not null default '',
  status text not null default 'placed' check (status in ('placed', 'confirmed', 'picked', 'delivered', 'cancelled')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'upi')),
  items_total int not null check (items_total >= 0),          -- what the customer pays for the dishes
  menu_total numeric(10,2) not null check (menu_total >= 0),  -- the restaurant's menu prices: what it is owed
  packing_fee int not null default 0,
  delivery_fee int not null default 0,
  platform_fee int not null default 0,
  gst int not null default 0,
  total int not null check (total >= 0),
  deal_type text not null default '',
  deal_value numeric(10,2),
  rider_id uuid references auth.users on delete set null,
  assigned_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid,
  picked_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text not null default '',
  tg_placed_sent boolean not null default false,
  tg_cancel_sent boolean not null default false
);
create index if not exists food_orders_created on public.food_orders (created_at desc);
create index if not exists food_orders_restaurant on public.food_orders (restaurant_id, created_at desc);
create index if not exists food_orders_phone on public.food_orders (customer_phone);
create index if not exists food_orders_rider on public.food_orders (rider_id) where rider_id is not null;

create table if not exists public.food_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders on delete cascade,
  menu_item_id uuid references public.food_menu_items on delete set null,
  name text not null,
  variant text not null default '',
  diet text not null default '',
  qty int not null check (qty between 1 and 20),
  price int not null check (price >= 0),                 -- customer price, each
  menu_price numeric(10,2) not null check (menu_price >= 0),
  line_total int not null check (line_total >= 0)
);
create index if not exists food_order_items_order on public.food_order_items (order_id);

-- Money paid to restaurants (Admin → Food → Payouts).
create table if not exists public.food_payouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  restaurant_id uuid not null references public.food_restaurants on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  note text not null default ''
);
create index if not exists food_payouts_restaurant on public.food_payouts (restaurant_id, created_at desc);

-- Who may see an order: the desk, the customer's own logins (as for grocery, update 060), its rider.
create or replace function public.can_see_food_order(p_placed_by uuid, p_phone text, p_rider uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_desk() or is_my_order(p_placed_by, '', p_phone) or (p_rider is not null and p_rider = auth.uid() and is_staff())
$$;

alter table public.food_orders enable row level security;
alter table public.food_order_items enable row level security;
alter table public.food_payouts enable row level security;
drop policy if exists "food orders read" on public.food_orders;
create policy "food orders read" on public.food_orders for select using (can_see_food_order(placed_by, customer_phone, rider_id));
drop policy if exists "food order items read" on public.food_order_items;
create policy "food order items read" on public.food_order_items for select using (
  exists (select 1 from public.food_orders o where o.id = order_id and can_see_food_order(o.placed_by, o.customer_phone, o.rider_id)));
drop policy if exists "food payouts owner" on public.food_payouts;
create policy "food payouts owner" on public.food_payouts for all using (is_admin()) with check (is_admin());
-- No insert / update / delete rules on orders: everything goes through the functions below.

-- Open right now in India? Times like "10:00" and "21:30"; a weekly off like "Tuesday". No times = open.
create or replace function public.food_open_now(p_opens text, p_closes text, p_closed_on text)
returns boolean
language plpgsql stable set search_path = public as $$
declare
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_day text := lower(trim(to_char(v_now, 'FMDay')));
  o int;
  c int;
  m int;
begin
  if coalesce(p_closed_on, '') <> '' and position(v_day in lower(p_closed_on)) > 0 then return false; end if;
  if coalesce(p_opens, '') !~ '^[0-9]{1,2}:[0-9]{2}' or coalesce(p_closes, '') !~ '^[0-9]{1,2}:[0-9]{2}' then return true; end if;
  o := split_part(p_opens, ':', 1)::int * 60 + left(split_part(p_opens, ':', 2), 2)::int;
  c := split_part(p_closes, ':', 1)::int * 60 + left(split_part(p_closes, ':', 2), 2)::int;
  if o = c then return true; end if;
  m := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  if o < c then return m >= o and m < c; end if;
  return m >= o or m < c;   -- open past midnight
end
$$;

-- p_lines: [{"id": "<menu item id>", "variant": "Half" or "", "qty": 2}]. Returns the order number.
create or replace function public.place_food_order(
  p_restaurant uuid, p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_note text, p_payment text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  r food_restaurants;
  m food_menu_items;
  c customers;
  q record;
  line jsonb;
  v_qty int;
  v_label text;
  v_variant jsonb;
  v_menu_price numeric;
  v_price int;
  v_items int := 0;
  v_menu numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_km numeric;
  v_pack int;
  v_delivery int;
  v_platform int;
  v_gst int;
  v_order food_orders;
begin
  if auth.uid() is null then raise exception 'Please reload the app and try again.'; end if;
  select * into s from store_settings where id = 1;
  if not coalesce(s.food_on, true) then raise exception 'Food ordering is paused right now. Please try again later.'; end if;
  if coalesce(trim(p_name), '') = '' or trim(p_name) !~ '[A-Za-z].*[A-Za-z]' or trim(p_name) ~ '[0-9]' then
    raise exception 'Enter your full name (letters only).';
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Enter your address or a landmark.'; end if;
  if not (p_area = any (s.delivery_area)) then raise exception 'Choose your area.'; end if;
  if p_payment not in ('cash', 'upi') then raise exception 'Choose a payment method.'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Set your home location on the map again.'; end if;

  if s.otp_required and not exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone) then
    raise exception 'Please verify your phone number with the OTP first.';
  end if;
  if p_lat is not null then
    select * into q from delivery_quote(p_lat, p_lng);
    if q.too_far then
      raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
    end if;
    v_km := q.km;
  end if;
  select * into c from customers where phone = p_phone;
  if coalesce(c.blocked, false) then raise exception 'Online ordering is blocked for this number. Please call us to order.'; end if;

  select * into r from food_restaurants where id = p_restaurant and status = 'live' and btrim(fssai_number) <> '';
  if not found then raise exception 'This restaurant is not taking orders right now.'; end if;
  if not food_open_now(r.opens_at, r.closes_at, r.closed_on) then
    raise exception '% is closed right now. Please order when it opens.', btrim(r.name);
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_lines) > 40 then raise exception 'Too many dishes in one order.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := case when (line ->> 'qty') ~ '^[0-9]{1,2}$' then (line ->> 'qty')::int end;
    m := null;
    if (line ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into m from food_menu_items
      where id = (line ->> 'id')::uuid and restaurant_id = r.id and available and btrim(name) <> '';
    end if;
    if m.id is null or v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Some dishes are not available any more. Please check your cart.';
    end if;
    v_label := coalesce(btrim(line ->> 'variant'), '');
    v_variant := null;
    if jsonb_typeof(m.variants) = 'array' then
      if v_label <> '' then
        select v into v_variant from jsonb_array_elements(m.variants) v where btrim(v ->> 'label') = v_label limit 1;
        if v_variant is null then raise exception 'Please choose the size of % again.', m.name; end if;
      elsif m.price is null then
        -- Sold only in sizes: one size means that size; more need a choice.
        if jsonb_array_length(m.variants) = 1 then
          v_variant := m.variants -> 0;
          v_label := btrim(v_variant ->> 'label');
        else
          raise exception 'Please choose a size for %.', m.name;
        end if;
      end if;
    end if;
    v_menu_price := case
      when v_variant is not null and (v_variant ->> 'price') ~ '^[0-9]+(\.[0-9]+)?$' then (v_variant ->> 'price')::numeric
      when v_variant is null then m.price
    end;
    if v_menu_price is null or v_menu_price <= 0 then raise exception '% has no price yet. Please remove it.', m.name; end if;
    v_price := round(food_customer_price(v_menu_price, r.deal_type, r.deal_value))::int;
    v_items := v_items + v_price * v_qty;
    v_menu := v_menu + v_menu_price * v_qty;
    v_lines := v_lines || jsonb_build_object('menu_item_id', m.id, 'name', btrim(m.name), 'variant', v_label, 'diet', m.diet,
      'qty', v_qty, 'price', v_price, 'menu_price', v_menu_price, 'line_total', v_price * v_qty);
  end loop;

  if v_items < coalesce(r.min_order, 0) then
    raise exception 'Minimum order at % is ₹%.', btrim(r.name), round(r.min_order);
  end if;
  v_pack := coalesce(round(r.packing_fee)::int, 0);
  v_delivery := case when v_items >= s.food_free_delivery_above then 0 else s.food_delivery_fee end;
  v_platform := s.food_platform_fee;
  v_gst := round((v_items + v_pack) * s.food_gst_percent / 100)::int;

  insert into food_orders (placed_by, restaurant_id, restaurant_name, restaurant_address, customer_name, customer_phone,
    address, area, lat, lng, distance_km, note, payment_method, items_total, menu_total, packing_fee, delivery_fee,
    platform_fee, gst, total, deal_type, deal_value)
  values (auth.uid(), r.id, btrim(r.name), btrim(r.address), trim(p_name), p_phone,
    trim(p_address), p_area, p_lat, p_lng, v_km, left(coalesce(trim(p_note), ''), 300), p_payment, v_items, v_menu, v_pack,
    v_delivery, v_platform, v_gst, v_items + v_pack + v_delivery + v_platform + v_gst, r.deal_type, r.deal_value)
  returning * into v_order;

  insert into food_order_items (order_id, menu_item_id, name, variant, diet, qty, price, menu_price, line_total)
  select v_order.id, (x ->> 'menu_item_id')::uuid, x ->> 'name', x ->> 'variant', coalesce(x ->> 'diet', ''),
         (x ->> 'qty')::int, (x ->> 'price')::int, (x ->> 'menu_price')::numeric, (x ->> 'line_total')::int
  from jsonb_array_elements(v_lines) x;

  return v_order.order_number;
end
$$;
revoke all on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text) to authenticated;

-- The customer may cancel until the restaurant is called and the order confirmed.
create or replace function public.customer_cancel_food_order(p_order_number text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  select * into o from food_orders where upper(order_number) = upper(btrim(p_order_number)) for update;
  if not found or not is_my_order(o.placed_by, '', o.customer_phone) then raise exception 'Order not found.'; end if;
  if o.status <> 'placed' then raise exception 'This order is already being prepared. Please call us to cancel it.'; end if;
  update food_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = 'Cancelled by customer' where id = o.id;
end
$$;
revoke all on function public.customer_cancel_food_order(text) from public, anon;
grant execute on function public.customer_cancel_food_order(text) to authenticated;

-- Desk (owner or executive): confirm, mark picked / delivered, or cancel with a reason.
-- A "No-show" cancel of a delivered-to-door order counts towards blocking the number, like grocery (update 037).
create or replace function public.desk_food_status(p_order_id uuid, p_status text, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status in ('delivered', 'cancelled') and not (is_admin() and p_status in ('picked', 'confirmed')) then
    raise exception 'This order is already %.', o.status;
  end if;
  if p_status = 'confirmed' then
    update food_orders set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, auth.uid()),
      delivered_at = null, delivered_by = null where id = o.id;
  elsif p_status = 'picked' then
    update food_orders set status = 'picked', picked_at = now(), confirmed_at = coalesce(confirmed_at, now()),
      delivered_at = null, delivered_by = null where id = o.id;
  elsif p_status = 'delivered' then
    update food_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      picked_at = coalesce(picked_at, now()), confirmed_at = coalesce(confirmed_at, now()) where id = o.id;
  elsif p_status = 'cancelled' then
    if coalesce(btrim(p_reason), '') = '' then raise exception 'Write why it is cancelled.'; end if;
    update food_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = left(btrim(p_reason), 200) where id = o.id;
    if btrim(p_reason) = 'No-show' and o.payment_method = 'cash' then
      update customers set no_show_count = no_show_count + 1 where phone = o.customer_phone;
    end if;
  else
    raise exception 'Unknown status.';
  end if;
end
$$;
revoke all on function public.desk_food_status(uuid, text, text) from public, anon;
grant execute on function public.desk_food_status(uuid, text, text) to authenticated;

-- Desk: give the order to a rider (or take it back with null).
create or replace function public.desk_food_assign(p_order_id uuid, p_rider uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  if p_rider is not null and not exists (select 1 from riders where user_id = p_rider and active) then
    raise exception 'Choose an active rider.';
  end if;
  update food_orders set rider_id = p_rider, assigned_at = case when p_rider is null then null else now() end
  where id = p_order_id and status not in ('delivered', 'cancelled');
  if not found then raise exception 'This order is already finished.'; end if;
end
$$;
revoke all on function public.desk_food_assign(uuid, uuid) from public, anon;
grant execute on function public.desk_food_assign(uuid, uuid) to authenticated;

-- Rider: food orders to pick up today (their own, and confirmed ones nobody has taken), with pickup and drop details.
create or replace function public.partner_food_orders()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or is_desk()) then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'no', o.order_number, 'status', o.status, 'created_at', o.created_at,
      'restaurant', o.restaurant_name, 'pickup_address', coalesce(nullif(btrim(fr.address), ''), o.restaurant_address),
      'pickup_area', coalesce(fr.area, ''), 'pickup_phone', coalesce(nullif(fr.phone, ''), fr.whatsapp, ''),
      'pickup_map', coalesce(fr.maps_link, ''), 'pickup_lat', fr.lat, 'pickup_lng', fr.lng,
      'name', o.customer_name, 'phone', o.customer_phone, 'address', o.address, 'area', o.area, 'lat', o.lat, 'lng', o.lng,
      'note', o.note, 'payment', o.payment_method, 'total', o.total, 'menu_total', o.menu_total,
      'mine', o.rider_id = auth.uid(), 'rider_id', o.rider_id,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty) order by i.name), '[]')
                from food_order_items i where i.order_id = o.id)
    ) order by o.created_at), '[]')
    from food_orders o
    left join food_restaurants fr on fr.id = o.restaurant_id
    where o.created_at > now() - interval '20 hours'
      and o.status in ('confirmed', 'picked')
      and (is_admin() or o.rider_id = auth.uid() or o.rider_id is null)
  );
end
$$;
revoke all on function public.partner_food_orders() from public, anon;
grant execute on function public.partner_food_orders() to authenticated;

-- Rider: picked up from the restaurant / delivered. A confirmed order nobody has taken becomes theirs.
create or replace function public.partner_food_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not (is_admin() or o.rider_id = auth.uid() or o.rider_id is null) then raise exception 'This order is with another rider.'; end if;
  if p_status = 'picked' and o.status = 'confirmed' then
    update food_orders set status = 'picked', picked_at = now(), rider_id = coalesce(rider_id, auth.uid()),
      assigned_at = coalesce(assigned_at, now()) where id = o.id;
  elsif p_status = 'delivered' and o.status in ('confirmed', 'picked') then
    update food_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      picked_at = coalesce(picked_at, now()), rider_id = coalesce(rider_id, auth.uid()) where id = o.id;
  else
    raise exception 'This order can''t be marked % now.', p_status;
  end if;
end
$$;
revoke all on function public.partner_food_status(uuid, text) from public, anon;
grant execute on function public.partner_food_status(uuid, text) to authenticated;

-- The rider app's short list (update 056) now also rings for food orders. Same keys as before.
create or replace function public.partner_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(x.j order by x.t), '[]') from (
      select o.created_at as t, jsonb_build_object(
        'id', o.id, 'no', o.order_number, 'name', o.customer_name, 'area', o.area, 'date', o.delivery_date, 'status', o.status) as j
      from orders o
      where o.delivery_date >= v_today
        and ((v_admin and o.status in ('placed', 'confirmed'))
             or (o.status = 'confirmed' and (o.rider_id = auth.uid() or (o.rider_id is null and coalesce(o.dispatch, '') = ''))))
      union all
      select f.created_at, jsonb_build_object(
        'id', f.id, 'no', f.order_number, 'name', f.customer_name, 'area', f.area,
        'date', (f.created_at at time zone 'Asia/Kolkata')::date, 'status', f.status)
      from food_orders f
      where f.created_at > now() - interval '20 hours'
        and ((v_admin and f.status in ('placed', 'confirmed'))
             or (f.status = 'confirmed' and (f.rider_id = auth.uid() or f.rider_id is null)))
    ) x
  );
end
$$;

-- Admin numbers for a date range (India dates): orders, money, by day, by restaurant, top dishes.
create or replace function public.admin_food_sales(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  with o as (
    select * from food_orders
    where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ), d as (select * from o where status = 'delivered')
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'delivered', (select count(*) from d),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'open', (select count(*) from o where status in ('placed', 'confirmed', 'picked')),
    'sales', (select coalesce(sum(total), 0) from d),
    'items_total', (select coalesce(sum(items_total), 0) from d),
    'menu_total', (select coalesce(sum(menu_total), 0) from d),
    'markup', (select coalesce(sum(items_total - menu_total), 0) from d),
    'delivery_fees', (select coalesce(sum(delivery_fee), 0) from d),
    'platform_fees', (select coalesce(sum(platform_fee), 0) from d),
    'packing', (select coalesce(sum(packing_fee), 0) from d),
    'gst', (select coalesce(sum(gst), 0) from d),
    'cash', (select coalesce(sum(total), 0) from d where payment_method = 'cash'),
    'upi', (select coalesce(sum(total), 0) from d where payment_method = 'upi'),
    'customers', (select count(distinct customer_phone) from o where status <> 'cancelled'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'orders', g.orders, 'delivered', g.delivered, 'sales', g.sales) order by g.day), '[]')
               from (select day::date as day,
                            (select count(*) from o where (o.created_at at time zone 'Asia/Kolkata')::date = day::date) as orders,
                            (select count(*) from d where (d.created_at at time zone 'Asia/Kolkata')::date = day::date) as delivered,
                            (select coalesce(sum(total), 0) from d where (d.created_at at time zone 'Asia/Kolkata')::date = day::date) as sales
                     from generate_series(p_from, least(p_to, p_from + 92), interval '1 day') day) g),
    'by_restaurant', (select coalesce(jsonb_agg(jsonb_build_object('id', g.restaurant_id, 'name', g.name, 'orders', g.orders,
                        'delivered', g.delivered, 'sales', g.sales, 'menu_total', g.menu_total, 'markup', g.markup) order by g.sales desc), '[]')
                      from (select restaurant_id, max(restaurant_name) as name, count(*) as orders,
                                   count(*) filter (where status = 'delivered') as delivered,
                                   coalesce(sum(total) filter (where status = 'delivered'), 0) as sales,
                                   coalesce(sum(menu_total) filter (where status = 'delivered'), 0) as menu_total,
                                   coalesce(sum(items_total - menu_total) filter (where status = 'delivered'), 0) as markup
                            from o group by restaurant_id) g),
    'top_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'qty', g.qty, 'sales', g.sales) order by g.qty desc), '[]')
                   from (select i.name || case when i.variant <> '' then ' (' || i.variant || ')' else '' end as name,
                                sum(i.qty) as qty, sum(i.line_total) as sales
                         from food_order_items i join d on d.id = i.order_id
                         group by 1 order by 2 desc limit 10) g)
  ) into v;
  return v;
end
$$;
revoke all on function public.admin_food_sales(date, date) from public, anon;
grant execute on function public.admin_food_sales(date, date) to authenticated;

-- Owner: what each restaurant is owed (menu prices of delivered orders) minus what was paid.
create or replace function public.admin_food_payouts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', btrim(r.name), 'pay_when', r.pay_when, 'upi_id', r.upi_id, 'phone', coalesce(nullif(r.phone, ''), r.whatsapp),
      'delivered_orders', coalesce(e.n, 0), 'earned', coalesce(e.amount, 0), 'paid', coalesce(p.amount, 0),
      'owed', coalesce(e.amount, 0) - coalesce(p.amount, 0), 'last_paid', p.last_at
    ) order by coalesce(e.amount, 0) - coalesce(p.amount, 0) desc, r.name), '[]')
    from food_restaurants r
    left join (select restaurant_id, count(*) as n, sum(menu_total) as amount
               from food_orders where status = 'delivered' group by restaurant_id) e on e.restaurant_id = r.id
    left join (select restaurant_id, sum(amount) as amount, max(created_at) as last_at
               from food_payouts group by restaurant_id) p on p.restaurant_id = r.id
    where r.status <> 'dropped' or coalesce(e.amount, 0) > 0
  );
end
$$;
revoke all on function public.admin_food_payouts() from public, anon;
grant execute on function public.admin_food_payouts() to authenticated;

-- Telegram alert for a new food order, and when one is cancelled (the telegram-notify function, updated).
create or replace function public.food_telegram_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'food_placed';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_kind := 'food_cancelled';
  else
    return new;
  end if;
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/telegram-notify',
    body := jsonb_build_object('food_order_id', new.id, 'kind', v_kind),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists food_orders_telegram_placed on public.food_orders;
create trigger food_orders_telegram_placed after insert on public.food_orders
  for each row execute function public.food_telegram_notify();
drop trigger if exists food_orders_telegram_cancelled on public.food_orders;
create trigger food_orders_telegram_cancelled after update of status on public.food_orders
  for each row execute function public.food_telegram_notify();

-- Customers' apps refresh orders when they change.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'food_orders') then
    alter publication supabase_realtime add table public.food_orders;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Check: the new tables and the food settings.
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('food_orders', 'food_order_items', 'food_payouts')) as tables,
       food_on, food_delivery_fee, food_free_delivery_above, food_platform_fee, food_gst_percent
from public.store_settings where id = 1;
