-- Update 032: the team. An executive runs the order desk, riders accept or get assigned orders.
-- Run once in Supabase → SQL Editor, BEFORE pushing the website update. Safe to run again.
--
-- Executive (role 'executive' in the riders table, login on /executive): sees orders, customers,
-- logins, complaints, carts and the daily summary; confirms, cancels, removes missing items, assigns
-- riders, marks items out of stock, blocks numbers and sends WhatsApp messages. Never: settings (UPI and
-- bank details, fees), delete orders, UPI payment checks, Jholzo Money, prices, cash records. Those stay
-- with the owner (admins table), and this database refuses them even if someone calls it directly.
-- Rider: sees only their own orders and confirmed orders nobody has taken yet ("Accept").

/* ---------------- roles ---------------- */

alter table public.riders add column if not exists role text not null default 'rider';
do $$ begin
  alter table public.riders add constraint riders_role_check check (role in ('rider', 'executive'));
exception when duplicate_object then null;
end $$;

create or replace function public.is_rider() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from riders where user_id = auth.uid() and active and role = 'rider')
$$;

create or replace function public.is_executive() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from riders where user_id = auth.uid() and active and role = 'executive')
$$;

-- The order desk: the owner or an executive. (is_staff() stays owner + riders: delivery steps.)
create or replace function public.is_desk() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_executive()
$$;

/* ---------------- who did what on an order ---------------- */

alter table public.orders
  add column if not exists rider_id uuid references auth.users on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users on delete set null,
  add column if not exists cancelled_by uuid references auth.users on delete set null;
create index if not exists orders_rider_idx on public.orders (rider_id);

-- Owner switch (Settings): riders may confirm new orders too, for days without an executive.
alter table public.store_settings add column if not exists riders_confirm boolean not null default false;

/* ---------------- what the executive can read (added rules; the old ones stay) ---------------- */

drop policy if exists "desk reads orders" on public.orders;
create policy "desk reads orders" on public.orders for select using (is_desk());
drop policy if exists "desk reads items" on public.order_items;
create policy "desk reads items" on public.order_items for select using (is_desk());
drop policy if exists "desk reads customers" on public.customers;
create policy "desk reads customers" on public.customers for select using (is_desk());
drop policy if exists "desk reads complaints" on public.complaints;
create policy "desk reads complaints" on public.complaints for select using (is_desk());
drop policy if exists "desk resolves complaints" on public.complaints;
create policy "desk resolves complaints" on public.complaints for update using (is_desk()) with check (is_desk());
drop policy if exists "desk reads messages" on public.order_messages;
create policy "desk reads messages" on public.order_messages for select using (is_desk());
drop policy if exists "desk reads signups" on public.signups;
create policy "desk reads signups" on public.signups for select using (is_desk());
drop policy if exists "desk reads waitlist" on public.waitlist;
create policy "desk reads waitlist" on public.waitlist for select using (is_desk());
drop policy if exists "desk marks waitlist" on public.waitlist;
create policy "desk marks waitlist" on public.waitlist for update using (is_desk()) with check (is_desk());
drop policy if exists "desk reads wallet" on public.wallet_entries;
create policy "desk reads wallet" on public.wallet_entries for select using (is_desk());
drop policy if exists "desk reads expenses" on public.daily_expenses;
create policy "desk reads expenses" on public.daily_expenses for select using (is_desk());
drop policy if exists "desk reads products" on public.products;
create policy "desk reads products" on public.products for select using (is_desk());
drop policy if exists "desk reads team" on public.riders;
create policy "desk reads team" on public.riders for select using (is_desk());
drop policy if exists "desk views delivery photos" on storage.objects;
create policy "desk views delivery photos" on storage.objects for select using (bucket_id = 'deliveries' and is_desk());

/* ---------------- order desk actions (the executive changes orders only through these) ---------------- */

-- After the confirmation call. A pay-now UPI order waits for the owner to check the payment.
create or replace function public.desk_confirm_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  if not (is_desk() or (is_rider() and coalesce((select riders_confirm from store_settings where id = 1), false))) then
    raise exception 'Only the order desk can confirm orders.';
  end if;
  select * into o from orders where id = p_order_id;
  if o.id is null or o.status <> 'placed' then raise exception 'Only new orders can be confirmed.'; end if;
  if o.payment_method = 'upi_now' and o.payment_status <> 'paid' and not is_admin() then
    raise exception 'Pay-now order: the owner checks the UPI payment first.';
  end if;
  update orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
    rider_id = coalesce(rider_id, case when is_rider() then auth.uid() end),
    assigned_at = coalesce(assigned_at, case when is_rider() then now() end)
  where id = p_order_id;
end
$$;

