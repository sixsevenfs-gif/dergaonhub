-- Update 071: a heavy rain notice, who opened the app during maintenance, and cold drinks in every restaurant.
-- 1. Admin → App → App status: "Heavy rain" on or off, with a message, for Food, Grocery or both. The apps show it
--    on the home and at checkout ("Orders may take a little longer today").
-- 2. Maintenance: every phone that opens the app while it is in maintenance is noted for that maintenance (the
--    customer's name and number when logged in, the phone, when, how often). Afterwards the owner sends a
--    notification to just those people ("We're back, order now"), from the same page.
-- 3. Cold drinks from the grocery shop (products with food_addon: Monster and Diet Coke to start) show at the end of
--    every restaurant's menu at the shop's own price, with no markup. They come from Jholzo's store, so they are not
--    in the restaurant's payout, have no food GST, and don't count for the restaurant's minimum order or coupons
--    (they do count for free delivery). A drink alone is not an order: it comes with food.
-- Run once in Supabase → SQL Editor, after 070. Safe to run again; nothing is deleted.

-- 1. Heavy rain notice (the apps read it like the other app settings).
alter table public.store_settings
  add column if not exists rain_on boolean not null default false,
  add column if not exists rain_message text not null default '',
  add column if not exists rain_place text not null default 'both',
  add column if not exists food_addons_seeded boolean not null default false;
alter table public.store_settings drop constraint if exists store_settings_rain_ok;
alter table public.store_settings add constraint store_settings_rain_ok
  check (rain_place in ('both', 'food', 'grocery') and char_length(rain_message) <= 200);

-- 2. Maintenance: one row each time the app goes into maintenance, and the phones that opened it meanwhile.
create table if not exists public.maintenance_windows (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,                      -- back to Live
  title text not null default '',
  message text not null default '',
  notified_at timestamptz,                   -- the owner sent "we're back" to the visitors
  notified_campaign uuid
);
create index if not exists maintenance_windows_started on public.maintenance_windows (started_at desc);
alter table public.maintenance_windows enable row level security;
drop policy if exists "owner maintenance windows" on public.maintenance_windows;
create policy "owner maintenance windows" on public.maintenance_windows for select using (is_admin());

create table if not exists public.maintenance_visits (
  window_id bigint not null references public.maintenance_windows on delete cascade,
  install_id uuid not null,                  -- app_installs.id: one phone with the app
  user_id uuid,                              -- the app's login then (its notification token has the same one)
  platform text not null default '',
  env text not null default 'prod',
  phone text not null default '',            -- the number logged in then ('' for a guest)
  name text not null default '',
  device_model text not null default '',
  app_version text not null default '',
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  opens int not null default 1,              -- opens at least 10 minutes apart
  primary key (window_id, install_id)
);
alter table public.maintenance_visits enable row level security;
drop policy if exists "owner maintenance visits" on public.maintenance_visits;
create policy "owner maintenance visits" on public.maintenance_visits for select using (is_admin());

-- The maintenance going on now (one is opened if the app was already in maintenance before this update).
create or replace function public.maintenance_window_now() returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v bigint;
begin
  perform pg_advisory_xact_lock(7101);
  select id into v from maintenance_windows where ended_at is null order by started_at desc limit 1;
  if v is null then
    insert into maintenance_windows (title, message)
    select app_status_title, app_status_message from store_settings where id = 1
    returning id into v;
  end if;
  return v;
end
$$;
revoke all on function public.maintenance_window_now() from public, anon, authenticated;

-- Switching to Maintenance opens a new one; back to Live closes it.
create or replace function public.maintenance_window_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.app_status = 'maintenance' and old.app_status is distinct from 'maintenance' then
    perform pg_advisory_xact_lock(7101);
    if not exists (select 1 from maintenance_windows where ended_at is null) then
      insert into maintenance_windows (title, message) values (new.app_status_title, new.app_status_message);
    end if;
  elsif new.app_status is distinct from 'maintenance' and old.app_status = 'maintenance' then
    update maintenance_windows set ended_at = now() where ended_at is null;
  end if;
  return new;
end
$$;
drop trigger if exists store_settings_maintenance on public.store_settings;
create trigger store_settings_maintenance after update of app_status on public.store_settings
  for each row execute function public.maintenance_window_track();

-- Already in maintenance while this update runs: that maintenance counts from now.
do $$
begin
  if (select app_status from public.store_settings where id = 1) = 'maintenance'
     and not exists (select 1 from public.maintenance_windows where ended_at is null) then
    insert into public.maintenance_windows (title, message)
    select app_status_title, app_status_message from public.store_settings where id = 1;
  end if;
end
$$;

-- app_hello() notes the phones that open the app during maintenance (copied from 069; same arguments).

create or replace function public.app_hello(p_install_id uuid, p_platform text, p_env text default 'prod',
  p_version text default '', p_build text default '', p_os text default '', p_model text default '',
  p_phone text default '', p_name text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  i app_installs;
  v_platform text := case when p_platform = 'ios' then 'ios' else 'android' end;
  v_phone text := case when coalesce(p_phone, '') ~ '^[0-9]{10}$' and owns_phone(p_phone) then p_phone else '' end;
  v_name text := left(trim(coalesce(p_name, '')), 60);
begin
  if p_install_id is null then return; end if;
  insert into app_installs as a (id, platform, env, app_version, build, os_version, device_model, user_id)
  values (p_install_id, v_platform, case when p_env = 'dev' then 'dev' else 'prod' end, left(coalesce(p_version, ''), 20),
          left(coalesce(p_build, ''), 20), left(coalesce(p_os, ''), 30), left(coalesce(p_model, ''), 60), auth.uid())
  on conflict (id) do update set platform = excluded.platform, env = excluded.env, app_version = excluded.app_version,
    build = excluded.build, os_version = excluded.os_version, device_model = excluded.device_model,
    user_id = coalesce(excluded.user_id, a.user_id),
    opens = a.opens + case when a.last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
    last_seen_at = now()
  returning * into i;
  if v_phone <> '' and (not i.logged_in or i.phone <> v_phone) then
    update app_installs set name = case when v_name <> '' then v_name when phone = v_phone then name else '' end,
      phone = v_phone, logged_in = true, first_login_at = coalesce(first_login_at, now()), last_login_at = now(), logins = logins + 1
    where id = i.id;
    insert into app_logins (install_id, phone, platform) values (i.id, v_phone, v_platform);
  elsif v_phone <> '' and v_name <> '' and i.name <> v_name then
    update app_installs set name = v_name where id = i.id;
  elsif coalesce(p_phone, '') = '' and i.logged_in then
    update app_installs set logged_in = false where id = i.id;   -- logged out
  end if;
  -- Update 071: opened while the app is in maintenance → noted for this maintenance (who, when, how often).
  if (select app_status from store_settings where id = 1) = 'maintenance' then
    begin
      select * into i from app_installs where id = p_install_id;
      insert into maintenance_visits as mv (window_id, install_id, user_id, platform, env, phone, name, device_model, app_version)
      values (maintenance_window_now(), i.id, auth.uid(), i.platform, i.env,
              case when i.logged_in then i.phone else '' end, case when i.logged_in then i.name else '' end,
              i.device_model, i.app_version)
      on conflict (window_id, install_id) do update set
        user_id = coalesce(excluded.user_id, mv.user_id),
        phone = case when excluded.phone <> '' then excluded.phone else mv.phone end,
        name = case when excluded.name <> '' then excluded.name else mv.name end,
        app_version = excluded.app_version,
        opens = mv.opens + case when mv.last_at < now() - interval '10 minutes' then 1 else 0 end,
        last_at = now();
    exception when others then
      null;   -- never stop the app's hello over this
    end;
  end if;
end
$$;
grant execute on function public.app_hello(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Owner: the maintenances (newest first) and, for one of them (default: the newest), who opened the app.
-- reachable: that phone has a notification token, so "we're back" can reach it.
create or replace function public.admin_maintenance_visits(p_window bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w bigint := coalesce(p_window, (select id from maintenance_windows order by started_at desc limit 1));
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  return jsonb_build_object(
    'status', (select app_status from store_settings where id = 1),
    'window', w,
    'windows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'started_at', m.started_at, 'ended_at', m.ended_at, 'notified_at', m.notified_at,
        'visitors', (select count(*) from maintenance_visits v where v.window_id = m.id)) order by m.started_at desc), '[]'::jsonb)
      from (select * from maintenance_windows order by started_at desc limit 12) m),
    'visitors', (select coalesce(jsonb_agg(jsonb_build_object(
        'install_id', v.install_id, 'platform', v.platform, 'env', v.env, 'phone', v.phone, 'name', v.name,
        'device_model', v.device_model, 'app_version', v.app_version, 'first_at', v.first_at, 'last_at', v.last_at,
        'opens', v.opens, 'is_test', coalesce(a.is_test, false),
        'reachable', exists (select 1 from device_tokens d
                             where (v.user_id is not null and d.user_id = v.user_id) or (v.phone <> '' and d.phone = v.phone)))
        order by v.first_at), '[]'::jsonb)
      from maintenance_visits v left join app_installs a on a.id = v.install_id
      where v.window_id = w));
