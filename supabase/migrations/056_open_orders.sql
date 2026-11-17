-- Update 056: an order nobody is delivering yet rings on EVERY rider's phone; the first to tap "I'll deliver"
-- gets it. Run once in Supabase → SQL Editor, after 055. Safe to run again; nothing is deleted.
--
-- 1) partner_alerts (Partner app ring): a rider now also gets confirmed orders that have no rider yet.
-- 2) partner_orders (rider page): a rider also sees those open orders, under "New orders".
-- 3) rider_take(order): the order becomes this rider's, only if nobody took it first (two taps at the same
--    moment: one wins, the other is told who has it). rider_give_back(order): before leaving the store, a rider can
--    hand it back to everyone.
-- Orders the owner or executive assigns to someone still go only to that rider. For everyone to get new orders,
-- set Admin → Settings → Team → "New orders go to" to "Nobody".

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
      and ((v_admin and o.status in ('placed', 'confirmed'))
           or (o.status = 'confirmed' and (o.rider_id = auth.uid() or (o.rider_id is null and coalesce(o.dispatch, '') = ''))))
  );
end
$$;

-- As in update 053, plus open orders (confirmed, no rider, not on the way) for riders.
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
        'removed', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name_snapshot', r.name_snapshot, 'quantity', r.quantity,
                                                                 'line_total', r.line_total, 'removed_at', r.removed_at,
                                                                 'removed_by_name', coalesce((select t.name from riders t where t.user_id = r.removed_by), ''))
                                      order by r.removed_at), '[]')
                    from order_removed_items r where r.order_id = o.id),
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
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid()
           or (o.status = 'confirmed' and o.rider_id is null and coalesce(o.dispatch, '') = ''))
  );
end
$$;

-- "I'll deliver": the open order becomes this rider's. Only one rider can win it.
create or replace function public.rider_take(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  if not is_rider() then raise exception 'Only delivery partners can take orders.'; end if;
  update orders set rider_id = auth.uid(), assigned_at = now()
  where id = p_order_id and rider_id is null and status = 'confirmed' and coalesce(dispatch, '') = '';
  if found then return; end if;
  select * into o from orders where id = p_order_id;
  if o.rider_id = auth.uid() then return; end if;   -- already yours (tapped twice)
  if o.rider_id is not null then
    raise exception '% is already delivering this order.', coalesce((select name from riders where user_id = o.rider_id), 'Another rider');
  end if;
  raise exception 'This order is no longer open.';
end
$$;

-- Before leaving the store: give the order back so another rider can take it.
create or replace function public.rider_give_back(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_rider() then raise exception 'Only delivery partners can do this.'; end if;
  update orders set rider_id = null, assigned_at = null
  where id = p_order_id and rider_id = auth.uid() and status = 'confirmed' and coalesce(dispatch, '') = '';
  if not found then raise exception 'You can give an order back only before you leave with it. Call the owner.'; end if;
end
$$;

revoke execute on function public.partner_alerts(), public.partner_orders(date),
  public.rider_take(uuid), public.rider_give_back(uuid) from public, anon;
grant execute on function public.partner_alerts(), public.partner_orders(date),
  public.rider_take(uuid), public.rider_give_back(uuid) to authenticated;

notify pgrst, 'reload schema';
