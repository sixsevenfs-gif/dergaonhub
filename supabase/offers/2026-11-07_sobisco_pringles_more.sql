-- Add 9 items from the Shanka price survey: Sobisco Desire Kaju and Choco Chip, Bisk Farm The Top, Patanjali Cashew
-- Cookies, Pringles Grab 'N' Go Cheese Burst and Sour Cream & Onion, Pringles Desi Masala Tadka 102 g, Nissin Cup
-- Noodles Chick'n Egg, Patanjali Dant Kanti. Bisk Farm Tiffun is already in the store: it only gets its buy price.
-- Pringles are priced like the Pringles already in the store (₹53 for 40 g, ₹106 for 102 g); the rest at MRP. The
-- shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each name + size only
-- once). Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Sobisco Desire Kaju (packaging may differ)', '106 g', 'snacks', 'sobisco desire kaju cashew biscuit', 20, '/products/sobisco-desire-kaju-106g.jpg'),
  ('Sobisco Desire Choco Chip', '106 g', 'snacks', 'sobisco desire choco chip chocolate cookies biscuit', 20, '/products/sobisco-desire-choco-chip-106g.jpg'),
  ('Bisk Farm The Top Butter Munch', '214 g', 'snacks', 'bisk farm biskfarm the top butter munch crackers biscuit', 30, '/products/bisk-farm-the-top-214g.jpg'),
  ('Patanjali Cashew Cookies', '200 g', 'snacks', 'patanjali cashew kaju cookies biscuit atta', 35, '/products/patanjali-cashew-cookies-200g.jpg'),
  ('Pringles Grab ''N'' Go Cheese Burst', '40 g', 'snacks', 'pringles grab n go cheese burst chips crisps potato', 53, '/products/pringles-grab-n-go-cheese-burst-40g.jpg'),
  ('Pringles Grab ''N'' Go Sour Cream & Onion', '40 g', 'snacks', 'pringles grab n go sour cream onion chips crisps potato', 53, '/products/pringles-grab-n-go-sour-cream-onion-40g.jpg'),
  ('Pringles Desi Masala Tadka', '102 g', 'snacks', 'pringles desi masala tadka chips crisps potato', 106, '/products/pringles-desi-masala-tadka-102g.jpg'),
  ('Nissin Cup Noodles Chick''n Egg', '45 g', 'snacks', 'nissin cup noodles chick n egg chicken instant noodles non veg', 35, '/products/nissin-cup-noodles-chick-n-egg-45g.jpg'),
  ('Patanjali Dant Kanti Toothpaste (Free Haldi Chandan Soap)', '100 g', 'personal', 'patanjali dant kanti natural toothpaste ayurvedic free soap offer', 60, '/products/patanjali-dant-kanti-100g.jpg')
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
      ('/products/sobisco-desire-kaju-106g.jpg', 18),
      ('/products/sobisco-desire-choco-chip-106g.jpg', 18),
      ('/products/bisk-farm-the-top-214g.jpg', 27),
      ('/products/patanjali-cashew-cookies-200g.jpg', 32),
      ('/products/pringles-grab-n-go-cheese-burst-40g.jpg', 50),
      ('/products/pringles-grab-n-go-sour-cream-onion-40g.jpg', 50),
      ('/products/pringles-desi-masala-tadka-102g.jpg', 100),
      ('/products/nissin-cup-noodles-chick-n-egg-45g.jpg', 32),
      ('/products/patanjali-dant-kanti-100g.jpg', 55)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
    insert into public.product_costs (product_id, cost)
    select id, 36 from public.products where lower(name) = 'bisk farm tiffun dry cake' and size = '100 g'
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price from public.products p
where p.photo_url like '/products/sobisco-%' or p.photo_url like '/products/pringles-%' or p.photo_url in (
  '/products/bisk-farm-the-top-214g.jpg', '/products/patanjali-cashew-cookies-200g.jpg',
  '/products/nissin-cup-noodles-chick-n-egg-45g.jpg', '/products/patanjali-dant-kanti-100g.jpg')
  or lower(p.name) = 'bisk farm tiffun dry cake'
order by p.name;
