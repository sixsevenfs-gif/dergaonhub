-- Update 069: Help & support in the apps, and the apps' own users (downloads and logins).
--
-- 1. Help & support. From the app a customer opens a request about a food order, a grocery order or anything
--    else, picks what went wrong, writes and adds up to 3 photos, then talks with Jholzo inside the request.
--    Everything lands in Admin → Support: the inbox (urgent first), the conversation, notes only the team sees,
--    quick replies, resolve with a refund (Jholzo Money is added by itself), the customer's rating and a report.
--    Telegram gets each new request and each customer reply; the customer gets an app notification for each
--    answer. One open request per order; at most 5 open and 10 new a day per number.
-- 2. App users. Each app install says hello when it opens (no login needed) and links the number after login,
--    so Admin → App → App users counts downloads, logins, Android / iPhone and versions apart from the website.
--    Test builds (Xcode, Android Studio) are left out by themselves; phones can be marked Test or deleted, and
--    counting can start from a chosen moment. Telegram tells you about each new app customer (switch on that
--    page). App logins no longer go into the website's Admin → Logins list.
-- 3. Delete my account also clears food orders, help requests and app logins.
--
-- Run once in Supabase → SQL Editor, after 068. Safe to run again; nothing is deleted.

/* ---------- 1. Help & support ---------- */

create sequence if not exists public.support_ticket_seq start 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('JH-' || nextval('public.support_ticket_seq')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  placed_by uuid default auth.uid(),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10}$'),
  customer_name text not null default '',
  kind text not null check (kind in ('food', 'grocery', 'other')),
  topic text not null,
  food_order_id uuid references public.food_orders on delete set null,
  order_id uuid references public.orders on delete set null,
  order_number text not null default '',          -- kept even if the order is deleted
  restaurant_name text not null default '',
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),  -- pending: waiting for the customer
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  source text not null default '' check (source in ('', 'android', 'ios', 'web')),
  app_version text not null default '',
  last_message_at timestamptz not null default now(),
  last_from text not null default 'customer' check (last_from in ('customer', 'support')),
  last_preview text not null default '',
  customer_unread int not null default 0,         -- answers the customer has not opened yet
  support_unread boolean not null default true,   -- a customer message the team has not opened yet
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution text not null default '',            -- what was done (team only)
  refund_amount numeric(10,2) not null default 0 check (refund_amount >= 0),
  refund_how text not null default '' check (refund_how in ('', 'cash', 'upi', 'wallet')),
  rating int check (rating between 1 and 5),
  rating_comment text not null default '',
  rated_at timestamptz,
  tg_sent boolean not null default false
);
create index if not exists support_tickets_inbox on public.support_tickets (status, last_message_at desc);
create index if not exists support_tickets_phone on public.support_tickets (customer_phone);
create index if not exists support_tickets_food_order on public.support_tickets (food_order_id) where food_order_id is not null;
create index if not exists support_tickets_order on public.support_tickets (order_id) where order_id is not null;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets on delete cascade,
  created_at timestamptz not null default now(),
  sender text not null check (sender in ('customer', 'support', 'system')),
  staff_id uuid,
  staff_name text not null default '',
  body text not null default '' check (char_length(body) <= 2000),
  photos text[] not null default '{}',
  internal boolean not null default false,        -- a note only the team sees
  tg_sent boolean not null default false
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, created_at);

create table if not exists public.support_quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.store_settings
  add column if not exists support_replies_seeded boolean not null default false,
  add column if not exists app_count_from timestamptz,              -- App users: count from this moment (empty: all)
  add column if not exists tg_app_users boolean not null default true;  -- Telegram for each new app customer

