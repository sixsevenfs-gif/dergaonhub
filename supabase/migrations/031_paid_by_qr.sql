-- Update 031: the rider shows a UPI QR with the exact amount at the door. When a cash-on-delivery
-- customer pays by that QR, the order becomes "UPI on delivery" just before Delivered, so it counts as
-- UPI (not cash the rider must hand over) on the rider page, the daily summary and the reports.
-- Run once in Supabase → SQL Editor. Safe to run again.

create or replace function public.partner_paid_by_qr(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  update orders set payment_method = 'upi'
  where id = p_order_id and status = 'confirmed' and payment_method = 'cash';
end
$$;

revoke execute on function public.partner_paid_by_qr(uuid) from public, anon;
grant execute on function public.partner_paid_by_qr(uuid) to authenticated;

notify pgrst, 'reload schema';
