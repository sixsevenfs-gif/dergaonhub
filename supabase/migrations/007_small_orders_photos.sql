-- Update 007: small-order delivery fee, no first-order limit, delivery photo by the rider.
-- Run once in Supabase → SQL Editor (after 006). Safe to run again; nothing is deleted.
--
-- Small orders: if the items total is below small_order_below (₹149), delivery costs a flat
-- small_order_fee (₹40), or the normal distance fee if that is higher, so a far-away small order never
-- pays less than a normal one. Free delivery (launch offer) only covers orders from ₹149 up.
-- There is no minimum order any more (min_order 200 → 0), and no ₹500 limit on a first order.

alter table public.store_settings
  add column if not exists small_order_below int not null default 149,
  add column if not exists small_order_fee int not null default 40;
update public.store_settings set min_order = 0 where min_order = 200;

alter table public.orders add column if not exists delivery_photo text not null default '';

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

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text) to authenticated;

/* ---------------- delivery photo ---------------- */

-- Private bucket: only the admin and riders can upload or see delivery photos.
insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false) on conflict (id) do nothing;
drop policy if exists "staff uploads delivery photos" on storage.objects;
create policy "staff uploads delivery photos" on storage.objects for insert with check (bucket_id = 'deliveries' and is_staff());
drop policy if exists "staff views delivery photos" on storage.objects;
create policy "staff views delivery photos" on storage.objects for select using (bucket_id = 'deliveries' and is_staff());

-- Delivered and paid. The rider must first photograph the items at the door (p_photo = storage path).
-- Cash is what the rider actually collected (UPI orders: 0).
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

notify pgrst, 'reload schema';