-- Who may see a request: the login that opened it, or any login that owns its number (OTP), like orders (060).
create or replace function public.is_my_ticket(p_placed_by uuid, p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (p_placed_by = auth.uid()
    or exists (select 1 from verified_phones v where v.user_id = auth.uid() and v.phone = p_phone))
$$;
grant execute on function public.is_my_ticket(uuid, text) to anon, authenticated;

alter table public.support_tickets enable row level security;
drop policy if exists "support tickets read" on public.support_tickets;
create policy "support tickets read" on public.support_tickets for select
  using (is_desk() or is_my_ticket(placed_by, customer_phone));
alter table public.support_messages enable row level security;
drop policy if exists "support messages read" on public.support_messages;
create policy "support messages read" on public.support_messages for select
  using (is_desk() or (not internal and exists (select 1 from support_tickets t
                                                where t.id = ticket_id and is_my_ticket(t.placed_by, t.customer_phone))));
alter table public.support_quick_replies enable row level security;
drop policy if exists "quick replies read" on public.support_quick_replies;
create policy "quick replies read" on public.support_quick_replies for select using (is_desk());
drop policy if exists "quick replies owner" on public.support_quick_replies;
create policy "quick replies owner" on public.support_quick_replies for all using (is_admin()) with check (is_admin());

-- Photos: private. A customer uploads into a folder named after their login; the team sees all, a customer
-- sees the photos of their own requests (also after logging in again).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create or replace function public.support_can_see_photo(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_desk()
    or (auth.uid() is not null and split_part(p_name, '/', 1) = auth.uid()::text)
    or exists (select 1 from support_messages m join support_tickets t on t.id = m.ticket_id
               where p_name = any(m.photos) and not m.internal and is_my_ticket(t.placed_by, t.customer_phone))
$$;
grant execute on function public.support_can_see_photo(text) to anon, authenticated;
drop policy if exists "support photos upload" on storage.objects;
create policy "support photos upload" on storage.objects for insert
  with check (bucket_id = 'support' and auth.uid() is not null and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "support photos read" on storage.objects;
create policy "support photos read" on storage.objects for select
  using (bucket_id = 'support' and support_can_see_photo(name));

-- What a request can be about.
create or replace function public.support_topic_ok(p_kind text, p_topic text) returns boolean
language sql immutable as $$
  select case p_kind
    when 'food' then p_topic in ('missing_item', 'wrong_item', 'quality', 'spilled', 'late', 'rider', 'payment', 'cancel', 'other')
    when 'grocery' then p_topic in ('missing_item', 'wrong_item', 'damaged', 'late', 'rider', 'payment', 'cancel', 'other')
    when 'other' then p_topic in ('login', 'app', 'wallet', 'account', 'suggestion', 'partner', 'other')
    else false end
$$;

-- Photos must be this login's own uploads, at most 3 per message.
create or replace function public.support_check_photos(p_photos text[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  p text;
begin
  if cardinality(coalesce(p_photos, '{}')) > 3 then raise exception 'Up to 3 photos at a time.'; end if;
  foreach p in array coalesce(p_photos, '{}') loop
    if p !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$' or split_part(p, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects where bucket_id = 'support' and name = p) then
      raise exception 'A photo did not upload. Please add it again.';
    end if;
  end loop;
end
$$;
revoke execute on function public.support_check_photos(text[]) from public, anon, authenticated;

-- A customer message into a request; it opens the request again for the team.
create or replace function public.support_customer_message(p_ticket_id uuid, p_body text, p_photos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into support_messages (ticket_id, sender, body, photos) values (p_ticket_id, 'customer', p_body, coalesce(p_photos, '{}'));
  update support_tickets set status = 'open', resolved_at = null, last_message_at = now(), last_from = 'customer',
    last_preview = left(case when p_body <> '' then p_body else 'Photo' end, 140), support_unread = true, updated_at = now()
  where id = p_ticket_id;
end
$$;
revoke execute on function public.support_customer_message(uuid, text, text[]) from public, anon, authenticated;

-- Customer: a new request. About an order, a second request goes into the open one for that order.
create or replace function public.support_new(p_kind text, p_topic text, p_message text, p_phone text,
  p_food_order_id uuid default null, p_order_id uuid default null, p_photos text[] default '{}',
  p_name text default '', p_source text default '', p_app_version text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_msg text := trim(coalesce(p_message, ''));
  v_photos text[] := coalesce(p_photos, '{}');
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_number text := '';
  v_restaurant text := '';
  t support_tickets;
  fo food_orders;
  o orders;
begin
  if auth.uid() is null then raise exception 'Please open the app again.'; end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' or not owns_phone(p_phone) then
    raise exception 'Please log in with your phone number to get help.';
  end if;
  if not support_topic_ok(p_kind, p_topic) then raise exception 'Please choose what the problem is.'; end if;
  if char_length(v_msg) < 3 and cardinality(v_photos) = 0 then raise exception 'Please tell us a little about the problem.'; end if;
  if char_length(v_msg) > 2000 then raise exception 'Please keep the message under 2000 letters.'; end if;
  perform support_check_photos(v_photos);

  if p_kind = 'food' then
    select * into fo from food_orders where id = p_food_order_id;
    if fo.id is null or not is_my_order(fo.placed_by, '', fo.customer_phone) then raise exception 'Please choose your order.'; end if;
    v_number := fo.order_number;
    v_restaurant := fo.restaurant_name;
    if v_name = '' then v_name := fo.customer_name; end if;
  elsif p_kind = 'grocery' then
    select * into o from orders where id = p_order_id;
    if o.id is null or not is_my_order(o.placed_by, o.ordered_by_phone, o.customer_phone) then raise exception 'Please choose your order.'; end if;
    v_number := o.order_number;
    if v_name = '' then v_name := case when o.ordered_by_phone = p_phone and o.ordered_by_name <> '' then o.ordered_by_name else o.customer_name end; end if;
  end if;
  if v_name = '' then v_name := coalesce((select name from customers where phone = p_phone), ''); end if;

  -- Already an open request for this order: add to it.
  if p_kind <> 'other' then
    select * into t from support_tickets
    where status <> 'resolved' and customer_phone = p_phone
      and ((p_kind = 'food' and food_order_id = fo.id) or (p_kind = 'grocery' and order_id = o.id))
    order by created_at desc limit 1;
    if t.id is not null then
      perform support_customer_message(t.id, v_msg, v_photos);
      return jsonb_build_object('id', t.id, 'ticket_number', t.ticket_number, 'existing', true);
    end if;
  end if;

  -- No flooding.
  if (select count(*) from support_tickets where customer_phone = p_phone and status <> 'resolved') >= 5 then
    raise exception 'You already have 5 open requests. Please reply in one of them.';
  end if;
  if (select count(*) from support_tickets where customer_phone = p_phone and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many requests today. Please reply in an open one, or call us.';
  end if;

  insert into support_tickets (customer_phone, customer_name, kind, topic, food_order_id, order_id, order_number,
    restaurant_name, priority, source, app_version, last_preview)
  values (p_phone, v_name, p_kind, p_topic, fo.id, o.id, v_number, v_restaurant,
    case when p_topic in ('missing_item', 'wrong_item', 'spilled', 'damaged', 'payment', 'rider') then 'high' else 'normal' end,
    case when p_source in ('android', 'ios', 'web') then p_source else '' end, left(coalesce(p_app_version, ''), 20),
    left(case when v_msg <> '' then v_msg else 'Photo' end, 140))
  returning * into t;
  insert into support_messages (ticket_id, sender, body, photos) values (t.id, 'customer', v_msg, v_photos);
  return jsonb_build_object('id', t.id, 'ticket_number', t.ticket_number, 'existing', false);
end
$$;
revoke execute on function public.support_new(text, text, text, text, uuid, uuid, text[], text, text, text) from public, anon;
grant execute on function public.support_new(text, text, text, text, uuid, uuid, text[], text, text, text) to authenticated;

-- Customer: a reply in a request (also after it was resolved, for 7 days).
create or replace function public.support_send(p_ticket_id uuid, p_message text, p_photos text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
  v_msg text := trim(coalesce(p_message, ''));
begin
  select * into t from support_tickets where id = p_ticket_id;
  if t.id is null or not is_my_ticket(t.placed_by, t.customer_phone) then raise exception 'Request not found.'; end if;
  if t.status = 'resolved' and t.resolved_at < now() - interval '7 days' then
    raise exception 'This request is closed. Please start a new one.';
  end if;
  if v_msg = '' and cardinality(coalesce(p_photos, '{}')) = 0 then raise exception 'Write a message or add a photo.'; end if;
  if char_length(v_msg) > 2000 then raise exception 'Please keep the message under 2000 letters.'; end if;
  perform support_check_photos(p_photos);
  if (select count(*) from support_messages where ticket_id = t.id and sender = 'customer'
      and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages. Please wait a little for our reply.';
  end if;
  perform support_customer_message(t.id, v_msg, p_photos);
end
$$;
revoke execute on function public.support_send(uuid, text, text[]) from public, anon;
grant execute on function public.support_send(uuid, text, text[]) to authenticated;

-- Customer: my requests, open ones first.
create or replace function public.support_my_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_open' order by x.sort_open desc, x.last_message_at desc), '[]')
  from (select id, ticket_number, kind, topic, order_number, restaurant_name, status, created_at, last_message_at,
               last_from, last_preview, customer_unread, rating, status <> 'resolved' as sort_open
        from support_tickets where is_my_ticket(placed_by, customer_phone)
        order by last_message_at desc limit 50) x
$$;
revoke execute on function public.support_my_list() from public, anon;
grant execute on function public.support_my_list() to authenticated;

-- Customer: one request with its conversation (without the team's notes); opening it marks the answers read.
create or replace function public.support_get(p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket_id;
  if t.id is null or not is_my_ticket(t.placed_by, t.customer_phone) then raise exception 'Request not found.'; end if;
  if t.customer_unread > 0 then update support_tickets set customer_unread = 0 where id = t.id; end if;
  return jsonb_build_object(
    'id', t.id, 'ticket_number', t.ticket_number, 'kind', t.kind, 'topic', t.topic, 'order_number', t.order_number,
    'food_order_id', t.food_order_id, 'order_id', t.order_id, 'restaurant_name', t.restaurant_name,
    'status', t.status, 'created_at', t.created_at, 'resolved_at', t.resolved_at,
    'rating', t.rating, 'rating_comment', t.rating_comment,
    'can_reply', not (t.status = 'resolved' and t.resolved_at < now() - interval '7 days'),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.created_at, 'from', m.sender,
                    'body', m.body, 'photos', to_jsonb(m.photos)) order by m.created_at), '[]')
                 from support_messages m where m.ticket_id = t.id and not m.internal));
end
$$;
revoke execute on function public.support_get(uuid) from public, anon;
grant execute on function public.support_get(uuid) to authenticated;

-- Customer: stars for a resolved request (can be changed).
create or replace function public.support_rate(p_ticket_id uuid, p_rating int, p_comment text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket_id;
  if t.id is null or not is_my_ticket(t.placed_by, t.customer_phone) then raise exception 'Request not found.'; end if;
  if t.status <> 'resolved' then raise exception 'You can rate once the request is resolved.'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose 1 to 5 stars.'; end if;
  update support_tickets set rating = p_rating, rating_comment = left(trim(coalesce(p_comment, '')), 500), rated_at = now()
  where id = t.id;
end
$$;
revoke execute on function public.support_rate(uuid, int, text) from public, anon;
grant execute on function public.support_rate(uuid, int, text) to authenticated;

-- The team's name on a reply (customers see "Jholzo Support").
create or replace function public.support_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select name from riders where user_id = auth.uid()), ''), case when is_admin() then 'Owner' else 'Team' end)
$$;
revoke execute on function public.support_staff_name() from public, anon, authenticated;

-- Team: one request with everything: the conversation with notes, the customer, their recent orders and app.
create or replace function public.desk_support_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
  c customers;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  select * into t from support_tickets where id = p_id;
  if t.id is null then raise exception 'Request not found.'; end if;
  if t.support_unread then update support_tickets set support_unread = false where id = t.id; end if;
  select * into c from customers where phone = t.customer_phone;
  return to_jsonb(t) || jsonb_build_object(
    'support_unread', false,
    'messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]') from support_messages m where m.ticket_id = t.id),
    'customer', jsonb_build_object(
      'customer_id', c.id,
      'blocked', coalesce(c.blocked, false),
      'grocery_orders', (select count(*) from orders where customer_phone = t.customer_phone or ordered_by_phone = t.customer_phone),
      'food_orders', (select count(*) from food_orders where customer_phone = t.customer_phone),
      'requests', (select count(*) from support_tickets where customer_phone = t.customer_phone),
      'refunds', (select coalesce(sum(refund_amount), 0) from support_tickets where customer_phone = t.customer_phone),
      'app', (select jsonb_build_object('platform', platform, 'app_version', app_version, 'device_model', device_model,
                'os_version', os_version, 'last_seen_at', last_seen_at)
              from app_installs where phone = t.customer_phone order by last_seen_at desc limit 1)),
    'recent', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]') from (
        (select 'grocery' as kind, id, order_number, status, total::numeric as total, created_at from orders
         where customer_phone = t.customer_phone or ordered_by_phone = t.customer_phone order by created_at desc limit 5)
        union all
        (select 'food', id, order_number, status, total::numeric, created_at from food_orders
         where customer_phone = t.customer_phone order by created_at desc limit 5)) r));
end
$$;
revoke execute on function public.desk_support_get(uuid) from public, anon;
grant execute on function public.desk_support_get(uuid) to authenticated;

-- Team: a reply to the customer, or a note only the team sees.
create or replace function public.desk_support_send(p_id uuid, p_message text, p_internal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
  v_msg text := trim(coalesce(p_message, ''));
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  select * into t from support_tickets where id = p_id for update;
  if t.id is null then raise exception 'Request not found.'; end if;
  if v_msg = '' then raise exception 'Write a reply first.'; end if;
  if char_length(v_msg) > 2000 then raise exception 'Please keep it under 2000 letters.'; end if;
  insert into support_messages (ticket_id, sender, staff_id, staff_name, body, internal)
  values (t.id, 'support', auth.uid(), support_staff_name(), v_msg, coalesce(p_internal, false));
  if not coalesce(p_internal, false) then
    update support_tickets set status = case when status = 'resolved' then status else 'pending' end,
      first_response_at = coalesce(first_response_at, now()), last_message_at = now(), last_from = 'support',
      last_preview = left(v_msg, 140), customer_unread = customer_unread + 1, support_unread = false, updated_at = now()
    where id = t.id;
  end if;
end
$$;
revoke execute on function public.desk_support_send(uuid, text, boolean) from public, anon;
grant execute on function public.desk_support_send(uuid, text, boolean) to authenticated;

-- Team: open again, waiting for the customer, or urgent / normal. (Resolve has its own button.)
create or replace function public.desk_support_set(p_id uuid, p_status text default null, p_priority text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  if p_status is not null and p_status not in ('open', 'pending') then raise exception 'Use Resolve to close a request.'; end if;
  if p_priority is not null and p_priority not in ('normal', 'high') then raise exception 'Unknown priority.'; end if;
  update support_tickets set status = coalesce(p_status, status), priority = coalesce(p_priority, priority),
    resolved_at = case when p_status is null then resolved_at end, updated_at = now()
  where id = p_id;
  if not found then raise exception 'Request not found.'; end if;
end
$$;
revoke execute on function public.desk_support_set(uuid, text, text) from public, anon;
grant execute on function public.desk_support_set(uuid, text, text) to authenticated;

-- Team: resolve, with what was done, an optional last reply and a refund. A Jholzo Money refund (owner only) is
-- added to the customer's wallet right away, once per request, usable for 90 days.
create or replace function public.desk_support_resolve(p_id uuid, p_resolution text default '', p_refund_amount numeric default 0,
  p_refund_how text default '', p_message text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
  v_customer uuid;
  v_amount numeric := round(coalesce(p_refund_amount, 0), 2);
  v_how text := case when coalesce(p_refund_amount, 0) > 0 then coalesce(p_refund_how, '') else '' end;
  v_rupees text;
begin
  if not is_desk() then raise exception 'Not allowed.'; end if;
  select * into t from support_tickets where id = p_id for update;
  if t.id is null then raise exception 'Request not found.'; end if;
  if v_amount < 0 or v_amount > 10000 then raise exception 'Enter a refund between ₹0 and ₹10,000.'; end if;
  if v_amount > 0 and v_how not in ('cash', 'upi', 'wallet') then raise exception 'Choose how the refund is given.'; end if;
  v_rupees := '₹' || case when v_amount = trunc(v_amount) then trunc(v_amount)::text else to_char(v_amount, 'FM999999990.00') end;
  if v_how = 'wallet' then
    if not is_admin() then raise exception 'Only the owner can add Jholzo Money.'; end if;
    if t.refund_how = 'wallet' and t.refund_amount > 0 then
      raise exception 'Jholzo Money was already added for this request.';
    end if;
    select id into v_customer from customers where phone = t.customer_phone;
    if v_customer is null then raise exception 'This number has no customer account yet. Give the refund by cash or UPI.'; end if;
    insert into wallet_gifts (customer_id, amount, min_order, expires_at, note)
    values (v_customer, v_amount, 0, now() + interval '90 days', 'Support ' || t.ticket_number);
  end if;
  if trim(coalesce(p_message, '')) <> '' then
    insert into support_messages (ticket_id, sender, staff_id, staff_name, body)
    values (t.id, 'support', auth.uid(), support_staff_name(), left(trim(p_message), 2000));
  end if;
  insert into support_messages (ticket_id, sender, body)
  values (t.id, 'system', 'Marked as resolved.' || case v_how
    when 'wallet' then ' Refund: ' || v_rupees || ' added to your Jholzo Money.'
    when 'upi' then ' Refund: ' || v_rupees || ' by UPI.'
    when 'cash' then ' Refund: ' || v_rupees || ' in cash.'
    else '' end);
  update support_tickets set status = 'resolved', resolved_at = now(), resolution = left(trim(coalesce(p_resolution, '')), 1000),
    refund_amount = case when v_amount > 0 then v_amount else refund_amount end,
    refund_how = case when v_amount > 0 then v_how else refund_how end,
    first_response_at = coalesce(first_response_at, now()), last_message_at = now(), last_from = 'support',
    last_preview = 'Marked as resolved', customer_unread = customer_unread + 1, support_unread = false, updated_at = now()
  where id = t.id;
end
$$;
revoke execute on function public.desk_support_resolve(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.desk_support_resolve(uuid, text, numeric, text, text) to authenticated;

-- Team: the numbers on the Support button.
create or replace function public.support_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_desk() then (select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'urgent', count(*) filter (where status = 'open' and priority = 'high'),
      'unread', count(*) filter (where support_unread and status <> 'resolved'),
      'pending', count(*) filter (where status = 'pending'))
    from support_tickets) else '{}'::jsonb end
$$;
revoke execute on function public.support_counts() from public, anon;
grant execute on function public.support_counts() to authenticated;

-- Owner: the support report for a range of days (India time).
create or replace function public.admin_support_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  return (with t as (select * from support_tickets where created_at >= v_from and created_at < v_to)
  select jsonb_build_object(
    'new', (select count(*) from t),
    'resolved', (select count(*) from t where status = 'resolved'),
    'open_now', (select count(*) from support_tickets where status = 'open'),
    'pending_now', (select count(*) from support_tickets where status = 'pending'),
    'first_reply_min', (select round(avg(extract(epoch from first_response_at - created_at) / 60)) from t where first_response_at is not null),
    'resolve_hours', (select round((avg(extract(epoch from resolved_at - created_at)) / 3600)::numeric, 1) from t where resolved_at is not null),
    'within_24h', (select count(*) from t where resolved_at is not null and resolved_at - created_at <= interval '24 hours'),
    'rating_avg', (select round(avg(rating)::numeric, 1) from t where rating is not null),
    'ratings', (select count(*) from t where rating is not null),
    'refunds', (select coalesce(sum(refund_amount), 0) from t),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from t group by 1) x),
    'by_topic', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'topic', topic, 'n', n) order by n desc), '[]')
                 from (select kind, topic, count(*) n from t group by 1, 2) x),
    'by_restaurant', (select coalesce(jsonb_agg(jsonb_build_object('name', restaurant_name, 'n', n, 'refunds', refunds) order by n desc), '[]')
                      from (select restaurant_name, count(*) n, sum(refund_amount) refunds from t
                            where kind = 'food' and restaurant_name <> '' group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]')
               from (select (created_at at time zone 'Asia/Kolkata')::date d, count(*) n from t group by 1) x)
  ));
