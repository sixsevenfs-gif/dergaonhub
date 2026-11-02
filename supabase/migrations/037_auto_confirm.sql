-- Update 037: cash orders run by themselves.
--  * Cash on delivery orders are confirmed the moment they are placed; the store calls once before packing.
--  * No order limit: Cash on Delivery for any amount (the cod_limit check is gone).
--  * A number that cancels (or doesn't take) Cash on Delivery orders 2 times is blocked from ordering.
--    Unblocking it in Admin → Customers gives it a fresh start.
--  * UPI payments switched off (pay-now UPI shows "temporarily unavailable", the rider page hides Show QR),
--    and the automatic WhatsApp messages switched off. Both can be switched on again in Admin → Settings.
-- Includes update 035 (the UPI switch), so 035 doesn't have to be run first.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- From update 035: the UPI switch, and the database refusing UPI orders while it is off.
alter table public.store_settings add column if not exists upi_on boolean not null default true;

create or replace function public.orders_check_upi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_method in ('upi', 'upi_now') and not coalesce((select upi_on from store_settings where id = 1), true) then
    raise exception 'UPI payment is unavailable right now. Please choose Cash on Delivery.';
  end if;
  return new;
end
$$;
drop trigger if exists orders_check_upi on public.orders;
create trigger orders_check_upi before insert on public.orders for each row execute function public.orders_check_upi();
revoke execute on function public.orders_check_upi() from public, anon, authenticated;

update public.store_settings set upi_on = false, whatsapp_auto = false where id = 1;

-- Cancellations by the customer, counted with no-shows: 2 together block the number.
alter table public.customers add column if not exists cancel_count int not null default 0;

create or replace function public.customers_auto_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.blocked and not new.blocked then
    -- Unblocked by the store: a fresh start.
    new.cancel_count := 0;
    new.no_show_count := 0;
  elsif new.cancel_count + new.no_show_count >= 2
    and (new.cancel_count > old.cancel_count or new.no_show_count > old.no_show_count) then
    new.blocked := true;
  end if;
  return new;
end
$$;
drop trigger if exists customers_auto_block on public.customers;
create trigger customers_auto_block before update on public.customers
  for each row execute function public.customers_auto_block();
revoke execute on function public.customers_auto_block() from public, anon, authenticated;

-- Numbers that already have 2 no-shows (they couldn't pay cash before) follow the same rule now.
update public.customers set blocked = true where not blocked and cancel_count + no_show_count >= 2;

-- Checkout asks this before showing Cash on Delivery.
create or replace function public.cod_allowed(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from customers where phone = p_phone and (blocked or cancel_count + no_show_count >= 2))
$$;
revoke execute on function public.cod_allowed(text) from public, anon;
grant execute on function public.cod_allowed(text) to authenticated;

-- Customer cancels from the order page (update 006): a cash order counts towards the block.
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
  if o.payment_method <> 'upi_now' then
    update customers set cancel_count = cancel_count + 1 where id = coalesce(o.orderer_id, o.customer_id);
  end if;
end
$$;
revoke execute on function public.customer_cancel_order(text) from public, anon;
grant execute on function public.customer_cancel_order(text) to authenticated;

-- place_order from update 035 with three changes: cash orders are saved as confirmed, no cash limit,
-- and no separate no-show rule (no-shows now block the number, checked above with "blocked").
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

  -- Blocked by the admin, or by 2 cancelled / not-taken orders (customers_auto_block): no online orders.
  select * into c from customers where phone = p_phone;
  if v_ob_phone <> '' then select * into ob from customers where phone = v_ob_phone; end if;
  if coalesce(c.blocked, false) or coalesce(ob.blocked, false) then
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
                      ordered_by_name, ordered_by_phone, payment_status, delivery_type, express_fee, express_by, status, confirmed_at)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, v_km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end,
          case when p_express then 'express' else 'evening' end, v_express,
          case when p_express then now() + make_interval(mins => s.express_minutes) end,
          -- Cash orders are confirmed at once (update 037); pay-now UPI orders wait for the payment check.
          case when p_payment = 'upi_now' then 'placed' else 'confirmed' end,
          case when p_payment = 'upi_now' then null else now() end)
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
