-- 072: The activity log (who changed what, and when), money to give back on orders paid online, and customer
-- profiles for the dashboard.
--
-- · Activity log: every change the team makes (owner, executives, riders, price collectors) to orders, products,
--   menus, restaurants, settings, coupons, banners, notifications, Jholzo Money and the team is written down with
--   who did it and when. Customers' own actions, the apps and the automatic jobs are not. Only the owner reads it
--   (admin_activity_list); nobody can change or delete it from the website or the apps.
-- · Refunds: an order paid online (UPI) that is then cancelled, or made cheaper after paying (an item taken off,
--   the express charge not taken), owes the customer money. orders.paid_amount remembers what was paid,
--   admin_refunds() lists what is still to give back and admin_order_refund() records it: by UPI, in cash, or as
--   Jholzo Money (added to the customer's balance at once).
-- · Customers: admin_customers() lists everyone with their numbers counted in the database (grocery and food orders,
--   money, last order), admin_customer() is one customer's whole picture: orders, Jholzo Money, help requests,
--   addresses and the phones the app is on.
--
-- Safe to run again.

/* ---------------- activity log ---------------- */

create table if not exists public.admin_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text not null default '',     -- owner | executive | rider | collector
  actor_name text not null default '',
  area text not null default '',           -- orders | catalog | customers | money | settings | team
  entity text not null,                    -- the table
  entity_id text not null default '',
  label text not null default '',          -- order number, product, customer, restaurant…
  action text not null,                    -- insert | update | delete | bulk_delete
  changes jsonb not null default '{}'      -- update: {column: [before, after]}; insert/delete: {column: value}
);
create index if not exists admin_activity_actor on public.admin_activity (actor_id, id desc);
create index if not exists admin_activity_area on public.admin_activity (area, id desc);
alter table public.admin_activity enable row level security;
-- No policies on purpose: written only by the triggers below, read only through admin_activity_list() (owner).
revoke all on public.admin_activity from anon, authenticated;

-- Who is making this change: the owner or an active team member. Null for customers, the apps and jobs.
create or replace function public.activity_actor() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.admins a where a.user_id = auth.uid()) then
      jsonb_build_object('role', 'owner', 'name', coalesce(
        (select nullif(trim(r.name), '') from public.riders r where r.user_id = auth.uid()),
        (select nullif(trim(u.raw_user_meta_data ->> 'name'), '') from auth.users u where u.id = auth.uid()),
        'Owner'))
    else (select jsonb_build_object('role', r.role, 'name', coalesce(nullif(trim(r.name), ''), nullif(r.phone, ''), r.role))
          from public.riders r where r.user_id = auth.uid() and r.active)
  end
$$;