-- Same as before, now also for the executive, and it remembers who cancelled.
create or replace function public.cancel_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Only the order desk can cancel orders.'; end if;
  update orders set status = 'cancelled', cancel_reason = p_reason, cancelled_by = auth.uid()
  where id = p_order_id and status <> 'completed';
  if p_reason = 'No-show' then
    update customers set no_show_count = no_show_count + 1
    where id = (select customer_id from orders where id = p_order_id);
  end if;
end
$$;

-- An item was not found at the shop. Same total as src/lib/store.supabase.js removeOrderItem: packaging
-- follows the new items total, the delivery charge stays as quoted, Jholzo Money used stays used.
create or replace function public.desk_remove_item(p_order_id uuid, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_left int;
  v_sub int;
begin
  if not is_desk() then raise exception 'Only the order desk can change orders.'; end if;
  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.status not in ('placed', 'confirmed') then raise exception 'This order can no longer be changed.'; end if;
  select count(*), coalesce(sum(line_total), 0) into v_left, v_sub from order_items where order_id = p_order_id and id <> p_item_id;
  if v_left = 0 then raise exception 'You cannot remove the last item. Cancel the order instead.'; end if;
  delete from order_items where id = p_item_id and order_id = p_order_id;
  if not found then raise exception 'This item is not on the order.'; end if;
  update orders set subtotal = v_sub, packaging_fee = public.packaging_fee(v_sub),
    total = greatest(0, v_sub + delivery_fee + coalesce(express_fee, 0) + public.packaging_fee(v_sub) - coalesce(wallet_used, 0))
  where id = p_order_id;
end
$$;

-- Give an open order to a rider (or take it back with null).
create or replace function public.desk_assign_rider(p_order_id uuid, p_rider uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Only the order desk can assign riders.'; end if;
  if p_rider is not null and not exists (select 1 from riders where user_id = p_rider and active and role = 'rider') then
    raise exception 'Choose an active rider.';
  end if;
  update orders set rider_id = p_rider, assigned_at = case when p_rider is null then null else now() end
  where id = p_order_id and status in ('placed', 'confirmed');
  if not found then raise exception 'Only open orders can be assigned.'; end if;
end
$$;

-- Out of stock on/off. Prices, names and photos stay with the owner.
create or replace function public.desk_set_available(p_product_id uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Only the order desk can change stock.'; end if;
  update products set available = coalesce(p_available, true), updated_at = now() where id = p_product_id;
end
$$;

create or replace function public.desk_set_blocked(p_customer_id uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Only the order desk can block numbers.'; end if;
  update customers set blocked = coalesce(p_blocked, false) where id = p_customer_id;
end
$$;

-- WhatsApp sent by hand: riders and the order desk.
create or replace function public.log_order_message(p_order_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or is_desk()) then raise exception 'Team only.'; end if;
  insert into order_messages (order_id, kind, channel) values (p_order_id, p_kind, 'tap');
end
$$;

-- Same as update 023; the executive's pages also tidy up yesterday's open orders.
create or replace function public.expire_old_orders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform expire_unpaid_orders();
  if is_desk() then
    update orders set status = 'cancelled', cancel_reason = 'Expired'
    where status in ('placed', 'confirmed') and delivery_date < (now() at time zone 'Asia/Kolkata')::date;
  end if;
end
$$;

-- UPI payment check: now the owner only (it was open to riders too). Otherwise same as update 015.
create or replace function public.staff_set_payment(p_order_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_limit int := (select cod_limit from store_settings where id = 1);
begin
  if not is_admin() then raise exception 'Only the owner can mark UPI payments.'; end if;
  if p_status not in ('paid', 'failed') then raise exception 'Unknown payment status.'; end if;
  select * into o from orders where id = p_order_id;
  if o.id is null or o.payment_method <> 'upi_now' then raise exception 'This order is not paid online.'; end if;
  if p_status = 'paid' then
    update orders set payment_status = 'paid', paid_at = now(),
      status = case when status = 'placed' then 'confirmed' else status end,
      confirmed_at = case when status = 'placed' then now() else confirmed_at end,
      confirmed_by = case when status = 'placed' then auth.uid() else confirmed_by end
    where id = o.id;
  elsif o.total <= v_limit then
    update orders set payment_status = 'none', payment_method = 'cash', upi_ref = '' where id = o.id;
  else
    update orders set payment_status = 'failed' where id = o.id;
  end if;
end
$$;

/* ---------------- riders: accept, give back, only their own orders ---------------- */

-- Stops a rider from working on an order another rider has (the owner can always).
create or replace function public.check_my_order(p_order_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_name text;
begin
  if is_admin() then return; end if;
  select r.name into v_name from orders o join riders r on r.user_id = o.rider_id
  where o.id = p_order_id and o.rider_id <> auth.uid();
  if found then raise exception 'This order is with %.', coalesce(nullif(v_name, ''), 'another rider'); end if;
end
$$;

-- First come, first served.
create or replace function public.rider_accept(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_rider() then raise exception 'Delivery partners only.'; end if;
  if exists (select 1 from orders where id = p_order_id and rider_id = auth.uid()) then return; end if;
  perform check_my_order(p_order_id);
  update orders set rider_id = auth.uid(), assigned_at = now()
  where id = p_order_id and status = 'confirmed' and rider_id is null;
  if not found then raise exception 'Only confirmed orders can be accepted.'; end if;
end
$$;

-- Give an order back before leaving with it.
create or replace function public.rider_release(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_rider() then raise exception 'Delivery partners only.'; end if;
  update orders set rider_id = null, assigned_at = null
  where id = p_order_id and rider_id = auth.uid() and status = 'confirmed' and dispatch = '';
  if not found then raise exception 'You can give an order back only before "On the way".'; end if;
end
$$;

-- One day's orders. The owner sees all of them with the rider's name; a rider sees their own, plus
-- confirmed orders nobody has taken (and new ones when the owner lets riders confirm).
create or replace function public.partner_orders(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_confirm boolean := coalesce((select riders_confirm from store_settings where id = 1), false);
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(
      (to_jsonb(o) - array['placed_by', 'customer_id']) || jsonb_build_object(
        'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name_snapshot), '[]') from order_items i where i.order_id = o.id),
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'channel', m.channel, 'ok', m.ok, 'at', m.created_at) order by m.created_at), '[]')
                     from order_messages m where m.order_id = o.id),
        'rider_name', (select r.name from riders r where r.user_id = o.rider_id)
      ) order by o.area, o.created_at), '[]')
    from orders o
    where o.delivery_date = p_date and o.status <> 'cancelled'
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid()
           or (o.rider_id is null and (o.status = 'confirmed' or (o.status = 'placed' and v_confirm))))
  );
end
$$;

-- Delivery steps (updates 003, 008, 009, 031) with one change: only the order's rider or the owner,
-- and a free order becomes the rider's as soon as they start it.
create or replace function public.partner_set_dispatch(p_order_id uuid, p_dispatch text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_dispatch not in ('', 'on_the_way', 'arriving') then raise exception 'Unknown delivery step.'; end if;
  perform check_my_order(p_order_id);
  update orders set dispatch = p_dispatch, dispatched_at = case when p_dispatch = '' then null else now() end,
    rider_id = coalesce(rider_id, case when is_rider() then auth.uid() end),
    assigned_at = coalesce(assigned_at, case when is_rider() then now() end)
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can go out for delivery.'; end if;
end
$$;

create or replace function public.partner_complete(p_order_id uuid, p_cash int, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if coalesce(trim(p_photo), '') = '' then raise exception 'Take a photo of the items at the door first.'; end if;
  perform check_my_order(p_order_id);
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(), delivery_photo = p_photo,
    cash_collected = case when payment_method = 'cash' then total else 0 end,
    rider_id = coalesce(rider_id, case when is_rider() then auth.uid() end),
    assigned_at = coalesce(assigned_at, case when is_rider() then now() end)
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

create or replace function public.partner_no_show(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  perform check_my_order(p_order_id);
  update orders set status = 'cancelled', cancel_reason = 'No-show', cancelled_by = auth.uid()
  where id = p_order_id and status = 'confirmed'
  returning * into o;
  if o.id is null then raise exception 'Only confirmed orders can be marked as a no-show.'; end if;
  update customers set no_show_count = no_show_count + 1 where id = o.customer_id;
end
$$;

create or replace function public.partner_paid_by_qr(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  perform check_my_order(p_order_id);
  update orders set payment_method = 'upi'
  where id = p_order_id and status = 'confirmed' and payment_method = 'cash';
end
$$;

/* ---------------- team list (owner) ---------------- */

drop function if exists public.admin_list_riders();
create or replace function public.admin_list_riders() returns table (user_id uuid, email text, name text, phone text, role text, active boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, u.email::text, r.name, r.phone, r.role, r.active
  from riders r join auth.users u on u.id = r.user_id
  where is_admin()
  order by r.active desc, r.role, r.name
$$;

-- Make an existing login (Supabase → Authentication → Users) a rider or an executive.
drop function if exists public.admin_add_rider(text, text, text);
create or replace function public.admin_add_rider(p_email text, p_name text, p_phone text, p_role text default 'rider') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if coalesce(p_role, 'rider') not in ('rider', 'executive') then raise exception 'Choose Rider or Executive.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No login with this email yet. First create it in Supabase → Authentication → Users → Add user.';
  end if;
  if exists (select 1 from admins where user_id = v_id) then raise exception 'This is the owner login.'; end if;
  insert into riders (user_id, name, phone, role) values (v_id, trim(p_name), coalesce(trim(p_phone), ''), coalesce(p_role, 'rider'))
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, role = excluded.role, active = true;
end
$$;

/* ---------------- carts left behind (reminders from the order desk) ---------------- */

create table if not exists public.carts (
  phone text primary key check (phone ~ '^[0-9]{10}$'),
  user_id uuid default auth.uid(),
  name text not null default '',
  items jsonb not null default '[]',   -- [{ "id": product id, "qty": 2 }]
  updated_at timestamptz not null default now(),
  reminded_at timestamptz,             -- one WhatsApp reminder per cart
  reminded_by uuid references auth.users on delete set null
);
alter table public.carts enable row level security;
drop policy if exists "desk reads carts" on public.carts;
create policy "desk reads carts" on public.carts for select using (is_desk());
-- Written only by save_my_cart() and desk_mark_reminded().

-- The customer's cart, for the number they logged in with (OTP-verified, or one they ordered with).
-- An empty cart deletes the row. The reminder mark stays until the cart is emptied.
create or replace function public.save_my_cart(p_phone text, p_name text, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
begin
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' or not owns_phone(p_phone) then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.e->>'id', 'qty', least(greatest((x.e->>'qty')::int, 1), 99))), '[]'::jsonb)
  into v_items
  from (select t.e from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) as t(e) limit 60) x
  where (x.e->>'id') ~ '^[0-9a-fA-F-]{36}$' and (x.e->>'qty') ~ '^[0-9]{1,3}$';
  if jsonb_array_length(v_items) = 0 then
    delete from carts where phone = p_phone;
    return;
  end if;
  insert into carts (phone, user_id, name, items, updated_at)
  values (p_phone, auth.uid(), left(coalesce(trim(p_name), ''), 60), v_items, now())
  on conflict (phone) do update set
    user_id = excluded.user_id,
    name = case when excluded.name <> '' then excluded.name else carts.name end,
    items = excluded.items,
    updated_at = case when carts.items = excluded.items then carts.updated_at else now() end;
end
$$;

create or replace function public.desk_mark_reminded(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Order desk only.'; end if;
  update carts set reminded_at = now(), reminded_by = auth.uid() where phone = p_phone;
end
$$;

-- An order clears that number's cart, even if the phone never sent the empty cart.
create or replace function public.orders_clear_cart() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from carts where phone in (new.customer_phone, nullif(new.ordered_by_phone, ''));
  return new;
end
$$;
drop trigger if exists orders_clear_cart on public.orders;
create trigger orders_clear_cart after insert on public.orders for each row execute function public.orders_clear_cart();

/* ---------------- who may call what ---------------- */

-- is_executive() and is_desk() stay callable by everyone, like is_admin(): the read rules above use them
-- on public reads (products), and a visitor without a login must not hit "permission denied".
revoke execute on function public.desk_confirm_order(uuid), public.cancel_order(uuid, text),
  public.desk_remove_item(uuid, uuid), public.desk_assign_rider(uuid, uuid), public.desk_set_available(uuid, boolean),
  public.desk_set_blocked(uuid, boolean), public.log_order_message(uuid, text), public.staff_set_payment(uuid, text),
  public.rider_accept(uuid), public.rider_release(uuid), public.partner_orders(date), public.partner_set_dispatch(uuid, text),
  public.partner_complete(uuid, int, text), public.partner_no_show(uuid), public.partner_paid_by_qr(uuid),
  public.admin_list_riders(), public.admin_add_rider(text, text, text, text), public.save_my_cart(text, text, jsonb),
  public.desk_mark_reminded(text) from public, anon;
grant execute on function public.is_executive(), public.is_desk() to public, anon, authenticated;
grant execute on function public.desk_confirm_order(uuid), public.cancel_order(uuid, text),
  public.desk_remove_item(uuid, uuid), public.desk_assign_rider(uuid, uuid), public.desk_set_available(uuid, boolean),
  public.desk_set_blocked(uuid, boolean), public.log_order_message(uuid, text), public.staff_set_payment(uuid, text),
  public.rider_accept(uuid), public.rider_release(uuid), public.partner_orders(date), public.partner_set_dispatch(uuid, text),
  public.partner_complete(uuid, int, text), public.partner_no_show(uuid), public.partner_paid_by_qr(uuid),
  public.admin_list_riders(), public.admin_add_rider(text, text, text, text), public.save_my_cart(text, text, jsonb),
  public.desk_mark_reminded(text) to authenticated;
-- Used only inside the functions above.
revoke execute on function public.check_my_order(uuid), public.orders_clear_cart() from public, anon, authenticated;

notify pgrst, 'reload schema';
