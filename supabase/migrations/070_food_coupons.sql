-- Update 070: coupons for Jholzo Food, like the food apps have ("Add ₹54 more to get ₹50 off").
-- The owner makes them in Admin → Food → Coupons (with a preview of the bar customers see): flat ₹ off or % off
-- (with a cap), from a minimum order, for all restaurants or one, first food order only, uses per customer, a
-- total limit, start and end, shown in the app or only for people who type the code. place_food_order() checks
-- the coupon and works out the discount itself; Jholzo pays it (the restaurant is paid its menu total as before),
-- so Food sales show the markup after discounts. Jholzo Money stays for grocery only.
-- Run once in Supabase → SQL Editor, after 069. Safe to run again; nothing is deleted.

create table if not exists public.food_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,15}$'),
  title text not null default '' check (char_length(title) <= 40),     -- "₹50 off"; empty: made from the rule
  note text not null default '' check (char_length(note) <= 80),       -- a small line under it
  kind text not null check (kind in ('flat', 'percent')),
  value numeric(10,2) not null check (value > 0 and (kind = 'flat' or value <= 90)),
  max_off int check (max_off > 0),                                     -- % coupons: at most this much off
  min_order int not null default 0 check (min_order >= 0),             -- dishes total, at app prices
  restaurant_id uuid references public.food_restaurants on delete cascade,  -- empty: every restaurant
  first_order_only boolean not null default false,
  uses_per_customer int not null default 1 check (uses_per_customer >= 0),  -- 0: no limit
  total_uses int check (total_uses > 0),                               -- empty: no limit
  show_in_app boolean not null default true,                           -- false: only by typing the code
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.food_coupons enable row level security;
drop policy if exists "food coupons desk" on public.food_coupons;
create policy "food coupons desk" on public.food_coupons for select using (is_desk());
drop policy if exists "food coupons owner" on public.food_coupons;
create policy "food coupons owner" on public.food_coupons for all using (is_admin()) with check (is_admin());

alter table public.food_orders
  add column if not exists coupon_id uuid references public.food_coupons on delete set null,
  add column if not exists coupon_code text not null default '',
  add column if not exists discount int not null default 0 check (discount >= 0);
create index if not exists food_orders_coupon on public.food_orders (coupon_id) where coupon_id is not null;

-- Orders that used a coupon (cancelled ones give it back).
create or replace function public.food_coupon_uses(p_coupon uuid, p_phone text default null) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from food_orders
  where coupon_id = p_coupon and status <> 'cancelled' and (p_phone is null or customer_phone = p_phone)
$$;
revoke execute on function public.food_coupon_uses(uuid, text) from public, anon, authenticated;

-- How much a coupon takes off these dishes (0 below its minimum).
create or replace function public.food_coupon_off(c food_coupons, p_items int) returns int
language sql immutable as $$
  select case
    when c.id is null or p_items < c.min_order then 0
    when c.kind = 'flat' then least(floor(c.value)::int, p_items)
    else least(floor(p_items * c.value / 100)::int, coalesce(c.max_off, p_items), p_items)
  end
$$;

-- Why this number can't use the coupon on this order, or '' when it can.
create or replace function public.food_coupon_why(c food_coupons, p_restaurant uuid, p_items int, p_phone text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if c.id is null or not c.active then return 'This coupon code is not valid.'; end if;
  if c.starts_at is not null and c.starts_at > now() then return 'This coupon is not open yet.'; end if;
  if c.ends_at is not null and c.ends_at <= now() then return 'This coupon has expired.'; end if;
  if c.restaurant_id is not null and c.restaurant_id is distinct from p_restaurant then return 'This coupon is not for this restaurant.'; end if;
  if c.total_uses is not null and food_coupon_uses(c.id) >= c.total_uses then return 'This coupon has been fully used.'; end if;
  if c.first_order_only and exists (select 1 from food_orders where customer_phone = p_phone and status <> 'cancelled') then
    return 'This coupon is for your first food order.';
  end if;
  if c.uses_per_customer > 0 and food_coupon_uses(c.id, p_phone) >= c.uses_per_customer then
    return case when c.uses_per_customer = 1 then 'You have already used this coupon.' else 'You have used this coupon ' || c.uses_per_customer || ' times already.' end;
  end if;
  if p_items < c.min_order then return 'Add ₹' || (c.min_order - p_items) || ' more to use this coupon.'; end if;
  return '';
end
$$;
revoke execute on function public.food_coupon_why(food_coupons, uuid, int, text) from public, anon, authenticated;

-- The apps: coupons to show, and which ones this number has used up already.
create or replace function public.food_coupons_live(p_phone text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_mine boolean := coalesce(p_phone, '') ~ '^[0-9]{10}$' and owns_phone(p_phone);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'note', c.note,
      'kind', c.kind, 'value', c.value, 'max_off', c.max_off, 'min_order', c.min_order, 'restaurant_id', c.restaurant_id,
      'first_order_only', c.first_order_only, 'ends_at', c.ends_at,
      'used_up', v_mine and (
        (c.first_order_only and exists (select 1 from food_orders where customer_phone = p_phone and status <> 'cancelled'))
        or (c.uses_per_customer > 0 and food_coupon_uses(c.id, p_phone) >= c.uses_per_customer)))
    order by c.sort, c.min_order, c.created_at)
    from food_coupons c
    where c.show_in_app and c.active and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
      and (c.total_uses is null or food_coupon_uses(c.id) < c.total_uses)), '[]'::jsonb);
