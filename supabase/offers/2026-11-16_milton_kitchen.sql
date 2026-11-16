-- 12 kitchen and home items from the Sankar store price survey (14 Nov 2026), all in Home & Kitchen:
--   Milton gas lighter, Pigeon Favo+ tawa, two water purifiers (Shreya 24 L, Milton Pure 'N' Sleek 20 L),
--   Milton Crystal jugs (1 L, 500 ml), Milton Eiffel and Thermosteel flasks, Treo Nimbus glass jug,
--   Milton Ace bottle, Surya Himstar kettle, Milton Marvel casserole.
-- Sold at MRP; the shop price is saved as the buy price (owner only, update 034). Safe to run again (adds each
-- name + size only once). Push first so the photos (public/products/) are live, then run this.

insert into public.categories (id, name, short, sort) values ('home', 'Home & Kitchen', 'Home & Kitchen', 14)
on conflict (id) do nothing;

insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select v.name, v.size, 'home', v.keywords, v.price, v.photo, true, 'active'
from (values
  ('Milton Hot Kitchen Gas Lighter', '1 pc',
   'milton hot kitchen gas lighter stove chulha burner igniter lighter', 210, '/products/milton-hot-kitchen-gas-lighter.jpg'),
  ('Pigeon Favo+ Non-Stick Tawa', '28 cm',
   'pigeon stovekraft favo plus non stick tawa dosa roti chapati pan 280 mm', 995, '/products/pigeon-favo-plus-nonstick-tawa-28cm.jpg'),
  ('Shreya Mineral Water Purifier (packaging may differ)', '24 L',
   'shreya sureye mineral water purifier filter non electric gravity uf 7 stage unbreakable 24 litre', 3200, '/products/mineral-water-purifier-24l.jpg'),
  ('Milton Pure ''N'' Sleek Water Purifier', '20 L',
   'milton pure n sleek water purifier filter non electric gravity candle 20 litre', 1435, '/products/milton-pure-n-sleek-water-purifier-20l.jpg'),
  ('Milton Crystal Thermoware Jug, Blue', '1 L',
   'milton crystal 1000 thermoware vacuum insulated flask jug tea coffee hot water 1 litre', 610, '/products/milton-crystal-thermoware-jug-1l.jpg'),
  ('Milton Crystal Thermoware Jug, Peach', '500 ml',
   'milton crystal 500 thermoware vacuum insulated flask jug tea coffee hot water', 430, '/products/milton-crystal-thermoware-jug-500ml.jpg'),
  ('Milton Eiffel Flask with Cup & Strap', '500 ml',
   'milton eiffel 500 thermoware vacuum insulated flask thermos cup strap tea school', 350, '/products/milton-eiffel-flask-500ml.jpg'),
  ('Milton Thermosteel Flip Lid Flask (24 Hr Hot & Cold)', '750 ml',
   'milton thermosteel flip lid steel flask thermos bottle hot cold 24 hours cover', 1185, '/products/milton-thermosteel-flip-lid-flask-750ml.jpg'),
  ('Treo by Milton Nimbus Glass Jug', '1.65 L',
   'treo milton nimbus glass water jug pitcher lid 1650 ml', 445, '/products/treo-nimbus-glass-jug-1650ml.jpg'),
  ('Milton Ace Flip Water Bottle', '1 L',
   'milton ace flip plastic water bottle fridge school 1 litre', 135, '/products/milton-ace-flip-bottle-1l.jpg'),
  ('Surya Himstar Electric Kettle', '1.8 L',
   'surya himstar electric kettle steel water boil tea maggi 1.8 litre', 650, '/products/surya-himstar-electric-kettle-1-8l.jpg'),
  ('Milton Marvel Insulated Casserole', '2 L',
   'milton marvel 2000 thermoware insulated casserole hot pot roti chapati box serving', 760, '/products/milton-marvel-insulated-casserole-2l.jpg')
) as v(name, size, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/milton-hot-kitchen-gas-lighter.jpg', 110),
      ('/products/pigeon-favo-plus-nonstick-tawa-28cm.jpg', 680),
      ('/products/mineral-water-purifier-24l.jpg', 1300),
      ('/products/milton-pure-n-sleek-water-purifier-20l.jpg', 1050),
      ('/products/milton-crystal-thermoware-jug-1l.jpg', 450),
      ('/products/milton-crystal-thermoware-jug-500ml.jpg', 305),
      ('/products/milton-eiffel-flask-500ml.jpg', 250),
      ('/products/milton-thermosteel-flip-lid-flask-750ml.jpg', 850),
      ('/products/treo-nimbus-glass-jug-1650ml.jpg', 311),
      ('/products/milton-ace-flip-bottle-1l.jpg', 94),
      ('/products/surya-himstar-electric-kettle-1-8l.jpg', 400),
      ('/products/milton-marvel-insulated-casserole-2l.jpg', 530)
    ) as v(photo, cost) on v.photo = p.photo_url
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Check
select p.name, p.size, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in ('/products/milton-hot-kitchen-gas-lighter.jpg', '/products/pigeon-favo-plus-nonstick-tawa-28cm.jpg',
  '/products/mineral-water-purifier-24l.jpg', '/products/milton-pure-n-sleek-water-purifier-20l.jpg',
  '/products/milton-crystal-thermoware-jug-1l.jpg', '/products/milton-crystal-thermoware-jug-500ml.jpg',
  '/products/milton-eiffel-flask-500ml.jpg', '/products/milton-thermosteel-flip-lid-flask-750ml.jpg',
  '/products/treo-nimbus-glass-jug-1650ml.jpg', '/products/milton-ace-flip-bottle-1l.jpg',
  '/products/surya-himstar-electric-kettle-1-8l.jpg', '/products/milton-marvel-insulated-casserole-2l.jpg')
order by p.price desc;