end
$$;
revoke execute on function public.admin_support_report(date, date) from public, anon;
grant execute on function public.admin_support_report(date, date) to authenticated;

-- Ready-made answers, once (the owner can change or delete them in Admin → Support → Quick replies).
do $$
begin
  if exists (select 1 from store_settings where id = 1 and not support_replies_seeded) then
    insert into support_quick_replies (title, body, sort) values
      ('Checking now', 'Sorry about this, {name}. We are checking it right now and will reply here in a few minutes.', 1),
      ('Missing item on its way', 'Sorry, {name}! The missing item from {order} is on its way to you now.', 2),
      ('Need a photo', 'Could you please send a photo? It helps us fix this quickly.', 3),
      ('Refund as Jholzo Money', 'We have added your refund to Jholzo Money. You will find it in the app under Account → Jholzo Money, for your next grocery order.', 4),
      ('Refund by UPI', 'We will send your refund for {order} by UPI today. Sorry for the trouble!', 5),
      ('Rider on the way', 'Your order {order} is on the way. You can call the rider from the order page in the app.', 6),
      ('All done', 'Glad we could help, {name}! If anything else comes up, just reply here.', 7);
    update store_settings set support_replies_seeded = true where id = 1;
  end if;
end
$$;

-- Telegram for each new request and each customer reply; an app notification for each answer to the customer.
create or replace function public.support_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'support_tickets' then
    perform net.http_post(
      url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/telegram-notify',
      body := jsonb_build_object('kind', 'support_new', 'ticket_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  elsif new.sender = 'customer' then
    -- The first message comes with the new request.
    if (select count(*) from support_messages where ticket_id = new.ticket_id) > 1 then
      perform net.http_post(
        url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/telegram-notify',
        body := jsonb_build_object('kind', 'support_reply', 'message_id', new.id),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    end if;
  elsif not new.internal then
    -- "Resolved" right after a reply: the reply's notification is enough.
    if new.sender = 'system' and exists (select 1 from support_messages where ticket_id = new.ticket_id and sender = 'support'
                                         and not internal and id <> new.id and created_at > now() - interval '10 seconds') then
      return new;
    end if;
    perform net.http_post(
      url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/push-notify',
      body := jsonb_build_object('support_message', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists support_tickets_notify on public.support_tickets;
create trigger support_tickets_notify after insert on public.support_tickets for each row execute function public.support_notify();
drop trigger if exists support_messages_notify on public.support_messages;
create trigger support_messages_notify after insert on public.support_messages for each row execute function public.support_notify();

/* ---------- 2. App users ---------- */

create table if not exists public.app_installs (
  id uuid primary key,                            -- made by the app on its first open, kept until the app is deleted
  platform text not null check (platform in ('android', 'ios')),
  env text not null default 'prod' check (env in ('prod', 'dev')),  -- dev: test builds from Xcode / Android Studio
  app_version text not null default '',
  build text not null default '',
  os_version text not null default '',
  device_model text not null default '',
  user_id uuid,
  phone text not null default '',                 -- the last number that logged in on this phone
  name text not null default '',
  logged_in boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  opens int not null default 1,                   -- app opens, 30 minutes apart
  first_login_at timestamptz,
  last_login_at timestamptz,
  logins int not null default 0,
  is_test boolean not null default false          -- marked by the owner: not counted
);
create index if not exists app_installs_first on public.app_installs (first_seen_at desc);
create index if not exists app_installs_phone on public.app_installs (phone) where phone <> '';
alter table public.app_installs enable row level security;
drop policy if exists "owner app installs" on public.app_installs;
create policy "owner app installs" on public.app_installs for select using (is_admin());

create table if not exists public.app_logins (
  id bigserial primary key,
  install_id uuid not null references public.app_installs on delete cascade,
  phone text not null,
  platform text not null,
  at timestamptz not null default now(),
  tg_sent boolean not null default false
);
create index if not exists app_logins_at on public.app_logins (at desc);
create index if not exists app_logins_phone on public.app_logins (phone);
alter table public.app_logins enable row level security;
drop policy if exists "owner app logins" on public.app_logins;
create policy "owner app logins" on public.app_logins for select using (is_admin());

-- The apps call this when they open (and come back after 30 minutes), after login and after logout.
-- A number is linked only when this login owns it (OTP); a new number on the phone counts as a login.
create or replace function public.app_hello(p_install_id uuid, p_platform text, p_env text default 'prod',
  p_version text default '', p_build text default '', p_os text default '', p_model text default '',
  p_phone text default '', p_name text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  i app_installs;
  v_platform text := case when p_platform = 'ios' then 'ios' else 'android' end;
  v_phone text := case when coalesce(p_phone, '') ~ '^[0-9]{10}$' and owns_phone(p_phone) then p_phone else '' end;
  v_name text := left(trim(coalesce(p_name, '')), 60);
begin
  if p_install_id is null then return; end if;
  insert into app_installs as a (id, platform, env, app_version, build, os_version, device_model, user_id)
  values (p_install_id, v_platform, case when p_env = 'dev' then 'dev' else 'prod' end, left(coalesce(p_version, ''), 20),
          left(coalesce(p_build, ''), 20), left(coalesce(p_os, ''), 30), left(coalesce(p_model, ''), 60), auth.uid())
  on conflict (id) do update set platform = excluded.platform, env = excluded.env, app_version = excluded.app_version,
    build = excluded.build, os_version = excluded.os_version, device_model = excluded.device_model,
    user_id = coalesce(excluded.user_id, a.user_id),
    opens = a.opens + case when a.last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
    last_seen_at = now()
  returning * into i;
  if v_phone <> '' and (not i.logged_in or i.phone <> v_phone) then
    update app_installs set name = case when v_name <> '' then v_name when phone = v_phone then name else '' end,
      phone = v_phone, logged_in = true, first_login_at = coalesce(first_login_at, now()), last_login_at = now(), logins = logins + 1
    where id = i.id;
    insert into app_logins (install_id, phone, platform) values (i.id, v_phone, v_platform);
  elsif v_phone <> '' and v_name <> '' and i.name <> v_name then
    update app_installs set name = v_name where id = i.id;
  elsif coalesce(p_phone, '') = '' and i.logged_in then
    update app_installs set logged_in = false where id = i.id;   -- logged out
  end if;
end
$$;
grant execute on function public.app_hello(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Telegram for a number's first login in the app (not test builds), when the owner wants these messages.
create or replace function public.app_login_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from app_logins where phone = new.phone and id <> new.id) then return new; end if;
  if not coalesce((select tg_app_users from store_settings where id = 1), false) then return new; end if;
  if (select env from app_installs where id = new.install_id) <> 'prod' then return new; end if;
  perform net.http_post(
    url := 'https://nyzwehemganasxwcxeai.supabase.co/functions/v1/telegram-notify',
    body := jsonb_build_object('kind', 'app_user', 'login_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists app_logins_notify on public.app_logins;
create trigger app_logins_notify after insert on public.app_logins for each row execute function public.app_login_notify();

-- Owner: the App users page. Counted: real installs (not test builds, not marked Test) since the count start.
create or replace function public.admin_app_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (select app_count_from from store_settings where id = 1);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  return (with i as (select * from app_installs where env = 'prod' and not is_test and (v_from is null or first_seen_at >= v_from)),
               l as (select g.* from app_logins g join app_installs a on a.id = g.install_id
                     where a.env = 'prod' and not a.is_test and (v_from is null or g.at >= v_from))
  select jsonb_build_object(
    'count_from', v_from,
    'tg_app_users', (select tg_app_users from store_settings where id = 1),
    'installs', (select count(*) from i),
    'android', (select count(*) from i where platform = 'android'),
    'ios', (select count(*) from i where platform = 'ios'),
    'logged_in', (select count(*) from i where logged_in),
    'customers', (select count(distinct phone) from l),
    'today', (select count(*) from i where (first_seen_at at time zone 'Asia/Kolkata')::date = v_today),
    'new_7d', (select count(*) from i where first_seen_at > now() - interval '7 days'),
    'active_today', (select count(*) from i where (last_seen_at at time zone 'Asia/Kolkata')::date = v_today),
    'active_7d', (select count(*) from i where last_seen_at > now() - interval '7 days'),
    'logins_today', (select count(*) from l where (at at time zone 'Asia/Kolkata')::date = v_today),
    'test', (select count(*) from app_installs where is_test),
    'dev', (select count(*) from app_installs where env = 'dev'),
    'before', (select count(*) from app_installs where v_from is not null and first_seen_at < v_from),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'installs', n, 'customers', c) order by d), '[]') from (
        select s.d::date as d,
          (select count(*) from i where (i.first_seen_at at time zone 'Asia/Kolkata')::date = s.d::date) as n,
          (select count(distinct l.phone) from l where (l.at at time zone 'Asia/Kolkata')::date = s.d::date
             and not exists (select 1 from app_logins e where e.phone = l.phone and e.at < l.at)) as c
        from generate_series(v_today - 29, v_today, interval '1 day') as s(d)) x),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'version', v, 'n', n) order by platform, n desc), '[]')
                 from (select platform, coalesce(nullif(app_version, ''), '?') as v, count(*) as n from i
                       where last_seen_at > now() - interval '30 days' group by 1, 2) x)
  ));
