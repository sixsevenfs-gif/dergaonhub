-- Update 044: the rider's money for the day, and paying it back to the owner.
-- Run once in Supabase → SQL Editor, AFTER update 043. Safe to run again; nothing is deleted.
--
-- Riders are paid a salary: every rupee a customer pays belongs to the store (delivery and packaging charges too).
-- For each delivered order the rider took the customer's cash (cash orders) and paid the shop. What is left is
-- what the rider gives back to the owner:
--   cash collected − paid at the shop − already given back = to give back
-- "Paid at the shop" for an order: the shop bill when the rider added one (update 043), else the ticked items at
-- their shop price (buy price, or MRP when there is none). A tick means "I bought this". Paid by UPI / QR orders
-- go straight to the store's account, so for them the owner owes the rider what they paid the shop.
-- The rider pays back with the store's UPI QR (amount filled in) or in cash, and taps "I paid": rider_returns.

create table if not exists public.rider_returns (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,                         -- the delivery day it is for
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('upi', 'cash')),
  created_at timestamptz not null default now()
);
create index if not exists rider_returns_day on public.rider_returns (day, rider_id);
alter table public.rider_returns enable row level security;
drop policy if exists "owner and the rider read returns" on public.rider_returns;
create policy "owner and the rider read returns" on public.rider_returns for select using (is_admin() or rider_id = auth.uid());

-- One row per rider for the day: the owner gets every rider, a rider only themself.
create or replace function public.rider_day_money(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    with done as (
      select o.* from orders o
      where o.delivery_date = p_day and o.status = 'completed' and o.delivered_by is not null
        and (v_admin or o.delivered_by = auth.uid())
    ), per_order as (
      select d.delivered_by as rider_id,
        case when d.payment_method = 'cash' then coalesce(d.cash_collected, d.total) else 0 end as cash,
        coalesce(
          (select b.paid from order_shop_bills b where b.order_id = d.id),
          (select coalesce(sum(i.quantity * coalesce((shop_price_of(i) ->> 'buy_price')::numeric, (shop_price_of(i) ->> 'mrp')::numeric)), 0)
           from order_items i where i.order_id = d.id and i.picked)
        ) as shop
      from done d
    ), per_rider as (
      select rider_id, count(*) as delivered, sum(cash) as cash, sum(shop) as shop from per_order group by rider_id
    ), back as (
      select rider_id, sum(amount) as returned from rider_returns
      where day = p_day and (v_admin or rider_id = auth.uid()) group by rider_id
    ), rows as (
      select coalesce(p.rider_id, b.rider_id) as rider_id, coalesce(p.delivered, 0) as delivered,
        coalesce(p.cash, 0) as cash, coalesce(p.shop, 0) as shop, coalesce(b.returned, 0) as returned
      from per_rider p full join back b on b.rider_id = p.rider_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id', r.rider_id,
      'name', coalesce((select x.name from riders x where x.user_id = r.rider_id), 'Owner'),
      'delivered', r.delivered, 'cash', r.cash, 'shop', r.shop, 'returned', r.returned,
      'to_return', r.cash - r.shop - r.returned
    ) order by r.cash - r.shop - r.returned desc), '[]')
    from rows r
  );
end
$$;

-- "I paid": the rider gives back money for a day, by the store's UPI QR or in cash.
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
