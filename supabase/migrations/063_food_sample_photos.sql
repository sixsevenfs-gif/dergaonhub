-- Update 063: sample photos for dishes that have no photo yet.
-- A dish with no photo in the Food Desk gets a sample photo by its name ("Chicken Roll" → chicken roll),
-- the longest matching word wins ("Chicken Egg Roll" → egg roll; "Pork Chowmein" → pork chowmein).
-- The photos are free-licence stock photos (Pexels) on the website: jholzo.com/food-samples/…
-- The app shows a small note under such a menu: the photos are for illustration.
-- A real photo added in the Food Desk always wins.
-- Run once in Supabase → SQL Editor, after 061 and 062. Safe to run again.

create table if not exists public.food_sample_photos (
  keyword text primary key check (keyword = lower(btrim(keyword)) and keyword <> ''),
  photo text not null,
  updated_at timestamptz not null default now()
);
alter table public.food_sample_photos enable row level security;
drop policy if exists "food desk sample photos" on public.food_sample_photos;
create policy "food desk sample photos" on public.food_sample_photos for all using (is_desk()) with check (is_desk());

insert into public.food_sample_photos (keyword, photo)
select k, 'https://jholzo.com/food-samples/' || f || '.jpg'
from (values
  ('fried rice', 'veg-fried-rice'), ('veg fried rice', 'veg-fried-rice'), ('vegetable fried rice', 'veg-fried-rice'),
  ('chicken fried rice', 'chicken-fried-rice'), ('egg fried rice', 'egg-fried-rice'), ('pork fried rice', 'pork-fried-rice'),
  ('paneer fried rice', 'paneer-fried-rice'), ('mix fried rice', 'mixed-fried-rice'), ('mixed fried rice', 'mixed-fried-rice'),
  ('chowmein', 'veg-chowmein'), ('chow mein', 'veg-chowmein'), ('noodles', 'veg-chowmein'), ('hakka', 'veg-chowmein'),
  ('veg chowmein', 'veg-chowmein'), ('veg chow mein', 'veg-chowmein'), ('veg noodles', 'veg-chowmein'),
  ('chicken chowmein', 'chicken-chowmein'), ('chicken chow mein', 'chicken-chowmein'), ('chicken noodles', 'chicken-chowmein'),
  ('egg chowmein', 'egg-chowmein'), ('egg noodles', 'egg-chowmein'), ('paneer chowmein', 'paneer-chowmein'),
  ('pork chowmein', 'pork-chowmein'), ('mix chowmein', 'mixed-chowmein'), ('mixed chowmein', 'mixed-chowmein'),
  ('roll', 'veg-roll'), ('wrap', 'veg-roll'), ('veg roll', 'veg-roll'), ('chicken roll', 'chicken-roll'),
  ('egg roll', 'egg-roll'), ('paneer roll', 'paneer-roll'), ('pork roll', 'pork-roll'),
  ('chilli chicken', 'chilli-chicken'), ('chili chicken', 'chilli-chicken'), ('chicken chilli', 'chilli-chicken'),
  ('chicken manchurian', 'chilli-chicken'),
  ('chicken pakora', 'chicken-pakora'), ('chicken fry', 'chicken-pakora'), ('chicken 65', 'chicken-pakora'),
  ('fried chicken', 'chicken-pakora'), ('chicken dry', 'chicken-pakora'),
  ('thali', 'veg-thali'), ('veg thali', 'veg-thali'), ('chicken thali', 'chicken-thali'), ('fish thali', 'fish-thali'),
  ('fish curry', 'fish-thali'),
  ('roti', 'roti'), ('chapati', 'roti'), ('paratha', 'paratha'), ('parotta', 'paratha'),
  ('pork', 'pork-fry'), ('pork fry', 'pork-fry'), ('pork dry fry', 'pork-fry'),
  ('paneer', 'paneer-curry'), ('chilli paneer', 'chilli-paneer'), ('chili paneer', 'chilli-paneer'),
  ('momo', 'veg-momos'), ('veg momo', 'veg-momos'), ('chicken momo', 'chicken-momos'), ('pork momo', 'chicken-momos'),
  ('chicken curry', 'chicken-curry'), ('egg curry', 'egg-curry'),
  ('biryani', 'chicken-biryani'), ('chicken biryani', 'chicken-biryani'), ('egg biryani', 'egg-biryani'),
  ('fries', 'fries'), ('french fries', 'fries'), ('finger chips', 'fries')
) as v(k, f)
on conflict (keyword) do update set photo = excluded.photo, updated_at = now();

-- The sample photo for a dish name (or, failing that, its menu section): the longest keyword it contains.
create or replace function public.food_sample_photo(p_name text, p_section text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.photo from public.food_sample_photos s
      where position(s.keyword in lower(coalesce(p_name, ''))) > 0
      order by length(s.keyword) desc limit 1),
    (select s.photo from public.food_sample_photos s
      where position(s.keyword in lower(coalesce(p_section, ''))) > 0
      order by length(s.keyword) desc limit 1))
$$;
revoke all on function public.food_sample_photo(text, text) from public;

-- food_live() from 061, now with a sample photo and "photo_sample": true for dishes without a photo.
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

-- Check: each Live dish and the photo it will show.
select r.name as restaurant, m.name as dish,
       case when btrim(m.photo) <> '' then 'own photo'
            else coalesce(regexp_replace(public.food_sample_photo(m.name, m.section), '^.*/', ''), 'no photo') end as photo
from public.food_restaurants r
join public.food_menu_items m on m.restaurant_id = r.id
where r.status = 'live' and btrim(r.fssai_number) <> ''
order by r.name, m.sort, m.created_at;
