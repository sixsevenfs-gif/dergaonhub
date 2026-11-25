-- Update 066: app banners and app updates, both changed from the admin without a new app review.
-- 1. Banners (Admin → App → Banners): pictures at the top of the Grocery home and the Food home, each with
--    what it opens, on/off, order, and optional start / end times. The apps show only the ones running now;
--    with none, they show their built-in banners.
-- 2. App updates (Admin → App → App updates): the lowest app version that may still be used (older ones see
--    a full screen "Update Jholzo" they can't skip) and the newest one (older ones are asked once).
-- Pictures go in the public app-media bucket from update 065.
-- Run once in Supabase → SQL Editor, after 065. Safe to run again; nothing is deleted.

create table if not exists public.app_banners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  place text not null default 'grocery' check (place in ('grocery', 'food')),
  image text not null check (image ~ '^https://'),
  title text not null default '',
  link text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists app_banners_place on public.app_banners (place, sort);
alter table public.app_banners enable row level security;
drop policy if exists "banners running now" on public.app_banners;
create policy "banners running now" on public.app_banners for select
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "owner banners" on public.app_banners;
create policy "owner banners" on public.app_banners for all using (is_admin()) with check (is_admin());

alter table public.store_settings
  add column if not exists ios_min_version text not null default '',
  add column if not exists ios_latest_version text not null default '',
  add column if not exists android_min_version_code int not null default 0,
  add column if not exists android_latest_version_code int not null default 0,
  add column if not exists update_message text not null default '',
  add column if not exists ios_store_url text not null default 'https://apps.apple.com/app/id6836980141',
  add column if not exists android_store_url text not null default 'https://play.google.com/store/apps/details?id=com.jholzo.app';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_ios_versions') then
    alter table public.store_settings add constraint store_settings_ios_versions
      check (ios_min_version ~ '^([0-9]+(\.[0-9]+){0,2})?$' and ios_latest_version ~ '^([0-9]+(\.[0-9]+){0,2})?$');
  end if;
end $$;

notify pgrst, 'reload schema';

-- Check: the banners table and the update settings.
select (select count(*) from public.app_banners) as banners,
       ios_min_version, ios_latest_version, android_min_version_code, android_latest_version_code, ios_store_url
from public.store_settings where id = 1;
