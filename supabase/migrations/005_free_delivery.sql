-- Update 005: free delivery switch (launch offer). Run once in Supabase → SQL Editor.
-- Safe to run again; nothing is deleted. Turn it on/off in Admin → Settings.

alter table public.store_settings add column if not exists free_delivery boolean not null default false;

-- Road distance ≈ straight line × 1.3; every started km costs per_km_fee, never below min_delivery_fee.
-- free_delivery (launch offer, Admin → Settings) makes the fee 0 inside the delivery area.
create or replace function public.delivery_quote(p_lat double precision, p_lng double precision)
returns table (km numeric, fee int, too_far boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from store_settings where id = 1),
  d as (
    select s.*, round((2 * 6371 * asin(sqrt(
      power(sin(radians(p_lat - s.lat) / 2), 2) +
      cos(radians(s.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.lng) / 2), 2)
    )) * 1.3)::numeric, 1) as dist
    from s
  )
  select d.dist,
         case when d.dist > d.max_delivery_km then null
              when d.free_delivery then 0
              else greatest(d.min_delivery_fee, ceil(d.dist)::int * d.per_km_fee) end,
         d.dist > d.max_delivery_km
  from d
$$;

notify pgrst, 'reload schema';
