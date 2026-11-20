-- 11 items from the Shiv Enterprises price survey (20 Nov 2026): Sunsilk, Pantene and Dove shampoos and
-- conditioners, Lotus Biscoff and Pran Toast.
-- Sold at MRP with no discount (thin margins; the owner sets any offer in Admin). The shop price is saved as
-- the buy price (owner only, update 034). Safe to run again (adds each name + size only once).
-- The two Dove Hair Fall Rescue sizes share one photo, so buy prices and text match by name + size.
-- Dove Daily Shine 180 ml is already live; this adds the 75 ml bottle under the same name.
-- Push first so the photos (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('Sunsilk Nourishing Soft & Smooth Shampoo', '80 ml', 'personal',
   'sunsilk nourishing soft and smooth shampoo yellow egg protein almond oil vitamin e hair wash', 79, '/products/sunsilk-soft-smooth-shampoo-80ml.jpg'),
  ('Sunsilk Thick & Long Shampoo', '80 ml', 'personal',
   'sunsilk luscious thick and long shampoo pink keratin collagen hair wash', 54, '/products/sunsilk-thick-long-shampoo-80ml.jpg'),
  ('Sunsilk Thick & Long Shampoo', '180 ml', 'personal',
   'sunsilk luscious thick and long shampoo pink keratin collagen hair wash', 173, '/products/sunsilk-thick-long-shampoo-180ml.jpg'),
  ('Sunsilk Black Shine Conditioner', '180 ml', 'personal',
   'sunsilk radiant black shine conditioner hair conditioner vitamin c shiny hair', 222, '/products/sunsilk-black-shine-conditioner-180ml.jpg'),
  ('Pantene Silky Smooth Shampoo', '75 ml', 'personal',
   'pantene hair science silky smooth shampoo pro-v vitamin e frizz hair wash', 75, '/products/pantene-silky-smooth-shampoo-75ml.jpg'),
  ('Pantene Silky Smooth Shampoo', '180 ml', 'personal',
   'pantene hair science silky smooth shampoo pro-v vitamin e frizz hair wash', 192, '/products/pantene-silky-smooth-shampoo-180ml.jpg'),
  ('Dove Daily Shine Shampoo', '75 ml', 'personal',
   'dove damage therapy daily shine shampoo bio protein care hair wash', 60, '/products/dove-daily-shine-shampoo-75ml.jpg'),
  ('Dove Hair Fall Rescue 1 Minute Conditioner', '75 ml', 'personal',
   'dove damage therapy hair fall rescue 1 minute conditioner hairfall bio protein tube', 120, '/products/dove-hair-fall-rescue-conditioner.jpg'),
  ('Dove Hair Fall Rescue 1 Minute Conditioner', '175 ml', 'personal',
   'dove damage therapy hair fall rescue 1 minute conditioner hairfall bio protein tube', 313, '/products/dove-hair-fall-rescue-conditioner.jpg'),
  ('Lotus Biscoff Caramelised Cookies', '75 g', 'snacks',
   'lotus biscoff caramelised caramelized cookie biscuit biscoff biscuit', 30, '/products/lotus-biscoff-75g.jpg'),
  ('Pran Toast Sweet Rusk', '250 g', 'snacks',
   'pran toast sweet rusk rusk biscuit tea time cha', 50, '/products/pran-toast-sweet-rusk-250g.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('Sunsilk Nourishing Soft & Smooth Shampoo', '80 ml', 74.00),
      ('Sunsilk Thick & Long Shampoo', '80 ml', 50.50),
      ('Sunsilk Thick & Long Shampoo', '180 ml', 162.00),
      ('Sunsilk Black Shine Conditioner', '180 ml', 208.00),
      ('Pantene Silky Smooth Shampoo', '75 ml', 71.00),
      ('Pantene Silky Smooth Shampoo', '180 ml', 180.00),
      ('Dove Daily Shine Shampoo', '75 ml', 56.00),
      ('Dove Hair Fall Rescue 1 Minute Conditioner', '75 ml', 112.00),
      ('Dove Hair Fall Rescue 1 Minute Conditioner', '175 ml', 292.50),
      ('Lotus Biscoff Caramelised Cookies', '75 g', 28.00),
      ('Pran Toast Sweet Rusk', '250 g', 45.00)
    ) as v(name, size, cost) on lower(p.name) = lower(v.name) and p.size = v.size
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- Product page text (update 055). Skipped before 055; only fills an empty description.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = v.d
    from (values
      ('Sunsilk Nourishing Soft & Smooth Shampoo', '80 ml', 'Shampoo with egg protein, almond oil and vitamin E, for soft, smooth hair that is easy to manage.'),
      ('Sunsilk Thick & Long Shampoo', '80 ml', 'Shampoo with keratin, collagen and macadamia oil, for thick, long and bouncy-looking hair.'),
      ('Sunsilk Thick & Long Shampoo', '180 ml', 'Shampoo with keratin, collagen and macadamia oil, for thick, long and bouncy-looking hair.'),
      ('Sunsilk Black Shine Conditioner', '180 ml', 'Conditioner with vitamin C, ceramides and pearl protein, for shiny, radiant black hair. Use after shampoo.'),
      ('Pantene Silky Smooth Shampoo', '75 ml', 'Shampoo with Pro-V and vitamin E that hydrates hair, for smooth, frizz-free hair.'),
      ('Pantene Silky Smooth Shampoo', '180 ml', 'Shampoo with Pro-V and vitamin E that hydrates hair, for smooth, frizz-free hair.'),
      ('Dove Daily Shine Shampoo', '75 ml', 'Dove Damage Therapy shampoo with bio-protein care, for soft, shiny hair every day.'),
      ('Dove Hair Fall Rescue 1 Minute Conditioner', '75 ml', 'Dove conditioner with bio-protein care that helps reduce hair fall from breakage. Leave on for 1 minute, then rinse.'),
      ('Dove Hair Fall Rescue 1 Minute Conditioner', '175 ml', 'Dove conditioner with bio-protein care that helps reduce hair fall from breakage. Leave on for 1 minute, then rinse.'),
      ('Lotus Biscoff Caramelised Cookies', '75 g', 'The original crunchy caramelised Biscoff cookies. Great with tea or coffee.'),
      ('Pran Toast Sweet Rusk', '250 g', 'Crunchy, sweet toast rusk, best dipped in a hot cup of tea.')
    ) as v(name, size, d)
    where lower(p.name) = lower(v.name) and p.size = v.size and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.category_id, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in (
  '/products/sunsilk-soft-smooth-shampoo-80ml.jpg', '/products/sunsilk-thick-long-shampoo-80ml.jpg',
  '/products/sunsilk-thick-long-shampoo-180ml.jpg', '/products/sunsilk-black-shine-conditioner-180ml.jpg',
  '/products/pantene-silky-smooth-shampoo-75ml.jpg', '/products/pantene-silky-smooth-shampoo-180ml.jpg',
  '/products/dove-daily-shine-shampoo-75ml.jpg', '/products/dove-hair-fall-rescue-conditioner.jpg',
  '/products/lotus-biscoff-75g.jpg', '/products/pran-toast-sweet-rusk-250g.jpg')
order by p.category_id, p.name, p.size;
