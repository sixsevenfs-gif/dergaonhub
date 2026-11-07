-- Update 041: customers can delete their account themselves (the App Store requires it in the app).
--
-- delete_my_account(phone), for a number this phone owns (OTP-verified here, or used to order from here),
-- and only when no order of that number is still open. It takes the name, number, addresses, notes and
-- UPI references off the customer's past orders and complaints, deletes their logins, cart, waitlist entry,
-- OTP records and app notification tokens, sets their Jholzo Money to zero and frees the number. Order
-- amounts stay for the accounts.
--
-- A number with cash-order strikes (cancelled or not taken, update 037) keeps the number and the count on
-- the customer row, without a name: deleting the account must not undo the cash-on-delivery rule.

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

  delete from verified_phones where phone = p_phone;
  delete from otp_requests where phone = p_phone;
  delete from signups where phone = p_phone;
  delete from waitlist where phone = p_phone;
  -- These come with other updates (032 carts, 028 app notifications), so only when they are there.
  if to_regclass('public.carts') is not null then execute 'delete from public.carts where phone = $1' using p_phone; end if;
  if to_regclass('public.device_tokens') is not null then execute 'delete from public.device_tokens where phone = $1' using p_phone; end if;
end
$$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