-- Long text and big lists are cut, so the log stays small.
create or replace function public.activity_short(v jsonb) returns jsonb
language sql immutable as $$
  select case
    when v is null then 'null'::jsonb
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160 then to_jsonb(left(v #>> '{}', 157) || '…')
    when jsonb_typeof(v) in ('array', 'object') and length(v::text) > 300 then to_jsonb('(' || jsonb_typeof(v) || ' changed)')
    else v
  end
$$;

-- The name people know a row by: order number, product, customer, restaurant…
create or replace function public.activity_label(p_table text, r jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  case p_table
    when 'orders', 'food_orders' then v := r ->> 'order_number';
    when 'order_removed_items' then
      v := coalesce((select o.order_number from orders o where o.id = (r ->> 'order_id')::uuid), '') || ' · ' || coalesce(r ->> 'name_snapshot', '');
    when 'products' then v := trim(coalesce(r ->> 'name', '') || ' ' || coalesce(r ->> 'size', ''));
    when 'customers' then v := coalesce(nullif(r ->> 'name', ''), 'Customer') || ' · ' || coalesce(r ->> 'phone', '');
    when 'wallet_entries', 'wallet_gifts' then
      v := (select coalesce(nullif(c.name, ''), 'Customer') || ' · ' || c.phone from customers c where c.id = (r ->> 'customer_id')::uuid);
    when 'riders' then v := coalesce(nullif(r ->> 'name', ''), r ->> 'phone');
    when 'admins' then v := 'Owner login';
    when 'rider_returns' then
      v := coalesce((select coalesce(nullif(x.name, ''), x.phone) from riders x where x.user_id = (r ->> 'rider_id')::uuid), 'Rider')
           || ' · ' || coalesce(r ->> 'day', '');
    when 'complaints' then v := coalesce(nullif(r ->> 'order_number', ''), r ->> 'customer_name');
    when 'support_tickets' then v := r ->> 'ticket_number';
    when 'food_payouts' then v := (select f.name from food_restaurants f where f.id = (r ->> 'restaurant_id')::uuid);
    when 'food_coupons' then v := r ->> 'code';
    when 'food_restaurants' then v := r ->> 'name';
    when 'food_menu_items' then
      v := coalesce((select f.name from food_restaurants f where f.id = (r ->> 'restaurant_id')::uuid), '') || ' · ' || coalesce(r ->> 'name', '');
    when 'app_banners' then v := coalesce(nullif(r ->> 'title', ''), initcap(coalesce(r ->> 'place', '')) || ' banner');
    when 'push_campaigns' then v := r ->> 'title';
    when 'categories' then v := r ->> 'name';
    when 'store_settings' then v := 'Settings';
    when 'private_settings' then v := 'Owner settings';
    else v := coalesce(r ->> 'name', r ->> 'title', r ->> 'id');
  end case;
  return left(coalesce(v, ''), 200);
end
$$;

-- One trigger function for every watched table. Arguments: area, the columns to watch (comma list; '' = all but
-- the timestamps), and the columns whose values are never written, only that they changed (comma list).
create or replace function public.activity_log_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who jsonb;
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_watch text[];
  v_hide text[] := '{}';
  v_changes jsonb := '{}';
  v_keys text[];
  k text;
begin
  v_who := activity_actor();
  if v_who is null then return null; end if;     -- customers, the apps, jobs: not the team's doing
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  if tg_nargs > 1 and tg_argv[1] <> '' then v_watch := string_to_array(tg_argv[1], ','); end if;
  if tg_nargs > 2 and tg_argv[2] <> '' then v_hide := string_to_array(tg_argv[2], ','); end if;
  -- A grocery order's total is shown when it is placed; later it only moves with an item taken off (its own line)
  -- or the express charge dropped (express_waived).
  if tg_table_name = 'orders' and tg_op = 'UPDATE' then v_watch := array_remove(v_watch, 'total'); end if;

  -- Jholzo Money: only what the owner adds or takes back by hand. Refunds as Jholzo Money show on the order.
  if tg_table_name = 'wallet_entries' and (v_row ->> 'kind' is distinct from 'admin' or v_row ->> 'order_id' is not null) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if v_watch is not null then
        continue when not (k = any(v_watch));
      else
        continue when k in ('updated_at', 'created_at', 'otp_failures', 'otp_failed_at')
          or k like '%\_seeded' or k like 'tg\_%' or k like 'wa\_%';
      end if;
      if (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k,
          case when k = any(v_hide) then '["•••", "•••"]'::jsonb
               else jsonb_build_array(activity_short(v_old -> k), activity_short(v_new -> k)) end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
    if tg_table_name = 'orders' then
      select array_agg(x) into v_keys from jsonb_object_keys(v_changes) x;
      -- Missed evenings moving on (carry_missed_orders) and orders the clock cancels ("Not paid in time",
      -- "Expired") run in whichever dashboard is open: not that person's doing.
      if v_keys <@ array['delivery_date', 'delayed_from'] and v_new ->> 'delayed_from' is not null then return null; end if;
      if v_new ->> 'status' = 'cancelled' and v_old ->> 'status' is distinct from 'cancelled'
         and v_new ->> 'cancel_reason' in ('Not paid in time', 'Expired') then
        return null;
      end if;
    end if;
  else
    for k in select jsonb_object_keys(v_row) loop
      continue when v_watch is not null and not (k = any(v_watch));
      continue when k = any(v_hide) or k in ('id', 'created_at', 'updated_at');
      continue when jsonb_typeof(v_row -> k) = 'null' or (v_row -> k) in ('""'::jsonb, '[]'::jsonb, '{}'::jsonb);
      v_changes := v_changes || jsonb_build_object(k, activity_short(v_row -> k));
    end loop;
  end if;

  insert into admin_activity (actor_id, actor_role, actor_name, area, entity, entity_id, label, action, changes)
  values (auth.uid(), v_who ->> 'role', coalesce(v_who ->> 'name', ''), coalesce(tg_argv[0], ''), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'user_id', ''), activity_label(tg_table_name, v_row), lower(tg_op), v_changes);
  return null;
exception when others then
  return null;   -- the log never stops the real change
end
$$;

-- "Delete orders" (admin_delete_orders) keeps a copy of each in deleted_orders: one line for the whole batch.
create or replace function public.activity_log_deleted_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who jsonb := activity_actor();
  v_n int;
  v_first text;
  v_last text;
  v_total numeric;
begin
  if v_who is null then return null; end if;
  select count(*), min(order_number), max(order_number), coalesce(sum(total), 0) into v_n, v_first, v_last, v_total from gone;
  if v_n = 0 then return null; end if;
  insert into admin_activity (actor_id, actor_role, actor_name, area, entity, entity_id, label, action, changes)
  values (auth.uid(), v_who ->> 'role', coalesce(v_who ->> 'name', ''), 'orders', 'orders', '',
          v_n || case when v_n = 1 then ' order' else ' orders' end, 'bulk_delete',
          jsonb_build_object('count', v_n, 'first', v_first, 'last', v_last, 'total', v_total));
  return null;
exception when others then
  return null;
end
$$;

revoke execute on function public.activity_actor(), public.activity_short(jsonb), public.activity_label(text, jsonb),
  public.activity_log_row(), public.activity_log_deleted_orders() from public, anon, authenticated;

/* ---------------- refunds on orders paid online ---------------- */

alter table public.orders
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists refunded_amount numeric not null default 0,
  add column if not exists refund_how text not null default '',
  add column if not exists refund_note text not null default '',
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references auth.users on delete set null;

-- What was paid, from the moment the payment is marked paid (the total then). Undoing the payment clears it.
create or replace function public.orders_paid_amount() returns trigger
language plpgsql as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_amount := coalesce(new.total, 0);
  elsif new.payment_status is distinct from 'paid' and old.payment_status = 'paid' then
    new.paid_amount := 0;
  end if;
  return new;
end
$$;
drop trigger if exists orders_paid_amount on public.orders;
create trigger orders_paid_amount before update of payment_status on public.orders
  for each row execute function public.orders_paid_amount();

-- Orders already paid: their total now (an item taken off before today can't be told apart any more).
update public.orders set paid_amount = coalesce(total, 0) where payment_status = 'paid' and paid_amount = 0;

-- Still to give back: all of it when cancelled, else what the order went down by after paying.
create or replace function public.order_refund_due(o public.orders) returns numeric
language sql immutable as $$
  select case when o.payment_status = 'paid' and coalesce(o.paid_amount, 0) > 0
              then greatest(0, o.paid_amount - case when o.status = 'cancelled' then 0 else coalesce(o.total, 0) end
                                - coalesce(o.refunded_amount, 0))
              else 0 end
$$;

create index if not exists orders_paid_idx on public.orders (created_at) where payment_status = 'paid';
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_orderer_idx on public.orders (orderer_id) where orderer_id is not null;
create index if not exists complaints_phone_idx on public.complaints (customer_phone);

-- Owner: what to give back, and the last 30 refunds made.
create or replace function public.admin_refunds() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can see refunds.'; end if;
  return jsonb_build_object(
    'due', (select coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status,
              'customer_name', o.customer_name, 'customer_phone', o.customer_phone, 'paid_amount', o.paid_amount,
              'total', o.total, 'refunded_amount', o.refunded_amount, 'due', order_refund_due(o), 'upi_ref', o.upi_ref,
              'paid_at', o.paid_at, 'cancel_reason', o.cancel_reason,
              'has_account', coalesce(o.orderer_id, o.customer_id) is not null) order by o.created_at), '[]')
            from orders o where o.payment_status = 'paid' and order_refund_due(o) > 0),
    'done', (select coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
              'amount', o.refunded_amount, 'how', o.refund_how, 'note', o.refund_note, 'at', o.refunded_at)
              order by o.refunded_at desc), '[]')
             from (select * from orders where refunded_at is not null order by refunded_at desc limit 30) o)
  );
