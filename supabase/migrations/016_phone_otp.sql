-- Update 016: phone OTP once per new phone (Message Central VerifyNow). Run once in Supabase → SQL Editor
-- (after 015). Safe to run again. OTP stays off until you switch it on in Admin → Settings.

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

notify pgrst, 'reload schema';
