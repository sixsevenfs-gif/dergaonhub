-- Update 050: Settings switch "App orders are real" (store_settings.app_orders_live).
-- Run once in Supabase → SQL Editor. Safe to run again; nothing is deleted.
--
-- Off (the default): the phone apps (Android, iPhone) are in test mode. Testers and store reviewers can try the whole
-- checkout, but the app does not send the order: nothing reaches Admin, the rider page, Telegram or WhatsApp, and
-- the app says "Test order, not sent to the store". The website is not affected.
-- On: orders from the apps are real, exactly like website orders. Turn it on when the app is public.

alter table public.store_settings add column if not exists app_orders_live boolean not null default false;

notify pgrst, 'reload schema';
