-- Update 020: security hardening. Run once in Supabase → SQL Editor (after 019). Safe to run again; nothing is deleted.
--
-- 1. Telegram alerts go out once per event. The telegram-notify function is public (the database calls it
--    without a login), so it claims these flags before sending: calling it again for the same order or UTR
--    does nothing, and nobody can flood the admin's Telegram with repeats.
-- 2. Admin, rider and customer functions can no longer be called without a login (role anon). They already
--    check is_admin()/is_staff()/auth.uid() inside; this closes the door one step earlier. Customers keep
--    working: their automatic device login has the authenticated role. is_admin(), is_staff() and is_rider()
--    stay callable by everyone because row-level security policies use them on public reads.

alter table public.orders
  add column if not exists tg_placed_sent boolean not null default false,
  add column if not exists tg_utr_sent text not null default '';

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'admin_add_rider', 'admin_list_riders', 'admin_wallet_adjust', 'cancel_order', 'expire_old_orders',
      'log_order_message', 'partner_complete', 'partner_no_show', 'partner_set_dispatch', 'partner_undo_delivered',
      'staff_set_payment', 'customer_cancel_order', 'customer_submit_upi_ref', 'my_wallet', 'phone_verified',
      'cod_allowed'])
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end
$$;