end
$$;

-- Owner: the money went back. As Jholzo Money it is added to the customer's balance now (kind "admin", so the
-- automatic money-back of a cancelled order, which looks for kind "refund", is never skipped because of it).
create or replace function public.admin_order_refund(p_order_id uuid, p_how text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_due numeric;
  v_customer uuid;
begin
  if not is_admin() then raise exception 'Only the owner can record refunds.'; end if;
  if p_how is null or p_how not in ('upi', 'cash', 'wallet') then raise exception 'Choose how the money went back.'; end if;
  select * into o from orders where id = p_order_id for update;
  if o.id is null then raise exception 'Order not found.'; end if;
  v_due := order_refund_due(o);
  if v_due <= 0 then raise exception 'Nothing is left to give back on this order.'; end if;
  if p_how = 'wallet' then
    v_customer := coalesce(o.orderer_id, o.customer_id);
    if v_customer is null then raise exception 'This order has no customer account for Jholzo Money. Give it back by UPI or cash.'; end if;
    insert into wallet_entries (customer_id, amount, kind, order_id, note)
    values (v_customer, v_due, 'admin', o.id, 'Money back for order ' || o.order_number);
  end if;
  update orders set refunded_amount = coalesce(refunded_amount, 0) + v_due, refund_how = p_how,
    refund_note = left(trim(coalesce(p_note, '')), 300), refunded_at = now(), refunded_by = auth.uid()
  where id = o.id;
  return jsonb_build_object('amount', v_due, 'how', p_how);
end
$$;

/* ---------------- customers ---------------- */

-- Everyone, with their numbers counted here (the website no longer adds up every order itself).
create or replace function public.admin_customers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Only the Jholzo team can see customers.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'phone', c.phone, 'name', c.name, 'blocked', c.blocked, 'no_show_count', c.no_show_count,
      'cancel_count', c.cancel_count, 'created_at', c.created_at, 'referral_code', c.referral_code, 'referred_by', c.referred_by,
      'referred_by_name', coalesce((select nullif(x.name, '') from customers x where x.id = c.referred_by), ''),
      'orders', g.orders, 'completed', g.completed, 'spent', g.spent,
      'food_orders', f.orders, 'food_delivered', f.delivered, 'food_spent', f.spent,
      'last_order_at', greatest(g.last_at, f.last_at),
      'wallet', wallet_balance(c.id) + gift_balance(c.id),
      'app', (select i.platform from app_installs i where i.phone = c.phone and i.phone <> '' and not i.is_test
              order by i.last_seen_at desc limit 1)
    ) order by c.no_show_count desc, c.name), '[]')
    from customers c
    cross join lateral (select count(*) as orders, count(*) filter (where o.status = 'completed') as completed,
                               coalesce(sum(o.total) filter (where o.status = 'completed'), 0) as spent, max(o.created_at) as last_at
                        from orders o where o.customer_id = c.id) g
    cross join lateral (select count(*) as orders, count(*) filter (where fo.status = 'delivered') as delivered,
                               coalesce(sum(fo.total) filter (where fo.status = 'delivered'), 0) as spent, max(fo.created_at) as last_at
                        from food_orders fo where fo.customer_phone = c.phone) f
  );
