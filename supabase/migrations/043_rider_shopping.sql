-- Update 043: the rider's shopping at the shop.
-- Run once in Supabase → SQL Editor (after update 034, buy prices). Safe to run again; nothing is deleted.
--
-- 1. Ticks ("picked") are saved with the order, not on one phone: they stay after logging out or on another phone.
--    A tick means "I bought this" and remembers who ticked (picked_by): the owner ticks what the owner bought, and
--    a rider cannot change someone else's tick (update 044 counts each rider's own ticks as money they spent).
-- 2. The rider sees what to pay the shop for each item of their orders: the buy price (update 034), or the MRP
--    when there is no buy price yet, and the total. Only for orders assigned to them; customers never see it.
-- 3. The shop asked for more? The rider writes what they paid and adds a photo of the shop's bill. The owner sees
--    it on the order (expected vs paid, with the photo) and the profit uses what was really paid.

alter table public.order_items add column if not exists picked boolean not null default false;
alter table public.order_items add column if not exists picked_by uuid references auth.users on delete set null;

-- One per order. A separate table so customers (who can read their own orders) never see shop prices.
create table if not exists public.order_shop_bills (
  order_id uuid primary key references public.orders on delete cascade,
  expected numeric(10,2) not null,          -- buy prices (MRP where there is none) × quantity, when the bill was added
  paid numeric(10,2) not null check (paid > 0),
  photo text not null check (photo <> ''),  -- path in the private "deliveries" bucket
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null
);
alter table public.order_shop_bills enable row level security;
drop policy if exists "owner reads shop bills" on public.order_shop_bills;
create policy "owner reads shop bills" on public.order_shop_bills for select using (is_admin());

-- What the rider should pay the shop for one item: buy price when the item was ordered, else today's buy
-- price, else the MRP (the sale's "was" price, or the selling price).
create or replace function public.shop_price_of(p_item order_items) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'buy_price', coalesce((select c.cost from order_item_costs c where c.order_item_id = p_item.id),
                          (select c.cost from product_costs c where c.product_id = p_item.product_id)),
    'mrp', coalesce((select p.compare_price from products p where p.id = p_item.product_id), p_item.price_snapshot))
$$;
revoke execute on function public.shop_price_of(order_items) from public, anon, authenticated;

-- What the calling rider should pay the shop for an order: every item except those someone else (the owner) bought.
create or replace function public.shop_expected(p_order_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.quantity * coalesce((shop_price_of(i) ->> 'buy_price')::numeric, (shop_price_of(i) ->> 'mrp')::numeric)), 0)
  from order_items i where i.order_id = p_order_id
    and not (i.picked and i.picked_by is not null and i.picked_by <> auth.uid())
$$;
revoke execute on function public.shop_expected(uuid) from public, anon, authenticated;

-- As in update 033, plus per item: picked, buy_price, mrp; per order: shop_bill.
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
        'shop_bill', (select to_jsonb(b) - 'created_by' from order_shop_bills b where b.order_id = o.id)
      ) order by o.area, o.created_at), '[]')
    from orders o
    where o.delivery_date = p_date and o.status <> 'cancelled'
      and (v_admin or o.rider_id = auth.uid() or o.delivered_by = auth.uid())
  );
end
$$;

-- Tick one item, or every item of the order (p_item_id null), while the order is out for shopping. Only items
-- whose tick changes are touched, so "tick all" keeps who bought the others. A rider leaves the owner's ticks alone.
create or replace function public.partner_set_picked(p_order_id uuid, p_item_id uuid, p_picked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_on boolean := coalesce(p_picked, false);
begin
  perform check_my_order(p_order_id);
  if not exists (select 1 from orders where id = p_order_id and status = 'confirmed') then
    raise exception 'Only confirmed orders can be ticked.';
  end if;
  update order_items set picked = v_on, picked_by = case when v_on then auth.uid() end
  where order_id = p_order_id and (p_item_id is null or id = p_item_id) and picked <> v_on
    and (is_admin() or picked_by is null or picked_by = auth.uid());
end
$$;

-- The shop asked for more than the buy prices: what the rider paid, with a photo of the bill. p_paid null removes it.
create or replace function public.partner_shop_bill(p_order_id uuid, p_paid numeric, p_photo text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform check_my_order(p_order_id);
  if not exists (select 1 from orders where id = p_order_id and status in ('confirmed', 'completed')) then
    raise exception 'This order is not out for delivery.';
  end if;
  if p_paid is null then
    delete from order_shop_bills where order_id = p_order_id;
    return;
  end if;
  if p_paid <= 0 or p_paid > 100000 then raise exception 'Write what you paid at the shop.'; end if;
  if coalesce(p_photo, '') = '' then raise exception 'Take a photo of the shop''s bill first.'; end if;
  insert into order_shop_bills (order_id, expected, paid, photo, note)
  values (p_order_id, shop_expected(p_order_id), round(p_paid, 2), p_photo, left(coalesce(p_note, ''), 300))
  on conflict (order_id) do update set expected = excluded.expected, paid = excluded.paid, photo = excluded.photo,
    note = excluded.note, created_at = now(), created_by = auth.uid();
end
$$;

revoke execute on function public.partner_orders(date), public.partner_set_picked(uuid, uuid, boolean),
  public.partner_shop_bill(uuid, numeric, text, text) from public, anon;
grant execute on function public.partner_orders(date), public.partner_set_picked(uuid, uuid, boolean),
  public.partner_shop_bill(uuid, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
