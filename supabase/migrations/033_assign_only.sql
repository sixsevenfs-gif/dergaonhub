-- Update 033: riders get orders only by assignment. The owner or the executive assigns each order to a
-- rider; a rider can't accept a free order or give one back, and sees only the orders given to them.
-- Run once in Supabase → SQL Editor (after 032). Safe to run again.

drop function if exists public.rider_accept(uuid);
drop function if exists public.rider_release(uuid);

-- A rider may work only on the orders assigned to them (the owner on any order).
create or replace function public.check_my_order(p_order_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_admin() then return; end if;
  if not exists (select 1 from orders where id = p_order_id and rider_id = auth.uid()) then
    raise exception 'This order is not assigned to you. Ask the order desk.';
  end if;
end
$$;

-- One day's orders: the owner sees all of them with the rider's name, a rider only theirs.
create or replace function public.partner_orders(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
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
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid())
  );
end
$$;

-- Riders may confirm (owner switch in Settings) only the new orders assigned to them.
create or replace function public.desk_confirm_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  select * into o from orders where id = p_order_id;
  -- coalesce: an unassigned order has rider_id null, and "null = uid" must count as no.
  if not (is_desk() or (is_rider() and coalesce(o.rider_id = auth.uid(), false) and coalesce((select riders_confirm from store_settings where id = 1), false))) then
    raise exception 'Only the order desk can confirm orders.';
  end if;
  if o.id is null or o.status <> 'placed' then raise exception 'Only new orders can be confirmed.'; end if;
  if o.payment_method = 'upi_now' and o.payment_status <> 'paid' and not is_admin() then
    raise exception 'Pay-now order: the owner checks the UPI payment first.';
  end if;
  update orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid() where id = p_order_id;
end
$$;

-- Delivery steps as in update 032, without taking free orders: check_my_order() allows only the assigned rider.
create or replace function public.partner_set_dispatch(p_order_id uuid, p_dispatch text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_dispatch not in ('', 'on_the_way', 'arriving') then raise exception 'Unknown delivery step.'; end if;
  perform check_my_order(p_order_id);
  update orders set dispatch = p_dispatch, dispatched_at = case when p_dispatch = '' then null else now() end
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
    cash_collected = case when payment_method = 'cash' then total else 0 end
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

-- partner_paid_by_qr (update 032) already calls check_my_order(): nothing to change.

revoke execute on function public.check_my_order(uuid) from public, anon, authenticated;
revoke execute on function public.partner_orders(date), public.desk_confirm_order(uuid), public.partner_set_dispatch(uuid, text),
  public.partner_complete(uuid, int, text), public.partner_no_show(uuid) from public, anon;
grant execute on function public.partner_orders(date), public.desk_confirm_order(uuid), public.partner_set_dispatch(uuid, text),
  public.partner_complete(uuid, int, text), public.partner_no_show(uuid) to authenticated;

notify pgrst, 'reload schema';
