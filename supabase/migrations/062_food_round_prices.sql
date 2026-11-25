-- Update 062: Jholzo Food prices end in a round number.
-- With a "markup" deal (Food Desk → Deal), the price customers see is the menu price plus the markup,
-- rounded UP to the next ₹5 (₹84 → ₹85, ₹108 → ₹110, ₹144 → ₹145), so it is never below the markup.
-- Prices under ₹20 go up to the next rupee only (a ₹10 roti with 20% is ₹12, not ₹15).
-- Commission and monthly deals keep the menu price. Half / Full prices work the same way.
-- The apps read the new prices at once; no app update is needed.
-- Run once in Supabase → SQL Editor, after update 061. Safe to run again.

create or replace function public.food_customer_price(p numeric, deal_type text, deal_value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p is null then null
    when deal_type = 'markup' and coalesce(deal_value, 0) > 0 then
      case
        when p * (1 + deal_value / 100) < 20 then ceil(p * (1 + deal_value / 100))
        else ceil(p * (1 + deal_value / 100) / 5) * 5
      end
    else p
  end
$$;

-- Check: menu price → price in the app, for every Live restaurant with an FSSAI number.
select r.name as restaurant,
       m.name as dish,
       m.price as menu_price,
       public.food_customer_price(m.price, r.deal_type, r.deal_value) as app_price
from public.food_restaurants r
join public.food_menu_items m on m.restaurant_id = r.id
where r.status = 'live' and btrim(r.fssai_number) <> ''
order by r.name, m.sort, m.created_at;
