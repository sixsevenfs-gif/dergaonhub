-- Update 051: gift money. The owner adds Jholzo Money to a customer (Admin → Jholzo Money) with their own rules:
--  * how much, and from which items total it can be used (0 = any order),
--  * until when: after that moment whatever is left is gone,
--  * no per-order limit: the customer can use all of it on one order (the wallet_max_per_order limit is only
--    for invite rewards and refunds, as before),
--  * it pays for items only, never the delivery, express or packaging charge.
-- Gifts that expire soonest are used first. A cancelled order gives the gift money back to the same gifts.
-- Other Jholzo Money (invite rewards, refunds, money added by hand) works exactly as before.
-- Run once in Supabase → SQL Editor, after 050. Safe to run again; nothing is deleted.

create table if not exists public.wallet_gifts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  min_order int not null default 0 check (min_order >= 0),   -- items total needed to use it
  expires_at timestamptz not null,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz                                     -- taken back by the owner
);
create index if not exists wallet_gifts_customer_idx on public.wallet_gifts (customer_id, expires_at);

-- What happened to each gift: used on an order (minus), given back when that order was cancelled (refund),
-- or given back when an item was taken off the order (returned).
create table if not exists public.wallet_gift_moves (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.wallet_gifts on delete cascade,
  order_id uuid references public.orders on delete cascade,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('used', 'refund', 'returned')),
  created_at timestamptz not null default now()
);
create index if not exists wallet_gift_moves_gift_idx on public.wallet_gift_moves (gift_id);
create index if not exists wallet_gift_moves_order_idx on public.wallet_gift_moves (order_id);

alter table public.wallet_gifts enable row level security;
alter table public.wallet_gift_moves enable row level security;
drop policy if exists "desk reads gifts" on public.wallet_gifts;
create policy "desk reads gifts" on public.wallet_gifts for select using (is_desk());
drop policy if exists "desk reads gift moves" on public.wallet_gift_moves;
create policy "desk reads gift moves" on public.wallet_gift_moves for select using (is_desk());
-- No other policies: gifts change only through the functions below.

-- The part of wallet_used that came from gifts (wallet_used is still the whole Jholzo Money on the order).
alter table public.orders add column if not exists gift_used numeric(10,2) not null default 0;

-- Money left on a gift (it can show as used up even before it expires).
create or replace function public.gift_left(p_gift_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select g.amount + coalesce((select sum(m.amount) from wallet_gift_moves m where m.gift_id = g.id), 0)
  from wallet_gifts g where g.id = p_gift_id
$$;
revoke execute on function public.gift_left(uuid) from public, anon, authenticated;

-- Gift money a customer can still use on some order (not expired, not taken back).
create or replace function public.gift_balance(p_customer_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(gift_left(g.id), 0)), 0)
  from wallet_gifts g
  where g.customer_id = p_customer_id and g.cancelled_at is null and g.expires_at > now()
$$;
revoke execute on function public.gift_balance(uuid) from public, anon, authenticated;

