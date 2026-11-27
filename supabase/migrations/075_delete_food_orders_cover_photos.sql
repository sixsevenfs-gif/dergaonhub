-- 075: Delete test food orders (like grocery's Delete orders), and several cover photos for a restaurant that the
-- apps show one after another.
--
-- · Admin → Food → Delete orders (owner, with the same delete code as grocery): test or demo food orders leave the
--   database for good and count nowhere (sales, payouts, coupons used, reports). A short note of each stays in
--   deleted_food_orders for the owner. A no-show the order added no longer counts against the number.
-- · food_restaurants.cover_photos: up to 8 photos (Food Desk → Cover photos). food_live() gives them to the apps as
--   cover_photos; cover_photo stays the first one, so apps from before this update still show a photo.
--
-- Run after 072 (073 and 074 don't matter for it). Safe to run again; nothing else is deleted.

/* ---------------- delete test food orders ---------------- */

create table if not exists public.deleted_food_orders (
  id uuid primary key,
  order_number text not null,
  placed_at timestamptz,
  deleted_at timestamptz not null default now(),
  restaurant_name text not null default '',
  customer_name text not null default '',
  customer_phone text not null default '',
  status text not null default '',
  total numeric not null default 0,
  item_count int not null default 0,
  items jsonb not null default '[]'
);
alter table public.deleted_food_orders enable row level security;
drop policy if exists "owner reads deleted food orders" on public.deleted_food_orders;
create policy "owner reads deleted food orders" on public.deleted_food_orders for select using (is_admin());

create or replace function public.admin_delete_food_orders(p_ids uuid[], p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orders int;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not delete_code_ok(p_code) then raise exception 'Wrong delete code.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one order.'; end if;
  if cardinality(p_ids) > 200 then raise exception 'Delete at most 200 orders at a time.'; end if;

  -- A no-show these orders added (cash orders, like grocery) no longer counts against the number.
  update customers c set no_show_count = greatest(0, c.no_show_count - x.n)
  from (select customer_phone, count(*)::int as n from food_orders
        where id = any(p_ids) and status = 'cancelled' and cancel_reason = 'No-show' and payment_method = 'cash'
        group by customer_phone) x
  where c.phone = x.customer_phone;

  insert into deleted_food_orders (id, order_number, placed_at, restaurant_name, customer_name, customer_phone, status, total, item_count, items)
  select f.id, f.order_number, f.created_at, f.restaurant_name, f.customer_name, f.customer_phone, f.status, f.total,
         coalesce((select sum(i.qty) from food_order_items i where i.order_id = f.id), 0)::int,
         coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty) order by i.name)
                   from food_order_items i where i.order_id = f.id), '[]'::jsonb)
  from food_orders f where f.id = any(p_ids)
  on conflict (id) do nothing;

  delete from food_orders where id = any(p_ids);   -- its dishes go with it; help requests keep their messages
  get diagnostics v_orders = row_count;
  return jsonb_build_object('orders', v_orders);
end
$$;
revoke all on function public.admin_delete_food_orders(uuid[], text) from public, anon;
grant execute on function public.admin_delete_food_orders(uuid[], text) to authenticated;

-- The activity log (update 072): one line for each batch deleted.
create or replace function public.activity_log_deleted_food_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who jsonb := activity_actor();
  v_n int;
  v_first text;
  v_last text;
  v_total numeric;
begin
  if v_who is null then return null; end if;
  select count(*), min(order_number), max(order_number), coalesce(sum(total), 0) into v_n, v_first, v_last, v_total from gone;
  if v_n = 0 then return null; end if;
  insert into admin_activity (actor_id, actor_role, actor_name, area, entity, entity_id, label, action, changes)
  values (auth.uid(), v_who ->> 'role', coalesce(v_who ->> 'name', ''), 'orders', 'food_orders', '',
          v_n || case when v_n = 1 then ' food order' else ' food orders' end, 'bulk_delete',
          jsonb_build_object('count', v_n, 'first', v_first, 'last', v_last, 'total', v_total));
  return null;
exception when others then
  return null;
