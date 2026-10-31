-- Add Campa Cola and Campa Orange (500 ml, ₹20 each) to Cold Drinks & Water. Safe to run again (adds each only once).
-- Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, '500 ml', 'colddrinks', v.keywords, 20, v.photo, true, 'active'
from (values
  ('Campa Cola', 'campa cola cold drink soft drink thanda reliance', '/products/campa-cola-500ml.jpg'),
  ('Campa Orange', 'campa orange cold drink soft drink thanda reliance orange flavoured', '/products/campa-orange-500ml.jpg')
) as v(name, keywords, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = '500 ml');

-- Check
select name, size, price, category_id from public.products where name ilike 'campa%';
