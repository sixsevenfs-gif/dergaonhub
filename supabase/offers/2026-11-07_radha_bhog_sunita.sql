-- Add 5 items from the Shanka price survey: Radha Bhog Besan 500 g and 200 g, Radha Bhog Chakki Fresh Atta 2 kg,
-- Radha Bhog Premium Suji 500 g, Sunita Elaichi Chai 250 g. Sold at MRP; the shop price is saved as the buy
-- price (owner only, update 034). Safe to run again (adds each name + size only once).
-- Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Radha Bhog Besan', '500 g', 'atta', 'radha bhog besan gram flour chana atta pakoda', 70, '/products/radha-bhog-besan-500g.jpg'),
  ('Radha Bhog Besan', '200 g', 'atta', 'radha bhog besan gram flour chana atta pakoda', 30, '/products/radha-bhog-besan-200g.jpg'),
  ('Radha Bhog Chakki Fresh Atta', '2 kg', 'atta', 'radha bhog chakki fresh atta aata gehu wheat flour', 120, '/products/radha-bhog-chakki-fresh-atta-2kg.jpg'),
  ('Radha Bhog Premium Suji', '500 g', 'atta', 'radha bhog premium suji sooji rava semolina', 40, '/products/radha-bhog-premium-suji-500g.jpg'),
  ('Sunita Elaichi Chai', '250 g', 'beverages', 'sunita binani elaichi chai tea cardamom patti', 140, '/products/sunita-elaichi-chai-250g.jpg')
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
      ('/products/radha-bhog-besan-500g.jpg', 38),
      ('/products/radha-bhog-besan-200g.jpg', 16),
      ('/products/radha-bhog-chakki-fresh-atta-2kg.jpg', 92),
      ('/products/radha-bhog-premium-suji-500g.jpg', 25),
      ('/products/sunita-elaichi-chai-250g.jpg', 95)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select name, size, price, category_id from public.products
where photo_url in ('/products/radha-bhog-besan-500g.jpg', '/products/radha-bhog-besan-200g.jpg',
  '/products/radha-bhog-chakki-fresh-atta-2kg.jpg', '/products/radha-bhog-premium-suji-500g.jpg', '/products/sunita-elaichi-chai-250g.jpg')
order by category_id, name, size;
