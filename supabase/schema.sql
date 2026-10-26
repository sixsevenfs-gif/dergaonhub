-- Dergaon Hub database (Supabase / Postgres)
-- Run once in Supabase → SQL Editor, then run seed.sql. See supabase/README.md.
--
-- Who can do what (row-level security):
--   Everyone (no login)   : read store settings, categories and active products; join the waitlist.
--   Customer (device)     : each phone gets an anonymous Supabase login. It can place orders
--                           (only through place_order), see its own orders and report problems on them.
--   Admin (founder)       : email + password login listed in the admins table; can do everything.
--   Rider (partner)       : email + password login listed in the riders table; on /partner sees one
--                           day's orders and marks them on the way / arriving / delivered (functions only).
-- Prices, delivery fee, limits and the delivery day are worked out inside the database,
-- so a customer can never change them from the browser.

create extension if not exists pgcrypto;

/* ---------------- admins ---------------- */

create table public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

/* ---------------- store settings (one row) ---------------- */

create table public.store_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Dergaon Hub Store',
  phone text not null check (phone ~ '^[0-9]{10}$'),
  whatsapp text not null check (whatsapp ~ '^91[0-9]{10}$'),
  open_time time not null default '08:00',
  close_time time not null default '21:00',
  cutoff_time time not null default '18:00',   -- orders after this go to the next day
  slot_start time not null default '17:00',
  slot_end time not null default '20:00',
  min_order int not null default 200 check (min_order >= 0),
  delivery_area text[] not null default '{}',
  paused boolean not null default false,
  lat double precision not null,            -- founder's home: distance is measured from here
  lng double precision not null,
  per_km_fee int not null default 10 check (per_km_fee >= 0),
  min_delivery_fee int not null default 20 check (min_delivery_fee >= 0),
  max_delivery_km numeric not null default 4 check (max_delivery_km > 0),
  free_delivery boolean not null default false,   -- launch offer: no delivery charge
  pack_fee_low int not null default 5 check (pack_fee_low >= 0),      -- packaging charge by items total
  pack_fee_mid int not null default 9 check (pack_fee_mid >= 0),
  pack_fee_high int not null default 12 check (pack_fee_high >= 0),
  pack_mid_from int not null default 500 check (pack_mid_from >= 0),
  pack_high_from int not null default 1000 check (pack_high_from >= 0),
  updated_at timestamptz not null default now()
);

/* ---------------- catalogue ---------------- */

create table public.categories (
  id text primary key,
  name text not null,
  short text not null,
  sort int not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  size text not null default '',
  category_id text not null references public.categories,
  keywords text not null default '',
  price int not null check (price > 0),
  photo_url text not null default '',
  featured boolean not null default false,
  available boolean not null default true,
  status text not null default 'active' check (status in ('active', 'hidden')),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

/* ---------------- customers and orders ---------------- */

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[0-9]{10}$'),
  name text not null default '',
  no_show_count int not null default 0,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('DG-' || nextval('public.order_number_seq')),
  customer_id uuid not null references public.customers,
  placed_by uuid references auth.users on delete set null,   -- the device login that placed it
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  area text not null,
  lat double precision,
  lng double precision,
  distance_km numeric,
  note text not null default '',
  allow_substitute boolean not null default true,
  subtotal int not null,
  delivery_fee int not null,
  packaging_fee int not null default 0,
  total int not null,
  payment_method text not null check (payment_method in ('cash', 'upi')),
  cash_collected int not null default 0,
  delivery_date date not null,
  status text not null default 'placed' check (status in ('placed', 'confirmed', 'completed', 'cancelled')),
  cancel_reason text not null default '',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  ordered_by_name text not null default '',    -- "Order for someone else": who placed it
  ordered_by_phone text not null default ''
);
create index orders_day_idx on public.orders (delivery_date, status);
create index orders_placed_by_idx on public.orders (placed_by);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  product_id uuid references public.products on delete set null,
  name_snapshot text not null,      -- name and price at the time of order,
  price_snapshot int not null,      -- so later price edits never change past orders
  quantity int not null check (quantity > 0),
  note text not null default '',
  line_total int not null
);
create index order_items_order_idx on public.order_items (order_id);

/* ---------------- complaints, waitlist, daily money ---------------- */

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  order_number text not null,
  placed_by uuid default auth.uid(),
  customer_name text not null default '',
  customer_phone text not null default '',
  type text not null,
  message text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  name text not null default '',
  lat double precision,
  lng double precision,
  label text not null default '',
  km numeric,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.daily_expenses (
  date date primary key,
  amount int not null check (amount >= 0),
  note text not null default ''
);

/* ---------------- delivery fee (same rule as src/lib/delivery.js) ---------------- */

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

-- Packaging charge by items total (same rule as packagingFee in src/lib/delivery.js).
create or replace function public.packaging_fee(p_subtotal int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_subtotal >= s.pack_high_from then s.pack_fee_high
              when p_subtotal >= s.pack_mid_from then s.pack_fee_mid
              else s.pack_fee_low end
  from store_settings s where s.id = 1
$$;

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

-- Order page by order number (the link in the WhatsApp bill). Address and phone are only
-- included for the device that placed the order, or for the admin.
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - case when o.placed_by = auth.uid() or is_admin() then '{}'::text[]
                               else array['address', 'customer_phone', 'lat', 'lng', 'placed_by', 'customer_id'] end,
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name_snapshot), '[]') from order_items i where i.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

