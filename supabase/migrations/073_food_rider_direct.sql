-- 073: Food orders go straight to the riders, with no confirming in the admin first.
--
-- A new food order rings every rider's phone (the Jholzo Partner app), like a phone call. The rider who takes it:
--   1. calls the restaurant and taps "Restaurant has the order" (the customer sees "being prepared"),
--   2. leaves for the restaurant some minutes later (Admin → Food settings, 10 by default; the app shows the time),
--   3. pays the restaurant there when it is paid at pickup, and taps "Picked up",
--   4. delivers and taps "Delivered".
-- Before step 1 the rider can give the order back (it rings the others again), or report that the restaurant
-- can't make it (the order is cancelled and the owner gets the usual Telegram message).
-- The desk can still confirm, give an order to a rider or cancel it (Admin → Food orders), as before.
-- What riders pay restaurants at pickup now counts in Admin → Food → Payouts.
--
-- Run after 072. Safe to run again; nothing is deleted.

alter table public.store_settings add column if not exists food_leave_minutes int not null default 10;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_food_leave_ok') then
    alter table public.store_settings add constraint store_settings_food_leave_ok check (food_leave_minutes between 0 and 60);
  end if;
end $$;

alter table public.food_orders
  add column if not exists leave_at timestamptz,                         -- when the rider should leave for the restaurant
  add column if not exists restaurant_paid numeric not null default 0,   -- paid to the restaurant at pickup by the rider
  add column if not exists restaurant_paid_at timestamptz;

-- The rider pays at pickup when the restaurant is paid that way (Food Desk → deal → "at pickup").
create or replace function public.food_paid_at_pickup(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select pay_when = 'pickup' from food_restaurants where id = p_restaurant), false)
$$;
revoke all on function public.food_paid_at_pickup(uuid) from public, anon, authenticated;

/* ---------------- the rider ---------------- */

