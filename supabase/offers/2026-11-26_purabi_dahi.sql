-- Purabi Dahi (sweetened curd) in two cups at the owner's prices: 200 g ₹30 and 400 g ₹55. No buy prices were given,
-- so none are saved. Safe to run again (each name + size is added only once). Push first so the photos
-- (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, 'dairy', v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('Purabi Dahi, Sweetened Curd', '200 g',
   'purabi dahi doi curd sweet sweetened mishti doi yogurt dairy cup', 30, '/products/purabi-dahi-sweetened-curd-200g.jpg'),
  ('Purabi Dahi, Sweetened Curd', '400 g',
   'purabi dahi doi curd sweet sweetened mishti doi yogurt dairy cup', 55, '/products/purabi-dahi-sweetened-curd-400g.jpg')
) as v(name, size, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

-- Product page text (update 055). Skipped before 055; only fills an empty description.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'description') then
    update public.products p set description = 'Purabi''s thick, sweetened curd in a sealed cup. Eat it chilled as it is, after a meal, or with rice. Keep it in the fridge (below 8 °C).'
    where p.photo_url in ('/products/purabi-dahi-sweetened-curd-200g.jpg', '/products/purabi-dahi-sweetened-curd-400g.jpg')
      and coalesce(p.description, '') = '';
  end if;
end
$$;

-- Check: the two cups.
select name, size, price, category_id, available from public.products where name = 'Purabi Dahi, Sweetened Curd' order by price;
