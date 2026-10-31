-- Update 024: proper name and phone on every order, phone OTP switched on, and an OTP credit counter
-- that warns on Telegram before the Message Central balance runs out. Run once in Supabase → SQL Editor
-- (after 023), then deploy the phone-otp function again.

-- OTP credits: the admin types how many OTPs are left (Settings), every SMS sent takes one off.
-- otp_alert_at: Telegram warns when the count drops to this number (and again at 10 and at 0).
alter table public.store_settings add column if not exists otp_credits_left int;
alter table public.store_settings add column if not exists otp_alert_at int not null default 50;
-- Failed sends in a row: after 3 within 15 minutes, OTP switches itself off so customers can still order.
alter table public.store_settings add column if not exists otp_failures int not null default 0;
alter table public.store_settings add column if not exists otp_failed_at timestamptz;
alter table public.store_settings add column if not exists otp_auto_off boolean not null default false;

-- Every order: a real name (letters, no digits) and an Indian mobile number (starts with 6, 7, 8 or 9).
create or replace function public.orders_check_contact() returns trigger
language plpgsql as $$
begin
  if coalesce(trim(new.customer_name), '') !~ '[A-Za-zঀ-৿ऀ-ॿ].*[A-Za-zঀ-৿ऀ-ॿ]'
     or new.customer_name ~ '[0-9]' then
    raise exception 'Enter your full name (letters only).';
  end if;
  if coalesce(new.customer_phone, '') !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number.';
  end if;
  if coalesce(new.ordered_by_phone, '') <> '' and new.ordered_by_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number for yourself.';
  end if;
  return new;
end $$;

drop trigger if exists orders_check_contact on public.orders;
create trigger orders_check_contact before insert on public.orders
  for each row execute function public.orders_check_contact();

-- Turn the OTP on: from now on a number must pass the SMS code once on a phone before it can order.
update public.store_settings set otp_required = true, otp_auto_off = false, otp_failures = 0 where id = 1;
