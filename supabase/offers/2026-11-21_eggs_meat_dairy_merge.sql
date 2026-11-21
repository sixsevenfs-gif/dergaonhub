-- Sections: eggs join chicken in "Eggs, Meat & Fish", and Dairy (milk, paneer, condensed milk) joins Tea & Beverages
-- as "Dairy & Beverages", in Dairy's old place on the home page. The empty Dairy section is then removed.
-- The new pictures (public/categories/meat.webp and beverages.webp) come with the push. Safe to run again.

-- 1. Eggs, Meat & Fish
update public.categories set name = 'Eggs, Meat & Fish', short = 'Eggs, Meat & Fish' where id = 'meat';
update public.products set category_id = 'meat'
where category_id = 'dairy' and (name ilike '%egg%' or name ilike '%anda%');

-- 2. Dairy & Beverages (everything left in Dairy moves over, in stock or not)
update public.products set category_id = 'beverages' where category_id = 'dairy';
update public.categories set name = 'Dairy & Beverages', short = 'Dairy & Beverages', sort = 5 where id = 'beverages';
delete from public.categories c where c.id = 'dairy' and not exists (select 1 from public.products p where p.category_id = 'dairy');

-- Check: the sections in order, with how many items each has
select c.sort, c.name, count(p.id) filter (where p.status = 'active') as items
from public.categories c left join public.products p on p.category_id = c.id
group by c.sort, c.name order by c.sort, c.name;
