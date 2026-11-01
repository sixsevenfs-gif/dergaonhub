-- Update 025: every customer login saved once per number (Admin → Logins), for offers later.
-- Run once in Supabase → SQL Editor (after 024). Safe to run again.

-- One row per phone number: the same person logging in again only updates last_at and the count.
-- verified: the number passed the SMS OTP at least once.
create table if not exists public.signups (
  phone text primary key check (phone ~ '^[0-9]{10}$'),
  name text not null default '',
  verified boolean not null default false,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  logins int not null default 1
);
create index if not exists signups_first_idx on public.signups (first_at desc);
alter table public.signups enable row level security;
drop policy if exists "admin reads signups" on public.signups;
create policy "admin reads signups" on public.signups for select using (is_admin());
-- Rows are written only by record_login below.

-- Called by the site on login. "verified" is not trusted from the browser: it is true only when the
-- phone-otp function has marked this number verified for this login.
create or replace function public.record_login(p_phone text, p_name text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(coalesce(trim(p_name), ''), 60);
  v_ok boolean := exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone);
begin
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then return; end if;
  insert into signups (phone, name, verified) values (p_phone, v_name, v_ok)
  on conflict (phone) do update set
    name = case when excluded.name <> '' then excluded.name else signups.name end,
    verified = signups.verified or excluded.verified,
    last_at = now(),
    logins = signups.logins + 1;
end $$;
revoke execute on function public.record_login(text, text) from anon, public;
grant execute on function public.record_login(text, text) to authenticated;

-- Fill in who came before this update: OTP numbers (sent or verified) and everyone who ordered.
insert into signups (phone, name, verified, first_at, last_at, logins)
select phone, '', false, min(created_at), max(created_at), 1 from otp_requests
where phone ~ '^[0-9]{10}$' group by phone
on conflict (phone) do nothing;

update signups s set verified = true, first_at = least(s.first_at, v.at)
from (select phone, min(verified_at) as at from verified_phones group by phone) v
where v.phone = s.phone;
insert into signups (phone, name, verified, first_at, last_at, logins)
select phone, '', true, min(verified_at), max(verified_at), 1 from verified_phones group by phone
on conflict (phone) do nothing;

insert into signups (phone, name, verified, first_at, last_at, logins)
select phone, name, false, created_at, created_at, 1 from customers
on conflict (phone) do update set name = case when signups.name = '' then excluded.name else signups.name end;

notify pgrst, 'reload schema';
