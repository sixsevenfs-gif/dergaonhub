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

-- Check
select p.name, p.size, p.price from public.products p
where p.photo_url in ('/products/bisk-farm-chatpata-spicy-200g.jpg',
  '/products/sunfeast-moms-magic-cashew-almond-231g.jpg', '/products/bisk-farm-eat-fit-masala-cracker-250g.jpg',
  '/products/sunfeast-marie-light-280g.jpg', '/products/bisk-farm-coco-wonder-200g.jpg', '/products/britannia-doodh-marie-gold-229g.jpg',
  '/products/sunfeast-dark-fantasy-choco-fills-69g.jpg', '/products/britannia-bourbon-150g.jpg', '/products/anmol-butter-bake-119g.jpg')
order by p.name;
