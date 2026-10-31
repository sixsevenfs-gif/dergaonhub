-- Add Stayfree Secure XL (6 pads, ₹45) to Personal Care. Safe to run again (adds it only once).
-- The photo is a file of the website (public/products/stayfree-secure-xl.jpg): it shows once the new build is on Netlify.
insert into public.products (name, size, category_id, keywords, price, photo_url, available, status)
select 'Stayfree Secure XL', '6 pads', 'personal', 'stayfree pad pads sanitary napkin sanitary pad periods xl whisper', 45,
       '/products/stayfree-secure-xl.jpg', true, 'active'
where not exists (select 1 from public.products where lower(name) = 'stayfree secure xl');
