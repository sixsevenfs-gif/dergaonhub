-- Update 029: Admin → Delete orders. Removes test / demo orders from the database for good, so they
-- count nowhere (sales, daily summary, reports, top items, customers, Jholzo Money, no-shows).
-- Run once in Supabase → SQL Editor (after 028, or after 027 if you skipped the app notifications).
-- Safe to run again.
--
-- Goes with each order: its items, complaints and WhatsApp message log (deleted by the database together
-- with the order), its Jholzo Money entries (money used on it, rewards it earned), its notification log,
-- a no-show it added, and the customers who have no other orders (with their Jholzo Money and invite code).
-- Order numbers keep counting from where they are.

create or replace function public.admin_delete_orders(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_people uuid[];
  v_orders int;
  v_customers int;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one order.'; end if;
  if cardinality(p_ids) > 200 then raise exception 'Delete at most 200 orders at a time.'; end if;

  -- The people on these orders (receiver and orderer), checked again once the orders are gone.
  select coalesce(array_agg(distinct pid), '{}') into v_people
  from (
    select customer_id as pid from orders where id = any(p_ids)
    union
    select orderer_id from orders where id = any(p_ids) and orderer_id is not null
  ) s;

  -- A no-show these orders added no longer counts against the number.
  update customers c set no_show_count = greatest(0, c.no_show_count - x.n)
  from (
    select customer_id, count(*)::int as n from orders
    where id = any(p_ids) and status = 'cancelled' and cancel_reason = 'No-show'
    group by customer_id
  ) x
  where c.id = x.customer_id;

  delete from wallet_entries where order_id = any(p_ids);
  delete from orders where id = any(p_ids);   -- items, complaints, messages go with it
  get diagnostics v_orders = row_count;

  if to_regclass('public.push_log') is not null then
    execute 'delete from public.push_log where order_id = any($1)' using p_ids;
  end if;

  -- Customers who only had these orders.
  delete from customers c
  where c.id = any(v_people)
    and not exists (select 1 from orders o where o.customer_id = c.id or o.orderer_id = c.id);
  get diagnostics v_customers = row_count;

  return jsonb_build_object('orders', v_orders, 'customers', v_customers);
end
$$;
revoke execute on function public.admin_delete_orders(uuid[]) from public, anon;
grant execute on function public.admin_delete_orders(uuid[]) to authenticated;

notify pgrst, 'reload schema';
