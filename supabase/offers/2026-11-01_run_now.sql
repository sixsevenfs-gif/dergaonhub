-- ===== Jholzo: run all of this once in Supabase → SQL Editor → New query → Run =====
-- 1) Stayfree Secure XL  2) Update 022 (order without map pin)  3) Update 023 (UPI pay timer)

-- Add Stayfree Secure XL (6 pads, ₹45) to Personal Care. Safe to run again (adds it only once).
-- The photo is a file of the website (public/products/stayfree-secure-xl.jpg): it shows once the new build is on Netlify.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select 'Stayfree Secure XL', '6 pads', 'personal', 'stayfree pad pads sanitary napkin sanitary pad periods xl whisper', 45,
       '/products/stayfree-secure-xl.jpg', true, 'active'
where not exists (select 1 from public.products where lower(name) = 'stayfree secure xl');


-- Update 022: order without a map pin. When the map or the phone's location does not work, the customer types
-- the address by hand and picks an area; the order then has no lat/lng and no distance (the store calls to confirm).
-- Same place_order as update 018 otherwise. Run once in Supabase → SQL Editor (after 018). Safe to run again.

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
  v_km numeric;                            -- null when the address was typed without a map pin
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
  -- No map pin is allowed (map or location not working): the address is typed by hand and the store calls to confirm.
  if (p_lat is null) <> (p_lng is null) then raise exception 'Set your home location on the map again.'; end if;
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

  if p_lat is not null then
    select * into q from delivery_quote(p_lat, p_lng);
    if q.too_far then
      raise exception 'We are currently not available at your location (% km away). We will be available soon!', q.km;
    end if;
    v_km := q.km;
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
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, v_km,
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

notify pgrst, 'reload schema';


-- Update 023: "Pay now by UPI" orders must be paid within upi_pay_minutes (15). The order page shows a timer;
-- an order still waiting for payment after that is cancelled ("Not paid in time"), and any Jholzo Money used on it
-- comes back (wallet trigger from update 017). Paid late? The customer types the UTR and the order comes back.
-- Run once in Supabase → SQL Editor (after 022). Safe to run again; nothing is deleted.

alter table public.store_settings
  add column if not exists upi_pay_minutes int not null default 15 check (upi_pay_minutes between 5 and 120);

-- Cancels UPI orders still waiting for payment after upi_pay_minutes. Any logged-in phone may run it:
-- it only touches orders that are really late, so the order page can run it when its timer ends.
create or replace function public.expire_unpaid_orders() returns void
language sql security definer set search_path = public as $$
  update orders o set status = 'cancelled', cancel_reason = 'Not paid in time'
  from store_settings s
  where s.id = 1 and o.payment_method = 'upi_now' and o.payment_status = 'awaiting' and o.status = 'placed'
    and o.created_at < now() - make_interval(mins => s.upi_pay_minutes)
$$;
revoke execute on function public.expire_unpaid_orders() from public, anon;
grant execute on function public.expire_unpaid_orders() to authenticated;

-- The admin's clean-up (runs when admin and rider pages load): late UPI orders, then old days.
create or replace function public.expire_old_orders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform expire_unpaid_orders();
  if is_admin() then
    update orders set status = 'cancelled', cancel_reason = 'Expired'
    where status in ('placed', 'confirmed') and delivery_date < (now() at time zone 'Asia/Kolkata')::date;
  end if;
end
$$;

-- UTR from the customer. Paid after the timer ended: the order comes back for the admin to check,
-- and the Jholzo Money given back at cancelling is used on it again.
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
  if o.status = 'cancelled' then
    if o.cancel_reason <> 'Not paid in time' then raise exception 'This order is cancelled. Please call us.'; end if;
    delete from wallet_entries where order_id = o.id and kind = 'refund';
    update orders set status = 'placed', cancel_reason = '', upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
    return;
  end if;
  update orders set upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
end
$$;

notify pgrst, 'reload schema';
