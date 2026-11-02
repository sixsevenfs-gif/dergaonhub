-- Update 030: a secret code to open Admin → Delete orders, checked by the database (not by the website,
-- whose code anyone can read). Without the right code no order can be deleted, even through the API.
-- Run once in Supabase → SQL Editor (after 029). Safe to run again.
--
-- The code is never written in this file: this project is public on GitHub. Set it once with this line
-- in the SQL Editor, typing your own 4–8 digit code in place of 0000, and keep it to yourself:
--   update admin_secrets set delete_code_hash = encode(sha256(convert_to('0000', 'UTF8')), 'hex') where id = 1;
-- Only its fingerprint (hash) is saved. To change it later, run the same line with the new code.

-- Secrets of the admin area. Row-level security with no policies: the website can neither read nor
-- change it; only the database functions below (and the SQL Editor) can.
create table if not exists public.admin_secrets (
  id int primary key default 1 check (id = 1),
  delete_code_hash text
);
insert into public.admin_secrets (id) values (1) on conflict (id) do nothing;
alter table public.admin_secrets enable row level security;

-- True when p_code matches the saved code. Used only inside the functions below.
create or replace function public.delete_code_ok(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select delete_code_hash from admin_secrets where id = 1) = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex'),
    false)
$$;
revoke execute on function public.delete_code_ok(text) from public, anon, authenticated;

-- Admin → Delete orders asks for the code before showing anything.
create or replace function public.admin_check_delete_code(p_code text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if (select delete_code_hash from admin_secrets where id = 1) is null then
    raise exception 'No delete code is set yet. Set it in Supabase (see migrations/030_delete_code.sql).';
  end if;
  return delete_code_ok(p_code);
end
$$;
revoke execute on function public.admin_check_delete_code(text) from public, anon;
grant execute on function public.admin_check_delete_code(text) to authenticated;

-- Same as update 029, now with the code.
drop function if exists public.admin_delete_orders(uuid[]);
create or replace function public.admin_delete_orders(p_ids uuid[], p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_people uuid[];
  v_orders int;
  v_customers int;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not delete_code_ok(p_code) then raise exception 'Wrong delete code.'; end if;
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
revoke execute on function public.admin_delete_orders(uuid[], text) from public, anon;
grant execute on function public.admin_delete_orders(uuid[], text) to authenticated;

notify pgrst, 'reload schema';
