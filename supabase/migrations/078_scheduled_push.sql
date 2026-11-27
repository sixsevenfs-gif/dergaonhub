-- 078: scheduled notifications. In Admin → App → Notifications the owner can pick a date and time instead of
-- "now"; at most 5 can wait at once. The database itself sends them: a timer (pg_cron) runs every minute, finds the
-- ones whose time has come and asks push-notify to send them. Nothing needs the admin page, a laptop or a phone to
-- be on. If push-notify doesn't answer, the timer asks again every 2 minutes (5 times). One that is more than
-- 3 hours late (the timer was stopped) is not sent: a lunch offer at midnight helps nobody; it shows as "Missed".
-- Run once in Supabase → SQL Editor, after 077. Safe to run again; nothing is deleted.
-- Check at the end: the timer "jholzo-push-scheduled" is listed with active = true.

alter table public.push_campaigns
  add column if not exists send_at timestamptz,          -- null: sent at once (as before)
  add column if not exists tries int not null default 0,  -- how many times the timer asked push-notify
  add column if not exists kicked_at timestamptz;         -- the last time it asked

alter table public.push_campaigns drop constraint if exists push_campaigns_status_check;
alter table public.push_campaigns add constraint push_campaigns_status_check
  check (status in ('scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled'));
create index if not exists push_campaigns_due on public.push_campaigns (send_at) where status in ('scheduled', 'queued');

-- The owner's rules for a scheduled one: a time from 2 minutes to 60 days ahead, and at most 5 waiting.
create or replace function public.push_campaign_schedule_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'scheduled' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'scheduled' and new.send_at is not distinct from old.send_at then return new; end if;
  if new.send_at is null then raise exception 'Choose the date and time to send it.'; end if;
  if new.send_at < now() + interval '1 minute' then raise exception 'Choose a time at least 2 minutes from now.'; end if;
  if new.send_at > now() + interval '60 days' then raise exception 'Choose a time within the next 60 days.'; end if;
  if (select count(*) from push_campaigns where status = 'scheduled' and id <> new.id) >= 5 then
    raise exception 'You can schedule at most 5 notifications. Cancel one, or wait until one is sent.';
  end if;
  new.tries := 0;
  new.kicked_at := null;
  return new;
end
$$;
drop trigger if exists push_campaigns_schedule on public.push_campaigns;
create trigger push_campaigns_schedule before insert or update on public.push_campaigns
  for each row execute function public.push_campaign_schedule_check();

-- Every minute: send what is due. Returns how many it asked push-notify to send.
create or replace function public.push_send_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  -- Far too late (the timer was stopped for hours): not sent.
  update push_campaigns set status = 'failed', error = 'Missed: the time passed more than 3 hours ago', finished_at = now()
  where status in ('scheduled', 'queued') and send_at is not null and send_at < now() - interval '3 hours';
  -- Its time has come.
  update push_campaigns set status = 'queued', tries = 0, kicked_at = null
  where status = 'scheduled' and send_at <= now();
  -- push-notify didn't take it after 5 asks: give up and say so.
  update push_campaigns set status = 'failed', error = 'push-notify did not answer. Check that it is deployed.', finished_at = now()
  where status = 'queued' and send_at is not null and tries >= 5 and kicked_at < now() - interval '2 minutes';
  -- Ask push-notify (again after 2 minutes, if it hasn't started on it).
  for c in
    select id from push_campaigns
    where status = 'queued' and send_at is not null and tries < 5
      and (kicked_at is null or kicked_at < now() - interval '2 minutes')
    order by send_at
    for update skip locked
  loop
    update push_campaigns set tries = tries + 1, kicked_at = now() where id = c.id;
    perform net.http_post(
      url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/push-notify',
      body := jsonb_build_object('scheduled', c.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.push_send_due() from public, anon, authenticated;

-- The timer: every minute, on Supabase's database itself.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'jholzo-push-scheduled';
    perform cron.schedule('jholzo-push-scheduled', '* * * * *', 'select public.push_send_due()');
  else
    raise notice 'pg_cron is not available here: turn it on in Supabase → Database → Extensions, then run this again.';
  end if;
end
$$;

-- Is the timer running? 'on', 'off' (stopped) or 'missing' (pg_cron not set up). The admin shows it next to
-- scheduled notifications.
create or replace function public.push_timer_status() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v boolean;
begin
  if not is_admin() and auth.uid() is not null then raise exception 'Owner only.'; end if;
  if to_regclass('cron.job') is null then return 'missing'; end if;
  execute 'select active from cron.job where jobname = $1 limit 1' into v using 'jholzo-push-scheduled';
  return case when v is null then 'missing' when v then 'on' else 'off' end;
end
$$;
revoke all on function public.push_timer_status() from public, anon;
grant execute on function public.push_timer_status() to authenticated;

notify pgrst, 'reload schema';

-- Should say: on
select public.push_timer_status() as scheduled_notifications_timer;
