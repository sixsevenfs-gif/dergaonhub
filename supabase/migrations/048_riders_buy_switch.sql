-- Update 048: Settings switch "Riders buy the items at the shop" (store_settings.riders_buy).
-- Run once in Supabase → SQL Editor, AFTER update 047. Safe to run again; nothing is deleted.
--
-- Off (the default): the owner buys the items and hands them to the rider, as before updates 043–047. Riders don't
-- see shop prices, the shop bill or anything to pay back; they tick items and collect the customer's money as before.
-- On: the rider buys at the shop, sees what to pay, adds the shop bill and gives the owner's money back.
-- Turning it on starts the riders' money from that day, so days with the switch off never count.
-- If updates 043–047 are ever run again, run this one again after them.

alter table public.store_settings add column if not exists riders_buy boolean not null default false;

create or replace function public.riders_buy() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select riders_buy from store_settings where id = 1), false)
$$;
revoke execute on function public.riders_buy() from public, anon, authenticated;

-- Switched on: the money count starts today.
create or replace function public.store_riders_buy_on() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.riders_buy and not coalesce(old.riders_buy, false) then
    insert into private_settings (id) values (1) on conflict (id) do nothing;
    update private_settings set rider_money_from = (now() at time zone 'Asia/Kolkata')::date where id = 1;
  end if;
  return new;
end
$$;
revoke execute on function public.store_riders_buy_on() from public, anon, authenticated;
drop trigger if exists store_riders_buy_on on public.store_settings;
create trigger store_riders_buy_on before update of riders_buy on public.store_settings
  for each row execute function public.store_riders_buy_on();

-- As in update 043; a rider gets no prices while the switch is off (the owner always does).
create or replace function public.shop_price_of(p_item order_items) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_admin() or riders_buy() then jsonb_build_object(
    'buy_price', coalesce((select c.cost from order_item_costs c where c.order_item_id = p_item.id),
                          (select c.cost from product_costs c where c.product_id = p_item.product_id)),
    'mrp', coalesce((select p.compare_price from products p where p.id = p_item.product_id), p_item.price_snapshot))
  else jsonb_build_object('buy_price', null, 'mrp', null) end
$$;
revoke execute on function public.shop_price_of(order_items) from public, anon, authenticated;

-- The rider's money (update 047) only while the switch is on; the owner can always look.
create or replace function public.rider_money_allowed() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() and not riders_buy() then
    raise exception 'The owner buys the items now (Settings → Riders buy the items at the shop is off).';
  end if;
end
$$;
revoke execute on function public.rider_money_allowed() from public, anon, authenticated;

-- Wrappers keep the bodies of updates 043–047: rename the old ones once, then check the switch first.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'rider_day_money_047') then
    alter function public.rider_day_money(date) rename to rider_day_money_047;
    alter function public.partner_return(date, numeric, text, uuid) rename to partner_return_047;
    alter function public.partner_shop_bill(uuid, numeric, text, text) rename to partner_shop_bill_043;
  end if;
end $$;
revoke execute on function public.rider_day_money_047(date), public.partner_return_047(date, numeric, text, uuid),
  public.partner_shop_bill_043(uuid, numeric, text, text) from public, anon, authenticated;

create or replace function public.rider_day_money(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if not is_admin() and not riders_buy() then return '[]'::jsonb; end if;
  return rider_day_money_047(p_day);
end
$$;

create or replace function public.partner_return(p_day date, p_amount numeric, p_method text, p_order_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  perform rider_money_allowed();
  perform partner_return_047(p_day, p_amount, p_method, p_order_id);
end
$$;

create or replace function public.partner_shop_bill(p_order_id uuid, p_paid numeric, p_photo text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform rider_money_allowed();
  perform partner_shop_bill_043(p_order_id, p_paid, p_photo, p_note);
end
$$;

revoke execute on function public.rider_day_money(date), public.partner_return(date, numeric, text, uuid),
  public.partner_shop_bill(uuid, numeric, text, text) from public, anon;
grant execute on function public.rider_day_money(date), public.partner_return(date, numeric, text, uuid),
  public.partner_shop_bill(uuid, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
