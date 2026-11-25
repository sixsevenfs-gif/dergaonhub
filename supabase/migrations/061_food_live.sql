-- Update 061: Jholzo Food for customers (read only).
-- The apps show a restaurant only when its Food Desk status is "Live" and it has an FSSAI number.
-- Customers get only what they need to order: no owner phone, UPI, deal, GST, papers or notes.
-- Prices: with a "markup" deal the customer price includes the markup, rounded up to the rupee;
-- with a commission or monthly deal it is the menu price. Half / Full prices work the same way.
-- Photos are paths in the public "food" bucket.
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.

create or replace function public.food_customer_price(p numeric, deal_type text, deal_value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p is null then null
    when deal_type = 'markup' and coalesce(deal_value, 0) > 0 then ceil(p * (1 + deal_value / 100))
    else p
  end
$$;

create or replace function public.food_live()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('restaurants', coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb))
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
      'cover_photo', r.cover_photo,
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
          'photo', m.photo,
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

-- Check: every restaurant in the Food Desk, and whether the app will show it.
-- "shows_in_app" is true only for Live restaurants with an FSSAI number.
select r.name,
       r.status,
       btrim(r.fssai_number) <> '' as has_fssai,
       r.fssai_expiry,
       r.cover_photo <> '' as has_cover_photo,
       count(m.id) as menu_items,
       count(m.id) filter (where m.photo <> '') as dish_photos,
       (r.status = 'live' and btrim(r.fssai_number) <> '') as shows_in_app
from public.food_restaurants r
left join public.food_menu_items m on m.restaurant_id = r.id
group by r.id
order by r.created_at;
