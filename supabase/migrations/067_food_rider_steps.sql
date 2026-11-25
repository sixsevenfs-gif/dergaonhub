-- Update 067: Jholzo Food rider steps, like the big food apps. After the restaurant confirms, the rider marks
-- "Going to the restaurant" → "At the restaurant" → "Picked up" (the food left the restaurant) → "At your door"
-- → "Delivered" on the rider page. The customer's app shows each step, and gets a notification for each one
-- (push-notify, update 065). The rider's name and number are kept on the order, so the customer can call them.
-- Run once in Supabase → SQL Editor, after 066. Safe to run again; nothing is deleted.

alter table public.food_orders
  add column if not exists rider_stage text not null default '',
  add column if not exists rider_name text not null default '',
  add column if not exists rider_phone text not null default '',
  add column if not exists to_restaurant_at timestamptz,
  add column if not exists at_restaurant_at timestamptz,
  add column if not exists arriving_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'food_orders_rider_stage') then
    alter table public.food_orders add constraint food_orders_rider_stage
      check (rider_stage in ('', 'to_restaurant', 'at_restaurant', 'arriving'));
  end if;
end $$;

-- The rider's name and number on an order (what the customer sees).
create or replace function public.food_set_rider(p_order_id uuid, p_rider uuid)
returns void
language sql security definer set search_path = public as $$
  update food_orders f set rider_id = p_rider,
    assigned_at = case when p_rider is null then null else coalesce(case when f.rider_id = p_rider then f.assigned_at end, now()) end,
    rider_name = coalesce((select btrim(r.name) from riders r where r.user_id = p_rider), ''),
    rider_phone = coalesce((select r.phone from riders r where r.user_id = p_rider and r.phone ~ '^[6-9][0-9]{9}$'), '')
  where f.id = p_order_id
$$;
revoke all on function public.food_set_rider(uuid, uuid) from public, anon, authenticated;

