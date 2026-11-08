-- Update 049: each automatic WhatsApp message goes out once per order, even with two taps at the same moment.
-- Run once in Supabase → SQL Editor, then deploy notify-whatsapp again (it uses this table). Safe to run again.
--
-- notify-whatsapp already skipped a message that was sent before, but two calls at the same moment (a double tap,
-- or the rider and the owner on two phones) could both pass that check and both send. Now each call first claims
-- (order, message) here; only the call that gets the claim sends. A failed send frees the claim for a retry.

create table if not exists public.wa_auto_claims (
  order_id uuid not null references public.orders on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (order_id, kind)
);
alter table public.wa_auto_claims enable row level security;  -- no policies: only notify-whatsapp (service key) uses it

-- Messages already sent count as claimed.
insert into public.wa_auto_claims (order_id, kind)
select distinct order_id, kind from public.order_messages where channel = 'auto' and ok
on conflict do nothing;