-- Take a new order. Only one rider gets it: the others are told who took it.
create or replace function public.partner_food_take(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This order is already %.', o.status; end if;
  if o.rider_id is not null and o.rider_id <> auth.uid() then
    raise exception '% has already taken this order.', coalesce(nullif(btrim(o.rider_name), ''), 'Another rider');
  end if;
  if o.rider_id is null then perform food_set_rider(o.id, auth.uid()); end if;
  select * into o from food_orders where id = p_order_id;
  return jsonb_build_object('status', o.status, 'rider_name', o.rider_name);
end
$$;

-- One step of a trip: take, confirmed (the restaurant has the order), picked, delivered; or before the
-- restaurant has it: release (give it back) and restaurant_no (the restaurant can't make it: cancelled).
-- The older steps (to_restaurant, at_restaurant, arriving) of rider pages before this update still work.
create or replace function public.partner_food_step(p_order_id uuid, p_step text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
  v_desk boolean := is_desk();
  v_leave int := coalesce((select food_leave_minutes from store_settings where id = 1), 10);
  v_pay boolean;
begin
  if not (is_staff() or v_desk) then raise exception 'Delivery partners only.'; end if;
  if p_step = 'take' then return partner_food_take(p_order_id); end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not (v_desk or o.rider_id = auth.uid() or o.rider_id is null) then
    raise exception '% has this order.', coalesce(nullif(btrim(o.rider_name), ''), 'Another rider');
  end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  -- The same step again (a double tap): nothing to do.
  if (p_step = 'confirmed' and o.status = 'confirmed')
     or (p_step in ('to_restaurant', 'at_restaurant', 'arriving') and o.rider_stage = p_step)
     or (p_step = 'picked' and o.status = 'picked') or (p_step = 'delivered' and o.status = 'delivered') then
    return jsonb_build_object('status', o.status, 'stage', o.rider_stage, 'leave_at', o.leave_at);
  end if;

  if p_step = 'release' then
    if o.status <> 'placed' or o.rider_id is distinct from auth.uid() then
      raise exception 'Only a new order you took can be given back. Call the owner.';
    end if;
    perform food_set_rider(o.id, null);
    return jsonb_build_object('status', o.status, 'stage', o.rider_stage, 'leave_at', o.leave_at);
  end if;
  if p_step = 'restaurant_no' then
    if o.status not in ('placed', 'confirmed') then raise exception 'The food is picked up already. Call the owner.'; end if;
    if not v_desk and o.rider_id is distinct from auth.uid() then raise exception 'Take the order first.'; end if;
    update food_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = 'The restaurant could not take this order' where id = o.id;
    return jsonb_build_object('status', 'cancelled', 'stage', o.rider_stage, 'leave_at', o.leave_at);
  end if;

  -- A rider (not the desk) who moves an order takes it.
  if not v_desk and o.rider_id is null then perform food_set_rider(o.id, auth.uid()); end if;

  -- Rider pages from before this update start with "Going to the restaurant": that also means the
  -- restaurant has the order.
  if p_step in ('confirmed', 'to_restaurant', 'at_restaurant') and o.status = 'placed' then
    update food_orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
      leave_at = now() + make_interval(mins => v_leave) where id = o.id;
    select * into o from food_orders where id = p_order_id;
    if p_step = 'confirmed' then return jsonb_build_object('status', o.status, 'stage', o.rider_stage, 'leave_at', o.leave_at); end if;
  end if;

  v_pay := food_paid_at_pickup(o.restaurant_id);
  if p_step = 'to_restaurant' and o.status = 'confirmed' and o.rider_stage = '' then
    update food_orders set rider_stage = 'to_restaurant', to_restaurant_at = now() where id = o.id;
  elsif p_step = 'at_restaurant' and o.status = 'confirmed' and o.rider_stage in ('', 'to_restaurant') then
    update food_orders set rider_stage = 'at_restaurant', at_restaurant_at = now(),
      to_restaurant_at = coalesce(to_restaurant_at, now()) where id = o.id;
  elsif p_step = 'picked' and o.status in ('placed', 'confirmed') then
    update food_orders set status = 'picked', picked_at = now(), rider_stage = '',
      confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, auth.uid()),
      restaurant_paid = case when v_pay then menu_total else 0 end, restaurant_paid_at = case when v_pay then now() end
    where id = o.id;
  elsif p_step = 'arriving' and o.status = 'picked' and o.rider_stage = '' then
    update food_orders set rider_stage = 'arriving', arriving_at = now() where id = o.id;
  elsif p_step = 'delivered' and o.status in ('confirmed', 'picked') then
    update food_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      picked_at = coalesce(picked_at, now()),
      restaurant_paid = case when o.status = 'confirmed' and v_pay then menu_total else restaurant_paid end,
      restaurant_paid_at = case when o.status = 'confirmed' and v_pay then now() else restaurant_paid_at end
    where id = o.id;
  else
    raise exception 'This order can''t be marked "%" now (it is %).', p_step, o.status;
  end if;
  select * into o from food_orders where id = p_order_id;
  return jsonb_build_object('status', o.status, 'stage', o.rider_stage, 'leave_at', o.leave_at);
end
$$;

-- What rings the Partner app (every 10 seconds): grocery as before; food: every new order nobody has taken
-- (all riders), and the rider's own until the food is picked up (for the "time to leave" reminder).
create or replace function public.partner_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(x.j order by x.t), '[]') from (
      select o.created_at as t, jsonb_build_object(
        'id', o.id, 'no', o.order_number, 'name', o.customer_name, 'area', o.area, 'date', o.delivery_date, 'status', o.status,
        'kind', 'grocery') as j
      from orders o
      where o.delivery_date >= v_today
        and ((v_admin and o.status in ('placed', 'confirmed'))
             or (o.status = 'confirmed' and (o.rider_id = auth.uid() or (o.rider_id is null and coalesce(o.dispatch, '') = ''))))
      union all
      select f.created_at, jsonb_build_object(
        'id', f.id, 'no', f.order_number, 'name', f.customer_name, 'area', f.area,
        'date', (f.created_at at time zone 'Asia/Kolkata')::date, 'status', f.status, 'kind', 'food',
        'restaurant', f.restaurant_name, 'total', f.total, 'payment', f.payment_method,
        'items', (select coalesce(sum(i.qty), 0) from food_order_items i where i.order_id = f.id),
        'taken', f.rider_id is not null, 'mine', coalesce(f.rider_id = auth.uid(), false), 'rider_name', f.rider_name,
        'leave_at', f.leave_at)
      from food_orders f
      where f.created_at > now() - interval '20 hours'
        and f.status in ('placed', 'confirmed')
        and (v_admin or f.rider_id = auth.uid() or f.rider_id is null)
    ) x
  );
