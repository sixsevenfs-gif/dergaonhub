-- Update 038: orders we couldn't deliver on their evening are carried to the next one, not cancelled.
-- Before, the first admin visit the next day cancelled them as "Expired". Now an order that is not on its
-- way when its evening ends (slot_end, 8 PM) moves to the next evening: delayed_from keeps the day it was
-- due, and the customer's order page says sorry with the new day. Orders forgotten for more than 3 days
-- still expire. A customer cancelling a late order is not counted towards the block (update 037).
-- Run once in Supabase → SQL Editor, after 037. Safe to run again.

alter table public.orders add column if not exists delayed_from date;

create or replace function public.carry_missed_orders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_end time := (select slot_end from store_settings where id = 1);
begin
  if not (is_desk() or is_staff()) then return; end if;
  update orders set status = 'cancelled', cancel_reason = 'Expired'
  where status in ('placed', 'confirmed') and coalesce(delayed_from, delivery_date) < v_now::date - 3;
  update orders set delayed_from = coalesce(delayed_from, delivery_date),
    delivery_date = case when v_now::time < v_end then v_now::date else v_now::date + 1 end
  where status in ('placed', 'confirmed') and dispatch = ''
    and (delivery_date < v_now::date or (delivery_date = v_now::date and v_now::time >= v_end));
end
$$;
revoke execute on function public.carry_missed_orders() from public, anon;
grant execute on function public.carry_missed_orders() to authenticated;

-- Same as update 032, but missed orders move on instead of being cancelled.
create or replace function public.expire_old_orders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform expire_unpaid_orders();
  perform carry_missed_orders();
end
$$;

-- From update 037, with the late-order exception.
create or replace function public.customer_cancel_order(p_order_number text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_end time := (select slot_end from store_settings where id = 1);
begin
  select * into o from orders where upper(order_number) = upper(p_order_number) and placed_by = auth.uid();
  if o.id is null then raise exception 'Order not found on this phone.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.status = 'completed' then raise exception 'This order is already delivered.'; end if;
  if o.dispatch <> '' then raise exception 'Our rider is already on the way, so this order can''t be cancelled now.'; end if;
  update orders set status = 'cancelled', cancel_reason = 'Cancelled by customer' where id = o.id;
  -- Not counted when we were late: the order was carried over, or its evening has already ended.
  if o.payment_method <> 'upi_now' and o.delayed_from is null
     and not (o.delivery_date < v_now::date or (o.delivery_date = v_now::date and v_now::time >= v_end)) then
    update customers set cancel_count = cancel_count + 1 where id = coalesce(o.orderer_id, o.customer_id);
  end if;
end
$$;
revoke execute on function public.customer_cancel_order(text) from public, anon;
grant execute on function public.customer_cancel_order(text) to authenticated;

notify pgrst, 'reload schema';