-- Desk: give the order to a rider (or take it back with null). A new rider starts the trip again.
create or replace function public.desk_food_assign(p_order_id uuid, p_rider uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  if p_rider is not null and not exists (select 1 from riders where user_id = p_rider and active) then
    raise exception 'Choose an active rider.';
  end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found or o.status in ('delivered', 'cancelled') then raise exception 'This order is already finished.'; end if;
  perform food_set_rider(o.id, p_rider);
  if o.rider_id is distinct from p_rider and o.status in ('placed', 'confirmed') then
    update food_orders set rider_stage = '', to_restaurant_at = null, at_restaurant_at = null where id = o.id;
  end if;
end
$$;
revoke all on function public.desk_food_assign(uuid, uuid) from public, anon;
grant execute on function public.desk_food_assign(uuid, uuid) to authenticated;

-- One step of the trip, by the rider (an order nobody has taken becomes theirs) or by the desk:
--   to_restaurant, at_restaurant (while the restaurant cooks), picked (status), arriving (at the door), delivered.
-- Pressing the same step twice does nothing.
create or replace function public.partner_food_step(p_order_id uuid, p_step text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
  v_desk boolean := is_desk();
begin
  if not (is_staff() or v_desk) then raise exception 'Delivery partners only.'; end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not (v_desk or is_admin() or o.rider_id = auth.uid() or o.rider_id is null) then
    raise exception 'This order is with another rider.';
  end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  -- The same step again (a double tap): nothing to do.
  if (p_step in ('to_restaurant', 'at_restaurant', 'arriving') and o.rider_stage = p_step)
     or (p_step = 'picked' and o.status = 'picked') or (p_step = 'delivered' and o.status = 'delivered') then
    return jsonb_build_object('status', o.status, 'stage', o.rider_stage);
  end if;
  -- A rider (not the desk) who moves an order takes it.
  if not v_desk and o.rider_id is null then perform food_set_rider(o.id, auth.uid()); end if;

  if p_step = 'to_restaurant' and o.status = 'confirmed' and o.rider_stage = '' then
    update food_orders set rider_stage = 'to_restaurant', to_restaurant_at = now() where id = o.id;
  elsif p_step = 'at_restaurant' and o.status = 'confirmed' and o.rider_stage in ('', 'to_restaurant') then
    update food_orders set rider_stage = 'at_restaurant', at_restaurant_at = now(),
      to_restaurant_at = coalesce(to_restaurant_at, now()) where id = o.id;
  elsif p_step = 'picked' and o.status = 'confirmed' then
    update food_orders set status = 'picked', picked_at = now(), rider_stage = '' where id = o.id;
  elsif p_step = 'arriving' and o.status = 'picked' and o.rider_stage = '' then
    update food_orders set rider_stage = 'arriving', arriving_at = now() where id = o.id;
  elsif p_step = 'delivered' and o.status in ('confirmed', 'picked') then
    update food_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      picked_at = coalesce(picked_at, now()) where id = o.id;
  else
    raise exception 'This order can''t be marked "%" now (it is %).', p_step,
      case when o.status = 'placed' then 'waiting for the restaurant to confirm' else o.status end;
  end if;
  select * into o from food_orders where id = p_order_id;
  return jsonb_build_object('status', o.status, 'stage', o.rider_stage);
end
$$;
revoke all on function public.partner_food_step(uuid, text) from public, anon;
grant execute on function public.partner_food_step(uuid, text) to authenticated;

-- The older two-button call (update 064) goes through the steps too.
create or replace function public.partner_food_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform partner_food_step(p_order_id, p_status);
end
$$;
revoke all on function public.partner_food_status(uuid, text) from public, anon;
grant execute on function public.partner_food_status(uuid, text) to authenticated;

-- Rider page: today's food trips (their own, and confirmed ones nobody has taken) with pickup and drop details,
-- the step times, how the restaurant is paid, and what the rider finished today.
create or replace function public.partner_food_orders()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or is_desk()) then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'no', o.order_number, 'status', o.status, 'stage', o.rider_stage, 'created_at', o.created_at,
      'confirmed_at', o.confirmed_at, 'to_restaurant_at', o.to_restaurant_at, 'at_restaurant_at', o.at_restaurant_at,
      'picked_at', o.picked_at, 'arriving_at', o.arriving_at, 'delivered_at', o.delivered_at,
      'restaurant', o.restaurant_name, 'pickup_address', coalesce(nullif(btrim(fr.address), ''), o.restaurant_address),
      'pickup_area', coalesce(fr.area, ''), 'pickup_phone', coalesce(nullif(fr.phone, ''), fr.whatsapp, ''),
      'pickup_map', coalesce(fr.maps_link, ''), 'pickup_lat', fr.lat, 'pickup_lng', fr.lng,
      'prep_minutes', fr.prep_minutes, 'pay_when', coalesce(fr.pay_when, ''), 'restaurant_upi', coalesce(fr.upi_id, ''),
      'name', o.customer_name, 'phone', o.customer_phone, 'address', o.address, 'area', o.area, 'lat', o.lat, 'lng', o.lng,
      'distance_km', o.distance_km, 'note', o.note, 'payment', o.payment_method, 'total', o.total,
      'menu_total', o.menu_total, 'packing_fee', o.packing_fee,
      'mine', o.rider_id = auth.uid(), 'rider_id', o.rider_id, 'rider_name', o.rider_name,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty, 'diet', i.diet) order by i.name), '[]')
                from food_order_items i where i.order_id = o.id)
    ) order by o.created_at), '[]')
    from food_orders o
    left join food_restaurants fr on fr.id = o.restaurant_id
    where o.created_at > now() - interval '20 hours'
      and ((o.status in ('confirmed', 'picked') and (is_admin() or is_desk() or o.rider_id = auth.uid() or o.rider_id is null))
           or (o.status = 'delivered' and o.rider_id = auth.uid()))
  );
end
$$;
revoke all on function public.partner_food_orders() from public, anon;
grant execute on function public.partner_food_orders() to authenticated;

-- Notifications (update 065) for each step of a food order as well.
create or replace function public.push_order_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' then
      v_kind := case when new.status = 'confirmed' then 'confirmed' end;   -- cash orders start confirmed (update 037)
    elsif new.status is distinct from old.status then
      v_kind := case new.status when 'confirmed' then 'confirmed' when 'completed' then 'delivered' when 'cancelled' then 'cancelled' end;
    elsif coalesce(new.dispatch, '') <> coalesce(old.dispatch, '') and coalesce(new.dispatch, '') in ('on_the_way', 'arriving') then
      v_kind := new.dispatch;
    end if;
  elsif tg_op = 'UPDATE' then
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
drop trigger if exists food_orders_push on public.food_orders;
create trigger food_orders_push after update of status, rider_stage on public.food_orders
  for each row execute function public.push_order_event();

notify pgrst, 'reload schema';

-- Check: today's food orders with their step.
select order_number, status, rider_stage, rider_name, to_restaurant_at, at_restaurant_at, picked_at, arriving_at, delivered_at
from public.food_orders where created_at > now() - interval '2 days' order by created_at desc limit 20;
