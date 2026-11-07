-- Update 046: the rider's money also counts orders the owner marked delivered.
-- Run once in Supabase → SQL Editor, AFTER update 045. Safe to run again; nothing is deleted.
--
-- When an order is marked delivered from the admin panel, "delivered by" stays empty (or is the owner), so the
-- rider who carried it and took the customer's cash saw ₹0 and no pay button. The money now belongs to the
-- "money rider": the team rider who marked it delivered, else the rider it is assigned to.

create or replace function public.money_rider_of(p_order orders) returns uuid
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from riders x where x.user_id = p_order.delivered_by) then p_order.delivered_by else p_order.rider_id end
$$;
revoke execute on function public.money_rider_of(orders) from public, anon, authenticated;

-- As in update 045, plus money_rider per order.
create or replace function public.partner_orders(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  return (
    select coalesce(jsonb_agg(
      (to_jsonb(o) - array['placed_by', 'customer_id']) || jsonb_build_object(
        'items', (select coalesce(jsonb_agg(to_jsonb(i) || shop_price_of(i) order by i.name_snapshot), '[]') from order_items i where i.order_id = o.id),
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'channel', m.channel, 'ok', m.ok, 'at', m.created_at) order by m.created_at), '[]')
                     from order_messages m where m.order_id = o.id),
        'rider_name', (select r.name from riders r where r.user_id = o.rider_id),
        'shop_bill', (select to_jsonb(b) from order_shop_bills b where b.order_id = o.id),
        'returns', (select coalesce(jsonb_agg(jsonb_build_object('amount', x.amount, 'method', x.method, 'at', x.created_at, 'confirmed_at', x.confirmed_at) order by x.created_at), '[]')
                    from rider_returns x where x.order_id = o.id and (v_admin or x.rider_id = auth.uid())),
        'money_rider', money_rider_of(o)
      ) order by o.area, o.created_at), '[]')
    from orders o
    where o.delivery_date = p_date and o.status <> 'cancelled'
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid())
  );
end
$$;

-- As in update 045, with the customer's cash going to the money rider.
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
      select r.rider_id, r.day, 0, 0, 0, r.amount, case when r.method = 'cash' and r.confirmed_at is null then r.amount else 0 end
      from rider_returns r where r.day between v_from and p_day
    ), per as (
      select m.rider_id,
        coalesce(sum(m.delivered) filter (where m.day = p_day), 0) as delivered,
        coalesce(sum(m.cash) filter (where m.day = p_day), 0) as cash,
        coalesce(sum(m.shop) filter (where m.day = p_day), 0) as shop,
        coalesce(sum(m.returned) filter (where m.day = p_day), 0) as returned,
        coalesce(sum(m.cash - m.shop - m.returned) filter (where m.day < p_day), 0) as earlier,
        sum(m.cash - m.shop - m.returned) as to_return,
        sum(m.pending) as cash_pending
      from moves m
      where (v_admin or m.rider_id = auth.uid()) and exists (select 1 from riders x where x.user_id = m.rider_id)
      group by m.rider_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id', p.rider_id, 'name', (select x.name from riders x where x.user_id = p.rider_id),
      'delivered', p.delivered, 'cash', p.cash, 'shop', p.shop, 'returned', p.returned,
      'earlier', p.earlier, 'to_return', p.to_return, 'cash_pending', p.cash_pending
    ) order by p.to_return desc), '[]')
    from per p
  );
end
$$;

-- As in update 045: an order must be one whose money is with this rider.
create or replace function public.partner_return(p_day date, p_amount numeric, p_method text, p_order_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if p_day is null or p_day > (now() at time zone 'Asia/Kolkata')::date + 1 then raise exception 'Pick the day it is for.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Write the amount you gave back.'; end if;
  if p_method not in ('upi', 'cash') then raise exception 'UPI or cash?'; end if;
  if p_order_id is not null and not exists (
    select 1 from orders o where o.id = p_order_id and o.status = 'completed' and money_rider_of(o) = auth.uid()
  ) then
    raise exception 'Only an order you delivered.';
  end if;
  insert into rider_returns (day, amount, method, order_id) values (p_day, round(p_amount, 2), p_method, p_order_id);
end
$$;

revoke execute on function public.partner_orders(date), public.rider_day_money(date), public.partner_return(date, numeric, text, uuid) from public, anon;
grant execute on function public.partner_orders(date), public.rider_day_money(date), public.partner_return(date, numeric, text, uuid) to authenticated;

notify pgrst, 'reload schema';