end
$$;
revoke execute on function public.admin_app_users() from public, anon;
grant execute on function public.admin_app_users() to authenticated;

-- Owner: mark phones as Test (not counted), or back.
create or replace function public.admin_app_installs_mark(p_ids uuid[], p_test boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  update app_installs set is_test = coalesce(p_test, false) where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.admin_app_installs_mark(uuid[], boolean) from public, anon;
grant execute on function public.admin_app_installs_mark(uuid[], boolean) to authenticated;

-- Owner: delete phones (with their logins): chosen ones, all marked Test, all test builds, or all from before
-- counting started. Deleting does not stop the app; an app that opens again comes back as a new install.
create or replace function public.admin_app_installs_delete(p_ids uuid[] default '{}', p_what text default '') returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  v_from timestamptz := (select app_count_from from store_settings where id = 1);
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  if p_what = 'test' then delete from app_installs where is_test;
  elsif p_what = 'dev' then delete from app_installs where env = 'dev';
  elsif p_what = 'before' then
    if v_from is null then raise exception 'Choose when counting starts first.'; end if;
    delete from app_installs where first_seen_at < v_from;
  elsif p_what = '' then delete from app_installs where id = any(coalesce(p_ids, '{}'));
  else raise exception 'Unknown choice.';
  end if;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.admin_app_installs_delete(uuid[], text) from public, anon;
grant execute on function public.admin_app_installs_delete(uuid[], text) to authenticated;

-- App overview (066) now counts phones from the installs (all phones, also without notifications on).
create or replace function public.admin_app_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (select app_count_from from store_settings where id = 1);
begin
  if not is_admin() then raise exception 'Not allowed.'; end if;
  return jsonb_build_object(
    'devices', (select jsonb_build_object(
        'total', count(*), 'android', count(*) filter (where platform = 'android'), 'ios', count(*) filter (where platform = 'ios'),
        'logged_in', count(*) filter (where logged_in), 'new_7d', count(*) filter (where first_seen_at > now() - interval '7 days'))
      from app_installs where env = 'prod' and not is_test and (v_from is null or first_seen_at >= v_from)),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'version', version, 'phones', phones)
        order by platform, phones desc), '[]')
      from (select platform, coalesce(nullif(app_version, ''), '?') as version, count(*) as phones
            from app_installs where env = 'prod' and not is_test and last_seen_at > now() - interval '30 days' group by 1, 2) v),
    'campaigns', (select jsonb_build_object('count_30d', count(*), 'sent_30d', coalesce(sum(sent), 0), 'failed_30d', coalesce(sum(failed), 0))
      from push_campaigns where created_at > now() - interval '30 days'),
    'last_campaign', (select to_jsonb(c) from (select title, body, created_at, sent, failed, audience, status
      from push_campaigns order by created_at desc limit 1) c),
    'banners', (select jsonb_build_object('total', count(*),
        'live', count(*) filter (where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
        'grocery', count(*) filter (where place in ('grocery', 'both') and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
        'food', count(*) filter (where place in ('food', 'both') and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())))
      from app_banners)
  );