end
$$;

-- Rider page: new food orders nobody took (all riders), the rider's own trips, and what they delivered today.
create or replace function public.partner_food_orders()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desk boolean := is_admin() or is_desk();
begin
  if not (is_staff() or v_desk) then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'no', o.order_number, 'status', o.status, 'stage', o.rider_stage, 'created_at', o.created_at,
      'assigned_at', o.assigned_at, 'confirmed_at', o.confirmed_at, 'leave_at', o.leave_at,
      'to_restaurant_at', o.to_restaurant_at, 'at_restaurant_at', o.at_restaurant_at,
      'picked_at', o.picked_at, 'arriving_at', o.arriving_at, 'delivered_at', o.delivered_at,
      'restaurant', o.restaurant_name, 'pickup_address', coalesce(nullif(btrim(fr.address), ''), o.restaurant_address),
      'pickup_area', coalesce(fr.area, ''), 'pickup_phone', coalesce(nullif(fr.phone, ''), fr.whatsapp, ''),
      'pickup_map', coalesce(fr.maps_link, ''), 'pickup_lat', fr.lat, 'pickup_lng', fr.lng,
      'prep_minutes', fr.prep_minutes, 'pay_when', coalesce(fr.pay_when, ''), 'restaurant_upi', coalesce(fr.upi_id, ''),
      'name', o.customer_name, 'phone', o.customer_phone, 'address', o.address, 'area', o.area, 'lat', o.lat, 'lng', o.lng,
      'distance_km', o.distance_km, 'note', o.note, 'payment', o.payment_method, 'total', o.total,
      'menu_total', o.menu_total, 'packing_fee', o.packing_fee, 'restaurant_paid', o.restaurant_paid,
      'mine', coalesce(o.rider_id = auth.uid(), false), 'rider_id', o.rider_id, 'rider_name', o.rider_name,
      'store_items_total', o.store_items_total,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty, 'diet', i.diet,
                  'from_store', i.from_store) order by i.from_store, i.name), '[]')
                from food_order_items i where i.order_id = o.id)
    ) order by o.created_at), '[]')
    from food_orders o
    left join food_restaurants fr on fr.id = o.restaurant_id
    where o.created_at > now() - interval '20 hours'
      and ((o.status in ('placed', 'confirmed', 'picked') and (v_desk or o.rider_id = auth.uid() or o.rider_id is null))
           or (o.status = 'delivered' and o.rider_id = auth.uid()))
  );
end
$$;

/* ---------------- the customer ---------------- */

