-- 076: The "Coming soon" page for the apps. While launch_on is true, both apps show only that page: the Jholzo
-- logo, "Coming soon", the owner's lines, "Launching on 01 Dec" (launch_label) and the hours, minutes and seconds
-- left until launch_at, with a button to shop on the website. The owner switches it on and off and sets the date,
-- the time and the words in Admin → App → App status. Everyone can read these (store_settings is public).
-- Safe to run again; nothing is deleted.

alter table public.store_settings
  add column if not exists launch_on boolean not null default false,
  add column if not exists launch_at timestamptz,
  add column if not exists launch_label text not null default 'Launching on 01 Dec',
  add column if not exists launch_message text not null default 'We''re getting the app ready for you.',
  add column if not exists launch_note text not null default 'Need groceries right now? Shop from our website.',
  add column if not exists launch_site text not null default 'https://jholzo.com';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_launch_ok') then
    alter table public.store_settings add constraint store_settings_launch_ok check (
      char_length(launch_label) <= 60 and char_length(launch_message) <= 160 and char_length(launch_note) <= 160
      and launch_site ~ '^https://');
  end if;
end $$;

notify pgrst, 'reload schema';

select launch_on, launch_at, launch_label from public.store_settings where id = 1;
