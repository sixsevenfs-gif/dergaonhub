-- 7 rice bags from the Shiv Enterprises price survey (20 Nov 2026): Ripuraj Sonashakti and Mahashakti,
-- Raja izong rice and Junaki jeera rice, in 5 kg and 10 kg bags.
-- Sold at MRP with no discount (thin margins; the owner sets any offer in Admin). The shop price is saved as
-- the buy price (owner only, update 034). Safe to run again (adds each name + size only once).
-- The Ripuraj 10 kg survey card says "10kh"; the bag says 10 kg. Push first so the photos
-- (public/products/) are live, then run this.

insert into public.products (name, size, category_id, keywords, price, compare_price, photo_url, available, status)
select v.name, v.size, v.cat, v.keywords, v.price, null, v.photo, true, 'active'
from (values
  ('Ripuraj Sonashakti Premium Jeera Rice', '10 kg', 'rice',
   'ripuraj sonashakti sona shakti premium jeera rice jira rice jeerakasala chawal chaul saul bhaat bag 10kg', 1300, '/products/ripuraj-sonashakti-jeera-rice-10kg.jpg'),
  ('Ripuraj Sonashakti Premium Jeera Parboiled Rice', '5 kg', 'rice',
   'ripuraj sonashakti sona shakti premium jeera parboiled rice boiled rice usna sidha chawal chaul saul bhaat bag 5kg', 720, '/products/ripuraj-sonashakti-jeera-parboiled-rice-5kg.jpg'),
  ('Ripuraj Mahashakti Premium Rice', '5 kg', 'rice',
   'ripuraj mahashakti maha shakti premium rice jeera masino katarni steam rice bpt steam rice chawal chaul saul bhaat bag 5kg', 570, '/products/ripuraj-mahashakti-rice-5kg.jpg'),
  ('Raja Izong Rice', '10 kg', 'rice',
   'raja izong ijong rice assam rice brahmaputra agro chawal chaul saul bhaat bag 10kg', 600, '/products/raja-izong-rice-10kg.jpg'),
  ('Raja Izong Rice', '5 kg', 'rice',
   'raja izong ijong rice assam rice brahmaputra agro chawal chaul saul bhaat bag 5kg', 325, '/products/raja-izong-rice-5kg.jpg'),
  ('Junaki Premium Jeera Rice', '10 kg', 'rice',
   'junaki premium jeera rice jira rice chawal chaul saul bhaat bag 10kg', 800, '/products/junaki-jeera-rice-10kg.jpg'),
  ('Junaki Premium Jeera Rice', '5 kg', 'rice',
   'junaki premium jeera rice jira rice chawal chaul saul bhaat bag 5kg', 400, '/products/junaki-jeera-rice-5kg.jpg')
) as v(name, size, cat, keywords, price, photo)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name) and p.size = v.size);

do $$
begin
  if to_regclass('public.product_costs') is not null then
    insert into public.product_costs (product_id, cost)
    select p.id, v.cost from public.products p
    join (values
      ('/products/ripuraj-sonashakti-jeera-rice-10kg.jpg', 880.00),
      ('/products/ripuraj-sonashakti-jeera-parboiled-rice-5kg.jpg', 440.00),
      ('/products/ripuraj-mahashakti-rice-5kg.jpg', 400.00),
      ('/products/raja-izong-rice-10kg.jpg', 480.00),
      ('/products/raja-izong-rice-5kg.jpg', 245.00),
      ('/products/junaki-jeera-rice-10kg.jpg', 720.00),
      ('/products/junaki-jeera-rice-5kg.jpg', 360.00)
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
      ('/products/ripuraj-sonashakti-jeera-rice-10kg.jpg', 'Small, thin jeera rice grains that cook soft and separate. Good for everyday rice, pulao and fried rice. 10 kg bag.'),
      ('/products/ripuraj-sonashakti-jeera-parboiled-rice-5kg.jpg', 'Parboiled (sidha) jeera rice. The grains stay firm and do not stick, and it keeps well after cooking. 5 kg bag.'),
      ('/products/ripuraj-mahashakti-rice-5kg.jpg', 'Premium steam rice from Ripuraj, with jeera masino, katarni and BPT grains. Cooks soft and fluffy for daily meals. 5 kg bag.'),
      ('/products/raja-izong-rice-10kg.jpg', 'Izong rice from Assam, packed by Brahmaputra Agro Industries. Soft, tasty everyday rice for bhaat. 10 kg bag.'),
      ('/products/raja-izong-rice-5kg.jpg', 'Izong rice from Assam, packed by Brahmaputra Agro Industries. Soft, tasty everyday rice for bhaat. 5 kg bag.'),
      ('/products/junaki-jeera-rice-10kg.jpg', 'Premium jeera rice with small, aromatic grains that cook soft and separate. For daily rice and pulao. 10 kg bag.'),
      ('/products/junaki-jeera-rice-5kg.jpg', 'Premium jeera rice with small, aromatic grains that cook soft and separate. For daily rice and pulao. 5 kg bag.')
    ) as v(photo, d)
    where p.photo_url = v.photo and p.description = '';
  end if;
end $$;

-- Check
select p.name, p.size, p.category_id, p.price, pc.cost as buy_price
from public.products p left join public.product_costs pc on pc.product_id = p.id
where p.photo_url in (
  '/products/ripuraj-sonashakti-jeera-rice-10kg.jpg', '/products/ripuraj-sonashakti-jeera-parboiled-rice-5kg.jpg',
  '/products/ripuraj-mahashakti-rice-5kg.jpg', '/products/raja-izong-rice-10kg.jpg', '/products/raja-izong-rice-5kg.jpg',
  '/products/junaki-jeera-rice-10kg.jpg', '/products/junaki-jeera-rice-5kg.jpg')
order by p.name, p.size;
