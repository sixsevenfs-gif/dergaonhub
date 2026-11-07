-- Add 7 items from the Shanka price survey: Bikaji Navratan Mix and Kuch-Kuch 200 g, Dove Serum Bar, Patanjali
-- Haldi Chandan Kanti (buy 3 get 1 free), Lux Smooth & Radiant, Vivel Aloe Vera, Lifebuoy Skin Protect (4 + 1 free).
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Bikaji Sub-Kuch Navratan Mix', '200 g', 'snacks', 'bikaji navratan mix sub kuch namkeen mixture bhujia snacks', 60, '/products/bikaji-navratan-mix-200g.jpg'),
  ('Bikaji All-in-One Kuch-Kuch', '200 g', 'snacks', 'bikaji kuch kuch all in one namkeen mixture bhujia snacks', 60, '/products/bikaji-kuch-kuch-200g.jpg'),
  ('Dove Serum Bar Deep Nourish', '100 g', 'personal', 'dove serum bar deep nourish soap bathing nutrient serum', 62, '/products/dove-serum-bar-deep-nourish-100g.jpg'),
  ('Patanjali Haldi Chandan Kanti Soap (Buy 3 Get 1 Free)', '4 × 150 g', 'personal', 'patanjali haldi chandan kanti soap body cleanser bathing turmeric sandal buy 3 get 1 free offer pack', 153, '/products/patanjali-haldi-chandan-kanti-4x150g.jpg'),
  ('Lux Smooth & Radiant Glutathione Soap', '80 g', 'personal', 'lux international smooth radiant glutathione soap bathing white rose', 43, '/products/lux-smooth-radiant-glutathione-80g.jpg'),
  ('Vivel Aloe Vera Soap', '100 g', 'personal', 'vivel aloe vera soap bathing natural', 30, '/products/vivel-aloe-vera-100g.jpg'),
  ('Lifebuoy Skin Protect Soap (4 + 1 Free)', '5 × 100 g', 'personal', 'lifebuoy skin protect soap bathing vitamin e germ 4 + 1 free offer pack', 115, '/products/lifebuoy-skin-protect-5x100g.jpg')
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
      ('/products/bikaji-navratan-mix-200g.jpg', 49),
      ('/products/bikaji-kuch-kuch-200g.jpg', 49),
      ('/products/dove-serum-bar-deep-nourish-100g.jpg', 57),
      ('/products/patanjali-haldi-chandan-kanti-4x150g.jpg', 142),
      ('/products/lux-smooth-radiant-glutathione-80g.jpg', 40),
      ('/products/vivel-aloe-vera-100g.jpg', 28),
      ('/products/lifebuoy-skin-protect-5x100g.jpg', 106)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.category_id from public.products p
where p.photo_url in ('/products/bikaji-navratan-mix-200g.jpg', '/products/bikaji-kuch-kuch-200g.jpg',
  '/products/dove-serum-bar-deep-nourish-100g.jpg', '/products/patanjali-haldi-chandan-kanti-4x150g.jpg',
  '/products/lux-smooth-radiant-glutathione-80g.jpg', '/products/vivel-aloe-vera-100g.jpg', '/products/lifebuoy-skin-protect-5x100g.jpg')
order by p.category_id, p.name;
