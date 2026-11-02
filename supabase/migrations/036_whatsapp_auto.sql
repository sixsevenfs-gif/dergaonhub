-- Update 036: the "order confirmed" WhatsApp message goes out by itself the moment an order is saved,
-- when Admin → Settings → Automatic WhatsApp messages is on. The database calls the notify-whatsapp
-- function (pg_net), like the Telegram alert, so it never depends on the customer's page staying open.
-- Run once in Supabase → SQL Editor, after deploying notify-whatsapp (supabase/README.md → WhatsApp
-- messages). Safe to run again. A failed message never blocks or undoes an order.

create extension if not exists pg_net with schema extensions;

-- Claimed by the function before sending, so the message goes out once per order however often it is called.
alter table public.orders add column if not exists wa_placed_sent boolean not null default false;

create or replace function public.whatsapp_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Pay-now UPI orders wait for the payment check; the owner sends that confirmation.
  if new.payment_method = 'upi_now' or not coalesce((select whatsapp_auto from store_settings where id = 1), false) then
    return new;
  end if;
  -- Your project's function address (Supabase → Project Settings → API → Project URL + /functions/v1/notify-whatsapp).
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/notify-whatsapp',
    body := jsonb_build_object('order_id', new.id, 'kind', 'placed'),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end
$$;
revoke execute on function public.whatsapp_notify() from public, anon, authenticated;

drop trigger if exists orders_whatsapp_placed on public.orders;
create trigger orders_whatsapp_placed after insert on public.orders
  for each row execute function public.whatsapp_notify();

notify pgrst, 'reload schema';
