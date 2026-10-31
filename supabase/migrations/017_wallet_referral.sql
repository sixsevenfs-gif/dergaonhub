-- Update 017: Jholzo Money (wallet) and Refer & Earn. Run once in Supabase → SQL Editor (after 016).
-- Safe to run again; nothing is deleted.
--
-- How it works:
-- · Every customer gets an invite code after their first order (e.g. RAHUL482).
-- · A friend who is new (no orders yet) enters the code on their first order.
-- · When that first order is DELIVERED (and its items total is at least referral_min_order),
--   the inviter gets referrer_reward and the friend gets friend_reward in Jholzo Money.
-- · Jholzo Money is used at checkout: up to wallet_max_per_order per order.
-- · A cancelled order gives the used money back. If a delivered order is undone, its rewards are taken back.
-- · Only a phone that owns the number (verified by OTP, or has placed orders for it from this browser)
--   can see or spend its money, so typing someone else's number does nothing.
-- All amounts and the on/off switch are in Admin → Settings → Refer & earn.

alter table public.store_settings
  add column if not exists referral_on boolean not null default true,
  add column if not exists referrer_reward int not null default 30,
  add column if not exists friend_reward int not null default 20,
  add column if not exists referral_min_order int not null default 200,
  add column if not exists wallet_max_per_order int not null default 50;

alter table public.customers
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.customers on delete set null;

alter table public.orders
  add column if not exists orderer_id uuid references public.customers on delete set null,  -- whose wallet and referral
  add column if not exists wallet_used numeric(10,2) not null default 0;

-- The money book: one row per change. Balance = sum(amount).
create table if not exists public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers on delete cascade,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('referral_bonus', 'welcome_bonus', 'order_payment', 'refund', 'admin')),
  order_id uuid references public.orders on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wallet_entries_customer_idx on public.wallet_entries (customer_id, created_at desc);
create index if not exists wallet_entries_order_idx on public.wallet_entries (order_id);
alter table public.wallet_entries enable row level security;
drop policy if exists "admin reads wallet" on public.wallet_entries;
create policy "admin reads wallet" on public.wallet_entries for select using (is_admin());
-- No other policies: money only moves through the functions below.

create or replace function public.wallet_balance(p_customer_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from wallet_entries where customer_id = p_customer_id
$$;
revoke execute on function public.wallet_balance(uuid) from public, anon, authenticated;

-- Does this browser own the number? Verified by OTP here, or it placed orders for this number itself.
create or replace function public.owns_phone(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone)
    or exists (select 1 from orders where placed_by = auth.uid()
               and (ordered_by_phone = p_phone or (customer_phone = p_phone and ordered_by_phone = '')))
  )
$$;
revoke execute on function public.owns_phone(text) from public, anon, authenticated;

-- Invite code: up to 5 letters of the name + 3 digits (RAHUL482), or JHOL + digits.
create or replace function public.new_referral_code(p_name text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_base text := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 5));
  v_code text;
begin
  if length(v_base) < 3 then v_base := 'JHOL'; end if;
  loop
    v_code := v_base || (100 + floor(random() * 900))::int;
    exit when not exists (select 1 from customers where referral_code = v_code);
  end loop;
  return v_code;
end
$$;
revoke execute on function public.new_referral_code(text) from public, anon, authenticated;

-- "My Jholzo Money" page: balance, history, invite code and invited friends, for a number this browser owns.
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
    return jsonb_build_object('locked', false, 'code', null, 'balance', 0, 'referred', false, 'has_orders', false,
                              'entries', '[]'::jsonb, 'friends', '[]'::jsonb);
  end if;
  if c.referral_code is null then
    update customers set referral_code = new_referral_code(c.name) where id = c.id returning * into c;
  end if;
  return jsonb_build_object(
    'locked', false,
    'code', c.referral_code,
    'balance', wallet_balance(c.id),
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
                from customers f where f.referred_by = c.id)
  );
end
$$;
revoke execute on function public.my_wallet(text) from public, anon;
grant execute on function public.my_wallet(text) to authenticated;

-- Admin: add or take back money by hand (a goodwill credit for a complaint, say).
create or replace function public.admin_wallet_adjust(p_customer_id uuid, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Enter an amount.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Write a short reason.'; end if;
  insert into wallet_entries (customer_id, amount, kind, note) values (p_customer_id, round(p_amount, 2), 'admin', trim(p_note));
end
$$;
revoke execute on function public.admin_wallet_adjust(uuid, numeric, text) from public, anon;
grant execute on function public.admin_wallet_adjust(uuid, numeric, text) to authenticated;

-- Money follows the order status, whichever screen changes it (admin, rider, customer, expiry).
create or replace function public.orders_wallet_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s store_settings;
  me customers;
  v_me uuid := coalesce(new.orderer_id, new.customer_id);
begin
  if new.status = old.status then return new; end if;
  select * into s from store_settings where id = 1;

  -- Cancelled: the Jholzo Money used on it comes back (once).
  if new.status = 'cancelled' and new.wallet_used > 0
     and not exists (select 1 from wallet_entries where order_id = new.id and kind = 'refund') then
    insert into wallet_entries (customer_id, amount, kind, order_id, note)
    values (v_me, new.wallet_used, 'refund', new.id, 'Order ' || new.order_number || ' cancelled');
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
drop trigger if exists orders_wallet_on_status on public.orders;
create trigger orders_wallet_on_status after update of status on public.orders
  for each row execute function public.orders_wallet_on_status();

-- Order page for strangers: also the Jholzo Money used (the bill shows it).
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used,
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

-- place_order: + use Jholzo Money (p_use_wallet) and an invite code on the first order (p_ref_code).
drop function if exists public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text);
create or replace function public.place_order(
  p_lines jsonb, p_name text, p_phone text, p_address text, p_area text,
  p_lat double precision, p_lng double precision,
  p_note text, p_payment text, p_allow_substitute boolean,
  p_orderer_name text default '', p_orderer_phone text default '',
  p_use_wallet boolean default false, p_ref_code text default ''
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
  v_date := next_delivery_date();

  insert into orders (customer_id, orderer_id, placed_by, customer_name, customer_phone, address, area, lat, lng, distance_km,
                      note, allow_substitute, subtotal, delivery_fee, packaging_fee, wallet_used, total, payment_method, delivery_date,
                      ordered_by_name, ordered_by_phone, payment_status)
  values (c.id, me.id, auth.uid(), trim(p_name), p_phone, trim(p_address), p_area, p_lat, p_lng, q.km,
          coalesce(trim(p_note), ''), coalesce(p_allow_substitute, true), v_subtotal, v_fee, v_packaging, v_wallet, v_total, p_payment, v_date,
          v_ob_name, v_ob_phone, case when p_payment = 'upi_now' then 'awaiting' else 'none' end)
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

grant execute on function public.place_order(jsonb, text, text, text, text, double precision, double precision, text, text, boolean, text, text, boolean, text) to authenticated;
