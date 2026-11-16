-- 10 more items from the Sankar store price survey (14 Nov 2026):
--   Pooja Needs: Brass Shanku Chakra diya, brass oil lamp, brass diya, brass kalash (pital lota)
--   Cleaning: Phool jhadu   ·   Home & Kitchen: multipurpose picnic basket
--   Personal Care: Bella Vita Skai Aquatic and Polar Breeze, Clensta Noble and Majesty body sprays
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Push first so the photos (public/products/) are live, then run this. It also adds the
-- Home & Kitchen category in case 2026-11-16_home_kitchen_party.sql has not been run yet.

insert into public.categories (id, name, short, sort) values ('home', 'Home & Kitchen', 'Home & Kitchen', 14)
on conflict (id) do nothing;

insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Brass Shanku Chakra Diya (Pure Pital)', '1 pc', 'pooja',
   'brass shanku chakra shankh chakra diya deepam lamp pure pital pooja puja oil lamp', 350, '/products/brass-shanku-chakra-diya.jpg'),
  ('Brass Oil Lamp, Small', '1 pc', 'pooja',
   'brass oil lamp diya deepak pital small pooja puja wick holder', 150, '/products/brass-oil-lamp-small.jpg'),
  ('Brass Diya (Pure Pital), Small', '1 pc', 'pooja',
   'brass diya deepak pure pital small pooja puja oil lamp', 150, '/products/brass-diya-small.jpg'),
  ('Brass Kalash / Pital Lota, Small', '1 pc', 'pooja',
   'brass kalash pital lota pooja chembu small puja water pot', 280, '/products/brass-kalash-lota-small.jpg'),
  ('Phool Jhadu Broom (packaging may differ)', '1 pc', 'cleaning',
   'phool jhadu broom grass soft jharu jhaadu floor cleaning', 100, '/products/phool-jhadu-broom.jpg'),
  ('Multipurpose Picnic Basket with Lid', '1 pc', 'home',
   'plastic multipurpose storage picnic basket lid handle tokri vegetable fruit', 558, '/products/plastic-picnic-basket-with-lid.jpg'),
  ('Bella Vita Skai Aquatic Deo Parfum', '150 ml', 'personal',
   'bella vita bellavita skai aquatic deo parfum perfume body spray no gas luxury men', 249, '/products/bella-vita-skai-aquatic-deo-150ml.jpg'),
  ('Bella Vita Polar Breeze Body Spray', '200 ml', 'personal',
   'bella vita bellavita polar breeze fragrance body spray deo deodorant mega pack', 299, '/products/bella-vita-polar-breeze-200ml.jpg'),
  ('Clensta Noble Body Spray (0% Gas)', '150 ml', 'personal',
   'clensta noble 0 gas no gas fragrance body spray deo perfume men', 349, '/products/clensta-noble-body-spray-150ml.jpg'),
  ('Clensta Majesty Body Spray (0% Gas)', '150 ml', 'personal',
   'clensta majesty 0 gas no gas fragrance body spray deo perfume men', 349, '/products/clensta-majesty-body-spray-150ml.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/brass-shanku-chakra-diya.jpg', 300),
      ('/products/brass-oil-lamp-small.jpg', 125),
      ('/products/brass-diya-small.jpg', 125),
      ('/products/brass-kalash-lota-small.jpg', 250),
      ('/products/phool-jhadu-broom.jpg', 70),
      ('/products/plastic-picnic-basket-with-lid.jpg', 380),
      ('/products/bella-vita-skai-aquatic-deo-150ml.jpg', 150),
      ('/products/bella-vita-polar-breeze-200ml.jpg', 110),
      ('/products/clensta-noble-body-spray-150ml.jpg', 140),
      ('/products/clensta-majesty-body-spray-150ml.jpg', 140)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select c.name as category, p.name, p.size, p.price, pc.cost as buy_price
from public.products p join public.categories c on c.id = p.category_id
left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in ('/products/brass-shanku-chakra-diya.jpg', '/products/brass-oil-lamp-small.jpg', '/products/brass-diya-small.jpg',
  '/products/brass-kalash-lota-small.jpg', '/products/phool-jhadu-broom.jpg', '/products/plastic-picnic-basket-with-lid.jpg',
  '/products/bella-vita-skai-aquatic-deo-150ml.jpg', '/products/bella-vita-polar-breeze-200ml.jpg',
  '/products/clensta-noble-body-spray-150ml.jpg', '/products/clensta-majesty-body-spray-150ml.jpg')
order by c.sort, p.price desc;