end
$$;

-- One customer's whole picture (owner and executive). Null when there is no such customer.
create or replace function public.admin_customer(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c customers;
begin
  if not is_desk() then raise exception 'Only the Jholzo team can see customers.'; end if;
  select * into c from customers where id = p_id;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'customer', to_jsonb(c) || jsonb_build_object(
      'referred_by_name', (select coalesce(nullif(x.name, ''), x.phone) from customers x where x.id = c.referred_by),
      'invited', (select count(*) from customers x where x.referred_by = c.id)),
    'wallet', jsonb_build_object(
      'general', wallet_balance(c.id), 'gifts', gift_balance(c.id),
      'entries', (select coalesce(jsonb_agg(jsonb_build_object('amount', e.amount, 'kind', e.kind, 'note', e.note, 'created_at', e.created_at,
                    'order_number', (select o.order_number from orders o where o.id = e.order_id)) order by e.created_at desc), '[]')
                  from (select * from wallet_entries w where w.customer_id = c.id order by w.created_at desc limit 30) e)),
    'grocery', (select jsonb_build_object('orders', count(*), 'completed', count(*) filter (where o.status = 'completed'),
                  'cancelled', count(*) filter (where o.status = 'cancelled'),
                  'spent', coalesce(sum(o.total) filter (where o.status = 'completed'), 0),
                  'first_at', min(o.created_at), 'last_at', max(o.created_at))
                from orders o where o.customer_id = c.id),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
                 'delivery_date', o.delivery_date, 'status', o.status, 'dispatch', o.dispatch, 'total', o.total,
                 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                 'items', (select count(*) from order_items i where i.order_id = o.id), 'refund_due', order_refund_due(o),
                 'for_someone', o.customer_id is distinct from c.id) order by o.created_at desc), '[]')
               from (select * from orders x where x.customer_id = c.id or x.orderer_id = c.id order by x.created_at desc limit 50) o),
    'food', (select jsonb_build_object('orders', count(*), 'delivered', count(*) filter (where f.status = 'delivered'),
               'cancelled', count(*) filter (where f.status = 'cancelled'),
               'spent', coalesce(sum(f.total) filter (where f.status = 'delivered'), 0))
             from food_orders f where f.customer_phone = c.phone),
    'food_orders', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'order_number', f.order_number, 'created_at', f.created_at,
                      'status', f.status, 'total', f.total, 'restaurant_name', f.restaurant_name, 'payment_method', f.payment_method)
                      order by f.created_at desc), '[]')
                    from (select * from food_orders x where x.customer_phone = c.phone order by x.created_at desc limit 50) f),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'ticket_number', t.ticket_number, 'created_at', t.created_at,
                  'status', t.status, 'topic', t.topic, 'kind', t.kind, 'order_number', t.order_number, 'refund_amount', t.refund_amount)
                  order by t.created_at desc), '[]')
                from (select * from support_tickets x where x.customer_phone = c.phone order by x.created_at desc limit 20) t),
    'complaints', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'order_number', x.order_number, 'type', x.type,
                     'status', x.status, 'created_at', x.created_at, 'message', left(x.message, 200)) order by x.created_at desc), '[]')
                   from (select * from complaints y where y.customer_phone = c.phone order by y.created_at desc limit 20) x),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object('platform', i.platform, 'device_model', i.device_model,
                 'app_version', i.app_version, 'os_version', i.os_version, 'logged_in', i.logged_in, 'opens', i.opens,
                 'first_seen_at', i.first_seen_at, 'last_seen_at', i.last_seen_at) order by i.last_seen_at desc), '[]')
               from app_installs i where i.phone = c.phone and i.phone <> '' and not i.is_test),
    'addresses', (select coalesce(jsonb_agg(jsonb_build_object('address', a.address, 'area', a.area, 'times', a.n, 'last_at', a.last_at)
                    order by a.last_at desc), '[]')
                  from (select o.address, o.area, count(*) as n, max(o.created_at) as last_at from orders o
                        where o.customer_id = c.id and o.address <> '' group by o.address, o.area
                        order by max(o.created_at) desc limit 5) a),
    'signup', (select to_jsonb(s) from signups s where s.phone = c.phone)
  );
