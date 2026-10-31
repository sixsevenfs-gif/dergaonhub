-- Offer (31 Oct 2026): fruits and dry fruits 7% off, oats 5% off.
-- Customers see the old price struck out with "% OFF" (compare_price, update 012). Orders use price.
-- Run once in Supabase → SQL Editor. Safe to run again: it always works from the original price.
-- Coconut, onion and potato stay at full price.

-- Fruits + Dry Fruits & Seeds: 7% off
update public.products
set compare_price = coalesce(compare_price, price),
    price = round(coalesce(compare_price, price) * 0.93)::int
where status = 'active'
  and (
    category_id = 'dryfruits'
    or (category_id = 'vegetables' and name in (
      'Apple (Seb)', 'Green Grapes (Angoor)', 'Red Grapes (Angoor)',
      'Guava (Amrood)', 'Orange (Santra)', 'Pomegranate (Anar)'
    ))
  );

-- Oats: 5% off
update public.products
set compare_price = coalesce(compare_price, price),
    price = round(coalesce(compare_price, price) * 0.95)::int
where status = 'active' and name in ('Kellogg''s Oats', 'Quaker Oats');

-- Check: old price, new price, % off
select name, size, compare_price as old_price, price as new_price,
       round(100 - price * 100.0 / compare_price, 1) as pct_off
from public.products
where compare_price is not null
order by category_id, name;

-- To END the offer later, run only this (prices go back to the old ones):
-- update public.products set price = compare_price, compare_price = null
-- where compare_price is not null
--   and (category_id = 'dryfruits'
--        or name in ('Apple (Seb)', 'Green Grapes (Angoor)', 'Red Grapes (Angoor)', 'Guava (Amrood)',
--                    'Orange (Santra)', 'Pomegranate (Anar)', 'Kellogg''s Oats', 'Quaker Oats'));
