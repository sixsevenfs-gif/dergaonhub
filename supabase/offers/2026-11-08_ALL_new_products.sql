-- ALL new products from the Shanka price survey (7–8 Nov 2026), in one go: 58 items in 8 batches,
-- 53 new and 5 that are already in the store.
-- Run this ONE file in Supabase → SQL Editor, AFTER pushing the website (so the photos are live).
-- It is one transaction: if anything fails, nothing is changed. Safe to run again (nothing is added twice).
-- Items already in the store (Harpic, Kissan jam 200 g, Dark Fantasy, NutriChoice cracker, Tiffun) are updated, not
-- added again. The separate batch files next to this one hold the same SQL.
begin;

-- ===================== 2026-11-07_radha_bhog_sunita =====================
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

-- ===================== 2026-11-07_bikaji_soaps =====================
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

-- ===================== 2026-11-07_cleaners_health_drinks =====================
-- Add 10 items from the Shanka price survey: Vivel Lime + Aloe Vera, Lux Radiant Glow (buy 3 get 1 free), Pubali
-- mustard oil 200 ml, Lizol Citrus and Jasmine, Harpic Power Plus, Horlicks, Bournvita, Junior Horlicks, Colin.
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Photos are files of the website (public/products/): they show once the new build is live.
-- Harpic is already in the store: show the 10X Total Clean pack the shop sells.
update public.products set photo_url = '/products/harpic-power-plus-original-500ml.jpg', updated_at = now()
where lower(name) = 'harpic power plus toilet cleaner (original)' and size = '500 ml';

insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Vivel Lime + Aloe Vera Soap', '100 g', 'personal', 'vivel lime aloe vera soap bathing vitamin e itc', 25, '/products/vivel-lime-aloe-vera-100g.jpg'),
  ('Lux Radiant Glow Rose Soap (Buy 3 Get 1 Free)', '4 × 100 g', 'personal', 'lux radiant glow soft glow rose vitamin c e soap bathing velvet buy 3 get 1 free offer pack', 104, '/products/lux-radiant-glow-rose-4x100g.jpg'),
  ('Pubali Kachchi Ghani Mustard Oil', '200 ml', 'oil', 'pubali kachchi ghani mustard oil sarson tel sorioh', 45, '/products/pubali-mustard-oil-200ml.jpg'),
  ('Lizol Floor Cleaner Citrus', '500 ml', 'cleaning', 'lizol disinfectant surface floor cleaner citrus lemon pocha phenyl', 129, '/products/lizol-citrus-500ml.jpg'),
  ('Lizol Floor Cleaner Jasmine', '500 ml', 'cleaning', 'lizol disinfectant surface floor cleaner jasmine pocha phenyl', 129, '/products/lizol-jasmine-500ml.jpg'),
  ('Harpic Power Plus Toilet Cleaner (Original)', '500 ml', 'cleaning', 'harpic power plus 10x toilet cleaner original disinfectant bathroom', 110, '/products/harpic-power-plus-original-500ml.jpg'),
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

-- ===================== 2026-11-07_kissan_bikaji =====================
-- Add 3 items from the Shanka price survey: Kissan Mixed Fruit Jam 200 g, Bikaji Bikaneri Bhujia 400 g, Bikaji
-- Manbhavan Soan Papdi 200 g. Sold at MRP; the shop price is saved as the buy price (owner only, update 034).
-- Safe to run again (adds each name + size only once). Photos are files of the website (public/products/): they
-- show once the new build is live.
-- Kissan Mixed Fruit Jam is already in the store: swap its photo for the clean pack shot.
update public.products set photo_url = '/products/kissan-mixed-fruit-jam-200g.jpg', updated_at = now()
where lower(name) = 'kissan mixed fruit jam' and size = '200 g';

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

-- ===================== 2026-11-07_biscuits =====================
-- Add 9 biscuits (NutriChoice Cracker is already in the store) from the Shanka price survey: Bisk Farm Chatpata Spicy, Eat-Fit Masala Cracker and Coco Wonder,
-- Britannia NutriChoice Cracker, Doodh Marie Gold and Bourbon, Sunfeast Mom's Magic, Marie Light and Dark Fantasy,
-- Anmol Butter Bake. Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run
-- again (adds each name + size only once). Photos are files of the website (public/products/): they show once the
-- new build is live.
-- Already in the store: Dark Fantasy (now a 69 g pack, new photo) and NutriChoice Cracker (keeps its photo, gets
-- its buy price below).
update public.products set size = '69 g', photo_url = '/products/sunfeast-dark-fantasy-choco-fills-69g.jpg', updated_at = now()
where lower(name) = 'sunfeast dark fantasy choco fills' and size = '65 g';

insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, 'snacks', v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Bisk Farm Chatpata Spicy', '200 g', 'bisk farm biskfarm chatpata spicy biscuit tea time namkeen', 40, '/products/bisk-farm-chatpata-spicy-200g.jpg'),
  ('Sunfeast Mom''s Magic Cashew & Almond', '231 g', 'sunfeast moms mom''s magic ghee roasted cashew almond kaju badam cookies biscuit', 40, '/products/sunfeast-moms-magic-cashew-almond-231g.jpg'),
  ('Bisk Farm Eat-Fit Sugar Free Masala Cracker', '250 g', 'bisk farm biskfarm eat fit sugar free masala cracker biscuit diabetic', 40, '/products/bisk-farm-eat-fit-masala-cracker-250g.jpg'),
  ('Sunfeast Marie Light', '280 g', 'sunfeast marie light biscuit tea time', 40, '/products/sunfeast-marie-light-280g.jpg'),
  ('Bisk Farm Coco Wonder', '200 g', 'bisk farm biskfarm coco wonder coconut coco malai biscuit', 30, '/products/bisk-farm-coco-wonder-200g.jpg'),
  ('Britannia Doodh Marie Gold', '229 g', 'britannia doodh marie gold milk biscuit tea time', 30, '/products/britannia-doodh-marie-gold-229g.jpg'),
  ('Sunfeast Dark Fantasy Choco Fills', '69 g', 'sunfeast dark fantasy choco fills chocolate filled cookie biscuit', 35, '/products/sunfeast-dark-fantasy-choco-fills-69g.jpg'),
  ('Britannia Bourbon', '150 g', 'britannia bourbon chocolate cream creme biscuit', 40, '/products/britannia-bourbon-150g.jpg'),
  ('Anmol Butter Bake', '119 g', 'anmol butter bake rich butter cookies biscuit', 20, '/products/anmol-butter-bake-119g.jpg')
) as v(name, size, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Buy prices, if update 034 is in. (Tick "Added to products" on the survey cards yourself: only a logged-in
-- owner can change that.)
do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/bisk-farm-chatpata-spicy-200g.jpg', 36),
      ('/products/sunfeast-moms-magic-cashew-almond-231g.jpg', 36),
      ('/products/bisk-farm-eat-fit-masala-cracker-250g.jpg', 36),
      ('/products/sunfeast-marie-light-280g.jpg', 36),
      ('/products/bisk-farm-coco-wonder-200g.jpg', 27),
      ('/products/britannia-doodh-marie-gold-229g.jpg', 27),
      ('/products/sunfeast-dark-fantasy-choco-fills-69g.jpg', 32),
      ('/products/britannia-bourbon-150g.jpg', 36),
      ('/products/anmol-butter-bake-119g.jpg', 18)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
    insert into public.product_costs (product_id, cost)
    select id, 45 from public.products where lower(name) = 'britannia nutrichoice sugar free cracker' and size = '295 g'
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- ===================== 2026-11-07_sobisco_pringles_more =====================
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

-- ===================== 2026-11-07_personal_care_more =====================
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

-- ===================== 2026-11-08_himalaya_garnier_fogg =====================
-- Add 4 items from the Shanka price survey: Himalaya Baby Lotion, Garnier Men TurboBright face wash, Fogg Amaze and
-- Fogg Desire body sprays. Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to
-- run again (adds each name + size only once). Photos are files of the website (public/products/): they show once
-- the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, 'personal', v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Himalaya Baby Lotion', '100 ml', 'himalaya baby lotion olive almond oil kids moisturiser', 125, '/products/himalaya-baby-lotion-100ml.jpg'),
  ('Garnier Men TurboBright Face Wash', '50 g', 'garnier men turbobright turbo bright anti pollution double action foam face wash charcoal', 124, '/products/garnier-men-turbobright-face-wash-50g.jpg'),
  ('Fogg Amaze Body Spray (Men)', '120 ml', 'fogg amaze fragrance body spray deo deodorant perfume men', 225, '/products/fogg-amaze-120ml.jpg'),
  ('Fogg Desire Body Spray (Women)', '120 ml', 'fogg desire fragrant body spray deo deodorant perfume women', 225, '/products/fogg-desire-120ml.jpg')
) as v(name, size, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Buy prices, if update 034 is in. (Tick "Added to products" on the survey cards yourself: only a logged-in
-- owner can change that.)
do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/himalaya-baby-lotion-100ml.jpg', 105),
      ('/products/garnier-men-turbobright-face-wash-50g.jpg', 113),
      ('/products/fogg-amaze-120ml.jpg', 160),
      ('/products/fogg-desire-120ml.jpg', 160)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

commit;

-- Check: everything added or changed in the last 10 minutes.
select name, size, price, category_id from public.products
where updated_at > now() - interval '10 minutes'
order by category_id, name, size;
