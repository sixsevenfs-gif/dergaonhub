-- Update 044: the rider's money for the day, and paying it back to the owner.
-- Run once in Supabase → SQL Editor, AFTER update 043. Safe to run again; nothing is deleted.
--
-- Riders are paid a salary: every rupee a customer pays belongs to the store (delivery and packaging charges too).
-- Each rider has a running balance of what they still hold for the owner, counted from the day this update is run
-- (earlier days were settled the old way):
--   + cash taken from customers (cash orders they delivered)
--   − what they paid at the shop: the shop bill when they added one (update 043), else the items THEY ticked
--     (a tick means "I bought this") at their shop price: buy price, or MRP when there is none
--   − what they already gave back
-- Only delivered orders count. Paid by UPI / QR orders go straight to the store, so the shop money for them comes
-- off the balance (it can go below zero: the owner owes the rider). The rider pays back with the store's UPI or in
-- cash and taps "I paid" (rider_returns); the owner checks the bank and can remove a wrong one.

-- The day the running balance starts (the day this update is run).
alter table public.private_settings add column if not exists rider_money_from date;
insert into public.private_settings (id) values (1) on conflict (id) do nothing;
update public.private_settings set rider_money_from = (now() at time zone 'Asia/Kolkata')::date where id = 1 and rider_money_from is null;

create table if not exists public.rider_returns (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,                         -- the day it was given back (the day picked on the rider page)
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('upi', 'cash')),
  created_at timestamptz not null default now()
);
create index if not exists rider_returns_day on public.rider_returns (day, rider_id);
alter table public.rider_returns enable row level security;
drop policy if exists "owner and the rider read returns" on public.rider_returns;
create policy "owner and the rider read returns" on public.rider_returns for select using (is_admin() or rider_id = auth.uid());

-- One row per rider (team riders only): that day's cash, shop and given back, the balance from earlier days, and
-- to_return = the whole balance up to that day. The owner gets every rider, a rider only themself.
create or replace function public.rider_day_money(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_from date;
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  select rider_money_from into v_from from private_settings where id = 1;
  v_from := coalesce(v_from, p_day);
  return (
    with done as (
      select o.id, o.delivery_date, o.delivered_by, o.payment_method, coalesce(o.cash_collected, o.total) as cash
      from orders o where o.status = 'completed' and o.delivery_date between v_from and p_day
    ), moves as (
      -- cash from customers, for the rider who delivered
      select d.delivered_by as rider_id, d.delivery_date as day, 1 as delivered,
        case when d.payment_method = 'cash' then d.cash else 0 end as cash, 0::numeric as shop, 0::numeric as returned
      from done d where d.delivered_by is not null
      union all
      -- shop: the items each rider ticked, on orders without a shop bill
      select i.picked_by, d.delivery_date, 0, 0,
        i.quantity * coalesce((shop_price_of(i) ->> 'buy_price')::numeric, (shop_price_of(i) ->> 'mrp')::numeric), 0
      from done d join order_items i on i.order_id = d.id
      where i.picked and i.picked_by is not null and not exists (select 1 from order_shop_bills b where b.order_id = d.id)
      union all
      -- shop: the bill, for the rider who added it
      select b.created_by, d.delivery_date, 0, 0, b.paid, 0
      from done d join order_shop_bills b on b.order_id = d.id where b.created_by is not null
      union all
      select r.rider_id, r.day, 0, 0, 0, r.amount from rider_returns r where r.day between v_from and p_day
    ), per as (
      select m.rider_id,
        coalesce(sum(m.delivered) filter (where m.day = p_day), 0) as delivered,
        coalesce(sum(m.cash) filter (where m.day = p_day), 0) as cash,
        coalesce(sum(m.shop) filter (where m.day = p_day), 0) as shop,
        coalesce(sum(m.returned) filter (where m.day = p_day), 0) as returned,
        coalesce(sum(m.cash - m.shop - m.returned) filter (where m.day < p_day), 0) as earlier,
        sum(m.cash - m.shop - m.returned) as to_return
      from moves m
      where (v_admin or m.rider_id = auth.uid()) and exists (select 1 from riders x where x.user_id = m.rider_id)
      group by m.rider_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id', p.rider_id, 'name', (select x.name from riders x where x.user_id = p.rider_id),
      'delivered', p.delivered, 'cash', p.cash, 'shop', p.shop, 'returned', p.returned,
      'earlier', p.earlier, 'to_return', p.to_return
    ) order by p.to_return desc), '[]')
    from per p
  );
end
$$;

-- "I paid": the rider gives back money for a day, by the store's UPI QR or in cash.
-- Update 045 replaces it with a version that also takes an order; if this file is run again after 045, drop that one
-- first so there are never two partner_return functions (the app couldn't tell them apart). Run 045 again after.
drop function if exists public.partner_return(date, numeric, text, uuid);
create or replace function public.partner_return(p_day date, p_amount numeric, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_day is null or p_day > (now() at time zone 'Asia/Kolkata')::date + 1 then raise exception 'Pick the day it is for.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Write the amount you gave back.'; end if;
  if p_method not in ('upi', 'cash') then raise exception 'UPI or cash?'; end if;
  insert into rider_returns (day, amount, method) values (p_day, round(p_amount, 2), p_method);
end
$$;

-- A wrong "I paid" (tapped by mistake): the owner removes it.
create or replace function public.admin_delete_return(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can remove a payment.'; end if;
  delete from rider_returns where id = p_id;
end
$$;

revoke execute on function public.rider_day_money(date), public.partner_return(date, numeric, text), public.admin_delete_return(uuid) from public, anon;
grant execute on function public.rider_day_money(date), public.partner_return(date, numeric, text), public.admin_delete_return(uuid) to authenticated;

notify pgrst, 'reload schema';
