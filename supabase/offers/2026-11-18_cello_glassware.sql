-- 7 glassware and kitchen items from the Sankar store price survey (14 Nov 2026), all in Home & Kitchen:
--   Cello Jewel and Vidivi glass jugs (1.2 L), Milton Crisp N Clear jar (1500 ml),
--   Cello Amore, Brilliant and Iris K-Series glass sets (6 pcs), Treo Elix glass set (6 pcs).
-- Priced like the earlier kitchen items: about 10% under MRP, with the MRP shown struck through (compare_price).
-- The shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each name + size
-- only once). Push first so the photos (public/products/) are live, then run this.

insert into public.categories (id, name, short, sort) values ('home', 'Home & Kitchen', 'Home & Kitchen', 14)
on conflict (id) do nothing;

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, 'home', v.keywords, v.price, v.mrp, v.photo, true, 'active'
from (values
  ('Cello Jewel Glass Jug with Lid', '1.2 L',
   'cello jewel glass water jug pitcher lid juice 1200 ml 1.2 litre', 319, 349, '/products/cello-jewel-glass-jug-1-2l.jpg'),
  ('Cello Vidivi Glass Jug with Lid', '1.2 L',
   'cello vidivi glass water jug pitcher lid juice 1200 ml 1.2 litre', 319, 349, '/products/cello-vidivi-glass-jug-1-2l.jpg'),
  ('Milton Crisp N Clear Round Storage Jar', '1500 ml',
   'milton crisp n clear round 1500 plastic storage jar container dabba airtight kitchen atta dal', 69, 77, '/products/milton-crisp-n-clear-round-jar-1500ml.jpg'),
  ('Cello Amore K-Series Glass Tumbler Set', '6 × 265 ml',
   'cello amore k series glass tumbler set of 6 water juice glasses gilas', 539, 599, '/products/cello-amore-k-series-glass-set-265ml.jpg'),
  ('Cello Brilliant K-Series Glass Tumbler Set', '6 × 275 ml',
   'cello brilliant k series glass tumbler set of 6 water juice glasses gilas', 529, 585, '/products/cello-brilliant-k-series-glass-set-275ml.jpg'),
  ('Cello Iris K-Series Glass Tumbler Set', '6 × 275 ml',
   'cello iris k series glass tumbler set of 6 water juice glasses gilas', 539, 599, '/products/cello-iris-k-series-glass-set-275ml.jpg'),
  ('Treo by Milton Elix Glass Tumbler Set', '6 × 290 ml',
   'treo milton elix 290 glass tumbler set of 6 water juice glasses gilas', 429, 475, '/products/treo-elix-glass-tumbler-set-290ml.jpg')
) as v(name, size, keywords, price, mrp, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Buy price (shop price from the survey).
do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/cello-jewel-glass-jug-1-2l.jpg', 240),
      ('/products/cello-vidivi-glass-jug-1-2l.jpg', 240),
      ('/products/milton-crisp-n-clear-round-jar-1500ml.jpg', 55),
      ('/products/cello-amore-k-series-glass-set-265ml.jpg', 420),
      ('/products/cello-brilliant-k-series-glass-set-275ml.jpg', 400),
      ('/products/cello-iris-k-series-glass-set-275ml.jpg', 415),
      ('/products/treo-elix-glass-tumbler-set-290ml.jpg', 330)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Product page text (update 055). Skipped if 055 has not been run; the owner's own text is never replaced.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = v.d
    from (values
      ('/products/cello-jewel-glass-jug-1-2l.jpg', 'A 1.2 litre glass jug from Cello with a pressed jewel pattern and a lid that keeps dust out. Good for water, juice or nimbu pani at the dining table. Wash by hand; avoid pouring boiling water into a cold jug.'),
      ('/products/cello-vidivi-glass-jug-1-2l.jpg', 'A 1.2 litre Cello Vidivi glass jug with a criss-cross pattern near the top and a lid with a handle. Holds water, juice or lassi for the whole family. Wash by hand; avoid pouring boiling water into a cold jug.'),
      ('/products/milton-crisp-n-clear-round-jar-1500ml.jpg', 'A clear, round 1500 ml storage jar from Milton with a screw-on lid. See at a glance how much atta, dal, sugar or snacks are left. Food-grade and BPA-free plastic. Wash before first use.'),
      ('/products/cello-amore-k-series-glass-set-265ml.jpg', 'A set of 6 Cello Amore K-Series glasses, 265 ml each, with a cut-glass diamond pattern at the base. For water, juice or cold drinks, and nice enough for guests. Wash by hand.'),
      ('/products/cello-brilliant-k-series-glass-set-275ml.jpg', 'A set of 6 Cello Brilliant K-Series glasses, 275 ml each, with a diamond band near the base. Heavy, clear glass for water, juice or cold drinks. Wash by hand.'),
      ('/products/cello-iris-k-series-glass-set-275ml.jpg', 'A set of 6 Cello Iris K-Series glasses, 275 ml each, with a raised petal pattern all around. For everyday water and juice or for guests. Wash by hand.'),
      ('/products/treo-elix-glass-tumbler-set-290ml.jpg', 'A set of 6 Treo by Milton Elix glasses, 290 ml each, with fine ribbed lines. Clear glass for water, juice, nimbu pani or cold drinks. Wash by hand.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.price, p.compare_price as mrp, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in ('/products/cello-jewel-glass-jug-1-2l.jpg', '/products/cello-vidivi-glass-jug-1-2l.jpg',
  '/products/milton-crisp-n-clear-round-jar-1500ml.jpg', '/products/cello-amore-k-series-glass-set-265ml.jpg',
  '/products/cello-brilliant-k-series-glass-set-275ml.jpg', '/products/cello-iris-k-series-glass-set-275ml.jpg',
  '/products/treo-elix-glass-tumbler-set-290ml.jpg')
order by p.price desc;
