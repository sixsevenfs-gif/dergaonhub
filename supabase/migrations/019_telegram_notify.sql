-- Update 019: Telegram message to the admin for every new order, and when a customer submits a UPI UTR.
-- Run once in Supabase → SQL Editor (after 018), after deploying the telegram-notify function
-- (see supabase/README.md → Telegram order alerts). Safe to run again; nothing is deleted.
--
-- The database calls the function itself (pg_net), after the order is saved, so an alert never
-- depends on the customer's page staying open. A failed alert never blocks or undoes an order.

create extension if not exists pg_net with schema extensions;

create or replace function public.telegram_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'placed';
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

drop trigger if exists orders_telegram_placed on public.orders;
create trigger orders_telegram_placed after insert on public.orders
  for each row execute function public.telegram_notify();

drop trigger if exists orders_telegram_utr on public.orders;
create trigger orders_telegram_utr after update of upi_ref on public.orders
  for each row execute function public.telegram_notify();
