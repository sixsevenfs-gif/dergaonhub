-- Update 052: Jholzo Partner app (the rider page inside an Android app, with a loud alert for new orders).
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.
--
-- 1) Riders can switch an item "Out of stock" / "In stock" from the rider page, like the owner and the order
--    desk already can. Only the stock switch: prices, names and photos stay with the owner.
-- 2) partner_alerts(): the short list the app checks every few seconds to ring for a new order.
--    A rider gets only their own confirmed orders; the owner gets every new order. Nobody else can call it.

-- As in update 032, now also for riders.
create or replace function public.desk_set_available(p_product_id uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_desk() or is_staff()) then raise exception 'Only the Jholzo team can change stock.'; end if;
  update products set available = coalesce(p_available, true), updated_at = now() where id = p_product_id;
end
$$;

create or replace function public.partner_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'no', o.order_number, 'name', o.customer_name, 'area', o.area, 'date', o.delivery_date, 'status', o.status
    ) order by o.created_at), '[]')
    from orders o
    where o.delivery_date >= v_today
      and ((v_admin and o.status in ('placed', 'confirmed')) or (o.status = 'confirmed' and o.rider_id = auth.uid()))
  );
end
$$;

revoke execute on function public.desk_set_available(uuid, boolean), public.partner_alerts() from public, anon;
grant execute on function public.desk_set_available(uuid, boolean), public.partner_alerts() to authenticated;

notify pgrst, 'reload schema';
