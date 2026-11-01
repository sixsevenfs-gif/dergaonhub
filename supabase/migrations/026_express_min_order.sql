-- Update 026: Express delivery only for an items total of at least the small-order limit (₹99, Admin →
-- Settings). Run once in Supabase → SQL Editor (after 025). Safe to run again.
-- Same rule as expressStatus() in src/lib/delivery.js; checked on every new order.
create or replace function public.orders_check_express() returns trigger
language plpgsql as $$
declare
  v_min int;
begin
  if new.delivery_type = 'express' then
    select small_order_below into v_min from store_settings where id = 1;
    if new.subtotal < coalesce(v_min, 99) then
      raise exception 'Express delivery is for orders of ₹% or more. Please choose evening delivery.', coalesce(v_min, 99);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_check_express on public.orders;
create trigger orders_check_express before insert on public.orders
  for each row execute function public.orders_check_express();
