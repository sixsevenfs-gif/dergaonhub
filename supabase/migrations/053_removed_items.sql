-- Update 053: an item not found at the shop is taken off the order, and the customer sees it.
-- Run once in Supabase → SQL Editor, AFTER update 051 (gift money) and 052. Safe to run again; nothing is deleted.
--
-- 1) The rider can take an item off THEIR order (assigned to them, not delivered yet), like the owner and the
--    order desk already can. The total, packaging and gift money are worked out again in the database.
-- 2) Every removed item is kept in order_removed_items (name, quantity, price, who, when), so the customer's order
--    page shows it struck through as "Not available" with the lower total, and the owner sees who removed it.
-- 3) get_order (customer's order page) and partner_orders (rider page) also return the removed items.

create table if not exists public.order_removed_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  product_id uuid references public.products on delete set null,
  name_snapshot text not null,
  price_snapshot int not null,
  quantity int not null,
  line_total int not null,
  reason text not null default 'Not available at the shop',
  removed_by uuid default auth.uid() references auth.users on delete set null,
  removed_at timestamptz not null default now()
);
create index if not exists order_removed_items_order_idx on public.order_removed_items (order_id);
alter table public.order_removed_items enable row level security;
-- Same readers as order_items: the customer who placed the order, the owner and the order desk. Rows are written
-- only by desk_remove_item (security definer), so there is no insert/update policy.
drop policy if exists "read removed items of visible orders" on public.order_removed_items;
create policy "read removed items of visible orders" on public.order_removed_items for select
  using (is_desk() or exists (select 1 from orders o where o.id = order_id and o.placed_by = auth.uid()));

-- As in update 051, plus: riders may remove from their own orders, and the removed item is kept.
create or replace function public.desk_remove_item(p_order_id uuid, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  it order_items;
  v_left int;
  v_sub int;
  v_back numeric := 0;
  v_give numeric;
  g record;
begin
  if not (is_desk() or is_staff()) then raise exception 'Only the Jholzo team can change orders.'; end if;
  if not is_desk() then perform check_my_order(p_order_id); end if;   -- a rider: only an order assigned to them
  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.status not in ('placed', 'confirmed') then raise exception 'This order can no longer be changed.'; end if;
  select * into it from order_items where id = p_item_id and order_id = p_order_id;
  if it.id is null then raise exception 'This item is not on the order.'; end if;
  select count(*), coalesce(sum(line_total), 0) into v_left, v_sub from order_items where order_id = p_order_id and id <> p_item_id;
  if v_left = 0 then raise exception 'You cannot remove the last item. Cancel the order instead.'; end if;
  insert into order_removed_items (order_id, product_id, name_snapshot, price_snapshot, quantity, line_total)
  values (it.order_id, it.product_id, it.name_snapshot, it.price_snapshot, it.quantity, it.line_total);
  delete from order_items where id = p_item_id and order_id = p_order_id;
  if coalesce(o.gift_used, 0) > v_sub then
    v_back := o.gift_used - v_sub;
    -- Back first to the gift that lasts longest.
    for g in select m.gift_id, -sum(m.amount) as used from wallet_gift_moves m join wallet_gifts wg on wg.id = m.gift_id
             where m.order_id = p_order_id group by m.gift_id, wg.expires_at having sum(m.amount) < 0
             order by wg.expires_at desc loop
      exit when v_back <= 0;
      v_give := least(g.used, v_back);
      insert into wallet_gift_moves (gift_id, order_id, amount, kind) values (g.gift_id, p_order_id, v_give, 'returned');
      v_back := v_back - v_give;
    end loop;
    v_back := o.gift_used - v_sub - v_back;   -- what actually went back
  end if;
  update orders set subtotal = v_sub, packaging_fee = public.packaging_fee(v_sub),
    gift_used = coalesce(gift_used, 0) - v_back, wallet_used = coalesce(wallet_used, 0) - v_back,
    total = greatest(0, v_sub + delivery_fee + coalesce(express_fee, 0) + public.packaging_fee(v_sub) - (coalesce(wallet_used, 0) - v_back))
  where id = p_order_id;
end
$$;

-- As in update 018, plus 'removed': items taken off the order (not at the shop).
create or replace function public.get_order(p_order_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', case when o.placed_by = auth.uid() or is_staff() then to_jsonb(o) - array['placed_by', 'customer_id', 'orderer_id']
                  else jsonb_build_object(
                    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'dispatch', o.dispatch,
                    'delivery_date', o.delivery_date, 'created_at', o.created_at, 'completed_at', o.completed_at,
                    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'packaging_fee', o.packaging_fee,
                    'wallet_used', o.wallet_used, 'delivery_type', o.delivery_type, 'express_fee', o.express_fee, 'express_by', o.express_by,
                    'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                    'cancel_reason', o.cancel_reason, 'customer_name', '', 'ordered_by_phone', '', 'ordered_by_name', '') end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_snapshot', i.name_snapshot, 'price_snapshot', i.price_snapshot,
                                                           'quantity', i.quantity, 'line_total', i.line_total, 'note', i.note) order by i.name_snapshot), '[]')
              from order_items i where i.order_id = o.id),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name_snapshot', r.name_snapshot, 'quantity', r.quantity,
                                                             'line_total', r.line_total, 'reason', r.reason, 'removed_at', r.removed_at) order by r.removed_at), '[]')
                from order_removed_items r where r.order_id = o.id),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from complaints k
                   where k.order_id = o.id and (o.placed_by = auth.uid() or is_admin())),
    'mine', o.placed_by = auth.uid()
  )
  from orders o
  where upper(o.order_number) = upper(p_order_number)
$$;

-- As in update 046, plus 'removed'.
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
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid())
  );
end
$$;

revoke execute on function public.desk_remove_item(uuid, uuid), public.partner_orders(date) from public, anon;
grant execute on function public.desk_remove_item(uuid, uuid), public.partner_orders(date) to authenticated;
grant execute on function public.get_order(text) to anon, authenticated;

notify pgrst, 'reload schema';
