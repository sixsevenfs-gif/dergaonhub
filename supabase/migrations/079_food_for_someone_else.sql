-- 079: a food order for someone else, like grocery ("For someone else" at checkout). The person who gets the
-- food is the order's name and number (the rider calls them; the notifications reach them if they have the app);
-- the one ordering is ordered_by_name / ordered_by_phone, and it is their number the OTP checks. A blocked number
-- can't order either way. Everything else is as in 071 (prices, coupons, cold drinks), and the apps from before
-- this update keep working (the two new parts are optional).
-- Run once in Supabase → SQL Editor, after 078. Safe to run again; nothing is deleted.

alter table public.food_orders
  add column if not exists ordered_by_name text not null default '',
  add column if not exists ordered_by_phone text not null default '';
-- Customers read their own orders column by column (update 074): these two as well.
grant select (ordered_by_name, ordered_by_phone) on public.food_orders to anon, authenticated;

drop function if exists public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text);
create or replace function public.place_food_order(
  p_restaurant uuid, p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_note text, p_payment text, p_coupon text default '',
  p_orderer_name text default '', p_orderer_phone text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  r food_restaurants;
  m food_menu_items;
  pr products;
  c customers;
  q record;
  line jsonb;
  v_qty int;
  v_label text;
  v_variant jsonb;
  v_menu_price numeric;
  v_price int;
  v_items int := 0;
  v_store int := 0;
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
  ob customers;
  v_ob_name text := coalesce(trim(p_orderer_name), '');
  v_ob_phone text := coalesce(p_orderer_phone, '');
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
  -- Update 079: ordered for someone else. p_name / p_phone are the person who gets the food (the rider calls
  -- them); the orderer is the login placing it, whose number is checked with the OTP.
  if v_ob_phone = p_phone then v_ob_phone := ''; v_ob_name := ''; end if;   -- ordering for themselves
  if v_ob_phone <> '' then
    if v_ob_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit phone number for yourself.'; end if;
    if v_ob_name = '' or v_ob_name !~ '[A-Za-z].*[A-Za-z]' or v_ob_name ~ '[0-9]' then raise exception 'Enter your name.'; end if;
  end if;

  if s.otp_required and not exists (select 1 from verified_phones where user_id = auth.uid()
                                      and phone = case when v_ob_phone <> '' then v_ob_phone else p_phone end) then
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
  if v_ob_phone <> '' then select * into ob from customers where phone = v_ob_phone; end if;
  if coalesce(c.blocked, false) or coalesce(ob.blocked, false) then raise exception 'Online ordering is blocked for this number. Please call us to order.'; end if;

  select * into r from food_restaurants where id = p_restaurant and status = 'live' and btrim(fssai_number) <> '';
  if not found then raise exception 'This restaurant is not taking orders right now.'; end if;
  if not food_open_now(r.opens_at, r.closes_at, r.closed_on) then
    raise exception '% is closed right now. Please order when it opens.', btrim(r.name);
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_lines) > 40 then raise exception 'Too many dishes in one order.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    v_qty := case when (line ->> 'qty') ~ '^[0-9]{1,2}$' then (line ->> 'qty')::int end;
    -- A cold drink from Jholzo's store (update 071): the shop's own price, no markup, nothing for the restaurant.
    if line ? 'product_id' then
      pr := null;
      if (line ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select * into pr from products
        where id = (line ->> 'product_id')::uuid and food_addon and available and status = 'active';
      end if;
      if pr.id is null or v_qty is null or v_qty < 1 or v_qty > 20 or coalesce(pr.price, 0) <= 0 then
        raise exception 'Some items are not available any more. Please check your cart.';
      end if;
      v_price := round(pr.price)::int;
      v_store := v_store + v_price * v_qty;
      v_lines := v_lines || jsonb_build_object('product_id', pr.id, 'name', btrim(pr.name), 'variant', btrim(coalesce(pr.size, '')),
        'diet', 'veg', 'qty', v_qty, 'price', v_price, 'menu_price', 0, 'line_total', v_price * v_qty, 'from_store', true);
      continue;
    end if;
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

  if v_items = 0 then raise exception 'Add a dish from % too: cold drinks come with a food order.', btrim(r.name); end if;
  -- The restaurant's minimum, the food GST and coupons are for its dishes; free delivery counts the drinks too.
  if v_items < coalesce(r.min_order, 0) then
    raise exception 'Minimum order at % is ₹%.', btrim(r.name), round(r.min_order);
  end if;
  v_pack := coalesce(round(r.packing_fee)::int, 0);
  v_delivery := case when v_items + v_store >= s.food_free_delivery_above then 0 else s.food_delivery_fee end;
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
    platform_fee, gst, total, deal_type, deal_value, coupon_id, coupon_code, discount, store_items_total,
    ordered_by_name, ordered_by_phone)
  values (auth.uid(), r.id, btrim(r.name), btrim(r.address), trim(p_name), p_phone,
    trim(p_address), p_area, p_lat, p_lng, v_km, left(coalesce(trim(p_note), ''), 300), p_payment, v_items + v_store, v_menu, v_pack,
    v_delivery, v_platform, v_gst, greatest(0, v_items + v_store + v_pack + v_delivery + v_platform + v_gst - v_off), r.deal_type, r.deal_value,
    cp.id, case when v_off > 0 then cp.code else '' end, v_off, v_store,
    v_ob_name, v_ob_phone)
  returning * into v_order;

  insert into food_order_items (order_id, menu_item_id, product_id, from_store, name, variant, diet, qty, price, menu_price, line_total)
  select v_order.id, (x ->> 'menu_item_id')::uuid, (x ->> 'product_id')::uuid, coalesce((x ->> 'from_store')::boolean, false),
         x ->> 'name', x ->> 'variant', coalesce(x ->> 'diet', ''),
         (x ->> 'qty')::int, (x ->> 'price')::int, (x ->> 'menu_price')::numeric, (x ->> 'line_total')::int
  from jsonb_array_elements(v_lines) x;

  return v_order.order_number;
end
$$;
revoke all on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text, text, text) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

select count(*) as food_orders_for_someone_else from public.food_orders where ordered_by_phone <> '';
