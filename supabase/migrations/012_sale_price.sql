-- Update 012: sale price. compare_price is the price before the discount; customers see it struck out
-- next to the price, with "% OFF". Orders always use price. Run once in Supabase → SQL Editor. Safe to run again.

alter table public.products add column if not exists compare_price int;
do $$ begin
  alter table public.products add constraint products_compare_price_check check (compare_price is null or compare_price > price);
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
