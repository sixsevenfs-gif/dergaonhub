-- Update 023: "Pay now by UPI" orders must be paid within upi_pay_minutes (15). The order page shows a timer;
-- an order still waiting for payment after that is cancelled ("Not paid in time"), and any Jholzo Money used on it
-- comes back (wallet trigger from update 017). Paid late? The customer types the UTR and the order comes back.
-- Run once in Supabase → SQL Editor (after 022). Safe to run again; nothing is deleted.

alter table public.store_settings
  add column if not exists upi_pay_minutes int not null default 15 check (upi_pay_minutes between 5 and 120);

-- Cancels UPI orders still waiting for payment after upi_pay_minutes. Any logged-in phone may run it:
-- it only touches orders that are really late, so the order page can run it when its timer ends.
create or replace function public.expire_unpaid_orders() returns void
language sql security definer set search_path = public as $$
  update orders o set status = 'cancelled', cancel_reason = 'Not paid in time'
  from store_settings s
  where s.id = 1 and o.payment_method = 'upi_now' and o.payment_status = 'awaiting' and o.status = 'placed'
    and o.created_at < now() - make_interval(mins => s.upi_pay_minutes)
$$;
revoke execute on function public.expire_unpaid_orders() from public, anon;
grant execute on function public.expire_unpaid_orders() to authenticated;

-- The admin's clean-up (runs when admin and rider pages load): late UPI orders, then old days.
create or replace function public.expire_old_orders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform expire_unpaid_orders();
  if is_admin() then
    update orders set status = 'cancelled', cancel_reason = 'Expired'
    where status in ('placed', 'confirmed') and delivery_date < (now() at time zone 'Asia/Kolkata')::date;
  end if;
end
$$;

-- UTR from the customer. Paid after the timer ended: the order comes back for the admin to check,
-- and the Jholzo Money given back at cancelling is used on it again.
create or replace function public.customer_submit_upi_ref(p_order_number text, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_ref text := regexp_replace(coalesce(p_ref, ''), '\s', '', 'g');
begin
  select * into o from orders where upper(order_number) = upper(p_order_number) and placed_by = auth.uid();
  if o.id is null then raise exception 'Order not found on this phone.'; end if;
  if o.payment_method <> 'upi_now' then raise exception 'This order is not paid online.'; end if;
  if o.payment_status = 'paid' then return; end if;
  if v_ref !~ '^[0-9A-Za-z]{6,30}$' then raise exception 'Enter the UPI Ref No. / UTR shown in your UPI app (usually 12 digits).'; end if;
  if o.status = 'cancelled' then
    if o.cancel_reason <> 'Not paid in time' then raise exception 'This order is cancelled. Please call us.'; end if;
    delete from wallet_entries where order_id = o.id and kind = 'refund';
    update orders set status = 'placed', cancel_reason = '', upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
    return;
  end if;
  update orders set upi_ref = v_ref, payment_status = 'verifying' where id = o.id;
end
$$;

notify pgrst, 'reload schema';
