-- Update 027: Express delivery only during Express hours (Admin → Settings, 10 AM – 4 PM by default).
-- At other times customers choose the evening slot (orders after the cut-off go to the next evening).
-- Run once in Supabase → SQL Editor (after 026). Safe to run again; includes the ₹99 rule of 026.
-- Same rule as expressStatus() in src/lib/delivery.js; checked on every new order.

alter table public.store_settings
  add column if not exists express_from time not null default '10:00',
  add column if not exists express_until time not null default '16:00';

create or replace function public.orders_check_express() returns trigger
language plpgsql as $$
declare
  s record;
  v_now time := (now() at time zone 'Asia/Kolkata')::time;
begin
  if new.delivery_type = 'express' then
    select small_order_below, express_from, express_until into s from store_settings where id = 1;
    if new.subtotal < coalesce(s.small_order_below, 99) then
      raise exception 'Express delivery is for orders of ₹% or more. Please choose evening delivery.', coalesce(s.small_order_below, 99);
    end if;
    if v_now < s.express_from or v_now >= s.express_until then
      raise exception 'Express delivery is available from % to %. Please choose evening delivery.',
        to_char(s.express_from, 'FMHH12:MI AM'), to_char(s.express_until, 'FMHH12:MI AM');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_check_express on public.orders;
create trigger orders_check_express before insert on public.orders
  for each row execute function public.orders_check_express();

notify pgrst, 'reload schema';
