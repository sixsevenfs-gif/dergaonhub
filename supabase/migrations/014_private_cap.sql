-- Update 014: the orders-per-evening limit becomes private (admin only) and is set to 50.
-- Run once in Supabase → SQL Editor (after 013). Safe to run again.

-- Settings only the admin can read (customers must not see how many orders we take per evening).
create table if not exists public.private_settings (
  id int primary key default 1 check (id = 1),
  daily_order_cap int not null default 50 check (daily_order_cap > 0)
);
insert into public.private_settings (id) values (1) on conflict (id) do nothing;
alter table public.private_settings enable row level security;
drop policy if exists "admin manages private settings" on public.private_settings;
create policy "admin manages private settings" on public.private_settings for all using (is_admin()) with check (is_admin());

-- The limit moves here from store_settings (which everyone can read) and becomes 50.
update public.private_settings set daily_order_cap = 50 where id = 1;
alter table public.store_settings drop column if exists daily_order_cap;

-- The day the next order will be delivered: today before the cut-off, else tomorrow, and the next day
-- with room if that evening already has daily_order_cap orders. Checkout shows the day, never the limit.
create or replace function public.next_delivery_date() returns date
language plpgsql stable security definer set search_path = public as $$
declare
  s store_settings;
  v_cap int := coalesce((select daily_order_cap from private_settings where id = 1), 50);
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_date date;
begin
  select * into s from store_settings where id = 1;
  v_date := v_now::date + case when v_now::time >= s.cutoff_time then 1 else 0 end;
  while (select count(*) from orders where delivery_date = v_date and status <> 'cancelled') >= greatest(v_cap, 1) loop
    v_date := v_date + 1;
  end loop;
  return v_date;
end
$$;
grant execute on function public.next_delivery_date() to anon, authenticated;

notify pgrst, 'reload schema';