end
$$;
revoke all on function public.admin_app_overview() from public, anon;
grant execute on function public.admin_app_overview() to authenticated;

-- Website logins only: the apps now say where they log in from, and count their logins in app_installs.
-- (Old app builds without p_source still count here, as before.)
drop function if exists public.record_login(text, text);
create or replace function public.record_login(p_phone text, p_name text default '', p_source text default 'web')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(coalesce(trim(p_name), ''), 60);
  v_ok boolean := exists (select 1 from verified_phones where user_id = auth.uid() and phone = p_phone);
begin
  if coalesce(p_source, 'web') <> 'web' then return; end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then return; end if;
  insert into signups (phone, name, verified) values (p_phone, v_name, v_ok)
  on conflict (phone) do update set
    name = case when excluded.name <> '' then excluded.name else signups.name end,
    verified = signups.verified or excluded.verified,
    last_at = now(),
    logins = signups.logins + 1;
end $$;
revoke execute on function public.record_login(text, text, text) from anon, public;
grant execute on function public.record_login(text, text, text) to authenticated;

/* ---------- 3. Delete my account: also food orders, help requests and app logins ---------- */

-- A deleted customer's food orders keep a made-up number, like grocery orders.
alter table public.food_orders drop constraint if exists food_orders_customer_phone_check;
alter table public.food_orders add constraint food_orders_customer_phone_check check (customer_phone ~ '^[0-9]{10}$');

