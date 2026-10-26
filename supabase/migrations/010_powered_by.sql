-- Update 010: admin switch for "Powered by Malchetra Groups" (logo, footer, PDF bill).
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table public.store_settings add column if not exists show_powered_by boolean not null default true;

notify pgrst, 'reload schema';