end
$$;
revoke all on function public.admin_maintenance_visits(bigint) from public, anon;
grant execute on function public.admin_maintenance_visits(bigint) to authenticated;

-- Owner: a notification for just the people who opened the app during that maintenance. It is saved like any other
-- (Admin → App → Notifications shows it) and the page then asks push-notify to send it, as for other notifications.
create or replace function public.admin_maintenance_notify(p_window bigint, p_title text, p_body text,
  p_link text default '', p_image text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_targets text[];
  v_id uuid;
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'Write a title and a message.'; end if;
  if not exists (select 1 from maintenance_windows where id = p_window) then raise exception 'That maintenance was not found.'; end if;
  select coalesce(array_agg(distinct t), '{}') into v_targets from (
    select 'u:' || v.user_id::text as t from maintenance_visits v where v.window_id = p_window and v.user_id is not null
    union
    select v.phone from maintenance_visits v where v.window_id = p_window and v.phone <> ''
  ) x;
  if cardinality(v_targets) = 0 then raise exception 'Nobody opened the app during this maintenance.'; end if;
  insert into push_campaigns (title, body, image, link, audience, phones)
  values (left(btrim(p_title), 80), left(btrim(p_body), 300), coalesce(btrim(p_image), ''), coalesce(btrim(p_link), ''), 'maintenance', v_targets)
  returning id into v_id;
  update maintenance_windows set notified_at = now(), notified_campaign = v_id where id = p_window;
  return v_id;
end
$$;
revoke all on function public.admin_maintenance_notify(bigint, text, text, text, text) from public, anon;
grant execute on function public.admin_maintenance_notify(bigint, text, text, text, text) to authenticated;

-- Notifications can go to "the people who opened the app during a maintenance" (copied from 065).
alter table public.push_campaigns drop constraint if exists push_campaigns_audience_check;
alter table public.push_campaigns add constraint push_campaigns_audience_check
  check (audience in ('all', 'android', 'ios', 'grocery', 'food', 'phones', 'maintenance'));

create or replace function public.push_campaign_targets(p_audience text, p_phones text[] default '{}')
returns table (token text, platform text, env text)
language sql stable security definer set search_path = public as $$
  select d.token, d.platform, d.env from device_tokens d
  where case p_audience
    when 'all' then true
    when 'android' then d.platform = 'android'
    when 'ios' then d.platform = 'ios'
    when 'grocery' then d.phone <> '' and exists (select 1 from orders o where o.status <> 'cancelled'
                         and (o.customer_phone = d.phone or o.ordered_by_phone = d.phone))
    when 'food' then d.phone <> '' and exists (select 1 from food_orders f where f.status <> 'cancelled' and f.customer_phone = d.phone)
    when 'phones' then d.phone <> '' and d.phone = any (p_phones)
    -- Update 071: the app logins ("u:<id>") and numbers that opened the app during a maintenance.
    when 'maintenance' then (d.user_id is not null and ('u:' || d.user_id::text) = any (p_phones)) or (d.phone <> '' and d.phone = any (p_phones))
    else false
  end
$$;
revoke all on function public.push_campaign_targets(text, text[]) from public, anon, authenticated;

-- 3. Cold drinks in every restaurant: grocery products marked food_addon (Admin → Products, the glass button).
alter table public.products add column if not exists food_addon boolean not null default false;
alter table public.food_order_items
  add column if not exists product_id uuid references public.products on delete set null,
  add column if not exists from_store boolean not null default false;     -- picked up at Jholzo's store, not the restaurant
alter table public.food_orders add column if not exists store_items_total int not null default 0;  -- the drinks, at shop prices

-- Monster and Diet Coke to start (once: the owner's later changes in Admin are kept when this runs again).
do $$
begin
  if not coalesce((select food_addons_seeded from public.store_settings where id = 1), true) then
    update public.products set food_addon = true where name ilike 'monster energy%' or name ilike 'diet coke%';
    update public.store_settings set food_addons_seeded = true where id = 1;
  end if;
end
$$;

-- food_live() also gives the cold drinks, once for all restaurants (copied from 063).

create or replace function public.food_live()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('restaurants', coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb),
    -- Update 071: cold drinks from Jholzo's store, at the end of every menu, at the shop's own price.
    'addons', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', btrim(p.name), 'size', btrim(coalesce(p.size, '')), 'price', round(p.price),
        'photo', case when coalesce(p.photo_url, '') like '/%' then 'https://jholzo.com' || p.photo_url else coalesce(p.photo_url, '') end)
        order by p.price, p.name), '[]'::jsonb)
      from public.products p
      where p.food_addon and p.available and p.status = 'active' and p.price > 0))
  from (
    select r.name, jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'area', r.area,
      'address', r.address,
      'lat', r.lat,
      'lng', r.lng,
      'cuisines', to_jsonb(r.cuisines),
      'food_type', r.food_type,
      'opens_at', r.opens_at,
      'closes_at', r.closes_at,
      'closed_on', r.closed_on,
      'delivery_minutes', r.delivery_minutes,
      'cost_for_two', r.cost_for_two,
      'min_order', r.min_order,
      'packing_fee', r.packing_fee,
      'offer', r.offer,
      'fssai_number', btrim(r.fssai_number),
      'cover_photo', r.cover_photo,
      'menu', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'section', m.section,
          'name', m.name,
          'description', m.description,
          'diet', m.diet,
          'price', public.food_customer_price(m.price, r.deal_type, r.deal_value),
          'variants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'label', v->>'label',
              'price', public.food_customer_price(
                case when (v->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then (v->>'price')::numeric end,
                r.deal_type, r.deal_value)))
            from jsonb_array_elements(case when jsonb_typeof(m.variants) = 'array' then m.variants else '[]'::jsonb end) v
            where coalesce(v->>'label', '') <> ''
          ), '[]'::jsonb),
          'photo', case when btrim(m.photo) <> '' then m.photo else public.food_sample_photo(m.name, m.section) end,
          'photo_sample', btrim(m.photo) = '' and public.food_sample_photo(m.name, m.section) is not null,
          'available', m.available,
          'bestseller', m.bestseller
        ) order by m.sort, m.created_at)
        from public.food_menu_items m
        where m.restaurant_id = r.id and btrim(m.name) <> ''
      ), '[]'::jsonb)
    ) as j
    from public.food_restaurants r
    where r.status = 'live' and btrim(r.fssai_number) <> ''
  ) x
