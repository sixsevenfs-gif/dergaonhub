-- Update 021: the order of "Popular essentials" on the home page. Run once in Supabase → SQL Editor
-- (after 020). Safe to run again; nothing is deleted.
-- 1 shows first, then 2, 3…; starred products without a number come after, in category order.

alter table public.products add column if not exists featured_rank int;
