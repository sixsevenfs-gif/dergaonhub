-- Add 7 items: Morton macaroni, sugar, Thums Up and Sprite 250 ml, Nescafé iced cappuccino, Predator and Campa
-- energy drinks. Safe to run again (adds each name + size only once).
-- Photos are files of the website (public/products/): they show once the new build is live.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Morton Macaroni Pasta', '500 g', 'snacks', 'morton macaroni pasta birla noodles', 130, '/products/morton-macaroni-pasta-500g.jpg'),
  ('Refined White Sugar', '1 kg', 'masala', 'sugar chini cheeni refined white', 65, '/products/refined-sugar-1kg.jpg'),
  ('Thums Up', '250 ml', 'colddrinks', 'thums up thumbs up cola cold drink soft drink thanda', 20, '/products/thums-up-250ml.jpg'),
  ('Sprite', '250 ml', 'colddrinks', 'sprite lemon lime cold drink soft drink thanda', 20, '/products/sprite-250ml.jpg'),
  ('Nescafé Iced Cappuccino (Can)', '170 ml', 'colddrinks', 'nescafe nescafé iced cappuccino cold coffee can ready to drink', 50, '/products/nescafe-iced-cappuccino-170ml.jpg'),
  ('Predator Energy Gold Strike (Can)', '300 ml', 'colddrinks', 'predator energy drink gold strike can', 60, '/products/predator-energy-gold-strike-300ml.jpg'),
  ('Campa Energy Gold Boost (Can)', '135 ml', 'colddrinks', 'campa energy drink gold boost can reliance', 30, '/products/campa-energy-gold-boost-135ml.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Check
select name, size, price, category_id from public.products
where photo_url in ('/products/morton-macaroni-pasta-500g.jpg', '/products/refined-sugar-1kg.jpg', '/products/thums-up-250ml.jpg',
  '/products/sprite-250ml.jpg', '/products/nescafe-iced-cappuccino-170ml.jpg', '/products/predator-energy-gold-strike-300ml.jpg',
  '/products/campa-energy-gold-boost-135ml.jpg')
order by category_id, name;
