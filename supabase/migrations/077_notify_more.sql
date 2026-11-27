-- 077: more app notifications.
--  1. "Order received" as soon as an order is placed (grocery orders that wait for a payment check, and every food
--     order). The other steps were already sent: grocery confirmed / on the way / arriving / delivered / cancelled,
--     food confirmed (the rider called the restaurant) / picked up / delivered / cancelled. A rider taking an order
--     sends nothing. The words are in supabase/functions/push-notify/index.ts.
--  2. Notifications can go to "All customers": everyone logged in to the app with a customer account.
--  3. Jholzo Money to every customer at once (Admin → Jholzo Money → Give to all customers), owner only, with one
--     line in the activity log for the batch. The app notification for it is sent from the admin (a notification
--     to "All customers"), only when the owner ticks it.
-- Safe to run again; nothing is deleted.

/* ---------- 1. order received ---------- */

create or replace function public.push_order_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' then
      -- Cash orders start confirmed (update 037); the others are "received" until they are confirmed (update 077).
      v_kind := case new.status when 'confirmed' then 'confirmed' when 'placed' then 'placed' end;
    elsif new.status is distinct from old.status then
      v_kind := case new.status when 'confirmed' then 'confirmed' when 'completed' then 'delivered' when 'cancelled' then 'cancelled' end;
    elsif coalesce(new.dispatch, '') <> coalesce(old.dispatch, '') and coalesce(new.dispatch, '') in ('on_the_way', 'arriving') then
      v_kind := new.dispatch;
    end if;
  elsif tg_op = 'INSERT' then
    v_kind := case when new.status = 'placed' then 'placed' end;          -- update 077: "we got your order"
  else
    if new.status is distinct from old.status then
      v_kind := case new.status when 'confirmed' then 'confirmed' when 'picked' then 'picked' when 'delivered' then 'delivered' when 'cancelled' then 'cancelled' end;
    elsif new.rider_stage is distinct from old.rider_stage and new.rider_stage in ('to_restaurant', 'at_restaurant', 'arriving') then
      v_kind := new.rider_stage;
    end if;
  end if;
  if v_kind is null then return new; end if;
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('table', tg_table_name, 'id', new.id, 'kind', v_kind),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists food_orders_push_insert on public.food_orders;
create trigger food_orders_push_insert after insert on public.food_orders for each row execute function public.push_order_event();

/* ---------- 2. "All customers" ---------- */

alter table public.push_campaigns drop constraint if exists push_campaigns_audience_check;
alter table public.push_campaigns add constraint push_campaigns_audience_check
  check (audience in ('all', 'android', 'ios', 'grocery', 'food', 'customers', 'phones', 'maintenance'));

create or replace function public.push_campaign_targets(p_audience text, p_phones text[] default '{}')
returns table (token text, platform text, env text)
language sql stable security definer set search_path = public as $$
  select d.token, d.platform, d.env from device_tokens d
  where case p_audience
    when 'all' then true
    when 'android' then d.platform = 'android'
    when 'ios' then d.platform = 'ios'
    when 'grocery' then d.phone <> '' and exists (select 1 from orders o where o.status <> 'cancelled'
                         and (o.customer_phone = d.phone or o.ordered_by_phone = d.phone))
    when 'food' then d.phone <> '' and exists (select 1 from food_orders f where f.status <> 'cancelled' and f.customer_phone = d.phone)
    -- Update 077: everyone logged in with a customer account (all customers, whether they ordered or not).
    when 'customers' then d.phone <> '' and exists (select 1 from customers c where c.phone = d.phone and not c.blocked)
    when 'phones' then d.phone <> '' and d.phone = any (p_phones)
    -- Update 071: the app logins ("u:<id>") and numbers that opened the app during a maintenance.
    when 'maintenance' then (d.user_id is not null and ('u:' || d.user_id::text) = any (p_phones)) or (d.phone <> '' and d.phone = any (p_phones))
    else false
  end
$$;
revoke all on function public.push_campaign_targets(text, text[]) from public, anon, authenticated;

/* ---------- 3. Jholzo Money to every customer ---------- */

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
  -- Update 077: a batch (Jholzo Money to every customer) writes one line of its own instead of one per row.
  if current_setting('jholzo.quiet_log', true) = 'on' then return null; end if;
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

create or replace function public.admin_gift_add_all(p_amount numeric, p_min_order int, p_expires_at timestamptz, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_who jsonb;
  v_n int;
  v_note text := left(coalesce(trim(p_note), ''), 120);
begin
  if not is_admin() then raise exception 'Only the owner can give Jholzo Money.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter how much Jholzo Money to give.'; end if;
  if p_amount > 1000 then raise exception 'That is too much to give everyone (₹1,000 each at most).'; end if;
  if p_min_order is null or p_min_order < 0 then raise exception 'Enter the order amount needed (0 for any order).'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Choose a date and time in the future.'; end if;
  v_who := activity_actor();
  perform set_config('jholzo.quiet_log', 'on', true);
  insert into wallet_gifts (customer_id, amount, min_order, expires_at, note)
  select c.id, round(p_amount, 2), p_min_order, p_expires_at, v_note from customers c where not c.blocked;
  get diagnostics v_n = row_count;
  perform set_config('jholzo.quiet_log', 'off', true);
  if v_n > 0 then
    insert into admin_activity (actor_id, actor_role, actor_name, area, entity, entity_id, label, action, changes)
    values (auth.uid(), coalesce(v_who ->> 'role', 'owner'), coalesce(v_who ->> 'name', ''), 'money', 'wallet_gifts', '',
            'Jholzo Money to ' || v_n || case when v_n = 1 then ' customer' else ' customers' end, 'bulk_gift',
            jsonb_build_object('count', v_n, 'amount', round(p_amount, 2), 'total', round(p_amount, 2) * v_n,
                               'min_order', p_min_order, 'expires_at', p_expires_at, 'note', v_note));
  end if;
  return jsonb_build_object('customers', v_n, 'total', round(p_amount, 2) * v_n);
end
$$;
revoke execute on function public.admin_gift_add_all(numeric, int, timestamptz, text) from public, anon;
grant execute on function public.admin_gift_add_all(numeric, int, timestamptz, text) to authenticated;

-- How many customers "Give to all customers" reaches (owner only).
create or replace function public.admin_customer_count() returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  return (select count(*) from customers where not blocked);
end
$$;
revoke execute on function public.admin_customer_count() from public, anon;
grant execute on function public.admin_customer_count() to authenticated;

notify pgrst, 'reload schema';

select (select count(*) from public.customers where not blocked) as customers,
       (select count(*) from public.device_tokens where phone <> '') as phones_logged_in;
