-- Update 028: push notifications for the Android app (Firebase Cloud Messaging).
-- Run once in Supabase → SQL Editor (after 027), after deploying the push-notify function
-- (see supabase/README.md → App notifications). Safe to run again; nothing is deleted.
--
-- The app saves its Firebase token for the logged-in number (save_device_token). When an order is
-- confirmed, on the way, arriving, delivered, cancelled or its UPI payment is accepted, the database
-- calls push-notify (pg_net), which sends the notification to every phone of that number.

create extension if not exists pg_net with schema extensions;

-- One row per phone (app install). Only the push-notify function reads it (service key).
create table if not exists public.device_tokens (
  token text primary key,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  user_id uuid,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_phone_idx on public.device_tokens (phone);
alter table public.device_tokens enable row level security;
-- No policies: customers write through save_device_token() only, nobody reads it from the app.

-- Called by the app after login. A phone can only register for a number it owns (verified by OTP or
-- ordered from this phone), so nobody can get someone else's order updates. Otherwise it does nothing.
create or replace function public.save_device_token(p_token text, p_phone text, p_platform text default 'android') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then raise exception 'Invalid token.'; end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if not owns_phone(p_phone) then return; end if;
  insert into device_tokens (token, phone, user_id, platform, updated_at)
  values (p_token, p_phone, auth.uid(), left(coalesce(p_platform, 'android'), 20), now())
  on conflict (token) do update set phone = excluded.phone, user_id = excluded.user_id,
    platform = excluded.platform, updated_at = now();
end
$$;
revoke execute on function public.save_device_token(text, text, text) from public, anon;
grant execute on function public.save_device_token(text, text, text) to authenticated;

-- Each order event is sent once, even if the function is called twice.
create table if not exists public.push_log (
  order_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (order_id, kind)
);
alter table public.push_log enable row level security;

create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'completed', 'cancelled') then
    v_kind := case new.status when 'confirmed' then 'confirmed' when 'completed' then 'delivered' else 'cancelled' end;
  elsif new.dispatch is distinct from old.dispatch and new.dispatch in ('on_the_way', 'arriving') then
    v_kind := new.dispatch;
  elsif new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
    v_kind := 'paid';
  else
    return new;
  end if;
  -- Your project's function address (Supabase → Project Settings → API → Project URL + /functions/v1/push-notify).
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('order_id', new.id, 'kind', v_kind),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- a failed notification never blocks or undoes an order change
end
$$;

drop trigger if exists orders_push_notify on public.orders;
create trigger orders_push_notify after update of status, dispatch, payment_status on public.orders
  for each row execute function public.push_notify();

notify pgrst, 'reload schema';