-- Owner: give a customer gift money.
create or replace function public.admin_gift_add(p_customer_id uuid, p_amount numeric, p_min_order int, p_expires_at timestamptz, p_note text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'Only the owner can give Jholzo Money.'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter how much Jholzo Money to give.'; end if;
  if p_amount > 10000 then raise exception 'That is too much for one gift (₹10,000 at most).'; end if;
  if p_min_order is null or p_min_order < 0 then raise exception 'Enter the order amount needed (0 for any order).'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Choose a date and time in the future.'; end if;
  insert into wallet_gifts (customer_id, amount, min_order, expires_at, note)
  values (p_customer_id, round(p_amount, 2), p_min_order, p_expires_at, coalesce(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.admin_gift_add(uuid, numeric, int, timestamptz, text) from public, anon;
grant execute on function public.admin_gift_add(uuid, numeric, int, timestamptz, text) to authenticated;

-- Owner: take a gift back (what is left of it disappears; what was already used stays used).
create or replace function public.admin_gift_cancel(p_gift_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can take Jholzo Money back.'; end if;
  update wallet_gifts set cancelled_at = now() where id = p_gift_id and cancelled_at is null;
end
$$;
revoke execute on function public.admin_gift_cancel(uuid) from public, anon;
grant execute on function public.admin_gift_cancel(uuid) to authenticated;

-- "My Jholzo Money" (update 017) + gifts. balance = everything the customer has now (rewards and refunds plus
-- gifts that have not expired); general_balance and gift_balance are the two parts, gifts lists each gift.
create or replace function public.my_wallet(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c customers;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if not owns_phone(p_phone) then
    return jsonb_build_object('locked', true);
  end if;
  select * into c from customers where phone = p_phone;
  if c.id is null then
    -- Verified by OTP but never ordered: nothing yet. The invite code comes with the first order (with their name).
    return jsonb_build_object('locked', false, 'code', null, 'balance', 0, 'general_balance', 0, 'gift_balance', 0,
                              'referred', false, 'has_orders', false,
                              'entries', '[]'::jsonb, 'friends', '[]'::jsonb, 'gifts', '[]'::jsonb);
  end if;
  if c.referral_code is null then
    update customers set referral_code = new_referral_code(c.name) where id = c.id returning * into c;
  end if;
  return jsonb_build_object(
    'locked', false,
    'code', c.referral_code,
    'balance', wallet_balance(c.id) + gift_balance(c.id),
    'general_balance', wallet_balance(c.id),
    'gift_balance', gift_balance(c.id),
    'referred', c.referred_by is not null,
    'has_orders', exists (select 1 from orders where orderer_id = c.id or customer_id = c.id),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'amount', e.amount, 'kind', e.kind, 'note', e.note,
                                                             'created_at', e.created_at,
                                                             'order_number', (select order_number from orders where id = e.order_id))
                                          order by e.created_at desc), '[]')
                from (select * from wallet_entries where customer_id = c.id order by created_at desc limit 50) e),
    -- Invited friends: first name only, and whether the reward came.
    'friends', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', coalesce(nullif(split_part(f.name, ' ', 1), ''), 'Friend'),
                  'joined_at', f.created_at,
                  'earned', exists (select 1 from wallet_entries w join orders o on o.id = w.order_id
                                    where w.customer_id = c.id and w.kind = 'referral_bonus'
                                      and coalesce(o.orderer_id, o.customer_id) = f.id))
                order by f.created_at desc), '[]')
                from customers f where f.referred_by = c.id),
    -- Gifts that still work, and the ones that ended in the last 30 days.
    'gifts', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', g.id, 'amount', g.amount, 'left', greatest(gift_left(g.id), 0), 'min_order', g.min_order,
                'expires_at', g.expires_at, 'note', g.note, 'created_at', g.created_at,
                'status', case when g.cancelled_at is not null then 'cancelled'
                               when gift_left(g.id) <= 0 then 'used'
                               when g.expires_at <= now() then 'expired'
                               else 'active' end)
              order by g.expires_at), '[]')
              from wallet_gifts g
              where g.customer_id = c.id
                and ((g.cancelled_at is null and g.expires_at > now()) or greatest(g.expires_at, coalesce(g.cancelled_at, g.expires_at)) > now() - interval '30 days'))
  );
end
$$;
revoke execute on function public.my_wallet(text) from public, anon;
grant execute on function public.my_wallet(text) to authenticated;

-- Money follows the order status (update 017). Cancelled: rewards and refunds money back to the wallet as before,
-- gift money back to the same gifts (each once). Delivered: invite rewards. Delivered undone: rewards taken back.
create or replace function public.orders_wallet_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  me customers;
  v_me uuid := coalesce(new.orderer_id, new.customer_id);
  v_general numeric := coalesce(new.wallet_used, 0) - coalesce(new.gift_used, 0);
