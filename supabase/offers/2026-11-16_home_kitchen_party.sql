-- 12 items from the Sankar store price survey (14 Nov 2026), in two new categories:
--   Home & Kitchen: Asian Super Stylo container set, Milton Solid Orbit buckets (25 / 20 / 18 / 15 / 11 L),
--                   two stainless steel water jugs (2 L), two printed serving trays.
--   Party & Birthday: Happy Birthday cake topper, Happy Birthday heart candle.
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Photos are files of the website (public/products/): they show once the new build is live,
-- so push first, then run this.

insert into public.categories (id, name, short, sort) values
  ('home', 'Home & Kitchen', 'Home & Kitchen', 14),
  ('party', 'Party & Birthday', 'Party', 15)
on conflict (id) do nothing;

insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Asian Super Stylo Container Set', 'Set of 3 (S, M, L)', 'home',
   'asian super stylo plastic storage container dabba storage jar box kitchen plastic set 3 piece atta rice daal', 495, '/products/asian-super-stylo-container-set-3.jpg'),
  ('Milton Solid Orbit Bucket, Red', '25 L', 'home',
   'milton solid orbit plastic bucket with handle balti red 25 litre ltr bathroom water', 480, '/products/milton-solid-orbit-bucket-red-25l.jpg'),
  ('Milton Solid Orbit Bucket, Sky Blue', '20 L', 'home',
   'milton solid orbit plastic bucket with handle balti blue sky blue 20 litre ltr bathroom water', 355, '/products/milton-solid-orbit-bucket-sky-blue-20l.jpg'),
  ('Milton Solid Orbit Bucket, Red', '18 L', 'home',
   'milton solid orbit plastic bucket with handle balti red 18 litre ltr bathroom water', 335, '/products/milton-solid-orbit-bucket-red-18l.jpg'),
  ('Milton Solid Orbit Bucket, Red', '15 L', 'home',
   'milton solid orbit plastic bucket with handle balti red 15 litre ltr bathroom water', 245, '/products/milton-solid-orbit-bucket-red-15l.jpg'),
  ('Milton Solid Orbit Bucket, Blue', '11 L', 'home',
   'milton solid orbit plastic bucket with handle balti blue 11 litre ltr small bathroom water', 232, '/products/milton-solid-orbit-bucket-blue-11l.jpg'),
  ('Stainless Steel Water Jug with Lid', '2 L', 'home',
   'stainless steel water jug jag pitcher lid flower etched 2 litre ltr dining table serving', 280, '/products/stainless-steel-water-jug-2l.jpg'),
  ('Fancy Steel Water Jug with Lid', '2 L', 'home',
   'fancy stainless steel water jug jag pitcher lid gold knob flower etched 2 litre ltr gift dining table serving premium', 650, '/products/fancy-steel-water-jug-flower-2l.jpg'),
  ('Printed Serving Tray, Red & Gold', '1 pc', 'home',
   'serving tray plate red gold printed design tea snacks guests', 85, '/products/serving-tray-red-gold.jpg'),
  ('Printed Serving Tray, Black & Gold', '1 pc', 'home',
   'serving tray plate black gold printed design tea snacks guests', 100, '/products/serving-tray-black-gold.jpg'),
  ('Happy Birthday Cake Topper', '1 pc', 'party',
   'happy birthday cake topper tag decoration party glossy colourful multicolour acrylic', 10, '/products/happy-birthday-cake-topper.jpg'),
  ('Happy Birthday Heart Candle', '1 pc', 'party',
   'happy birthday candle heart red wax cake party mombatti', 40, '/products/happy-birthday-heart-candle.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Buy prices, if update 034 is in. (Tick "Added to products" on the survey cards yourself: only a logged-in
-- owner can change that.)
do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/asian-super-stylo-container-set-3.jpg', 345),
      ('/products/milton-solid-orbit-bucket-red-25l.jpg', 335),
      ('/products/milton-solid-orbit-bucket-sky-blue-20l.jpg', 245),
      ('/products/milton-solid-orbit-bucket-red-18l.jpg', 230),
      ('/products/milton-solid-orbit-bucket-red-15l.jpg', 170),
      ('/products/milton-solid-orbit-bucket-blue-11l.jpg', 160),
      ('/products/stainless-steel-water-jug-2l.jpg', 210),
      ('/products/fancy-steel-water-jug-flower-2l.jpg', 450),
      ('/products/serving-tray-red-gold.jpg', 50),
      ('/products/serving-tray-black-gold.jpg', 50),
      ('/products/happy-birthday-cake-topper.jpg', 5.75),
      ('/products/happy-birthday-heart-candle.jpg', 18)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select c.name as category, p.name, p.size, p.price, pc.cost as buy_price
from public.products p join public.categories c on c.id = p.category_id
left join public.product_costs pc on pc.product_id = p.id
where p.category_id in ('home', 'party') order by c.sort, p.price desc;
