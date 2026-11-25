-- Update 068: App update without writing a version. Admin → App → App update now only says Normal or Mandatory,
-- for both apps or one of them; each app asks its own store (the App Store on iPhone, Google Play on Android)
-- whether a newer version is out, and only then asks or makes the customer update.
-- This drops update 066's rule that a version must be written. Run once in Supabase → SQL Editor, after 066.
-- Safe to run again; nothing is deleted.

alter table public.store_settings drop constraint if exists store_settings_app_update;
alter table public.store_settings add constraint store_settings_app_update check (
  update_mode in ('off', 'soft', 'force') and update_platforms in ('both', 'android', 'ios')
  and update_version ~ '^([0-9]+(\.[0-9]+){0,3})?$' and app_status in ('live', 'maintenance'));

notify pgrst, 'reload schema';

-- Check: the update setting the apps read.
select update_mode, update_platforms, app_status from public.store_settings where id = 1;