begin
  if new.status = old.status then return new; end if;
  select * into s from store_settings where id = 1;

  if new.status = 'cancelled' then
    if v_general > 0 and not exists (select 1 from wallet_entries where order_id = new.id and kind = 'refund') then
      insert into wallet_entries (customer_id, amount, kind, order_id, note)
      values (v_me, v_general, 'refund', new.id, 'Order ' || new.order_number || ' cancelled');
    end if;
    insert into wallet_gift_moves (gift_id, order_id, amount, kind)
    select m.gift_id, new.id, -sum(m.amount), 'refund'
    from wallet_gift_moves m where m.order_id = new.id
    group by m.gift_id having sum(m.amount) < 0;
  end if;

  -- Delivered: first delivered order of an invited friend pays both rewards.
  if new.status = 'completed' and s.referral_on then
    select * into me from customers where id = v_me;
    if me.referred_by is not null
       and new.subtotal >= s.referral_min_order
       and not exists (select 1 from orders o where o.id <> new.id and o.status = 'completed'
                       and coalesce(o.orderer_id, o.customer_id) = v_me)
       and not exists (select 1 from wallet_entries where customer_id = v_me and kind = 'welcome_bonus') then
      if s.referrer_reward > 0 then
        insert into wallet_entries (customer_id, amount, kind, order_id, note)
        values (me.referred_by, s.referrer_reward, 'referral_bonus', new.id,
                coalesce(nullif(split_part(me.name, ' ', 1), ''), 'Your friend') || '''s first order was delivered');
      end if;
      if s.friend_reward > 0 then
        insert into wallet_entries (customer_id, amount, kind, order_id, note)
        values (v_me, s.friend_reward, 'welcome_bonus', new.id, 'Welcome reward for joining with an invite');
      end if;
    end if;
  end if;

  -- A delivered order was undone: its rewards are taken back (they come again when it is delivered).
  if old.status = 'completed' then
    delete from wallet_entries where order_id = new.id and kind in ('referral_bonus', 'welcome_bonus');
  end if;
  return new;
end
$$;

-- UTR from the customer (update 023). Paid after the timer ended: the order comes back for the admin to check,
-- and the Jholzo Money given back at cancelling (rewards and gifts) is used on it again.
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
    delete from wallet_gift_moves where order_id = o.id and kind = 'refund';
    update orders set status = 'placed', cancel_reason = '', upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
    return;
  end if;
  update orders set upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
end
$$;

-- An item was not found at the shop (update 032). Gift money pays for items only, so when the items total drops
-- below the gift money used, the difference goes back to the gifts (the delivery charge stays as quoted).
create or replace function public.desk_remove_item(p_order_id uuid, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_left int;
  v_sub int;
  v_back numeric := 0;
  v_give numeric;
  g record;
begin
  if not is_desk() then raise exception 'Only the order desk can change orders.'; end if;
  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.status not in ('placed', 'confirmed') then raise exception 'This order can no longer be changed.'; end if;
  select count(*), coalesce(sum(line_total), 0) into v_left, v_sub from order_items where order_id = p_order_id and id <> p_item_id;
  if v_left = 0 then raise exception 'You cannot remove the last item. Cancel the order instead.'; end if;
  delete from order_items where id = p_item_id and order_id = p_order_id;
  if not found then raise exception 'This item is not on the order.'; end if;
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
    total = greatest(0, v_sub + delivery_fee + coalesce(express_fee, 0) + public.packaging_fee(v_sub) - (coalesce(wallet_used, 0) - v_back))
  where id = p_order_id;
end
$$;

-- place_order from update 039 + gift money (used first, on items only, no per-order limit).
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
  v_gift numeric := 0;
  v_items_left numeric;
  v_take numeric;
  v_uses jsonb := '[]'::jsonb;
  g record;
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
                      ordered_by_name, ordered_by_phone, payment_status, delivery_type, express_fee, express_by, status, confirmed_at)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, v_km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet + v_gift, v_gift, v_total, p_payment, v_date,
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
grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text, boolean) to authenticated;

notify pgrst, 'reload schema';
