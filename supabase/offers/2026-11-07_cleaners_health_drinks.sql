-- Add 10 items from the Shanka price survey: Vivel Lime + Aloe Vera, Lux Radiant Glow (buy 3 get 1 free), Pubali
-- mustard oil 200 ml, Lizol Citrus and Jasmine, Harpic Power Plus, Horlicks, Bournvita, Junior Horlicks, Colin.
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Vivel Lime + Aloe Vera Soap', '100 g', 'personal', 'vivel lime aloe vera soap bathing vitamin e itc', 25, '/products/vivel-lime-aloe-vera-100g.jpg'),
  ('Lux Radiant Glow Rose Soap (Buy 3 Get 1 Free)', '4 × 100 g', 'personal', 'lux radiant glow soft glow rose vitamin c e soap bathing velvet buy 3 get 1 free offer pack', 104, '/products/lux-radiant-glow-rose-4x100g.jpg'),
  ('Pubali Kachchi Ghani Mustard Oil', '200 ml', 'oil', 'pubali kachchi ghani mustard oil sarson tel sorioh', 45, '/products/pubali-mustard-oil-200ml.jpg'),
  ('Lizol Floor Cleaner Citrus', '500 ml', 'cleaning', 'lizol disinfectant surface floor cleaner citrus lemon pocha phenyl', 129, '/products/lizol-citrus-500ml.jpg'),
  ('Lizol Floor Cleaner Jasmine', '500 ml', 'cleaning', 'lizol disinfectant surface floor cleaner jasmine pocha phenyl', 129, '/products/lizol-jasmine-500ml.jpg'),
  ('Harpic Power Plus Toilet Cleaner', '500 ml', 'cleaning', 'harpic power plus 10x toilet cleaner original disinfectant bathroom', 110, '/products/harpic-power-plus-original-500ml.jpg'),
  ('Horlicks Classic Malt (Jar)', '500 g', 'beverages', 'horlicks classic malt health drink nutrition milk powder jar', 264, '/products/horlicks-classic-malt-500g.jpg'),
  ('Cadbury Bournvita (Jar)', '500 g', 'beverages', 'cadbury bournvita bournvita chocolate health drink nutrition milk jar', 263, '/products/bournvita-500g.jpg'),
  ('Junior Horlicks Vanilla (Jar)', '500 g', 'beverages', 'junior horlicks vanilla kids health drink nutrition 2 to 6 years jar', 329, '/products/junior-horlicks-vanilla-500g.jpg'),
  ('Colin Glass & Surface Cleaner Spray', '500 ml', 'cleaning', 'colin glass surface cleaner spray 5x shine mirror window', 120, '/products/colin-glass-cleaner-500ml.jpg')
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
      ('/products/vivel-lime-aloe-vera-100g.jpg', 23),
      ('/products/lux-radiant-glow-rose-4x100g.jpg', 96),
      ('/products/pubali-mustard-oil-200ml.jpg', 45),
      ('/products/lizol-citrus-500ml.jpg', 119),
      ('/products/lizol-jasmine-500ml.jpg', 119),
      ('/products/harpic-power-plus-original-500ml.jpg', 102),
      ('/products/horlicks-classic-malt-500g.jpg', 245),
      ('/products/bournvita-500g.jpg', 244),
      ('/products/junior-horlicks-vanilla-500g.jpg', 305),
      ('/products/colin-glass-cleaner-500ml.jpg', 111)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.category_id from public.products p
where p.photo_url in ('/products/vivel-lime-aloe-vera-100g.jpg', '/products/lux-radiant-glow-rose-4x100g.jpg',
  '/products/pubali-mustard-oil-200ml.jpg', '/products/lizol-citrus-500ml.jpg', '/products/lizol-jasmine-500ml.jpg',
  '/products/harpic-power-plus-original-500ml.jpg', '/products/horlicks-classic-malt-500g.jpg', '/products/bournvita-500g.jpg',
  '/products/junior-horlicks-vanilla-500g.jpg', '/products/colin-glass-cleaner-500ml.jpg')
order by p.category_id, p.name;
