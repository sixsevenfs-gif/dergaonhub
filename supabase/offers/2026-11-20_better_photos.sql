-- Better pack photos for 10 products that are already live (names, sizes and prices stay the same):
-- Anmol Butter Bake, Nagwan almonds / pistachios / chia seeds / black kismis, Winkies Smilz Choco Haze,
-- Britannia Vita Marie Gold and the three Prayag Malai Paneer tins (one photo for all three sizes).
-- Matched by product id. Safe to run again. Push first so the photos (public/products/) are live.

update public.products p set photo_url = v.photo
from (values
  ('2ec1bc3d-7310-4b33-b183-21bf0a740127'::uuid, '/products/anmol-butter-bake-119g-v2.jpg'),            -- Anmol Butter Bake 119 g
  ('280b0f62-9c5f-49c7-98a8-394b725935c2'::uuid, '/products/nagwan-premium-almonds-250g.jpg'),           -- Nagwan Premium Quality Almonds 250 g
  ('4b2736e7-1389-459d-8a59-c72bdea980c7'::uuid, '/products/winkies-smilz-choco-haze-35g.jpg'),          -- Winkies Smilz Choco Haze
  ('23144840-f0a7-4cad-a6b2-39bdaa046b23'::uuid, '/products/britannia-vita-marie-gold-248g.jpg'),        -- Britannia Vita Marie Gold 248 g
  ('41d37d6c-a9d3-4f1b-9187-5329e035fe96'::uuid, '/products/nagwan-roasted-salted-pistachios-100g.jpg'), -- Nagwan Roasted & Salted Pistachios 100 g
  ('55d01731-f051-4cd5-a00f-dae6111ead96'::uuid, '/products/nagwan-chia-seeds-100g.jpg'),                -- Nagwan Chia Seeds 100 g
  ('270653a1-7b40-4355-95ca-e3520038d2ab'::uuid, '/products/nagwan-black-kismis-100g.jpg'),              -- Nagwan Black Kismis 100 g
  ('c5b0d998-7f68-4ed7-b4f7-ac657e592a8e'::uuid, '/products/prayag-malai-paneer-tin.jpg'),               -- Prayag Malai Paneer (tin) 200 g
  ('83676270-6d4e-4b68-8b01-b4e24997b5c0'::uuid, '/products/prayag-malai-paneer-tin.jpg'),               -- Prayag Malai Paneer (tin) 450 g
  ('d7db22ca-8b67-45ed-8353-cf6a9b7bff71'::uuid, '/products/prayag-malai-paneer-tin.jpg')                -- Prayag Malai Paneer (tin) 825 g
) as v(id, photo)
where p.id = v.id;

-- Check: all 10 should show the new /products/ photo
select name, size, price, photo_url from public.products
where id in ('2ec1bc3d-7310-4b33-b183-21bf0a740127', '280b0f62-9c5f-49c7-98a8-394b725935c2', '4b2736e7-1389-459d-8a59-c72bdea980c7',
             '23144840-f0a7-4cad-a6b2-39bdaa046b23', '41d37d6c-a9d3-4f1b-9187-5329e035fe96', '55d01731-f051-4cd5-a00f-dae6111ead96',
             '270653a1-7b40-4355-95ca-e3520038d2ab', 'c5b0d998-7f68-4ed7-b4f7-ac657e592a8e', '83676270-6d4e-4b68-8b01-b4e24997b5c0',
             'd7db22ca-8b67-45ed-8353-cf6a9b7bff71')
order by name, size;
