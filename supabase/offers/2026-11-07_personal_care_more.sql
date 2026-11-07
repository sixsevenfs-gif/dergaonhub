-- Add 9 items from the Shanka price survey: Kissan Mixed Fruit Jam cup 90 g, Patanjali Saundarya Aloe Vera Gel,
-- Clinic Plus Strong & Long, Dove Daily Shine Shampoo, Amul Mithai Mate, Lakmé Sun Expert SPF 30, Boroline, Dabur
-- Gulabari, Renu Raw Til Oil. None of them is in the store yet (the Kissan jar already there is 200 g). Sold at MRP;
-- the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each name + size only
-- once). Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Kissan Mixed Fruit Jam', '90 g', 'snacks', 'kissan mixed fruit jam cup small bread spread breakfast', 27, '/products/kissan-mixed-fruit-jam-cup-90g.jpg'),
  ('Patanjali Saundarya Aloe Vera Gel', '150 ml', 'personal', 'patanjali saundarya aloe vera gel skin face', 100, '/products/patanjali-saundarya-aloe-vera-gel-150ml.jpg'),
  ('Clinic Plus Strong & Long Shampoo', '175 ml', 'personal', 'clinic plus strong long health shampoo hair milk protein', 153, '/products/clinic-plus-strong-long-175ml.jpg'),
  ('Dove Daily Shine Shampoo', '180 ml', 'personal', 'dove daily shine damage therapy shampoo hair', 189, '/products/dove-daily-shine-shampoo-180ml.jpg'),
  ('Amul Mithai Mate Condensed Milk', '400 g', 'dairy', 'amul mithai mate sweetened condensed milk tin mithai kheer', 130, '/products/amul-mithai-mate-400g.jpg'),
  ('Lakmé 9to5 Sun Expert SPF 30 Sunscreen', '50 ml', 'personal', 'lakme lakmé 9to5 sun expert super matte spf 30 sunscreen lotion', 320, '/products/lakme-sun-expert-spf30-50ml.jpg'),
  ('Boroline Antiseptic Cream', '20 g', 'personal', 'boroline antiseptic ayurvedic cream cracked skin', 45, '/products/boroline-20g.jpg'),
  ('Dabur Gulabari Rose Water', '120 ml', 'personal', 'dabur gulabari premium rose water gulab jal', 54, '/products/dabur-gulabari-rose-water-120ml.jpg'),
  ('Renu Raw Til Oil', '100 ml', 'personal', 'renu raw til oil sesame kacha til tel hair body massage', 80, '/products/renu-raw-til-oil-100ml.jpg')
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
      ('/products/kissan-mixed-fruit-jam-cup-90g.jpg', 25),
      ('/products/patanjali-saundarya-aloe-vera-gel-150ml.jpg', 90),
      ('/products/clinic-plus-strong-long-175ml.jpg', 139),
      ('/products/dove-daily-shine-shampoo-180ml.jpg', 172),
      ('/products/amul-mithai-mate-400g.jpg', 125),
      ('/products/lakme-sun-expert-spf30-50ml.jpg', 286),
      ('/products/boroline-20g.jpg', 41),
      ('/products/dabur-gulabari-rose-water-120ml.jpg', 49),
      ('/products/renu-raw-til-oil-100ml.jpg', 67)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.category_id from public.products p
where p.photo_url in ('/products/kissan-mixed-fruit-jam-cup-90g.jpg', '/products/patanjali-saundarya-aloe-vera-gel-150ml.jpg',
  '/products/clinic-plus-strong-long-175ml.jpg', '/products/dove-daily-shine-shampoo-180ml.jpg', '/products/amul-mithai-mate-400g.jpg',
  '/products/lakme-sun-expert-spf30-50ml.jpg', '/products/boroline-20g.jpg', '/products/dabur-gulabari-rose-water-120ml.jpg',
  '/products/renu-raw-til-oil-100ml.jpg')
order by p.category_id, p.name;
