-- Delete every product that has no photo (31 Oct 2026).
-- On 31 Oct all 120 products shown to customers had a photo, so this only finds hidden ones.
-- Old orders keep the item name and price (order_items.product_id becomes empty).
-- Run in Supabase → SQL Editor in two steps.

-- STEP 1: run this alone first and check the list.
select name, size, category_id, price, status
from public.products
where coalesce(photo_url, '') = ''
order by status, category_id, name;

-- STEP 2: if the list is right, run this. It cannot be undone.
-- delete from public.products where coalesce(photo_url, '') = '';
