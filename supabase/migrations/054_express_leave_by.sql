-- Update 054: Express = "our rider leaves the store within 30 minutes". Late? The Express charge is not taken.
-- Run once in Supabase → SQL Editor, AFTER update 053. Safe to run again; nothing is deleted.
--
-- The promise changes: express_by (order time + "Express minutes" from Settings) is now the time the rider must
-- LEAVE the store, not the delivery time. After leaving, the rider comes straight to the customer.
-- 1) orders.left_at: when the order first left the store (first "On the way" / "Arriving", or "Delivered" without
--    either). Saved once, for every order.
-- 2) If an Express order leaves after express_by, the Express charge is taken off by itself: express_fee becomes 0,
--    the total goes down, and express_waived keeps how much was let go (shown to the customer as "free, we were late").
--    When "Delivered" is the first step, the cash to collect goes down with it.
-- 3) One-time fix for past Express orders that left late (the time comes from "On the way": dispatched_at or the
--    first "on the way" message). Their charge, total and cash collected are put right. The list at the end shows
--    every Express order so you can check.

alter table public.orders add column if not exists left_at timestamptz;
alter table public.orders add column if not exists express_waived int not null default 0;

create or replace function public.orders_left_store() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_off numeric;
begin
  if new.left_at is null and (
       (coalesce(new.dispatch, '') <> '' and coalesce(old.dispatch, '') = '')
       or (new.status = 'completed' and old.status is distinct from 'completed')) then
    new.left_at := now();
    if new.delivery_type = 'express' and new.express_by is not null and now() > new.express_by and coalesce(new.express_fee, 0) > 0 then
      v_off := least(new.express_fee, coalesce(new.total, 0));
      -- Delivered as the first step: partner_complete already wrote the old total as the cash taken.
      if new.status = 'completed' and new.payment_method = 'cash' and new.cash_collected = old.total then
        new.cash_collected := new.cash_collected - v_off;
      end if;
      new.express_waived := new.express_fee;
      new.express_fee := 0;
      new.total := new.total - v_off;
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.orders_left_store() from public, anon, authenticated;

-- Past orders: when they left the store, from what was saved before this update.
update orders o set left_at = t.left_time
from (
  select o2.id, least(o2.dispatched_at,
                      (select min(m.created_at) from order_messages m where m.order_id = o2.id and m.kind = 'on_the_way' and m.ok)) as left_time
  from orders o2
  where o2.left_at is null and (coalesce(o2.dispatch, '') <> '' or o2.status = 'completed')
) t
where o.id = t.id and t.left_time is not null;

-- Past Express orders that left late: take the charge off (only once: express_fee is 0 afterwards).
update orders set
  express_waived = express_fee,
  total = total - least(express_fee, total),
  cash_collected = case when status = 'completed' and payment_method = 'cash' and coalesce(cash_collected, 0) > 0
                        then greatest(0, cash_collected - express_fee) else cash_collected end,
  express_fee = 0
where delivery_type = 'express' and status <> 'cancelled' and express_fee > 0
  and express_by is not null and left_at is not null and left_at > express_by;

drop trigger if exists orders_left_store on public.orders;
create trigger orders_left_store before update of dispatch, status on public.orders
  for each row execute function public.orders_left_store();

notify pgrst, 'reload schema';

-- Every Express order, to check the fix (IST times).
select order_number as "order", status,
  to_char(created_at at time zone 'Asia/Kolkata', 'DD Mon HH12:MI AM') as placed,
  to_char(express_by at time zone 'Asia/Kolkata', 'HH12:MI AM') as leave_by,
  to_char(left_at at time zone 'Asia/Kolkata', 'HH12:MI AM') as "left",
  express_fee, express_waived, total, cash_collected
from orders where delivery_type = 'express' order by created_at;
