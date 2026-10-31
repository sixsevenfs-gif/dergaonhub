# Security model

Audit of 28 Oct 2026. The site is a static React app (Cloudflare Pages); the backend is Supabase.
Nothing secret is in the browser: every rule is enforced in the database or in server functions.

## What runs where

| Layer | What it holds | Who can reach it |
|---|---|---|
| Browser (React, `src/`) | Supabase project URL + **anon key** (public by design, like a door address) | Everyone |
| Postgres + row-level security | All data. RLS is on for every table | Anon key: active products, categories, store settings only |
| SQL functions (`security definer`) | Orders, prices, wallet, COD, riders, admin actions | Each checks `is_admin()`, `is_staff()` or `auth.uid()` inside |
| Edge functions (`supabase/functions`) | WhatsApp, OTP SMS, Telegram: their keys live in Supabase secrets | `notify-whatsapp`, `phone-otp`: login required. `telegram-notify`: public, but only sends to the admin chat, once per event |
| Storage | `photos` (public read, admin write), `deliveries` (staff only) | As listed |

Admin = a row in `public.admins` for that login; the `/admin` pages are only screens, the database
refuses admin work to anyone else. Prices, totals, fees, wallet and COD limits are computed in
`place_order` on the server, never trusted from the browser.

## Checked from outside (anon key only, 28 Oct 2026)

- Reading admins, customers, orders, items, complaints, riders, wallet, OTP, private settings: 0 rows.
- Hidden products: not visible. Editing products/store/categories: blocked.
- Admin functions (`cancel_order`, `admin_list_riders`, …): refused. `get_order` (bill link): no name,
  phone, address, location or UTR for strangers.
- Git history: no keys ever committed. `.env` is ignored.

## Fixed in this audit

- `public/_headers`: CSP (only our code; data only from our Supabase, OpenStreetMap, Google Fonts),
  no framing (clickjacking), nosniff, HSTS, referrer and permissions policies. Tested on a production build.
- `020_security_hardening.sql`: Telegram alerts once per event (no spamming via the public function);
  admin/rider/customer functions no longer callable without a login.

## Still to do (settings, not code)

1. **Phone OTP on** (Admin → Settings) once launched: without it, anyone can order under any phone number.
2. **Captcha** (Cloudflare Turnstile → Supabase → Authentication → Bot protection) against bots creating
   logins and fake orders.
3. **Admin login**: long unique password; Supabase → Authentication → turn off "Allow new users to sign up"
   for email if customers keep working (they use anonymous logins), and consider MFA for the admin.
4. **Telegram bot token** was pasted in a chat: `/revoke` in BotFather and set the new one with
   `npx supabase secrets set TELEGRAM_BOT_TOKEN=…`.
5. New outside service (payments, analytics, maps)? Add its address to the CSP in `public/_headers`.
