-- Update 040: price survey at the wholesaler (jholzo.com/collect).
-- A "Price collector" (new team role, Admin → Settings → Team) photographs each product, writes its size /
-- name and MRP, and later the price the shop gives. The owner sees everything in Admin → Wholesale prices.
-- Photos stay in the private "survey" bucket. Run once in Supabase → SQL Editor. Safe to run again.

alter table public.riders drop constraint if exists riders_role_check;
alter table public.riders add constraint riders_role_check check (role in ('rider', 'executive', 'collector'));

create or replace function public.is_collector() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from riders where user_id = auth.uid() and active and role = 'collector')
$$;
-- Used by the policies below, so it must stay callable (it only says yes or no about the caller).
grant execute on function public.is_collector() to anon, authenticated;

create table if not exists public.survey_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  shop text not null default '',
  photo text not null default '',          -- path in the private "survey" bucket
  details text not null default '',        -- size / quantity / name, as the collector wrote it
  mrp numeric(10,2) check (mrp >= 0),
  shop_price numeric(10,2) check (shop_price >= 0),
  priced_at timestamptz,
  priced_by uuid references auth.users on delete set null,
  done boolean not null default false      -- the owner has added it to the products
);
create index if not exists survey_items_created on public.survey_items (created_at desc);
alter table public.survey_items enable row level security;

drop policy if exists "survey read" on public.survey_items;
create policy "survey read" on public.survey_items for select using (is_admin() or is_collector());
drop policy if exists "survey add" on public.survey_items;
create policy "survey add" on public.survey_items for insert with check ((is_admin() or is_collector()) and created_by = auth.uid());
drop policy if exists "survey edit" on public.survey_items;
create policy "survey edit" on public.survey_items for update using (is_admin() or is_collector()) with check (is_admin() or is_collector());
drop policy if exists "survey delete" on public.survey_items;
create policy "survey delete" on public.survey_items for delete using (is_admin() or (is_collector() and created_by = auth.uid()));

-- Only the owner marks "added to products"; who priced it and when is filled in here, not by the phone.
create or replace function public.survey_items_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.done is distinct from old.done and not is_admin() then new.done := old.done; end if;
  if new.shop_price is distinct from (case when tg_op = 'UPDATE' then old.shop_price end) then
    new.priced_at := case when new.shop_price is null then null else now() end;
    new.priced_by := case when new.shop_price is null then null else auth.uid() end;
  end if;
  return new;
end
$$;
revoke execute on function public.survey_items_stamp() from public, anon, authenticated;
drop trigger if exists survey_items_stamp on public.survey_items;
create trigger survey_items_stamp before insert or update on public.survey_items for each row execute function public.survey_items_stamp();

insert into storage.buckets (id, name, public) values ('survey', 'survey', false) on conflict (id) do nothing;
drop policy if exists "survey photos upload" on storage.objects;
create policy "survey photos upload" on storage.objects for insert with check (bucket_id = 'survey' and (is_admin() or is_collector()));
drop policy if exists "survey photos view" on storage.objects;
create policy "survey photos view" on storage.objects for select using (bucket_id = 'survey' and (is_admin() or is_collector()));
drop policy if exists "survey photos delete" on storage.objects;
create policy "survey photos delete" on storage.objects for delete using (bucket_id = 'survey' and (is_admin() or is_collector()));

-- Team: same as update 032, with the new role.
create or replace function public.admin_add_rider(p_email text, p_name text, p_phone text, p_role text default 'rider') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if coalesce(p_role, 'rider') not in ('rider', 'executive', 'collector') then raise exception 'Choose Rider, Executive or Price collector.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No login with this email yet. First create it in Supabase → Authentication → Users → Add user.';
  end if;
  if exists (select 1 from admins where user_id = v_id) then raise exception 'This is the owner login.'; end if;
  insert into riders (user_id, name, phone, role) values (v_id, trim(p_name), coalesce(trim(p_phone), ''), coalesce(p_role, 'rider'))
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, role = excluded.role, active = true;
end
$$;
revoke execute on function public.admin_add_rider(text, text, text, text) from public, anon;
grant execute on function public.admin_add_rider(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
