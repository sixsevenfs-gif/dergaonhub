-- Add 3 items from the Shanka price survey: Kissan Mixed Fruit Jam 200 g, Bikaji Bikaneri Bhujia 400 g, Bikaji
-- Manbhavan Soan Papdi 200 g. Sold at MRP; the shop price is saved as the buy price (owner only, update 034).
-- Safe to run again (adds each name + size only once). Photos are files of the website (public/products/): they
-- show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Kissan Mixed Fruit Jam', '200 g', 'snacks', 'kissan mixed fruit jam bread spread breakfast', 90, '/products/kissan-mixed-fruit-jam-200g.jpg'),
  ('Bikaji Bikaneri Bhujia', '400 g', 'snacks', 'bikaji bikaneri bhujia bhujiya namkeen sev snacks', 120, '/products/bikaji-bikaneri-bhujia-400g.jpg'),
  ('Bikaji Manbhavan Soan Papdi', '200 g', 'snacks', 'bikaji manbhavan soan papdi sonpapdi soanpapdi mithai sweet', 65, '/products/bikaji-manbhavan-soan-papdi-200g.jpg')
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
      ('/products/kissan-mixed-fruit-jam-200g.jpg', 83),
      ('/products/bikaji-bikaneri-bhujia-400g.jpg', 100),
      ('/products/bikaji-manbhavan-soan-papdi-200g.jpg', 55)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.category_id from public.products p
where p.photo_url in ('/products/kissan-mixed-fruit-jam-200g.jpg', '/products/bikaji-bikaneri-bhujia-400g.jpg',
  '/products/bikaji-manbhavan-soan-papdi-200g.jpg')
order by p.name;
