-- Update 009: the rider always collects exactly the order total in cash (p_cash is ignored).
-- Run once in Supabase → SQL Editor. Safe to run again.

create or replace function public.partner_complete(p_order_id uuid, p_cash int, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Delivery partners only.'; end if;
  if coalesce(trim(p_photo), '') = '' then raise exception 'Take a photo of the items at the door first.'; end if;
  update orders set status = 'completed', completed_at = now(), delivered_by = auth.uid(), delivery_photo = p_photo,
    cash_collected = case when payment_method = 'cash' then total else 0 end
  where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Only confirmed orders can be marked delivered.'; end if;
end
$$;

notify pgrst, 'reload schema';
