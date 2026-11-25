-- Update 066: the Jholzo app's control centre (Admin → App), changed from the website without a new app version.
-- Every setting here works the same in both apps, Android and iPhone.
-- 1. Banners: pictures at the top of the Grocery home, the Food home, or both, each with what it opens, on/off,
--    order and optional start / end times. The app's two built-in banners are added here once, so they can be
--    changed or removed like any other. With no banner running, the apps show none.
-- 2. App update: a normal update (asked once, can be skipped) or a mandatory one (a full screen "Update Jholzo"
--    until the app is updated), for both apps or just one. Each app asks its own store whether a newer version
--    is out (update 068), so no version is written here.
-- 3. App status: Live, or Maintenance (a full screen "We'll be back soon" in both apps).
-- 4. admin_app_overview(): phones with the app, versions in use, notifications and banners, for the owner.
-- Pictures go in the public app-media bucket from update 065. Push the website first (the built-in banner
-- pictures are at jholzo.com/app-banners/), then run this once in Supabase → SQL Editor, after 065.
-- Safe to run again; nothing is deleted.

create table if not exists public.app_banners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  place text not null default 'grocery',
  image text not null check (image ~ '^https://'),
  title text not null default '',
  link text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
-- Grocery home, Food home, or both (an earlier copy of this update allowed only the first two).
alter table public.app_banners drop constraint if exists app_banners_place_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'app_banners_place_ok') then
    alter table public.app_banners add constraint app_banners_place_ok check (place in ('grocery', 'food', 'both'));
  end if;
end $$;
create index if not exists app_banners_place on public.app_banners (place, sort);
alter table public.app_banners enable row level security;
drop policy if exists "banners running now" on public.app_banners;
create policy "banners running now" on public.app_banners for select
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "owner banners" on public.app_banners;
create policy "owner banners" on public.app_banners for all using (is_admin()) with check (is_admin());

alter table public.store_settings
  add column if not exists update_mode text not null default 'off',
  add column if not exists update_version text not null default '',
  add column if not exists update_platforms text not null default 'both',
  add column if not exists update_title text not null default '',
  add column if not exists update_message text not null default '',
  add column if not exists ios_store_url text not null default 'https://apps.apple.com/app/id6836980141',
  add column if not exists android_store_url text not null default 'https://play.google.com/store/apps/details?id=com.jholzo.app',
  add column if not exists app_status text not null default 'live',
  add column if not exists app_status_title text not null default '',
  add column if not exists app_status_message text not null default '',
  add column if not exists app_banners_seeded boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_app_update') then
    alter table public.store_settings add constraint store_settings_app_update check (
      update_mode in ('off', 'soft', 'force') and update_platforms in ('both', 'android', 'ios')
      and update_version ~ '^([0-9]+(\.[0-9]+){0,3})?$' and app_status in ('live', 'maintenance'));
  end if;
end $$;

-- The app's own two banners, once (deleting them later keeps them deleted).
do $$ begin
  if exists (select 1 from public.store_settings where id = 1 and not app_banners_seeded) then
    if not exists (select 1 from public.app_banners) then
      insert into public.app_banners (place, image, title, link, sort) values
        ('grocery', 'https://jholzo.com/app-banners/fresh-groceries.jpg', 'Fresh groceries, delivered to your door', 'https://jholzo.com/?open=categories', 0),
        ('grocery', 'https://jholzo.com/app-banners/share-and-earn.jpg', 'Share Jholzo, earn rewards', 'https://jholzo.com/wallet', 1);
    end if;
    update public.store_settings set app_banners_seeded = true where id = 1;
  end if;
end $$;

-- Owner: the App part's home in numbers.
create or replace function public.admin_app_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  return jsonb_build_object(
    'devices', (select jsonb_build_object(
        'total', count(*), 'android', count(*) filter (where platform = 'android'), 'ios', count(*) filter (where platform = 'ios'),
        'logged_in', count(*) filter (where phone <> ''), 'new_7d', count(*) filter (where created_at > now() - interval '7 days'))
      from device_tokens where env = 'prod'),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'version', version, 'phones', phones)
        order by platform, phones desc), '[]')
      from (select platform, coalesce(nullif(app_version, ''), '?') as version, count(*) as phones
            from device_tokens where env = 'prod' group by 1, 2) v),
    'campaigns', (select jsonb_build_object('count_30d', count(*), 'sent_30d', coalesce(sum(sent), 0), 'failed_30d', coalesce(sum(failed), 0))
      from push_campaigns where created_at > now() - interval '30 days'),
    'last_campaign', (select to_jsonb(c) from (select title, body, created_at, sent, failed, audience, status
      from push_campaigns order by created_at desc limit 1) c),
    'banners', (select jsonb_build_object('total', count(*),
        'live', count(*) filter (where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
        'grocery', count(*) filter (where place in ('grocery', 'both') and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
        'food', count(*) filter (where place in ('food', 'both') and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())))
      from app_banners)
  );
end
$$;
revoke all on function public.admin_app_overview() from public, anon;
grant execute on function public.admin_app_overview() to authenticated;

notify pgrst, 'reload schema';

-- Check: the banners and the app settings.
select (select count(*) from public.app_banners) as banners, update_mode, update_version, update_platforms, app_status, ios_store_url
from public.store_settings where id = 1;
