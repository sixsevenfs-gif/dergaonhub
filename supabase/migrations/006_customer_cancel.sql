-- Update 006: customers can cancel their own order until the rider taps "On the way".
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.

create or replace function public.customer_cancel_order(p_order_number text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  select * into o from orders where upper(order_number) = upper(p_order_number) and placed_by = auth.uid();
  if o.id is null then raise exception 'Order not found on this phone.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.status = 'completed' then raise exception 'This order is already delivered.'; end if;
  if o.dispatch <> '' then raise exception 'Our rider is already on the way, so this order can''t be cancelled now.'; end if;
  update orders set status = 'cancelled', cancel_reason = 'Cancelled by customer' where id = o.id;
end
$$;

revoke execute on function public.customer_cancel_order(text) from public, anon;
grant execute on function public.customer_cancel_order(text) to authenticated;
