-- A new category, Meat & Fish (fresh chicken now; fish or mutton can go in later), and 5 items at the owner's prices:
-- Kinder Joy for Boys (Blue) and for Girls (Pink), 20 g each at ₹50; one pineapple ₹50; a tray of 30 white eggs
-- ₹250; broiler chicken curry cut 1 kg ₹260. No buy prices were given, so none are saved.
-- Safe to run again (the category and each name + size are added only once). Push first so the photos
-- (public/products/) and the category picture (public/categories/meat.webp) are live, then run this.

-- The new category goes at the end of the list (the home page shows it under "More").
insert into public.categories (id, name, short, sort)
select 'meat', 'Meat & Fish', 'Meat & Fish', (select coalesce(max(sort), 0) + 1 from public.categories)
where not exists (select 1 from public.categories where id = 'meat')
on conflict (id) do nothing;

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('Kinder Joy for Boys (Blue)', '20 g', 'snacks',
   'kinder joy boys blue egg chocolate surprise toy kids ferrero wafer cocoa', 50, '/products/kinder-joy-boys-blue-20g.jpg'),
  ('Kinder Joy for Girls (Pink)', '20 g', 'snacks',
   'kinder joy girls pink egg chocolate surprise toy kids ferrero wafer cocoa', 50, '/products/kinder-joy-girls-pink-20g.jpg'),
  ('Pineapple (Ananas)', '1 pc', 'vegetables',
   'pineapple ananas anaras matikothal fresh fruit', 50, '/products/pineapple-1pc.jpg'),
  ('White Eggs (Anda)', '30 pcs (1 tray)', 'dairy',
   'eggs egg anda koni white eggs tray 30 pcs', 250, '/products/white-eggs-tray-30.jpg'),
  ('Broiler Chicken (Murgi), Curry Cut', '1 kg', 'meat',
   'chicken broiler murgi kukura kukura mangxo curry cut fresh chicken meat non veg', 260, '/products/broiler-chicken-curry-cut-1kg.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Product page text (update 055). Skipped before 055; only fills an empty description.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = v.d
    from (values
      ('/products/kinder-joy-boys-blue-20g.jpg', 'Creamy milk and cocoa spread with crunchy wafer balls on one side, and a surprise toy for boys on the other. Eat it with the little spoon inside.'),
      ('/products/kinder-joy-girls-pink-20g.jpg', 'Creamy milk and cocoa spread with crunchy wafer balls on one side, and a surprise toy for girls on the other. Eat it with the little spoon inside.'),
      ('/products/pineapple-1pc.jpg', 'One whole fresh pineapple, sweet and juicy. Cut it fresh, or use it in juice, salads and desserts.'),
      ('/products/white-eggs-tray-30.jpg', 'A full tray of 30 fresh white eggs. Boil, fry or make an omelette.'),
      ('/products/broiler-chicken-curry-cut-1kg.jpg', 'Fresh broiler chicken, cut into curry pieces with the bone. 1 kg, for curry, fry or biryani.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select c.name as category, p.name, p.size, p.price
from public.products p join public.categories c on c.id = p.category_id
where p.photo_url in (
  '/products/kinder-joy-boys-blue-20g.jpg', '/products/kinder-joy-girls-pink-20g.jpg', '/products/pineapple-1pc.jpg',
  '/products/white-eggs-tray-30.jpg', '/products/broiler-chicken-curry-cut-1kg.jpg')
order by c.sort, p.name;
