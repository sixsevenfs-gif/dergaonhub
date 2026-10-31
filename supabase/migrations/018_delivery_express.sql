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
