-- Update 057: gift packing at checkout for a flat charge (₹20, Admin can change it in store_settings.gift_wrap_fee;
-- 0 switches it off). Run once in Supabase → SQL Editor, after 056. Safe to run again; nothing is deleted.
--
-- 1) orders.gift_wrap / orders.gift_wrap_fee: the customer asked for gift packing and what it cost.
-- 2) place_order(... p_gift_wrap): adds the charge to the total in the database (never trusted from the phone).
--    The old version without p_gift_wrap is dropped first, so the website and the app keep working (it defaults to no).
-- 3) desk_remove_item keeps the gift packing charge when an item is taken off; get_order shows it on the order page.
-- The rider page and the order desk see "Gift pack" on these orders (partner_orders already returns every column).

alter table public.store_settings add column if not exists gift_wrap_fee int not null default 20;
alter table public.orders add column if not exists gift_wrap boolean not null default false;
alter table public.orders add column if not exists gift_wrap_fee int not null default 0;

drop function if exists public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text, boolean);

create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default '',
  p_use_wallet boolean default false, p_ref_code text default '', p_express boolean default false,
  p_gift_wrap boolean default false
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
  v_gift numeric := 0;
  v_items_left numeric;
  v_take numeric;
  v_uses jsonb := '[]'::jsonb;
  g record;
  v_express int := 0;
  v_wrap int := 0;                         -- gift packing (update 057)
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
  -- Gift packing (update 057): a flat charge from Settings, whatever the order.
  if coalesce(p_gift_wrap, false) then
    if coalesce(s.gift_wrap_fee, 0) <= 0 then raise exception 'Gift packing is not available right now. Please switch it off.'; end if;
    v_wrap := s.gift_wrap_fee;
  end if;
  v_total := v_subtotal + v_fee + v_express + v_packaging + v_wrap;

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

  -- Jholzo Money: only from a phone that owns the number.
  if p_use_wallet then
    if not owns_phone(me.phone) then raise exception 'Jholzo Money can be used only from your own phone.'; end if;
    -- Gift money (update 051): every gift whose minimum the items total reaches, soonest to expire first, with no
    -- per-order limit, on the items only (the delivery and packaging charges are always paid).
    v_items_left := v_subtotal;
    for g in select wg.id, gift_left(wg.id) as left_amount from wallet_gifts wg
             where wg.customer_id = me.id and wg.cancelled_at is null and wg.expires_at > now() and wg.min_order <= v_subtotal
             order by wg.expires_at, wg.created_at loop
      exit when v_items_left <= 0;
      v_take := least(greatest(g.left_amount, 0), v_items_left);
      if v_take > 0 then
        v_uses := v_uses || jsonb_build_array(jsonb_build_object('gift_id', g.id, 'amount', v_take));
        v_gift := v_gift + v_take;
        v_items_left := v_items_left - v_take;
      end if;
    end loop;
    v_total := v_total - v_gift;
    -- Invite rewards and refunds: up to the per-order limit, as before.
    v_wallet := least(greatest(wallet_balance(me.id), 0), s.wallet_max_per_order, v_total);
    v_total := v_total - v_wallet;
  end if;

  -- Big orders are paid first by UPI while online payment is on (update 039, as before 037).
  if p_payment <> 'upi_now' and v_total > s.cod_limit and coalesce(s.upi_on, true) and coalesce(s.upi_id, '') <> '' then
    raise exception 'Orders above ₹% are paid online before delivery. Please choose "Pay now by UPI".', s.cod_limit;
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
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, wallet_used, gift_used, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status, delivery_type, express_fee, express_by, status, confirmed_at,
                      gift_wrap, gift_wrap_fee)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, v_km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet + v_gift, v_gift, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end,
          case when p_express then 'express' else 'evening' end, v_express,
          case when p_express then now() + make_interval(mins => s.express_minutes) end,
          -- Cash orders are confirmed at once (update 037); pay-now UPI orders wait for the payment check.
          case when p_payment = 'upi_now' then 'placed' else 'confirmed' end,
          case when p_payment = 'upi_now' then null else now() end,
          v_wrap > 0, v_wrap)
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
  insert into wallet_gift_moves (gift_id, order_id, amount, kind)
  select (u ->> 'gift_id')::uuid, v_order.id, -((u ->> 'amount')::numeric), 'used'
  from jsonb_array_elements(v_uses) u;
  -- After the first order the customer gets their own invite code.
  if me.referral_code is null then
    update customers set referral_code = new_referral_code(case when v_ob_phone <> '' then v_ob_name else trim(p_name) end) where id = me.id;
  end if;

  return v_order.order_number;