end
$$;

/* ---------------- the owner's view of the log ---------------- */

-- Newest first, 100 at a time (p_before: the last id already shown). Also the names behind the ids in the changes
-- (team, restaurants, categories) and everyone who appears in the log, for the person filter.
create or replace function public.admin_activity_list(p_before bigint default null, p_limit int default 100,
  p_actor uuid default null, p_area text default null, p_q text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  if not is_admin() then raise exception 'Only the owner can see the activity log.'; end if;
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc), '[]')
             from (select * from admin_activity x
                   where (p_before is null or x.id < p_before)
                     and (p_actor is null or x.actor_id = p_actor)
                     and (coalesce(p_area, '') = '' or x.area = p_area)
                     and (coalesce(trim(p_q), '') = '' or x.label ilike '%' || trim(p_q) || '%')
                   order by x.id desc limit v_limit) a),
    'people', (select coalesce(jsonb_object_agg(p.id, p.name), '{}')
               from (select r.user_id::text as id, coalesce(nullif(trim(r.name), ''), nullif(r.phone, ''), r.role) as name from riders r
                     union all
                     select a.user_id::text, 'Owner' from admins a where not exists (select 1 from riders r where r.user_id = a.user_id)) p),
    'restaurants', (select coalesce(jsonb_object_agg(f.id::text, f.name), '{}') from food_restaurants f),
    'categories', (select coalesce(jsonb_object_agg(c.id, c.name), '{}') from categories c),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', t.actor_id, 'name', t.actor_name, 'role', t.actor_role, 'n', t.n)
               order by t.last desc), '[]')
             from (select x.actor_id, (array_agg(x.actor_name order by x.id desc))[1] as actor_name,
                          (array_agg(x.actor_role order by x.id desc))[1] as actor_role, count(*) as n, max(x.id) as last
                   from admin_activity x group by x.actor_id) t)
  );