end
$$;
grant execute on function public.food_coupons_live(text) to anon, authenticated;

-- The apps: a typed code (also one not shown in the app), checked for this cart.
create or replace function public.food_coupon_check(p_code text, p_restaurant uuid, p_items int, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c food_coupons;
  v_why text;
begin
  if auth.uid() is null or coalesce(p_phone, '') !~ '^[0-9]{10}$' or not owns_phone(p_phone) then
    return jsonb_build_object('ok', false, 'message', 'Please log in to use a coupon.');
  end if;
  select * into c from food_coupons where code = upper(btrim(coalesce(p_code, '')));
  v_why := food_coupon_why(c, p_restaurant, coalesce(p_items, 0), p_phone);
  if v_why <> '' and v_why not like 'Add ₹%' then return jsonb_build_object('ok', false, 'message', v_why); end if;
  return jsonb_build_object('ok', v_why = '', 'message', v_why, 'off', food_coupon_off(c, coalesce(p_items, 0)),
    'coupon', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'note', c.note, 'kind', c.kind, 'value', c.value,
      'max_off', c.max_off, 'min_order', c.min_order, 'restaurant_id', c.restaurant_id, 'first_order_only', c.first_order_only,
      'ends_at', c.ends_at, 'used_up', false));
end
$$;
revoke execute on function public.food_coupon_check(text, uuid, int, text) from public, anon;
grant execute on function public.food_coupon_check(text, uuid, int, text) to authenticated;

-- Owner and executive: every coupon with how often it was used and how much it took off.
create or replace function public.desk_food_coupons() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'uses', (select count(*) from food_orders o where o.coupon_id = c.id and o.status <> 'cancelled'),
      'discount_total', (select coalesce(sum(discount), 0) from food_orders o where o.coupon_id = c.id and o.status = 'delivered'),
      'restaurant_name', (select name from food_restaurants r where r.id = c.restaurant_id))
    order by c.active desc, c.sort, c.created_at desc) from food_coupons c), '[]'::jsonb);
end
$$;
revoke execute on function public.desk_food_coupons() from public, anon;
grant execute on function public.desk_food_coupons() to authenticated;

-- place_food_order() takes an optional coupon (copied from 064; old apps call it without one).
drop function if exists public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text);
create or replace function public.place_food_order(
  p_restaurant uuid, p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_note text, p_payment text, p_coupon text default ''
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
  cp food_coupons;
  v_code text := upper(btrim(coalesce(p_coupon, '')));
  v_why text;
  v_off int := 0;
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
  -- A coupon (update 070): checked and worked out here, never taken from the app.
  if v_code <> '' then
    select * into cp from food_coupons where code = v_code;
    v_why := food_coupon_why(cp, r.id, v_items, p_phone);
    if v_why <> '' then raise exception '%', v_why; end if;
    v_off := food_coupon_off(cp, v_items);
  end if;

  insert into food_orders (placed_by, restaurant_id, restaurant_name, restaurant_address, customer_name, customer_phone,
    address, area, lat, lng, distance_km, note, payment_method, items_total, menu_total, packing_fee, delivery_fee,
    platform_fee, gst, total, deal_type, deal_value, coupon_id, coupon_code, discount)
  values (auth.uid(), r.id, btrim(r.name), btrim(r.address), trim(p_name), p_phone,
    trim(p_address), p_area, p_lat, p_lng, v_km, left(coalesce(trim(p_note), ''), 300), p_payment, v_items, v_menu, v_pack,
    v_delivery, v_platform, v_gst, greatest(0, v_items + v_pack + v_delivery + v_platform + v_gst - v_off), r.deal_type, r.deal_value,
    cp.id, case when v_off > 0 then cp.code else '' end, v_off)
  returning * into v_order;

  insert into food_order_items (order_id, menu_item_id, name, variant, diet, qty, price, menu_price, line_total)
  select v_order.id, (x ->> 'menu_item_id')::uuid, x ->> 'name', x ->> 'variant', coalesce(x ->> 'diet', ''),
         (x ->> 'qty')::int, (x ->> 'price')::int, (x ->> 'menu_price')::numeric, (x ->> 'line_total')::int
  from jsonb_array_elements(v_lines) x;

  return v_order.order_number;
end
$$;

revoke all on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text) to authenticated;

-- Food sales: the markup after coupon discounts, and the discounts given (copied from 064).
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
    'markup', (select coalesce(sum(items_total - menu_total - discount), 0) from d),
    'discounts', (select coalesce(sum(discount), 0) from d),
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
                                   coalesce(sum(items_total - menu_total - discount) filter (where status = 'delivered'), 0) as markup
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

notify pgrst, 'reload schema';

-- Check: coupons so far, and food orders that used one.
select (select count(*) from public.food_coupons) as coupons,
       (select count(*) from public.food_orders where discount > 0) as orders_with_coupon;
