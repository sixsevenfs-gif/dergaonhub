-- Update 042: a Telegram message when an order is cancelled, and sales totals for any dates on the admin home.
-- Run once in Supabase → SQL Editor, after deploying telegram-notify again (it knows the new "cancelled"
-- message). Safe to run again; nothing is deleted.
--
-- 1. Cancelled by the customer, by the store, not paid in time, or expired: the database tells
--    telegram-notify (same way as new orders, update 019), once per order (orders.tg_cancel_sent).
-- 2. admin_sales(from, to): totals of delivered orders by delivery day, so cancelled and test orders never
--    count. One call for a day, a month or everything since launch. Spend is shown to the owner only.

alter table public.orders add column if not exists tg_cancel_sent boolean not null default false;
-- Orders cancelled before this update never send a message.
update public.orders set tg_cancel_sent = true where status = 'cancelled' and not tg_cancel_sent;

create or replace function public.telegram_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'placed';
  elsif tg_name = 'orders_telegram_cancelled' then
    if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
    v_kind := 'cancelled';
  elsif coalesce(new.upi_ref, '') <> '' and new.upi_ref is distinct from old.upi_ref then
    v_kind := 'utr';
  else
    return new;
  end if;
  -- Your project's function address (Supabase → Project Settings → API → Project URL + /functions/v1/telegram-notify).
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/telegram-notify',
    body := jsonb_build_object('order_id', new.id, 'kind', v_kind),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end
$$;

drop trigger if exists orders_telegram_cancelled on public.orders;
create trigger orders_telegram_cancelled after update of status on public.orders
  for each row execute function public.telegram_notify();

create or replace function public.admin_sales(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not is_desk() then raise exception 'Only the store can see sales.'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Pick a start date on or before the end date.'; end if;
  with o as (
    select * from orders where delivery_date between p_from and p_to
  ), done as (
    select * from o where status = 'completed'
  ), lines as (
    select i.* from order_items i join done on done.id = i.order_id
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'delivered', (select count(*) from done),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'pending', (select count(*) from o where status in ('placed', 'confirmed')),
    'sales', (select coalesce(sum(total), 0) from done),
    'cash', (select coalesce(sum(cash_collected), 0) from done where payment_method = 'cash'),
    'upi', (select coalesce(sum(total), 0) from done where payment_method <> 'cash'),
    'delivery_fees', (select coalesce(sum(delivery_fee + express_fee), 0) from done),
    'packaging', (select coalesce(sum(packaging_fee), 0) from done),
    'wallet_used', (select coalesce(sum(wallet_used), 0) from done),
    'customers', (select count(distinct customer_phone) from done),
    'items_sold', (select coalesce(sum(quantity), 0) from lines),
    'spent', case when is_admin() then (select coalesce(sum(amount), 0) from daily_expenses where date between p_from and p_to) end,
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'delivered', n, 'sales', s) order by d), '[]'::jsonb)
               from (select delivery_date d, count(*) n, sum(total) s from done group by delivery_date) x),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'amount', a) order by q desc, a desc), '[]'::jsonb)
                  from (select name_snapshot name, sum(quantity) q, sum(line_total) a from lines
                        group by name_snapshot order by sum(quantity) desc, sum(line_total) desc limit 10) t)
  ) into r;
  return r;
end
$$;
revoke execute on function public.admin_sales(date, date) from public, anon;
grant execute on function public.admin_sales(date, date) to authenticated;
