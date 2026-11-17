-- Update 055: a description for every product, shown on the product page.
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.
--
-- products.description: a few plain lines about the item (what it is, how to use it). Customers see it under
-- "Product details" when they open a product. The owner writes or changes it in Admin → Products.
-- Empty means the product page shows one general line for its category instead.

alter table public.products add column if not exists description text not null default '';

notify pgrst, 'reload schema';