$$;

revoke all on function public.food_live() from public;
grant execute on function public.food_live() to anon, authenticated;

-- place_food_order() takes cold drink lines { product_id, qty } too (copied from 070; same arguments).
create or replace function public.place_food_order(
  p_restaurant uuid, p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision, p_note text, p_payment text, p_coupon text default ''
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
    platform_fee, gst, total, deal_type, deal_value, coupon_id, coupon_code, discount, store_items_total)
  values (auth.uid(), r.id, btrim(r.name), btrim(r.address), trim(p_name), p_phone,
    trim(p_address), p_area, p_lat, p_lng, v_km, left(coalesce(trim(p_note), ''), 300), p_payment, v_items + v_store, v_menu, v_pack,
    v_delivery, v_platform, v_gst, greatest(0, v_items + v_store + v_pack + v_delivery + v_platform + v_gst - v_off), r.deal_type, r.deal_value,
    cp.id, case when v_off > 0 then cp.code else '' end, v_off, v_store)
  returning * into v_order;

  insert into food_order_items (order_id, menu_item_id, product_id, from_store, name, variant, diet, qty, price, menu_price, line_total)
  select v_order.id, (x ->> 'menu_item_id')::uuid, (x ->> 'product_id')::uuid, coalesce((x ->> 'from_store')::boolean, false),
         x ->> 'name', x ->> 'variant', coalesce(x ->> 'diet', ''),
         (x ->> 'qty')::int, (x ->> 'price')::int, (x ->> 'menu_price')::numeric, (x ->> 'line_total')::int
  from jsonb_array_elements(v_lines) x;

  return v_order.order_number;