end
$$;
grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text, boolean, boolean) to authenticated;

-- As in update 053, plus the gift packing charge in the new total.
create or replace function public.desk_remove_item(p_order_id uuid, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  it order_items;
  v_left int;
  v_sub int;
  v_back numeric := 0;
  v_give numeric;
  g record;
begin
  if not (is_desk() or is_staff()) then raise exception 'Only the Jholzo team can change orders.'; end if;
  if not is_desk() then perform check_my_order(p_order_id); end if;   -- a rider: only an order assigned to them
  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.status not in ('placed', 'confirmed') then raise exception 'This order can no longer be changed.'; end if;
  select * into it from order_items where id = p_item_id and order_id = p_order_id;
  if it.id is null then raise exception 'This item is not on the order.'; end if;
  select count(*), coalesce(sum(line_total), 0) into v_left, v_sub from order_items where order_id = p_order_id and id <> p_item_id;
  if v_left = 0 then raise exception 'You cannot remove the last item. Cancel the order instead.'; end if;
  insert into order_removed_items (order_id, product_id, name_snapshot, price_snapshot, quantity, line_total)
  values (it.order_id, it.product_id, it.name_snapshot, it.price_snapshot, it.quantity, it.line_total);
  delete from order_items where id = p_item_id and order_id = p_order_id;
  if coalesce(o.gift_used, 0) > v_sub then
    v_back := o.gift_used - v_sub;
    -- Back first to the gift that lasts longest.
    for g in select m.gift_id, -sum(m.amount) as used from wallet_gift_moves m join wallet_gifts wg on wg.id = m.gift_id
             where m.order_id = p_order_id group by m.gift_id, wg.expires_at having sum(m.amount) < 0
             order by wg.expires_at desc loop
      exit when v_back <= 0;
      v_give := least(g.used, v_back);
      insert into wallet_gift_moves (gift_id, order_id, amount, kind) values (g.gift_id, p_order_id, v_give, 'returned');
      v_back := v_back - v_give;
    end loop;
    v_back := o.gift_used - v_sub - v_back;   -- what actually went back
  end if;
  update orders set subtotal = v_sub, packaging_fee = public.packaging_fee(v_sub),
    gift_used = coalesce(gift_used, 0) - v_back, wallet_used = coalesce(wallet_used, 0) - v_back,
    total = greatest(0, v_sub + delivery_fee + coalesce(express_fee, 0) + public.packaging_fee(v_sub) + coalesce(gift_wrap_fee, 0) - (coalesce(wallet_used, 0) - v_back))
  where id = p_order_id;
end
$$;


-- As in update 053, plus gift_wrap for people who open the order page by its number.
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used, 'delivery_type', o.delivery_type, 'express_fee', o.express_fee, 'express_by', o.express_by,
                    'total', o.total, 'gift_wrap', o.gift_wrap, 'gift_wrap_fee', o.gift_wrap_fee, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name_snapshot', r.name_snapshot, 'quantity', r.quantity,
                                                             'line_total', r.line_total, 'reason', r.reason, 'removed_at', r.removed_at) order by r.removed_at), '[]')
                from order_removed_items r where r.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;


revoke execute on function public.desk_remove_item(uuid, uuid) from public, anon;
grant execute on function public.desk_remove_item(uuid, uuid) to authenticated;
grant execute on function public.get_order(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Check: the charge and the newest orders with gift packing.
select gift_wrap_fee from store_settings where id = 1;
