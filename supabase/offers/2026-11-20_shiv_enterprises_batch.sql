-- 15 items from the Shiv Enterprises price survey (19 Nov 2026): sauces, tea, corn flakes, face washes,
-- hair and body oils, dry cake, mustard oil, ghee and honey.
-- Sold at MRP with no discount (thin margins; the owner sets any offer in Admin). The shop price is saved as
-- the buy price (owner only, update 034). Safe to run again (adds each name + size only once).
-- Lakmé is written with chr(233) so the é survives the clipboard. Push first so the photos
-- (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('SIL Red Chilli Sauce', '195 g', 'masala',
   'sil red chilli sauce chili sauce hot sauce lal mirch sauce chowmein momos bottle', 55, '/products/sil-red-chilli-sauce-195g.jpg'),
  ('SIL Soy Sauce', '215 g', 'masala',
   'sil soy sauce soya sauce dark soy chinese chowmein fried rice bottle', 55, '/products/sil-soy-sauce-215g.jpg'),
  ('Brooke Bond Red Label Natural Care Tea', '250 g', 'beverages',
   'brooke bond red label natural care tea chai patti ayurvedic tulsi ginger elaichi immunity', 145, '/products/red-label-natural-care-tea-250g.jpg'),
  ('Kellogg''s Corn Flakes Original', '475 g', 'snacks',
   'kelloggs kellogg corn flakes cornflakes original breakfast cereal', 195, '/products/kelloggs-corn-flakes-original-475g.jpg'),
  ('Streax Bright & Shine Face Wash', '50 ml', 'personal',
   'streax bright and shine face wash facewash vitamin c glycolic', 99, '/products/streax-bright-shine-face-wash-50ml.jpg'),
  ('Pond''s Bright Miracle Detox Face Wash', '50 g', 'personal',
   'ponds pond bright miracle detox face wash facewash activated charcoal', 130, '/products/ponds-bright-miracle-detox-face-wash-50g.jpg'),
  ('Lakm' || chr(233) || ' Blush & Glow Strawberry Face Wash', '50 g', 'personal',
   'lakme blush and glow strawberry face wash facewash vitamin c serum', 130, '/products/lakme-blush-glow-strawberry-face-wash-50g.jpg'),
  ('Nihar Naturals Coconut Hair Oil with Methi', '200 ml', 'personal',
   'nihar naturals coconut hair oil narikol tel methi jasmine thick strong hair', 88, '/products/nihar-naturals-coconut-hair-oil-200ml.jpg'),
  ('Parachute Advansed Jasmine Hair Oil', '90 ml', 'personal',
   'parachute advansed jasmine hair oil coconut narikol tel vitamin e non sticky', 43, '/products/parachute-advansed-jasmine-hair-oil-90ml.jpg'),
  ('Bajaj Almond Drops Hair Oil', '89 ml', 'personal',
   'bajaj almond drops hair oil badam tel vitamin e non sticky', 85, '/products/bajaj-almond-drops-hair-oil-89ml.jpg'),
  ('OlivAllen Ayurvedic Body Oil', '100 ml', 'personal',
   'olivallen olive allen ayurvedic body oil massage oil olive oil dr sarkar allenayur', 85, '/products/olivallen-ayurvedic-body-oil-100ml.jpg'),
  ('Pran Special Dry Cake', '100 g', 'snacks',
   'pran special dry cake rusk toast cake tea time biscuit', 40, '/products/pran-special-dry-cake-100g.jpg'),
  ('Pubali Kachchi Ghani Mustard Oil', '1 L', 'oil',
   'pubali kachchi ghani kachi ghani mustard oil sarson tel sorioh tel bottle 1 litre', 242, '/products/pubali-kachchi-ghani-mustard-oil-1l.jpg'),
  ('Mahaan Danedar Ghee', '430 ml', 'oil',
   'mahaan danedar ghee desi ghee tin cow ghee', 380, '/products/mahaan-danedar-ghee-430ml.jpg'),
  ('Dabur Honey', '100 g', 'masala',
   'dabur honey madhu shahad mou pure honey bottle', 70, '/products/dabur-honey-100g.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/sil-red-chilli-sauce-195g.jpg', 50.00),
      ('/products/sil-soy-sauce-215g.jpg', 50.00),
      ('/products/red-label-natural-care-tea-250g.jpg', 140.00),
      ('/products/kelloggs-corn-flakes-original-475g.jpg', 180.00),
      ('/products/streax-bright-shine-face-wash-50ml.jpg', 91.00),
      ('/products/ponds-bright-miracle-detox-face-wash-50g.jpg', 119.00),
      ('/products/lakme-blush-glow-strawberry-face-wash-50g.jpg', 119.00),
      ('/products/nihar-naturals-coconut-hair-oil-200ml.jpg', 82.50),
      ('/products/parachute-advansed-jasmine-hair-oil-90ml.jpg', 40.50),
      ('/products/bajaj-almond-drops-hair-oil-89ml.jpg', 80.00),
      ('/products/olivallen-ayurvedic-body-oil-100ml.jpg', 75.00),
      ('/products/pran-special-dry-cake-100g.jpg', 37.00),
      ('/products/pubali-kachchi-ghani-mustard-oil-1l.jpg', 222.00),
      ('/products/mahaan-danedar-ghee-430ml.jpg', 345.00),
      ('/products/dabur-honey-100g.jpg', 65.00)
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
      ('/products/sil-red-chilli-sauce-195g.jpg', 'Hot red chilli sauce made with red chillies, with no added colour. For chowmein, momos, fried rice, pakoras and snacks.'),
      ('/products/sil-soy-sauce-215g.jpg', 'Dark soy sauce made with soya beans. For chowmein, fried rice, chilli chicken and other Chinese dishes.'),
      ('/products/red-label-natural-care-tea-250g.jpg', 'Red Label tea with ayurvedic ingredients like tulsi, ginger and cardamom, for a strong, refreshing cup.'),
      ('/products/kelloggs-corn-flakes-original-475g.jpg', 'Crispy corn flakes for breakfast. Have them with cold or warm milk and fruit.'),
      ('/products/streax-bright-shine-face-wash-50ml.jpg', 'Face wash with vitamin C and glycolic serum, for a bright, clean face every day. Suitable for all skin types.'),
      ('/products/ponds-bright-miracle-detox-face-wash-50g.jpg', 'Face wash with activated charcoal that clears dirt and oil, for brighter-looking skin.'),
      ('/products/lakme-blush-glow-strawberry-face-wash-50g.jpg', 'Gentle face wash with strawberry and vitamin C serum, for soft, glowing skin.'),
      ('/products/nihar-naturals-coconut-hair-oil-200ml.jpg', 'Coconut hair oil with methi and jasmine, for thick and strong hair.'),
      ('/products/parachute-advansed-jasmine-hair-oil-90ml.jpg', 'Non-sticky coconut hair oil with jasmine and vitamin E, for soft, nourished hair.'),
      ('/products/bajaj-almond-drops-hair-oil-89ml.jpg', 'Light, non-sticky hair oil with almond and vitamin E, for nourished hair. This pack has 15% extra free.'),
      ('/products/olivallen-ayurvedic-body-oil-100ml.jpg', 'Ayurvedic body massage oil with natural olive oil. A gentle massage helps blood circulation and nourishes the skin.'),
      ('/products/pran-special-dry-cake-100g.jpg', 'Crisp, sweet dry cake slices, best with a hot cup of tea.'),
      ('/products/pubali-kachchi-ghani-mustard-oil-1l.jpg', 'Kachi ghani (cold-pressed) mustard oil with a strong aroma. For frying fish, cooking sabzi, pickles and tadka.'),
      ('/products/mahaan-danedar-ghee-430ml.jpg', 'Danedar (granular) ghee in a tin, with a rich aroma. For rotis, daal, rice and sweets.'),
      ('/products/dabur-honey-100g.jpg', 'Pure honey in a 100 g bottle. Have it with warm water or milk, or spread it on bread and roti.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.category_id, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in (
  '/products/sil-red-chilli-sauce-195g.jpg', '/products/sil-soy-sauce-215g.jpg', '/products/red-label-natural-care-tea-250g.jpg',
  '/products/kelloggs-corn-flakes-original-475g.jpg', '/products/streax-bright-shine-face-wash-50ml.jpg',
  '/products/ponds-bright-miracle-detox-face-wash-50g.jpg', '/products/lakme-blush-glow-strawberry-face-wash-50g.jpg',
  '/products/nihar-naturals-coconut-hair-oil-200ml.jpg', '/products/parachute-advansed-jasmine-hair-oil-90ml.jpg',
  '/products/bajaj-almond-drops-hair-oil-89ml.jpg', '/products/olivallen-ayurvedic-body-oil-100ml.jpg',
  '/products/pran-special-dry-cake-100g.jpg', '/products/pubali-kachchi-ghani-mustard-oil-1l.jpg',
  '/products/mahaan-danedar-ghee-430ml.jpg', '/products/dabur-honey-100g.jpg')
order by p.category_id, p.name;
