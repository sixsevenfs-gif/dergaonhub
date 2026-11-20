-- 13 more items from the Shiv Enterprises price survey (20 Nov 2026): Sunsilk, Head & Shoulders, TRESemme,
-- Clinic Plus, Dove and L'Oreal shampoos, two Garnier creams, Cadbury Cookies and Unibic Sugar Free cookies.
-- Sold at MRP with no discount (thin margins; the owner sets any offer in Admin). The shop price is saved as
-- the buy price (owner only, update 034). Safe to run again (adds each name + size only once).
-- TRESemme and L'Oreal are written with chr(233) so the accented e survives the clipboard.
-- Clinic Plus Strong & Long 175 ml is already live; this adds the 80 ml bottle under the same name.
-- Push first so the photos (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('Sunsilk Black Shine Shampoo', '80 ml', 'personal',
   'sunsilk radiant black shine shampoo shiny black hair vitamin c hair wash', 54, '/products/sunsilk-black-shine-shampoo-80ml.jpg'),
  ('Sunsilk Oil Blends Bouncy Volume Shampoo', '195 ml', 'personal',
   'sunsilk oil blends bouncy volume shampoo coconut oil aloe vera hair wash', 202, '/products/sunsilk-oil-blends-bouncy-volume-shampoo-195ml.jpg'),
  ('Head & Shoulders Smooth & Silky Anti-Dandruff Shampoo', '72 ml', 'personal',
   'head and shoulders h&s smooth silky anti dandruff shampoo dandruff khuski hair wash', 79, '/products/head-shoulders-smooth-silky-shampoo-72ml.jpg'),
  ('Head & Shoulders 2-in-1 Anti-Hairfall Shampoo + Conditioner', '180 ml', 'personal',
   'head and shoulders h&s 2 in 1 anti dandruff anti hairfall shampoo conditioner almond milk hair fall', 235, '/products/head-shoulders-2in1-anti-hairfall-180ml.jpg'),
  ('TRESemm' || chr(233) || ' Keratin Smooth Shampoo', '85 ml', 'personal',
   'tresemme tresseme keratin smooth shampoo argan oil frizz control professional hair wash', 65, '/products/tresemme-keratin-smooth-shampoo-85ml.jpg'),
  ('Clinic Plus Strong & Long Shampoo', '80 ml', 'personal',
   'clinic plus strong and long health shampoo milk protein multivitamin hair wash', 49, '/products/clinic-plus-strong-long-shampoo-80ml.jpg'),
  ('Dove Peptide Bond Strength Shampoo', '180 ml', 'personal',
   'dove damage therapy peptide bond strength shampoo bio protein care protein peptide hair wash', 285, '/products/dove-peptide-bond-shampoo-180ml.jpg'),
  ('L''Or' || chr(233) || 'al Paris Color Protect Shampoo', '200 ml', 'personal',
   'loreal l''oreal paris color colour protect protecting shampoo coloured colored hair linseed oil', 190, '/products/loreal-color-protect-shampoo-200ml.jpg'),
  ('L''Or' || chr(233) || 'al Paris Collagen Lifter Volumizing Shampoo', '200 ml', 'personal',
   'loreal l''oreal paris collagen lifter volumizing volume shampoo thin flat hair collagen peptides', 219, '/products/loreal-collagen-lifter-shampoo-200ml.jpg'),
  ('Garnier Bright Complete Vitamin C Serum Cream', '23 g', 'personal',
   'garnier bright complete vitamin c serum cream face cream uv fairness glow', 119, '/products/garnier-bright-complete-vitamin-c-cream-23g.jpg'),
  ('Garnier Skin Naturals Wrinkle Lift Anti-Ageing Cream', '40 g', 'personal',
   'garnier skin naturals wrinkle lift anti ageing anti aging cream face cream pro retinol', 329, '/products/garnier-wrinkle-lift-cream-40g.jpg'),
  ('Cadbury Cookies Choc Filled', '69 g', 'snacks',
   'cadbury cookies choc filled chocolate filled cookie biscuit choco', 30, '/products/cadbury-cookies-choc-filled-69g.jpg'),
  ('Unibic Sugar Free Oatmeal Cookies', '67.5 g', 'snacks',
   'unibic sugar free oatmeal oats cookies biscuit diabetic no sugar', 60, '/products/unibic-sugar-free-oatmeal-cookies-67g.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/sunsilk-black-shine-shampoo-80ml.jpg', 51.00),
      ('/products/sunsilk-oil-blends-bouncy-volume-shampoo-195ml.jpg', 189.00),
      ('/products/head-shoulders-smooth-silky-shampoo-72ml.jpg', 74.00),
      ('/products/head-shoulders-2in1-anti-hairfall-180ml.jpg', 220.00),
      ('/products/tresemme-keratin-smooth-shampoo-85ml.jpg', 60.80),
      ('/products/clinic-plus-strong-long-shampoo-80ml.jpg', 46.00),
      ('/products/dove-peptide-bond-shampoo-180ml.jpg', 265.00),
      ('/products/loreal-color-protect-shampoo-200ml.jpg', 178.00),
      ('/products/loreal-collagen-lifter-shampoo-200ml.jpg', 205.00),
      ('/products/garnier-bright-complete-vitamin-c-cream-23g.jpg', 110.00),
      ('/products/garnier-wrinkle-lift-cream-40g.jpg', 308.00),
      ('/products/cadbury-cookies-choc-filled-69g.jpg', 28.00),
      ('/products/unibic-sugar-free-oatmeal-cookies-67g.jpg', 55.00)
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
      ('/products/sunsilk-black-shine-shampoo-80ml.jpg', 'Shampoo with vitamin C, ceramides and pearl protein, for shiny, radiant black hair.'),
      ('/products/sunsilk-oil-blends-bouncy-volume-shampoo-195ml.jpg', 'Clear shampoo with coconut oil and aloe vera, for light, bouncy hair with more volume.'),
      ('/products/head-shoulders-smooth-silky-shampoo-72ml.jpg', 'Anti-dandruff shampoo that also nourishes dry hair and scalp, for smooth, silky hair. Gentle enough for every wash.'),
      ('/products/head-shoulders-2in1-anti-hairfall-180ml.jpg', 'Anti-dandruff shampoo and conditioner in one, with almond milk, that helps reduce hair fall from breakage.'),
      ('/products/tresemme-keratin-smooth-shampoo-85ml.jpg', 'Professional shampoo with keratin and argan oil, for smooth hair with up to 72 hours of frizz control.'),
      ('/products/clinic-plus-strong-long-shampoo-80ml.jpg', 'Health shampoo with milk protein and multivitamins, for strong and long hair.'),
      ('/products/dove-peptide-bond-shampoo-180ml.jpg', 'Dove Damage Therapy shampoo with protein peptide and bio-protein care, for stronger hair that breaks less.'),
      ('/products/loreal-color-protect-shampoo-200ml.jpg', 'Shampoo for coloured hair, with linseed oil and UV filters, that keeps hair colour bright for up to 30 washes.'),
      ('/products/loreal-collagen-lifter-shampoo-200ml.jpg', 'Volumizing shampoo with collagen peptides for thin, flat hair, for visibly fuller hair.'),
      ('/products/garnier-bright-complete-vitamin-c-cream-23g.jpg', 'Vitamin C serum cream with UV protection that brightens and evens skin tone. Suitable for all skin types.'),
      ('/products/garnier-wrinkle-lift-cream-40g.jpg', 'Anti-ageing cream with Swiss apple cell extract and pro-retinol, for fewer wrinkles and fine lines and firmer-looking skin.'),
      ('/products/cadbury-cookies-choc-filled-69g.jpg', 'Soft chocolate cookies with a gooey Cadbury chocolate filling.'),
      ('/products/unibic-sugar-free-oatmeal-cookies-67g.jpg', 'Crunchy oatmeal cookies with no added sugar, good with tea or as a light snack.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.category_id, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in (
  '/products/sunsilk-black-shine-shampoo-80ml.jpg', '/products/sunsilk-oil-blends-bouncy-volume-shampoo-195ml.jpg',
  '/products/head-shoulders-smooth-silky-shampoo-72ml.jpg', '/products/head-shoulders-2in1-anti-hairfall-180ml.jpg',
  '/products/tresemme-keratin-smooth-shampoo-85ml.jpg', '/products/clinic-plus-strong-long-shampoo-80ml.jpg',
  '/products/dove-peptide-bond-shampoo-180ml.jpg', '/products/loreal-color-protect-shampoo-200ml.jpg',
  '/products/loreal-collagen-lifter-shampoo-200ml.jpg', '/products/garnier-bright-complete-vitamin-c-cream-23g.jpg',
  '/products/garnier-wrinkle-lift-cream-40g.jpg', '/products/cadbury-cookies-choc-filled-69g.jpg',
  '/products/unibic-sugar-free-oatmeal-cookies-67g.jpg')
order by p.category_id, p.name, p.size;
