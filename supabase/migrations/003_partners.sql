-- Update 003: delivery partners (riders) and WhatsApp messages to customers.
-- Run once in Supabase → SQL Editor (after 002). Safe to run again; nothing is deleted.
--
-- Rider (delivery partner): email + password login listed in the riders table. On /partner a rider
-- sees the orders of a day (name, phone, address, items), marks "On the way", "Arriving" and
-- "Delivered", and sends the customer a WhatsApp message. A rider cannot see customers, money
-- reports, settings or products, and cannot change prices or totals.

/* ---------------- riders ---------------- */

create table if not exists public.riders (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_rider() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from riders where user_id = auth.uid() and active)
$$;

-- Admin or an active rider.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_rider()
$$;

alter table public.riders enable row level security;
drop policy if exists "admin manages riders" on public.riders;
create policy "admin manages riders" on public.riders for all using (is_admin()) with check (is_admin());
drop policy if exists "rider reads self" on public.riders;
create policy "rider reads self" on public.riders for select using (user_id = auth.uid());

/* ---------------- delivery progress on orders ---------------- */

-- dispatch: '' (not left yet), 'on_the_way' (rider has left), 'arriving' (next stop, about to arrive)
alter table public.orders
  add column if not exists dispatch text not null default '',
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_by uuid references auth.users on delete set null;
do $$ begin
  alter table public.orders add constraint orders_dispatch_check check (dispatch in ('', 'on_the_way', 'arriving'));
exception when duplicate_object then null;
end $$;

-- Turned on by the admin once the WhatsApp Cloud API is connected (see supabase/README.md).
alter table public.store_settings add column if not exists whatsapp_auto boolean not null default false;

/* ---------------- WhatsApp messages sent to customers ---------------- */

-- channel: 'auto' = sent by the notify-whatsapp Edge Function, 'tap' = sent by hand from WhatsApp.
create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  kind text not null check (kind in ('placed', 'on_the_way', 'arriving', 'delivered')),
  channel text not null check (channel in ('auto', 'tap')),
  ok boolean not null default true,
  error text not null default '',
  sent_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_messages_order_idx on public.order_messages (order_id);

alter table public.order_messages enable row level security;
drop policy if exists "staff reads messages" on public.order_messages;
create policy "staff reads messages" on public.order_messages for select using (is_staff());
-- Written only by log_order_message() and by the Edge Function (service role).

/* ---------------- partner functions ---------------- */

-- One day's orders for the delivery run, with items and the messages already sent.
create or replace function public.partner_orders(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(
      (to_jsonb(o) - array['placed_by', 'customer_id']) || jsonb_build_object(
        'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name_snapshot), '[]') from order_items i where i.order_id = o.id),
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'channel', m.channel, 'ok', m.ok, 'at', m.created_at) order by m.created_at), '[]')
                     from order_messages m where m.order_id = o.id)
      ) order by o.area, o.created_at), '[]')
    from orders o
    where o.delivery_date = p_date and o.status <> 'cancelled'
  );
end
$$;

create or replace function public.partner_set_dispatch(p_order_id uuid, p_dispatch text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_dispatch not in ('', 'on_the_way', 'arriving') then raise exception 'Unknown delivery step.'; end if;
  update orders set dispatch = p_dispatch, dispatched_at = case when p_dispatch = '' then null else now() end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can go out for delivery.'; end if;
end
$$;

-- Delivered and paid. Cash is what the rider actually collected (UPI orders: 0).
create or replace function public.partner_complete(p_order_id uuid, p_cash int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(),
    cash_collected = case when payment_method = 'cash' then greatest(coalesce(p_cash, total), 0) else 0 end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

-- Undo "Delivered" (tapped by mistake). A rider can only undo their own.
create or replace function public.partner_undo_delivered(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set status = 'confirmed', completed_at = null, cash_collected = 0, delivered_by = null
  where id = p_order_id and status = 'completed' and (is_admin() or delivered_by = auth.uid());
  if not found then raise exception 'This delivery cannot be undone.'; end if;
end
$$;

-- A message sent by hand (WhatsApp opened with the text ready).
create or replace function public.log_order_message(p_order_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  insert into order_messages (order_id, kind, channel) values (p_order_id, p_kind, 'tap');
end
$$;

-- Admin: riders with their login email.
create or replace function public.admin_list_riders() returns table (user_id uuid, email text, name text, phone text, active boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, u.email::text, r.name, r.phone, r.active
  from riders r join auth.users u on u.id = r.user_id
  where is_admin()
  order by r.active desc, r.name
$$;

-- Admin: make an existing login (Supabase → Authentication → Users) a rider.
create or replace function public.admin_add_rider(p_email text, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No login with this email yet. First create it in Supabase → Authentication → Users → Add user.';
  end if;
  insert into riders (user_id, name, phone) values (v_id, trim(p_name), coalesce(trim(p_phone), ''))
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, active = true;
end
$$;

revoke execute on function public.partner_orders(date), public.partner_set_dispatch(uuid, text), public.partner_complete(uuid, int),
  public.partner_undo_delivered(uuid), public.log_order_message(uuid, text), public.admin_list_riders(),
  public.admin_add_rider(text, text, text) from public, anon;
grant execute on function public.is_rider(), public.is_staff() to anon, authenticated;
grant execute on function public.partner_orders(date), public.partner_set_dispatch(uuid, text), public.partner_complete(uuid, int),
  public.partner_undo_delivered(uuid), public.log_order_message(uuid, text), public.admin_list_riders(),
  public.admin_add_rider(text, text, text) to authenticated;