create or replace function public.delete_my_account(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c customers;
  v_phone text;
  v_left numeric;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if not owns_phone(p_phone) then raise exception 'Log in with this number on this phone first.'; end if;
  if exists (select 1 from orders where (customer_phone = p_phone or ordered_by_phone = p_phone)
             and status in ('placed', 'confirmed')) then
    raise exception 'You have an order that is not delivered yet. You can delete your account once it is delivered or cancelled.';
  end if;
  if exists (select 1 from food_orders where customer_phone = p_phone and status in ('placed', 'confirmed', 'picked')) then
    raise exception 'You have a food order that is not delivered yet. You can delete your account once it is delivered or cancelled.';
  end if;

  select * into c from customers where phone = p_phone;
  if c.id is not null then
    v_phone := p_phone;
    if not c.blocked and c.cancel_count + c.no_show_count = 0 then
      -- No strikes: free the number. The row stays for its past orders, under a made-up number
      -- (real mobile numbers never start with 0).
      loop
        v_phone := '0' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
        exit when not exists (select 1 from customers where phone = v_phone);
      end loop;
    end if;
    update customers set phone = v_phone, name = 'Deleted customer', referral_code = null where id = c.id;
    v_left := wallet_balance(c.id);
    if v_left <> 0 then
      insert into wallet_entries (customer_id, amount, kind, note) values (c.id, -v_left, 'admin', 'Account deleted');
    end if;
  end if;

  update order_items set note = '' where order_id in (select id from orders where customer_phone = p_phone);
  update orders set customer_name = 'Deleted customer', customer_phone = '0000000000', address = '', area = '',
                    lat = null, lng = null, note = '', upi_ref = '', delivery_photo = '', cancel_reason = ''
    where customer_phone = p_phone;
  -- Orders they placed for someone else keep that person's details, without theirs.
  update orders set ordered_by_name = 'Deleted customer', ordered_by_phone = '0000000000' where ordered_by_phone = p_phone;
  update complaints set customer_name = 'Deleted customer', customer_phone = '', message = '' where customer_phone = p_phone;
  update food_orders set customer_name = 'Deleted customer', customer_phone = '0000000000', address = '', area = '',
                         lat = null, lng = null, note = ''
    where customer_phone = p_phone;
  -- Help requests stay for the numbers in the report, without what they wrote.
  update support_messages set body = '', photos = '{}'
    where sender = 'customer' and ticket_id in (select id from support_tickets where customer_phone = p_phone);
  update support_tickets set customer_name = 'Deleted customer', customer_phone = '0000000000', last_preview = '', rating_comment = ''
    where customer_phone = p_phone;
  delete from app_logins where phone = p_phone;
  update app_installs set phone = '', name = '', logged_in = false where phone = p_phone;

  delete from deleted_orders where customer_phone = p_phone or ordered_by_phone = p_phone;
  delete from verified_phones where phone = p_phone;
  delete from otp_requests where phone = p_phone;
  delete from signups where phone = p_phone;
  delete from waitlist where phone = p_phone;
  if to_regclass('public.carts') is not null then execute 'delete from public.carts where phone = $1' using p_phone; end if;
  if to_regclass('public.device_tokens') is not null then execute 'delete from public.device_tokens where phone = $1' using p_phone; end if;
end
$$;

notify pgrst, 'reload schema';

-- Check: help requests, quick replies, app installs and the Telegram switch for new app customers.
select (select count(*) from public.support_tickets) as help_requests,
       (select count(*) from public.support_quick_replies) as quick_replies,
       (select count(*) from public.app_installs) as app_installs,
       (select tg_app_users from public.store_settings where id = 1) as telegram_new_app_users;
