-- Update 074: customers see their food bill, never Jholzo's deal with the restaurant.
--
-- Until now a customer's app could read every column of its own food orders straight from the database (for
-- example with select=*), including the restaurant's menu prices (menu_total, food_order_items.menu_price), the
-- deal (deal_type, deal_value) and what the rider paid the restaurant at pickup (restaurant_paid, restaurant_paid_at).
-- From this update:
--   · Customers can still read every other column of their own orders and dishes, but not those six: asking for
--     them, or for "*", is refused. The apps from this update ask for their columns by name. Realtime also leaves
--     the six out. (Anyone not signed in still sees no orders at all.)
--   · The owner and the executive read food orders through desk_food_orders() below, which gives every column, as
--     before. The website from this update uses it: push the website first, then run this.
--   · Riders, the desk's buttons, sales, payouts, Telegram and push already go through database functions or the
--     server key, so nothing changes for them.
--
-- For later updates: a new column of food_orders or food_order_items stays hidden from the apps until it is granted
-- (grant select (new_column) on public.food_orders to anon, authenticated). The "food order items read" rule (064)
-- reads id, placed_by, customer_phone and rider_id of food_orders as the person asking, so those must stay granted.
--
-- Run after 072 (073 can come before or after it). Safe to run again; nothing is deleted.

do $$
declare
  v_cols text;
begin
  -- food_orders: every column except the restaurant's prices, the deal and the restaurant payment.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = 'public.food_orders'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any (array[
      'id', 'order_number', 'created_at', 'placed_by', 'restaurant_id', 'restaurant_name', 'restaurant_address',
      'customer_name', 'customer_phone', 'address', 'area', 'lat', 'lng', 'distance_km', 'note', 'status',
      'payment_method', 'items_total', 'packing_fee', 'delivery_fee', 'platform_fee', 'gst', 'total',
      'rider_id', 'assigned_at', 'confirmed_at', 'confirmed_by', 'picked_at', 'delivered_at', 'delivered_by',
      'cancelled_at', 'cancelled_by', 'cancel_reason', 'tg_placed_sent', 'tg_cancel_sent',
      'rider_stage', 'rider_name', 'rider_phone', 'to_restaurant_at', 'at_restaurant_at', 'arriving_at',   -- 067
      'coupon_id', 'coupon_code', 'discount',                                                             -- 070
      'store_items_total',                                                                                -- 071
      'leave_at'                                                                                          -- 073
    ]);
  revoke select on public.food_orders from anon, authenticated;   -- also clears earlier column grants
  execute format('grant select (%s) on public.food_orders to anon, authenticated', v_cols);

  -- food_order_items: every column except the restaurant's price of the dish.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = 'public.food_order_items'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any (array[
      'id', 'order_id', 'menu_item_id', 'name', 'variant', 'diet', 'qty', 'price', 'line_total',
      'product_id', 'from_store'                                                                          -- 071
    ]);
  revoke select on public.food_order_items from anon, authenticated;
  execute format('grant select (%s) on public.food_order_items to anon, authenticated', v_cols);
end
$$;

-- The owner's and executive's food orders with every column and their dishes (food_order_items), the same as
-- select=*,food_order_items(*) gave before: placed from p_from (included) to p_to (not included), or one order
-- (p_id); newest first, or oldest first. At most 1000 at a time: ask again with p_offset for the next ones.
create or replace function public.desk_food_orders(
  p_from timestamptz default null, p_to timestamptz default null, p_id uuid default null,
  p_oldest_first boolean default false, p_limit int default 500, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_old boolean := coalesce(p_oldest_first, false);
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  return (
    select coalesce(jsonb_agg(x.j order by case when v_old then x.created_at end,
                                           case when not v_old then x.created_at end desc, x.id), '[]'::jsonb)
    from (
      select f.id, f.created_at, to_jsonb(f) || jsonb_build_object('food_order_items',
               coalesce((select jsonb_agg(to_jsonb(i)) from food_order_items i where i.order_id = f.id), '[]'::jsonb)) as j
      from food_orders f
      where (p_id is null or f.id = p_id)
        and (p_from is null or f.created_at >= p_from)
        and (p_to is null or f.created_at < p_to)
      order by case when v_old then f.created_at end, case when not v_old then f.created_at end desc, f.id
      limit least(greatest(coalesce(p_limit, 500), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)
    ) x
  );
end
$$;
revoke all on function public.desk_food_orders(timestamptz, timestamptz, uuid, boolean, int, int) from public, anon;
grant execute on function public.desk_food_orders(timestamptz, timestamptz, uuid, boolean, int, int) to authenticated;

notify pgrst, 'reload schema';

-- Check: the first two say false (customers can't read the restaurant's prices), the last two true.
select has_column_privilege('authenticated', 'public.food_orders', 'menu_total', 'SELECT') as customers_see_menu_total,
       has_column_privilege('authenticated', 'public.food_order_items', 'menu_price', 'SELECT') as customers_see_menu_price,
       has_column_privilege('authenticated', 'public.food_orders', 'total', 'SELECT') as customers_see_bill,
       to_regprocedure('public.desk_food_orders(timestamptz, timestamptz, uuid, boolean, integer, integer)') is not null as desk_reads_ready;
