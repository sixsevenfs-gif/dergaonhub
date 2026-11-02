-- Update 034: buy prices (what you pay at the shop) and the profit of each order. The owner only:
-- customers and the executive can't read these tables, and products (which everyone reads) don't hold them.
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.product_costs (
  product_id uuid primary key references public.products on delete cascade,
  cost numeric(10,2) not null check (cost >= 0),
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
drop policy if exists "owner manages costs" on public.product_costs;
create policy "owner manages costs" on public.product_costs for all using (is_admin()) with check (is_admin());

-- The buy price at the moment an item is ordered, so changing a price later doesn't change old profits.
create table if not exists public.order_item_costs (
  order_item_id uuid primary key references public.order_items on delete cascade,
  cost numeric(10,2) not null
);
alter table public.order_item_costs enable row level security;
drop policy if exists "owner reads item costs" on public.order_item_costs;
create policy "owner reads item costs" on public.order_item_costs for select using (is_admin());

create or replace function public.order_items_cost_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into order_item_costs (order_item_id, cost)
  select new.id, c.cost from product_costs c where c.product_id = new.product_id
  on conflict (order_item_id) do nothing;
  return new;
end
$$;
drop trigger if exists order_items_cost_snapshot on public.order_items;
create trigger order_items_cost_snapshot after insert on public.order_items
  for each row execute function public.order_items_cost_snapshot();
revoke execute on function public.order_items_cost_snapshot() from public, anon, authenticated;

-- Costs of one delivered order for the profit estimate (Settings → Costs per order). Private like the
-- orders-per-evening limit (update 014).
alter table public.private_settings
  add column if not exists rider_pay_near numeric(10,2) not null default 15,
  add column if not exists rider_pay_far numeric(10,2) not null default 20,
  add column if not exists rider_far_km numeric(5,2) not null default 2,
  add column if not exists packing_cost numeric(10,2) not null default 2;
insert into public.private_settings (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';
