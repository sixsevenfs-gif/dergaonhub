-- 080: no sample (stock) dish photos any more. Since update 063 a dish without its own photo showed a stock photo
-- matched by its name ("Chicken Momo" → the momo photo) in every restaurant. From now on only the photos the
-- owner adds to a dish (Admin → Food → Restaurants → Menu) show; a dish without one shows no photo, in every
-- restaurant, old and new. Nothing is deleted: the owner's own photos stay, and the stock list stays in the
-- database, switched off (store_settings.food_sample_photos_on = true would bring it back).
-- Run once in Supabase → SQL Editor, after 079. Safe to run again.

alter table public.store_settings add column if not exists food_sample_photos_on boolean not null default false;
update public.store_settings set food_sample_photos_on = false where id = 1;

-- The matcher gives nothing while the switch is off, so food_live() sends only the dishes' own photos.
create or replace function public.food_sample_photo(p_name text, p_section text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when coalesce((select food_sample_photos_on from public.store_settings where id = 1), false) then
    coalesce(
      (select s.photo from public.food_sample_photos s
        where position(s.keyword in lower(coalesce(p_name, ''))) > 0
        order by length(s.keyword) desc limit 1),
      (select s.photo from public.food_sample_photos s
        where position(s.keyword in lower(coalesce(p_section, ''))) > 0
        order by length(s.keyword) desc limit 1))
  end
$$;

notify pgrst, 'reload schema';

-- Should say 0: dishes that would still show a stock photo.
select count(*) as dishes_with_stock_photo from public.food_menu_items m
where btrim(coalesce(m.photo, '')) = '' and public.food_sample_photo(m.name, m.section) is not null;