end
$$;
revoke execute on function public.activity_log_deleted_food_orders() from public, anon, authenticated;
drop trigger if exists deleted_food_orders_activity on public.deleted_food_orders;
create trigger deleted_food_orders_activity after insert on public.deleted_food_orders
  referencing new table as gone for each statement execute function public.activity_log_deleted_food_orders();

/* ---------------- several cover photos ---------------- */

alter table public.food_restaurants add column if not exists cover_photos text[] not null default '{}';
-- Restaurants with one cover photo start their list with it.
update public.food_restaurants set cover_photos = array[btrim(cover_photo)]
where btrim(coalesce(cover_photo, '')) <> '' and cardinality(cover_photos) = 0;

-- The photos to show, at most 8: cover_photo first (the Food Desk keeps it as the first of the list; a Food Desk
-- from before this update changes only cover_photo, and that photo then still shows), then the rest, no repeats.
create or replace function public.food_cover_list(p_cover text, p_covers text[]) returns text[]
language sql immutable as $$
  select coalesce((
    select array_agg(z.p order by z.o)
    from (
      select y.p, y.o from (
        select btrim(p_cover) as p, 0::bigint as o where btrim(coalesce(p_cover, '')) <> ''
        union all
        select btrim(u.c), u.ord from unnest(coalesce(p_covers, '{}'::text[])) with ordinality as u(c, ord)
        where btrim(coalesce(u.c, '')) <> '' and btrim(u.c) <> btrim(coalesce(p_cover, ''))
      ) y
      order by y.o
      limit 8
    ) z
  ), '{}'::text[])
$$;

create or replace function public.food_live()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('restaurants', coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb),
    -- Update 071: cold drinks from Jholzo's store, at the end of every menu, at the shop's own price.
    'addons', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', btrim(p.name), 'size', btrim(coalesce(p.size, '')), 'price', round(p.price),
        'photo', case when coalesce(p.photo_url, '') like '/%' then 'https://jholzo.com' || p.photo_url else coalesce(p.photo_url, '') end)
        order by p.price, p.name), '[]'::jsonb)
      from public.products p
      where p.food_addon and p.available and p.status = 'active' and p.price > 0))
  from (
    select r.name, jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'area', r.area,
      'address', r.address,
      'lat', r.lat,
      'lng', r.lng,
      'cuisines', to_jsonb(r.cuisines),
      'food_type', r.food_type,
      'opens_at', r.opens_at,
      'closes_at', r.closes_at,
      'closed_on', r.closed_on,
      'delivery_minutes', r.delivery_minutes,
      'cost_for_two', r.cost_for_two,
      'min_order', r.min_order,
      'packing_fee', r.packing_fee,
      'offer', r.offer,
      'fssai_number', btrim(r.fssai_number),
      -- Update 075: several cover photos, shown one after another; cover_photo stays the first (older apps).
      'cover_photo', (public.food_cover_list(r.cover_photo, r.cover_photos))[1],
      'cover_photos', to_jsonb(public.food_cover_list(r.cover_photo, r.cover_photos)),
      'menu', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'section', m.section,
          'name', m.name,
          'description', m.description,
          'diet', m.diet,
          'price', public.food_customer_price(m.price, r.deal_type, r.deal_value),
          'variants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'label', v->>'label',
              'price', public.food_customer_price(
                case when (v->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then (v->>'price')::numeric end,
                r.deal_type, r.deal_value)))
            from jsonb_array_elements(case when jsonb_typeof(m.variants) = 'array' then m.variants else '[]'::jsonb end) v
            where coalesce(v->>'label', '') <> ''
          ), '[]'::jsonb),
          'photo', case when btrim(m.photo) <> '' then m.photo else public.food_sample_photo(m.name, m.section) end,
          'photo_sample', btrim(m.photo) = '' and public.food_sample_photo(m.name, m.section) is not null,
          'available', m.available,
          'bestseller', m.bestseller
        ) order by m.sort, m.created_at)
        from public.food_menu_items m
        where m.restaurant_id = r.id and btrim(m.name) <> ''
      ), '[]'::jsonb)
    ) as j
    from public.food_restaurants r
    where r.status = 'live' and btrim(r.fssai_number) <> ''
  ) x
$$;

revoke all on function public.food_live() from public;
grant execute on function public.food_live() to anon, authenticated;

notify pgrst, 'reload schema';
