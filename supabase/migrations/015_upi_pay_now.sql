-- Update 015: "Pay now by UPI" (no gateway), payment verification, cash only up to ₹350,
-- packaging charge with paise. Run once in Supabase → SQL Editor (after 014). Safe to run again.

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

notify pgrst, 'reload schema';
