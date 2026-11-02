-- Delete the test order DG-1026 (for "aa", ₹264.80, delivered) everywhere.
-- Run once in Supabase → SQL Editor. It is all or nothing: if the order does not look exactly like the
-- test order, nothing is deleted.
--
-- Goes with it: its items, complaints and WhatsApp message log (deleted by the database together with
-- the order), its Jholzo Money entries, and the customer "aa" if they have no other orders.
-- The person who ordered it (you) is kept. Order numbers keep counting from where they are.
-- The rider's delivery photo stays in Supabase → Storage → deliveries (private); delete it there if you like.

do $$
declare
  o orders;
  n_customers int;
begin
  select * into o from orders where order_number = 'DG-1026';
  if o.id is null then
    raise exception 'Order DG-1026 not found. Nothing deleted.';
  end if;
  -- Safety: only the test order.
  if lower(trim(o.customer_name)) <> 'aa' or o.total <> 264.80 then
    raise exception 'DG-1026 is for % (₹%), not the test order. Nothing deleted, check the number first.', o.customer_name, o.total;
  end if;

  delete from wallet_entries where order_id = o.id;
  delete from orders where id = o.id;   -- items, complaints, messages go with it

  -- The receiver "aa", if this was their only order.
  delete from customers c
  where c.id = o.customer_id
    and not exists (select 1 from orders x where x.customer_id = c.id or x.orderer_id = c.id);
  get diagnostics n_customers = row_count;

  raise notice 'Deleted order DG-1026 and % test customer(s). Delivery photo: %', n_customers, coalesce(nullif(o.delivery_photo, ''), 'none');
end $$;

-- Check: DG-1026 should be gone from this list.
select order_number, customer_name, total, status, created_at from orders order by created_at desc limit 10;
