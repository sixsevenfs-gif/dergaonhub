-- Update 065: app notifications on Android and iPhone (this replaces 028, which was never run).
-- 1. The apps save their notification token (save_device_token), also before login, so offers reach everyone.
--    A token gets the phone number only when this login owns that number (OTP), for order updates.
-- 2. Order updates go out by themselves: grocery (confirmed, on the way, arriving, delivered, cancelled)
--    and food (restaurant accepted, on the way, delivered, cancelled). Each one once (push_sent).
-- 3. The owner sends offers and news from Admin → App → Notifications (push_campaigns).
-- Sending is done by the edge function push-notify (Android: Firebase; iPhone: Apple APNs).
-- Run once in Supabase → SQL Editor, after 064. Safe to run again; nothing is deleted.

create table if not exists public.device_tokens (
  token text primary key,
  phone text not null default '',
  user_id uuid,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
alter table public.device_tokens
  add column if not exists env text not null default 'prod',          -- iPhone: 'dev' for Xcode test builds (APNs sandbox)
  add column if not exists app_version text not null default '',
  add column if not exists created_at timestamptz not null default now();
create index if not exists device_tokens_phone on public.device_tokens (phone) where phone <> '';
alter table public.device_tokens enable row level security;   -- no rules: only the functions below and push-notify

-- Once-only record of order notifications: "orders:<id>:confirmed", "food_orders:<id>:picked".
create table if not exists public.push_sent (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_sent enable row level security;

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 300),
  image text not null default '',
  link text not null default '',
  audience text not null default 'all' check (audience in ('all', 'android', 'ios', 'grocery', 'food', 'phones')),
  phones text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  targeted int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  error text not null default '',
  finished_at timestamptz
);
create index if not exists push_campaigns_created on public.push_campaigns (created_at desc);
alter table public.push_campaigns enable row level security;
drop policy if exists "owner push campaigns" on public.push_campaigns;
create policy "owner push campaigns" on public.push_campaigns for all using (is_admin()) with check (is_admin());

-- Pictures for notifications and app banners (update 066 uses the same bucket). Public, so phones can show them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-media', 'app-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "app media owner upload" on storage.objects;
create policy "app media owner upload" on storage.objects for insert with check (bucket_id = 'app-media' and is_admin());
drop policy if exists "app media owner change" on storage.objects;
create policy "app media owner change" on storage.objects for update using (bucket_id = 'app-media' and is_admin()) with check (bucket_id = 'app-media' and is_admin());
drop policy if exists "app media owner delete" on storage.objects;
create policy "app media owner delete" on storage.objects for delete using (bucket_id = 'app-media' and is_admin());

-- The apps call this when they get a token, and again after login or logout.
drop function if exists public.save_device_token(text, text, text);
create or replace function public.save_device_token(p_token text, p_phone text default '', p_platform text default 'android',
  p_env text default 'prod', p_app_version text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := case when coalesce(p_phone, '') ~ '^[0-9]{10}$' and owns_phone(p_phone) then p_phone else '' end;
begin
  if auth.uid() is null then raise exception 'Please reload the app.'; end if;
  if coalesce(length(p_token), 0) not between 20 and 4096 or p_token ~ '\s' then raise exception 'Bad token.'; end if;
  insert into device_tokens (token, phone, user_id, platform, env, app_version, updated_at)
  values (p_token, v_phone, auth.uid(), case when p_platform = 'ios' then 'ios' else 'android' end,
          case when p_env = 'dev' then 'dev' else 'prod' end, left(coalesce(p_app_version, ''), 20), now())
  on conflict (token) do update set phone = excluded.phone, user_id = excluded.user_id, platform = excluded.platform,
    env = excluded.env, app_version = excluded.app_version, updated_at = now();
end
$$;
revoke all on function public.save_device_token(text, text, text, text, text) from public, anon;
grant execute on function public.save_device_token(text, text, text, text, text) to authenticated;

-- Order updates: the trigger tells push-notify what happened; push-notify reads the order and sends once.
create or replace function public.push_order_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' then
      v_kind := case when new.status = 'confirmed' then 'confirmed' end;   -- cash orders start confirmed (update 037)
    elsif new.status is distinct from old.status then
      v_kind := case new.status when 'confirmed' then 'confirmed' when 'completed' then 'delivered' when 'cancelled' then 'cancelled' end;
    elsif coalesce(new.dispatch, '') <> coalesce(old.dispatch, '') and coalesce(new.dispatch, '') in ('on_the_way', 'arriving') then
      v_kind := new.dispatch;
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_kind := case new.status when 'confirmed' then 'confirmed' when 'picked' then 'picked' when 'delivered' then 'delivered' when 'cancelled' then 'cancelled' end;
  end if;
  if v_kind is null then return new; end if;
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('table', tg_table_name, 'id', new.id, 'kind', v_kind),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists orders_push_notify on public.orders;   -- 028's name, if it was ever run
drop trigger if exists orders_push_insert on public.orders;
create trigger orders_push_insert after insert on public.orders for each row execute function public.push_order_event();
drop trigger if exists orders_push_update on public.orders;
create trigger orders_push_update after update of status, dispatch on public.orders for each row execute function public.push_order_event();
drop trigger if exists food_orders_push on public.food_orders;
create trigger food_orders_push after update of status on public.food_orders for each row execute function public.push_order_event();

-- Who a campaign goes to: every phone with the app, one platform, people who ordered grocery or food, or numbers.
create or replace function public.push_campaign_targets(p_audience text, p_phones text[] default '{}')
returns table (token text, platform text, env text)
language sql stable security definer set search_path = public as $$
  select d.token, d.platform, d.env from device_tokens d
  where case p_audience
    when 'all' then true
    when 'android' then d.platform = 'android'
    when 'ios' then d.platform = 'ios'
    when 'grocery' then d.phone <> '' and exists (select 1 from orders o where o.status <> 'cancelled'
                         and (o.customer_phone = d.phone or o.ordered_by_phone = d.phone))
    when 'food' then d.phone <> '' and exists (select 1 from food_orders f where f.status <> 'cancelled' and f.customer_phone = d.phone)
    when 'phones' then d.phone <> '' and d.phone = any (p_phones)
    else false
  end
$$;
revoke all on function public.push_campaign_targets(text, text[]) from public, anon, authenticated;

-- Owner: how many phones a campaign would reach, and how many phones have the app.
create or replace function public.push_audience_size(p_audience text, p_phones text[] default '{}')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Owner only.'; end if;
  return jsonb_build_object(
    'audience', (select count(*) from push_campaign_targets(p_audience, p_phones)),
    'android', (select count(*) from device_tokens where platform = 'android'),
    'ios', (select count(*) from device_tokens where platform = 'ios'),
    'logged_in', (select count(*) from device_tokens where phone <> ''));
end
$$;
revoke all on function public.push_audience_size(text, text[]) from public, anon;
grant execute on function public.push_audience_size(text, text[]) to authenticated;

-- (Deleting an account, updates 041 / 060, already removes that number's tokens once this table exists.)

notify pgrst, 'reload schema';

-- Check: tables and the phones that already have a token.
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('device_tokens', 'push_sent', 'push_campaigns')) as tables,
       (select count(*) from public.device_tokens) as phones_with_app;
