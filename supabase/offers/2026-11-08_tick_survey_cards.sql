-- Tick "Added to products" on the 58 Shanka survey cards whose products were added on 7–8 Nov 2026
-- (2026-11-08_ALL_new_products.sql). Run once in Supabase → SQL Editor. Safe to run again.
-- Normally only a logged-in owner can tick a card (trigger survey_items_stamp, update 040), and the SQL Editor is not
-- logged in, so the trigger is switched off just for this one update and switched on again. A card matches on its
-- size text (spaces and case ignored), MRP and shop price, exactly as written on the card.
begin;
alter table public.survey_items disable trigger survey_items_stamp;

update public.survey_items s set done = true
from (values
  ('500g', 70, 38), ('200g', 30, 16), ('2kg', 120, 92), ('500 g', 40, 25), ('250 g', 140, 95),
  ('200g', 60, 49), ('100 g', 62, 57), ('Buy 3 get 1 free 4×150g', 153, 142), ('80g', 43, 40), ('100 g', 30, 28),
  ('4+1 400g +100g free', 115, 106),
  ('100 g', 25, 23), ('Buy 3+1 3into100g +100g free', 104, 96), ('200 ml', 45, 45), ('500 ml', 129, 119),
  ('500 ml', 110, 102), ('500 g', 264, 245), ('500 g', 263, 244), ('500 g', 329, 305), ('500 ml', 120, 111),
  ('200g', 90, 83), ('400g', 120, 100), ('200g', 65, 55),
  ('200g', 40, 36), ('295g', 50, 45), ('231g', 40, 36), ('250 g', 40, 36), ('280g', 40, 36), ('200g', 30, 27),
  ('229', 30, 27), ('69g', 35, 32), ('150g', 40, 36), ('119g', 20, 18),
  ('106g', 20, 18), ('214g', 30, 27), ('100 g', 40, 36), ('200g', 35, 32), ('40g', 55, 50), ('102g', 110, 100),
  ('45g', 35, 32), ('100 g', 60, 55),
  ('90g', 27, 25), ('150ml', 100, 90), ('175ml', 153, 139), ('180ml', 189, 172), ('400g', 130, 125),
  ('50ml', 320, 286), ('20g', 45, 41), ('120ml', 54, 49), ('100ml', 80, 67),
  ('100ml', 125, 105), ('50g', 124, 113), ('120ml', 225, 160)
) as v(details, mrp, shop_price)
where s.shop ilike 'shanka%' and not s.done
  and s.mrp = v.mrp and s.shop_price = v.shop_price
  and lower(regexp_replace(replace(s.details, '×', 'x'), '\s', '', 'g'))
    = lower(regexp_replace(replace(v.details, '×', 'x'), '\s', '', 'g'));

alter table public.survey_items enable trigger survey_items_stamp;
commit;

-- Check: how many cards are ticked now, and the priced cards still open (if any).
select count(*) filter (where done) as ticked, count(*) filter (where not done and shop_price is not null) as still_open
from public.survey_items;
