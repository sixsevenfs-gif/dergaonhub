-- 3 mustard oils from the Shanka wholesale survey (6 Nov 2026), in Oil & Ghee:
--   Engine Kachi Ghani Mustard Oil 1 L and 500 ml, Dalda Kachi Ghani Mustard Oil 1 L.
-- Oil has a thin margin, so these sit just under MRP (MRP shown struck through), close to Dhara at ₹240.
-- The shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each name + size
-- only once). Push first so the photos (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, 'oil', v.keywords, v.price, v.mrp, v.photo, true, 'active'
from (values
  ('Engine Kachi Ghani Mustard Oil', '1 L',
   'engine brand kachi ghani mustard oil sarson tel sorioh tel agmark grade 1 bottle 1 litre', 269, 276, '/products/engine-kachi-ghani-mustard-oil-1l.jpg'),
  ('Engine Kachi Ghani Mustard Oil', '500 ml',
   'engine brand kachi ghani mustard oil sarson tel sorioh tel agmark grade 1 bottle half litre', 139, 141, '/products/engine-kachi-ghani-mustard-oil-500ml.jpg'),
  ('Dalda Kachi Ghani Mustard Oil', '1 L',
   'dalda kachi ghani mustard oil sarson tel sorioh tel vitamin a d bottle 1 litre', 239, 245, '/products/dalda-kachi-ghani-mustard-oil-1l.jpg')
) as v(name, size, keywords, price, mrp, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/engine-kachi-ghani-mustard-oil-1l.jpg', 228),
      ('/products/engine-kachi-ghani-mustard-oil-500ml.jpg', 117),
      ('/products/dalda-kachi-ghani-mustard-oil-1l.jpg', 210)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Product page text (update 055), in the same words as the other mustard oils. Skipped before 055.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = v.d
    from (values
      ('/products/engine-kachi-ghani-mustard-oil-1l.jpg', 'Kachi ghani (cold-pressed) mustard oil with a strong aroma, Agmark Grade 1. For frying fish, cooking sabzi, pickles and tadka.'),
      ('/products/engine-kachi-ghani-mustard-oil-500ml.jpg', 'Kachi ghani (cold-pressed) mustard oil with a strong aroma, Agmark Grade 1, in a 500 ml bottle. For frying fish, cooking sabzi, pickles and tadka.'),
      ('/products/dalda-kachi-ghani-mustard-oil-1l.jpg', 'Kachi ghani (cold-pressed) mustard oil with added vitamins A and D. For frying fish, cooking sabzi, pickles and tadka.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.compare_price as mrp, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.category_id = 'oil' and (p.name ilike '%mustard%')
order by p.name, p.price desc;