-- The customer can cancel only until a rider takes the order (the rider is then calling the restaurant).
create or replace function public.customer_cancel_food_order(p_order_number text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
begin
  select * into o from food_orders where upper(order_number) = upper(btrim(p_order_number)) for update;
  if not found or not is_my_order(o.placed_by, '', o.customer_phone) then raise exception 'Order not found.'; end if;
  if o.status <> 'placed' then raise exception 'This order is already being prepared. Please call us to cancel it.'; end if;
  if o.rider_id is not null then
    raise exception 'A rider is already giving your order to the restaurant. Please call us to cancel it.';
  end if;
  update food_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = 'Cancelled by customer' where id = o.id;
end
$$;
revoke all on function public.customer_cancel_food_order(text) from public, anon;
grant execute on function public.customer_cancel_food_order(text) to authenticated;

/* ---------------- the desk ---------------- */

-- The desk can still move an order itself (as before): confirming also sets the time to leave, and "picked"
-- counts the restaurant as paid when it is paid at pickup.
create or replace function public.desk_food_status(p_order_id uuid, p_status text, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o food_orders;
  v_leave int := coalesce((select food_leave_minutes from store_settings where id = 1), 10);
  v_pay boolean;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  select * into o from food_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status in ('delivered', 'cancelled') and not (is_admin() and p_status in ('picked', 'confirmed')) then
    raise exception 'This order is already %.', o.status;
  end if;
  v_pay := food_paid_at_pickup(o.restaurant_id);
  if p_status = 'confirmed' then
    update food_orders set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, auth.uid()),
      leave_at = coalesce(leave_at, now() + make_interval(mins => v_leave)), delivered_at = null, delivered_by = null where id = o.id;
  elsif p_status = 'picked' then
    update food_orders set status = 'picked', picked_at = now(), confirmed_at = coalesce(confirmed_at, now()),
      restaurant_paid = case when v_pay and restaurant_paid = 0 then menu_total else restaurant_paid end,
      restaurant_paid_at = case when v_pay and restaurant_paid = 0 then now() else restaurant_paid_at end,
      delivered_at = null, delivered_by = null where id = o.id;
  elsif p_status = 'delivered' then
    update food_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      picked_at = coalesce(picked_at, now()), confirmed_at = coalesce(confirmed_at, now()),
      restaurant_paid = case when v_pay and restaurant_paid = 0 then menu_total else restaurant_paid end,
      restaurant_paid_at = case when v_pay and restaurant_paid = 0 then now() else restaurant_paid_at end
    where id = o.id;
  elsif p_status = 'cancelled' then
    if coalesce(btrim(p_reason), '') = '' then raise exception 'Write why it is cancelled.'; end if;
    update food_orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = left(btrim(p_reason), 200) where id = o.id;
    if btrim(p_reason) = 'No-show' and o.payment_method = 'cash' then
      update customers set no_show_count = no_show_count + 1 where phone = o.customer_phone;
    end if;
  else
    raise exception 'Unknown status.';
  end if;
end
$$;

-- Owner: what each restaurant is owed. Money riders paid at pickup counts as paid.
create or replace function public.admin_food_payouts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', btrim(r.name), 'pay_when', r.pay_when, 'upi_id', r.upi_id, 'phone', coalesce(nullif(r.phone, ''), r.whatsapp),
      'delivered_orders', coalesce(e.n, 0), 'earned', coalesce(e.amount, 0), 'paid', coalesce(p.amount, 0),
      'paid_at_pickup', coalesce(e.at_pickup, 0),
      'owed', coalesce(e.amount, 0) - coalesce(e.at_pickup, 0) - coalesce(p.amount, 0), 'last_paid', p.last_at
    ) order by coalesce(e.amount, 0) - coalesce(e.at_pickup, 0) - coalesce(p.amount, 0) desc, r.name), '[]')
    from food_restaurants r
    left join (select restaurant_id, count(*) as n, sum(menu_total) as amount, sum(restaurant_paid) as at_pickup
               from food_orders where status = 'delivered' group by restaurant_id) e on e.restaurant_id = r.id
    left join (select restaurant_id, sum(amount) as amount, max(created_at) as last_at
               from food_payouts group by restaurant_id) p on p.restaurant_id = r.id
    where r.status <> 'dropped' or coalesce(e.amount, 0) > 0
  );
end
$$;

/* ---------------- who may call what ---------------- */

revoke all on function public.partner_food_take(uuid), public.partner_food_step(uuid, text), public.partner_alerts(),
  public.partner_food_orders(), public.desk_food_status(uuid, text, text), public.admin_food_payouts() from public, anon;
grant execute on function public.partner_food_take(uuid), public.partner_food_step(uuid, text), public.partner_alerts(),
  public.partner_food_orders(), public.desk_food_status(uuid, text, text), public.admin_food_payouts() to authenticated;

notify pgrst, 'reload schema';
