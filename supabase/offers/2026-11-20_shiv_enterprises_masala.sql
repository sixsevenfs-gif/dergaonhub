-- 10 items from the Shiv Enterprises price survey (19 Nov 2026): JMC, EveryDay, Sunrise and MDH masalas,
-- and 3 Star muri (puffed rice).
-- Sold at MRP with no discount (thin margins; the owner sets any offer in Admin). The shop price is saved as
-- the buy price (owner only, update 034). Safe to run again (adds each name + size only once).
-- MDH Tandoori Chicken Masala: the survey card says "98g" (the same as its MRP); MDH sells this box as 100 g,
-- so it goes in as 100 g. Push first so the photos (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('JMC Kasuri Methi', '25 g', 'masala',
   'jmc jagdamba kasuri methi kasoori methi dried fenugreek leaves methi patta', 36, '/products/jmc-kasuri-methi-25g.jpg'),
  ('JMC Sabji Masala', '50 g', 'masala',
   'jmc jagdamba sabji masala sabzi masala vegetable masala curry powder', 45, '/products/jmc-sabji-masala-50g.jpg'),
  ('JMC Black Pepper Powder', '50 g', 'masala',
   'jmc jagdamba black pepper powder kali mirch powder gol morich', 89, '/products/jmc-black-pepper-powder-50g.jpg'),
  ('JMC Dry Mango Powder (Amchur)', '50 g', 'masala',
   'jmc jagdamba dry mango powder amchur amchoor powder aam powder', 49, '/products/jmc-dry-mango-powder-50g.jpg'),
  ('EveryDay Garam Masala', '50 g', 'masala',
   'sigma everyday every day spices garam masala powder', 51, '/products/everyday-garam-masala-50g.jpg'),
  ('EveryDay Chole Masala', '50 g', 'masala',
   'sigma everyday every day spices chole masala chana masala chhole', 44, '/products/everyday-chole-masala-50g.jpg'),
  ('EveryDay Gold Panipuri Masala', '50 g', 'masala',
   'sigma everyday every day gold panipuri masala pani puri masala golgappa phuchka fuchka', 38, '/products/everyday-gold-panipuri-masala-50g.jpg'),
  ('Sunrise Pure Shahi Garam Masala', '25 g', 'masala',
   'sunrise pure itc shahi garam masala powder', 90, '/products/sunrise-shahi-garam-masala-25g.jpg'),
  ('MDH Tandoori Chicken Masala', '100 g', 'masala',
   'mdh tandoori chicken masala tikka masala chicken fry grill masala', 98, '/products/mdh-tandoori-chicken-masala-100g.jpg'),
  ('3 Star Puffed Rice (Muri)', '81 g', 'rice',
   '3 star three star puffed rice muri moori murmura jhal muri bhel', 10, '/products/3-star-puffed-rice-muri-81g.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/jmc-kasuri-methi-25g.jpg', 30.00),
      ('/products/jmc-sabji-masala-50g.jpg', 39.00),
      ('/products/jmc-black-pepper-powder-50g.jpg', 80.00),
      ('/products/jmc-dry-mango-powder-50g.jpg', 43.00),
      ('/products/everyday-garam-masala-50g.jpg', 45.00),
      ('/products/everyday-chole-masala-50g.jpg', 37.00),
      ('/products/everyday-gold-panipuri-masala-50g.jpg', 32.00),
      ('/products/sunrise-shahi-garam-masala-25g.jpg', 83.00),
      ('/products/mdh-tandoori-chicken-masala-100g.jpg', 92.00),
      ('/products/3-star-puffed-rice-muri-81g.jpg', 8.50)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Product page text (update 055). Skipped before 055; only fills an empty description.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = v.d
    from (values
      ('/products/jmc-kasuri-methi-25g.jpg', 'Dried fenugreek leaves with a strong aroma. Crush a pinch over paneer, daal, aloo methi and parathas at the end of cooking.'),
      ('/products/jmc-sabji-masala-50g.jpg', 'A ready spice mix for everyday vegetable curries and dry sabzi.'),
      ('/products/jmc-black-pepper-powder-50g.jpg', 'Ground black pepper (kali mirch) for eggs, soups, salads, chowmein and curries.'),
      ('/products/jmc-dry-mango-powder-50g.jpg', 'Amchur made from dried raw mango, for a sour, tangy taste in chaat, sabzi, chutney and pakoras.'),
      ('/products/everyday-garam-masala-50g.jpg', 'A warm blend of whole spices, ground. Add a pinch to curries, daal and meat at the end of cooking.'),
      ('/products/everyday-chole-masala-50g.jpg', 'A spice mix for dark, tangy chole (chickpea curry). Also good with rajma and aloo.'),
      ('/products/everyday-gold-panipuri-masala-50g.jpg', 'Spice mix for panipuri water and the filling. Mix with cold water, mint and lemon.'),
      ('/products/sunrise-shahi-garam-masala-25g.jpg', 'A rich garam masala with cardamom, cloves, cinnamon and nutmeg, for biryani, pulao, paneer and meat.'),
      ('/products/mdh-tandoori-chicken-masala-100g.jpg', 'Spice mix for tandoori chicken and tikka. Mix with curd and lemon, marinate, then grill, bake or fry.'),
      ('/products/3-star-puffed-rice-muri-81g.jpg', 'Crunchy puffed rice (muri) for jhal muri, bhel, laddoos or with tea.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.category_id, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in (
  '/products/jmc-kasuri-methi-25g.jpg', '/products/jmc-sabji-masala-50g.jpg', '/products/jmc-black-pepper-powder-50g.jpg',
  '/products/jmc-dry-mango-powder-50g.jpg', '/products/everyday-garam-masala-50g.jpg', '/products/everyday-chole-masala-50g.jpg',
  '/products/everyday-gold-panipuri-masala-50g.jpg', '/products/sunrise-shahi-garam-masala-25g.jpg',
  '/products/mdh-tandoori-chicken-masala-100g.jpg', '/products/3-star-puffed-rice-muri-81g.jpg')
order by p.category_id, p.name;