-- Placed or confirmed orders whose day has passed become "Expired" (called when admin opens orders).
create or replace function public.expire_old_orders() returns void
language sql security definer set search_path = public as $$
  update orders set status = 'cancelled', cancel_reason = 'Expired'
  where status in ('placed', 'confirmed') and delivery_date < (now() at time zone 'Asia/Kolkata')::date
    and is_admin()
$$;

-- Admin cancels with "No-show": also counts it against the phone number.
create or replace function public.cancel_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  update orders set status = 'cancelled', cancel_reason = p_reason
  where id = p_order_id and status <> 'completed';
  if p_reason = 'No-show' then
    update customers set no_show_count = no_show_count + 1
    where id = (select customer_id from orders where id = p_order_id);
  end if;
end
$$;

grant execute on function public.delivery_quote(double precision, double precision) to anon, authenticated;
grant execute on function public.packaging_fee(int) to anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text) to authenticated;
grant execute on function public.get_order(text) to anon, authenticated;
grant execute on function public.expire_old_orders() to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;

/* ---------------- row-level security ---------------- */

alter table public.admins enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.complaints enable row level security;
alter table public.waitlist enable row level security;
alter table public.daily_expenses enable row level security;

create policy "admin reads admins" on public.admins for select using (is_admin());

create policy "anyone reads store" on public.store_settings for select using (true);
create policy "admin edits store" on public.store_settings for update using (is_admin()) with check (is_admin());

create policy "anyone reads categories" on public.categories for select using (true);
create policy "admin manages categories" on public.categories for all using (is_admin()) with check (is_admin());

create policy "anyone reads active products" on public.products for select using (status = 'active' or is_admin());
create policy "admin manages products" on public.products for all using (is_admin()) with check (is_admin());

create policy "admin manages customers" on public.customers for all using (is_admin()) with check (is_admin());

-- Orders are created only by place_order(); customers read their own, admin reads and updates all.
create policy "customer reads own orders" on public.orders for select using (placed_by = auth.uid() or is_admin());
create policy "admin updates orders" on public.orders for update using (is_admin()) with check (is_admin());

create policy "read items of visible orders" on public.order_items for select
  using (exists (select 1 from orders o where o.id = order_id and (o.placed_by = auth.uid() or is_admin())));
create policy "admin manages items" on public.order_items for all using (is_admin()) with check (is_admin());

create policy "customer reports on own order" on public.complaints for insert
  with check (exists (select 1 from orders o where o.id = order_id and o.placed_by = auth.uid()));
create policy "customer reads own complaints" on public.complaints for select using (placed_by = auth.uid() or is_admin());
create policy "admin updates complaints" on public.complaints for update using (is_admin()) with check (is_admin());

create policy "anyone joins waitlist" on public.waitlist for insert with check (true);
create policy "admin manages waitlist" on public.waitlist for all using (is_admin()) with check (is_admin());

create policy "admin manages expenses" on public.daily_expenses for all using (is_admin()) with check (is_admin());

/* ---------------- product photos (Supabase Storage) ---------------- */

insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
create policy "anyone views photos" on storage.objects for select using (bucket_id = 'photos');
create policy "admin uploads photos" on storage.objects for insert with check (bucket_id = 'photos' and is_admin());
create policy "admin changes photos" on storage.objects for update using (bucket_id = 'photos' and is_admin());
create policy "admin deletes photos" on storage.objects for delete using (bucket_id = 'photos' and is_admin());

/* ================ delivery partners and WhatsApp messages (same as migrations/003_partners.sql) ================ */

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

/* ================ customer cancel (same as migrations/006_customer_cancel.sql) ================ */

-- Customers can cancel their own order until the rider taps "On the way".
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

/* ================ small orders, no first-order limit, delivery photo (same as migrations/007_small_orders_photos.sql) ================ */

-- Small orders: items total below small_order_below (₹149) pay a flat small_order_fee (₹40), or the
-- distance fee if higher. Free delivery only covers orders from ₹149 up. No minimum order by default.
alter table public.store_settings
  add column if not exists small_order_below int not null default 149,
  add column if not exists small_order_fee int not null default 40;
alter table public.store_settings alter column min_order set default 0;

alter table public.orders add column if not exists delivery_photo text not null default '';

-- place_order, redefined with the small-order fee and without the first-order limit.
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

-- Private bucket: only the admin and riders can upload or see delivery photos.
insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false) on conflict (id) do nothing;
create policy "staff uploads delivery photos" on storage.objects for insert with check (bucket_id = 'deliveries' and is_staff());
create policy "staff views delivery photos" on storage.objects for select using (bucket_id = 'deliveries' and is_staff());

-- Delivered and paid. The rider must first photograph the items at the door (p_photo = storage path).
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

/* ================ no-shows, cash on delivery limit, product photos (same as migrations/008_no_show_cod_photos.sql) ================ */

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

/* ================ fixed cash amount (same as migrations/009_fixed_cash.sql) ================ */

-- The rider always collects exactly the order total in cash (p_cash is ignored).
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

/* ================ "Powered by" switch (same as migrations/010_powered_by.sql) ================ */

alter table public.store_settings add column if not exists show_powered_by boolean not null default true;

/* ================ privacy and anti-spam (same as migrations/011_privacy_spam.sql) ================ */

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

/* ================ sale price (same as migrations/012_sale_price.sql) ================ */

-- compare_price: the price before the discount, shown struck out. Orders always use price.
alter table public.products add column if not exists compare_price int;
do $$ begin
  alter table public.products add constraint products_compare_price_check check (compare_price is null or compare_price > price);
exception when duplicate_object then null;
end $$;

/* ================ daily order limit (same as migrations/013_daily_cap.sql) ================ */

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

/* ================ private evening limit (same as migrations/014_private_cap.sql) ================ */

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