end
$$;

/* ---------------- the watched tables ---------------- */

do $$
declare
  t record;
begin
  for t in select * from (values
    -- table, area, events, watched columns ('' = all but the timestamps), hidden values
    ('orders', 'orders', 'insert or update',
       'status,cancel_reason,payment_status,payment_method,rider_id,dispatch,delivery_date,cash_collected,express_waived,refunded_amount,refund_how,refund_note,customer_name,customer_phone,address,note,total', ''),
    ('order_removed_items', 'orders', 'insert', 'name_snapshot,quantity,line_total,reason', ''),
    ('food_orders', 'orders', 'insert or update', 'status,cancel_reason,rider_id,payment_method,total,restaurant_name,customer_name', ''),
    ('products', 'catalog', 'insert or update or delete',
       'name,size,price,compare_price,available,status,category_id,featured,featured_rank,photo_url,photos,description,food_addon,keywords', ''),
    ('categories', 'catalog', 'insert or update or delete', '', ''),
    ('food_restaurants', 'catalog', 'insert or update or delete', '', ''),
    ('food_menu_items', 'catalog', 'insert or update or delete', 'section,name,description,diet,price,variants,photo,available,bestseller', ''),
    ('customers', 'customers', 'update', 'blocked,no_show_count,name,phone', ''),
    ('complaints', 'customers', 'update', 'status,admin_note', ''),
    ('support_tickets', 'customers', 'update', 'status,priority,resolution,refund_amount,refund_how', ''),
    ('wallet_entries', 'money', 'insert', 'amount,note', ''),
    ('wallet_gifts', 'money', 'insert or update', 'amount,min_order,expires_at,note,cancelled_at', ''),
    ('food_payouts', 'money', 'insert or delete', 'amount,note', ''),
    ('rider_returns', 'money', 'insert or update', 'amount,method,day,confirmed_at', ''),
    ('food_coupons', 'settings', 'insert or update or delete', '', ''),
    ('store_settings', 'settings', 'update', '', ''),
    ('private_settings', 'settings', 'update', '', ''),
    ('app_banners', 'settings', 'insert or update or delete', '', ''),
    ('push_campaigns', 'settings', 'insert', 'title,body,audience,link,image', ''),
    ('riders', 'team', 'insert or update or delete', 'name,phone,active,role', ''),
    ('admins', 'team', 'insert or delete', 'user_id', '')
  ) as v(tbl, area, events, watch, hide) loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t.tbl || '_activity', t.tbl);
    execute format('create trigger %I after %s on public.%I for each row execute function public.activity_log_row(%L, %L, %L)',
                   t.tbl || '_activity', t.events, t.tbl, t.area, t.watch, t.hide);
  end loop;
end
$$;

drop trigger if exists deleted_orders_activity on public.deleted_orders;
create trigger deleted_orders_activity after insert on public.deleted_orders
  referencing new table as gone for each statement execute function public.activity_log_deleted_orders();

/* ---------------- who may call what ---------------- */

revoke execute on function public.orders_paid_amount(), public.order_refund_due(public.orders) from public, anon, authenticated;
revoke execute on function public.admin_refunds(), public.admin_order_refund(uuid, text, text), public.admin_customers(),
  public.admin_customer(uuid), public.admin_activity_list(bigint, int, uuid, text, text) from public, anon;
grant execute on function public.admin_refunds(), public.admin_order_refund(uuid, text, text), public.admin_customers(),
  public.admin_customer(uuid), public.admin_activity_list(bigint, int, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
