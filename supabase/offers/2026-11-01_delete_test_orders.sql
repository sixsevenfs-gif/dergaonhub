-- Delete the test orders DG-1001 to DG-1021 everywhere, and keep the real order of Dilip Kalita.
-- Run once in Supabase → SQL Editor. It is all or nothing: if a check below fails, nothing is deleted.
--
-- Goes with each test order: its items, complaints, WhatsApp message log (deleted by the database
-- together with the order), its Jholzo Money entries, and the test customers who have no other orders.
-- Order numbers keep counting from where they are (the next order is not DG-1001 again).

do $$
declare
  n_orders int;
  n_customers int;
begin
  -- Safety: the real order must exist and must not be in the test range.
  if not exists (select 1 from orders where customer_name ilike '%dilip%') then
    raise exception 'Dilip Kalita''s order was not found. Nothing deleted.';
  end if;
  if exists (select 1 from orders where customer_name ilike '%dilip%'
             and order_number ~ '^DG-[0-9]+$' and substring(order_number from 4)::int <= 1021) then
    raise exception 'Dilip Kalita''s order is numbered DG-1021 or lower. Nothing deleted, check the numbers first.';
  end if;

  create temp table test_orders on commit drop as
    select id, customer_id, orderer_id from orders
    where order_number ~ '^DG-[0-9]+$' and substring(order_number from 4)::int <= 1021;
  n_orders := (select count(*) from test_orders);

  delete from wallet_entries where order_id in (select id from test_orders);
  delete from orders where id in (select id from test_orders);   -- items, complaints, messages go with it

  -- Test customers with no orders left (anyone who still has an order is kept).
  delete from customers c
  where (c.id in (select customer_id from test_orders) or c.id in (select orderer_id from test_orders where orderer_id is not null))
    and not exists (select 1 from orders o where o.customer_id = c.id or o.orderer_id = c.id);
  get diagnostics n_customers = row_count;

  raise notice 'Deleted % test orders and % test customers.', n_orders, n_customers;
end $$;

-- Check: only the real orders should be left.
select order_number, customer_name, total, status, created_at from orders order by created_at;
