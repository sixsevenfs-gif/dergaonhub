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

-- Check
select p.name, p.size, p.price from public.products p
where p.photo_url in ('/products/himalaya-baby-lotion-100ml.jpg', '/products/garnier-men-turbobright-face-wash-50g.jpg',
  '/products/fogg-amaze-120ml.jpg', '/products/fogg-desire-120ml.jpg')
order by p.name;