end
$$;

revoke all on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text, text, text, text, double precision, double precision, text, text, text) to authenticated;

-- Food sales: drinks are Jholzo's own sale, not markup (copied from 070).
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
    'markup', (select coalesce(sum(items_total - store_items_total - menu_total - discount), 0) from d),
    'store_items', (select coalesce(sum(store_items_total), 0) from d),
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
                                   coalesce(sum(items_total - store_items_total - menu_total - discount) filter (where status = 'delivered'), 0) as markup
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

-- Rider page: drinks to pick up at Jholzo's store (copied from 067).
create or replace function public.partner_food_orders()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or is_desk()) then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'no', o.order_number, 'status', o.status, 'stage', o.rider_stage, 'created_at', o.created_at,
      'confirmed_at', o.confirmed_at, 'to_restaurant_at', o.to_restaurant_at, 'at_restaurant_at', o.at_restaurant_at,
      'picked_at', o.picked_at, 'arriving_at', o.arriving_at, 'delivered_at', o.delivered_at,
      'restaurant', o.restaurant_name, 'pickup_address', coalesce(nullif(btrim(fr.address), ''), o.restaurant_address),
      'pickup_area', coalesce(fr.area, ''), 'pickup_phone', coalesce(nullif(fr.phone, ''), fr.whatsapp, ''),
      'pickup_map', coalesce(fr.maps_link, ''), 'pickup_lat', fr.lat, 'pickup_lng', fr.lng,
      'prep_minutes', fr.prep_minutes, 'pay_when', coalesce(fr.pay_when, ''), 'restaurant_upi', coalesce(fr.upi_id, ''),
      'name', o.customer_name, 'phone', o.customer_phone, 'address', o.address, 'area', o.area, 'lat', o.lat, 'lng', o.lng,
      'distance_km', o.distance_km, 'note', o.note, 'payment', o.payment_method, 'total', o.total,
      'menu_total', o.menu_total, 'packing_fee', o.packing_fee,
      'mine', o.rider_id = auth.uid(), 'rider_id', o.rider_id, 'rider_name', o.rider_name,
      'store_items_total', o.store_items_total,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty, 'diet', i.diet,
                  'from_store', i.from_store) order by i.from_store, i.name), '[]')
                from food_order_items i where i.order_id = o.id)
    ) order by o.created_at), '[]')
    from food_orders o
    left join food_restaurants fr on fr.id = o.restaurant_id
    where o.created_at > now() - interval '20 hours'
      and ((o.status in ('confirmed', 'picked') and (is_admin() or is_desk() or o.rider_id = auth.uid() or o.rider_id is null))
           or (o.status = 'delivered' and o.rider_id = auth.uid()))
  );
end
$$;
revoke all on function public.partner_food_orders() from public, anon;
grant execute on function public.partner_food_orders() to authenticated;

notify pgrst, 'reload schema';

-- Check: the new settings, the drinks every menu shows, and the maintenances so far.
select rain_on, rain_place, app_status,
  (select count(*) from public.maintenance_windows) as maintenances,
  (select string_agg(name || ' ' || size || ' ₹' || round(price), ', ' order by price, name) from public.products
   where food_addon and available and status = 'active') as drinks_in_every_menu
from public.store_settings where id = 1;
