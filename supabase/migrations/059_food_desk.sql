-- Update 059: Jholzo Food Desk (the separate restaurants tool, jholzo-food-desk on Netlify).
-- Restaurants the owner is talking to, their papers, menu items and photos. Every field can stay
-- empty and be filled in later. Only the owner and executives (Admin → Settings → Team) can see or
-- change any of it; customers see nothing yet. When Jholzo Food goes live, the app will read the
-- live restaurants through a separate update that shows only what customers need (not the deal,
-- UPI or papers).
-- Photos: "food" bucket (cover and dish photos; public, so the app can show them later) and the
-- private "food-docs" bucket (FSSAI, agreement, UPI QR, menu card). Run once in Supabase → SQL
-- Editor. Safe to run again; nothing is deleted.

create table if not exists public.food_restaurants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  status text not null default 'talking'
    check (status in ('talking', 'agreed', 'ready', 'live', 'paused', 'dropped')),
  name text not null default '',
  owner_name text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  address text not null default '',
  area text not null default '',
  maps_link text not null default '',
  lat double precision,
  lng double precision,
  cuisines text[] not null default '{}',
  food_type text not null default '' check (food_type in ('', 'veg', 'nonveg', 'both')),
  opens_at text not null default '',            -- "10:00"
  closes_at text not null default '',           -- "21:30"
  closed_on text not null default '',           -- weekly off, e.g. "Tuesday"
  prep_minutes int check (prep_minutes between 0 and 600),          -- food ready in
  delivery_minutes int check (delivery_minutes between 0 and 600),  -- time to show customers
  cost_for_two numeric(10,2) check (cost_for_two >= 0),
  min_order numeric(10,2) check (min_order >= 0),
  packing_fee numeric(10,2) check (packing_fee >= 0),
  offer text not null default '',
  deal_type text not null default '' check (deal_type in ('', 'markup', 'commission', 'monthly')),
  deal_value numeric(10,2) check (deal_value >= 0),                 -- % (markup, commission) or ₹ a month
  pay_when text not null default '' check (pay_when in ('', 'pickup', 'daily', 'weekly')),
  upi_id text not null default '',
  fssai_number text not null default '',
  fssai_expiry date,
  gst_number text not null default '',
  agreement_signed boolean not null default false,
  sticker_given boolean not null default false,
  cover_photo text not null default '',         -- path in the public "food" bucket
  notes text not null default '',
  drop_reason text not null default ''          -- why it is "Not doing"
);
create index if not exists food_restaurants_updated on public.food_restaurants (updated_at desc);

-- Papers and other photos of a restaurant (private bucket "food-docs").
create table if not exists public.food_restaurant_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references public.food_restaurants on delete cascade,
  kind text not null default 'other'
    check (kind in ('fssai', 'gst', 'trade', 'agreement', 'upi', 'menu', 'shop', 'other')),
  path text not null,
  note text not null default ''
);
create index if not exists food_restaurant_files_restaurant on public.food_restaurant_files (restaurant_id);

create table if not exists public.food_menu_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  restaurant_id uuid not null references public.food_restaurants on delete cascade,
  section text not null default '',             -- "Biryani", "Momos", "Starters" ...
  name text not null default '',
  description text not null default '',
  diet text not null default '' check (diet in ('', 'veg', 'nonveg', 'egg')),
  price numeric(10,2) check (price >= 0),       -- the restaurant's menu price
  variants jsonb not null default '[]'::jsonb,  -- [{"label": "Half", "price": 120}, {"label": "Full", "price": 200}]
  photo text not null default '',               -- path in the public "food" bucket
  available boolean not null default true,
  bestseller boolean not null default false,
  sort int not null default 0
);
create index if not exists food_menu_items_restaurant on public.food_menu_items (restaurant_id, sort);

create or replace function public.food_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists food_restaurants_touch on public.food_restaurants;
create trigger food_restaurants_touch before update on public.food_restaurants
  for each row execute function public.food_touch();
drop trigger if exists food_menu_items_touch on public.food_menu_items;
create trigger food_menu_items_touch before update on public.food_menu_items
  for each row execute function public.food_touch();

alter table public.food_restaurants enable row level security;
alter table public.food_restaurant_files enable row level security;
alter table public.food_menu_items enable row level security;

drop policy if exists "food desk restaurants" on public.food_restaurants;
create policy "food desk restaurants" on public.food_restaurants for all using (is_desk()) with check (is_desk());
drop policy if exists "food desk files" on public.food_restaurant_files;
create policy "food desk files" on public.food_restaurant_files for all using (is_desk()) with check (is_desk());
drop policy if exists "food desk menu" on public.food_menu_items;
create policy "food desk menu" on public.food_menu_items for all using (is_desk()) with check (is_desk());

-- Photo buckets. The desk shrinks photos before saving; papers can also be a PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food', 'food', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-docs', 'food-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "food photos upload" on storage.objects;
create policy "food photos upload" on storage.objects for insert
  with check (bucket_id in ('food', 'food-docs') and is_desk());
drop policy if exists "food photos view" on storage.objects;
create policy "food photos view" on storage.objects for select
  using (bucket_id in ('food', 'food-docs') and is_desk());
drop policy if exists "food photos change" on storage.objects;
create policy "food photos change" on storage.objects for update
  using (bucket_id in ('food', 'food-docs') and is_desk())
  with check (bucket_id in ('food', 'food-docs') and is_desk());
drop policy if exists "food photos delete" on storage.objects;
create policy "food photos delete" on storage.objects for delete
  using (bucket_id in ('food', 'food-docs') and is_desk());

-- Check: three tables, two buckets.
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('food_restaurants', 'food_restaurant_files', 'food_menu_items')) as tables,
       (select count(*) from storage.buckets where id in ('food', 'food-docs')) as buckets;
