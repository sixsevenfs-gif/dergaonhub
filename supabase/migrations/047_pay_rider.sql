-- Update 047: the owner pays a rider back.
-- Run once in Supabase → SQL Editor, AFTER update 046. Safe to run again; nothing is deleted.
--
-- A rider can end up owed money: they paid the shop for orders the customer paid by UPI or QR (that money went to the
-- store). The owner pays them and records it here, so the rider's balance goes back to zero. It is kept with the
-- rider's payments back (rider_returns) as a negative amount, already confirmed.

alter table public.rider_returns drop constraint if exists rider_returns_amount_check;
alter table public.rider_returns add constraint rider_returns_amount_check check (amount <> 0);

create or replace function public.admin_pay_rider(p_rider uuid, p_day date, p_amount numeric, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can pay a rider.'; end if;
  if not exists (select 1 from riders where user_id = p_rider) then raise exception 'Pick a rider.'; end if;
  if p_day is null then raise exception 'Pick the day it is for.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Write the amount you paid.'; end if;
  if p_method not in ('upi', 'cash') then raise exception 'UPI or cash?'; end if;
  insert into rider_returns (rider_id, day, amount, method, confirmed_at) values (p_rider, p_day, -round(p_amount, 2), p_method, now());
end
$$;

-- As in update 046; "returned" is what the rider gave back that day, "paid_to_rider" what the owner paid them.
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
      select o.id, o.delivery_date, money_rider_of(o) as money_rider, o.payment_method, coalesce(o.cash_collected, o.total) as cash
      from orders o where o.status = 'completed' and o.delivery_date between v_from and p_day
    ), moves as (
      select d.money_rider as rider_id, d.delivery_date as day, 1 as delivered,
        case when d.payment_method = 'cash' then d.cash else 0 end as cash, 0::numeric as shop, 0::numeric as returned, 0::numeric as pending
      from done d where d.money_rider is not null
      union all
      select i.picked_by, d.delivery_date, 0, 0,
        i.quantity * coalesce((shop_price_of(i) ->> 'buy_price')::numeric, (shop_price_of(i) ->> 'mrp')::numeric), 0, 0
      from done d join order_items i on i.order_id = d.id
      where i.picked and i.picked_by is not null and not exists (select 1 from order_shop_bills b where b.order_id = d.id)
      union all
      select b.created_by, d.delivery_date, 0, 0, b.paid, 0, 0
      from done d join order_shop_bills b on b.order_id = d.id where b.created_by is not null
      union all
      select r.rider_id, r.day, 0, 0, 0, r.amount, case when r.method = 'cash' and r.amount > 0 and r.confirmed_at is null then r.amount else 0 end
      from rider_returns r where r.day between v_from and p_day
    ), per as (
      select m.rider_id,
        coalesce(sum(m.delivered) filter (where m.day = p_day), 0) as delivered,
        coalesce(sum(m.cash) filter (where m.day = p_day), 0) as cash,
        coalesce(sum(m.shop) filter (where m.day = p_day), 0) as shop,
        coalesce(sum(m.returned) filter (where m.day = p_day and m.returned > 0), 0) as returned,
        coalesce(-sum(m.returned) filter (where m.day = p_day and m.returned < 0), 0) as paid_to_rider,
        coalesce(sum(m.cash - m.shop - m.returned) filter (where m.day < p_day), 0) as earlier,
        sum(m.cash - m.shop - m.returned) as to_return,
        sum(m.pending) as cash_pending
      from moves m
      where (v_admin or m.rider_id = auth.uid()) and exists (select 1 from riders x where x.user_id = m.rider_id)
      group by m.rider_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id', p.rider_id, 'name', (select x.name from riders x where x.user_id = p.rider_id),
      'delivered', p.delivered, 'cash', p.cash, 'shop', p.shop, 'returned', p.returned, 'paid_to_rider', p.paid_to_rider,
      'earlier', p.earlier, 'to_return', p.to_return, 'cash_pending', p.cash_pending
    ) order by p.to_return desc), '[]')
    from per p
  );
end
$$;

revoke execute on function public.admin_pay_rider(uuid, date, numeric, text), public.rider_day_money(date) from public, anon;
grant execute on function public.admin_pay_rider(uuid, date, numeric, text), public.rider_day_money(date) to authenticated;

notify pgrst, 'reload schema';
