# Database (Supabase)

`schema.sql` creates the tables, security rules and order logic. `seed.sql` adds store
settings, categories and the 67 starter products (regenerate with `node scripts/make-seed-sql.mjs`).

## Tables

| Table | What it holds | Who can read / change |
|---|---|---|
| `store_settings` | One row: name, phone, timings, min order, areas, home location, per-km fee, max km, paused | Everyone reads · admin changes |
| `categories` | Atta, Rice, Daal, ... | Everyone reads · admin changes |
| `products` | Name, size, price, photo, stock, popular star, hidden | Everyone reads active ones · admin changes |
| `customers` | Phone, name, no-show count, blocked | Admin only |
| `orders` | One row per order, with location, distance, fee, totals, status | Customer reads own · admin all |
| `order_items` | Items with name and price **at the time of order** | Same as orders |
| `complaints` | "Report a problem" | Customer adds/reads own · admin all |
| `waitlist` | "Notify me" from outside the delivery area | Anyone adds · admin reads |
| `daily_expenses` | Money spent at shops per day | Admin only |
| `admins` | Which logins are admin | Admin only |
| `private_settings` | Orders per evening (kept from customers) | Admin only |
| `riders` | Delivery partner logins (name, phone, access on/off) | Admin manages · rider reads own row |
| `order_messages` | WhatsApp messages sent to customers (automatic or by tap) | Admin and riders read · written by functions only |
| `wallet_entries` | Jholzo Money: every reward, use, refund and admin change (balance = sum) | Admin reads · changed only by the wallet functions and order status |

## Logins

- **Customers:** each phone gets an automatic anonymous login (no OTP, free). Orders are tied
  to that phone's browser, so nobody can see someone else's orders by typing a number.
  Phone OTP can be added later.
- **Admin:** email + password, created in Supabase and added to the `admins` table.
- **Rider (delivery partner):** email + password, created in Supabase and added in
  Admin → Settings → Delivery partners. Opens `/partner`. Everything a rider does goes through
  the `partner_*` functions, which check the login every time. A rider never reads the
  `orders` table directly, cannot see customers, money reports, settings or products, and
  "Remove access" locks them out at once.

## Important functions

- `place_order(...)`: the only way to create an order (optionally for someone else: the last two
  arguments are the orderer's name and phone). It prices items from `products`,
  works out distance and fee from the home location, checks min order, first-order limit,
  no-shows, blocked numbers, the cut-off time (India time) and the 15-per-evening cap.
- `delivery_quote(lat, lng)`: distance and fee (same rule as `src/lib/delivery.js`).
- `get_order(order_number)`: order page from the bill link; hides address and phone unless
  it is your own order or you are admin.
- `cancel_order(id, reason)`: admin cancel; "No-show" also counts against the number.
- `expire_old_orders()`: marks past-day unfinished orders as Expired.
- `partner_orders(date)`, `partner_set_dispatch(id, step)`, `partner_complete(id, cash)`,
  `partner_undo_delivered(id)`, `log_order_message(id, kind)`: the rider page. Only admin and
  active riders; an order goes out only after the admin has confirmed it.
- `admin_add_rider(email, name, phone)`, `admin_list_riders()`: riders in Admin → Settings.

## Setup (one time, about 15 minutes)

1. Go to https://supabase.com → sign up (GitHub login is easiest) → **New project**.
   Name `dergaonhub`, a strong database password (save it), region **Mumbai (ap-south-1)**, Free plan.
2. **SQL Editor → New query** → paste all of `schema.sql` → **Run**. Then the same for `seed.sql`.
3. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**. Keep Email on.
4. **Authentication → Users → Add user → Create new user**: your admin email + password
   (tick "Auto confirm"). Copy the new user's **UID**.
5. **SQL Editor** → run: `insert into public.admins (user_id) values ('PASTE-UID-HERE');`
6. **Project Settings → API**: copy **Project URL** and the **anon public** key into a file
   `.env` in the project folder (see `.env.example`). Never share the `service_role` key.

The free plan pauses a project after about a week with no use; open the site daily or
upgrade before handing over.

## Updates for an existing database

Run each file once, in order, in **SQL Editor → New query** (each is safe to run again).
`migrations/run_all_updates.sql` has all of them in one file:

1. `migrations/002_packaging.sql`: packaging charge.
2. `migrations/003_partners.sql`: riders, the `/partner` page and WhatsApp message log.
3. `migrations/004_order_for_someone.sql`: "Order for someone else" at checkout (the person
   who ordered is saved in `ordered_by_name` / `ordered_by_phone`; the receiver is the customer).
4. `migrations/005_free_delivery.sql`: "Free delivery (launch offer)" switch in Admin → Settings.
5. `migrations/006_customer_cancel.sql`: customers cancel their own order until the rider is on the way.
6. `migrations/007_small_orders_photos.sql`: orders below ₹149 pay ₹40 delivery (or the distance fee if
   higher), no minimum order and no first-order limit, and the rider must photograph the items to mark
   an order delivered (private `deliveries` storage bucket).
7. `migrations/008_no_show_cod_photos.sql`: the rider can mark "Customer not answering" (no-show);
   after 2 no-shows a number can no longer pay cash on delivery; several photos per product.
8. `migrations/009_fixed_cash.sql`: the rider always collects exactly the order total (cannot be changed).
9. `migrations/010_powered_by.sql`: admin switch to show or hide "Powered by Malchetra Groups".
10. `migrations/011_privacy_spam.sql`: order pages hide names and phones from strangers; at most 3 open orders per phone.
11. `migrations/012_sale_price.sql`: discount price per product (struck-out price and % OFF for customers).
12. `migrations/013_daily_cap.sql`: no limit on orders per person; orders per evening set in Admin → Settings; checkout shows the real delivery day.
13. `migrations/014_private_cap.sql`: the orders-per-evening limit (50) is admin-only (`private_settings`), never shown to customers.
14. `migrations/015_upi_pay_now.sql`: "Pay now by UPI" to the store's UPI ID with UTR check by admin/rider; orders above ₹350 must pay first; packaging with paise (₹3.80 / ₹7.80 / ₹13.60).
15. `migrations/016_phone_otp.sql`: phone OTP once per new phone (Message Central VerifyNow), switched on in Admin → Settings.
16. `migrations/017_wallet_referral.sql`: Jholzo Money (wallet) and Refer & Earn: invite codes, rewards when a friend's first order is delivered, wallet money at checkout (Admin → Settings → Refer & earn).
17. `migrations/018_delivery_express.sql`: evening delivery charge by order value (₹40 below ₹99, ₹11 up to ₹298, FREE from ₹299) and Express delivery within an hour for ₹40 extra (switched on in Admin → Settings).
18. `migrations/019_telegram_notify.sql`: Telegram message to the admin for every new order (Express marked URGENT and pinned) and when a customer submits a UPI UTR. Deploy the function first, see **Telegram order alerts** below.
19. `migrations/020_security_hardening.sql`: each Telegram alert goes out only once (repeat calls do nothing), and admin, rider and customer functions need a login. Deploy telegram-notify again after running it.
20. `migrations/021_featured_rank.sql`: the order of "Popular essentials" on the home page (`featured_rank`, 1 shows first).

A new database made from the latest `schema.sql` already has all of them.

## Adding a rider

1. **Authentication → Users → Add user → Create new user**: the rider's email + a password
   (tick "Auto confirm"). Give these to the rider.
2. On the site: **Admin → Settings → Delivery partners** → same email, name, phone → **Add**.
3. The rider opens `yoursite/partner` on their phone and logs in.

## WhatsApp messages

Without any setup, the rider page opens WhatsApp with the message ready and the rider taps
Send (free). The "order placed" message is sent the same way from the order page in Admin.

To send them automatically (no tap), connect the **WhatsApp Cloud API** (Meta). Meta charges
a small fee per message. One time:

1. https://business.facebook.com → create a Business account → **WhatsApp Manager** → add a
   phone number for the store (it must not be in use on the WhatsApp app).
2. **Message templates → Create**, category **Utility**, language **English**, these three
   (`{{1}}` name, `{{2}}` order number, `{{3}}` / `{{4}}` as shown):
   - `order_placed`: Hello {{1}}, your Jholzo order #{{2}} is placed successfully ✅ It will be delivered {{3}}. Total: {{4}}. Thank you!
   - `rider_on_the_way`: Hello {{1}}, our rider has left with your Jholzo order #{{2}} 🛵 You will get it in 10–15 minutes. Please keep {{3}} ready (cash or UPI).
   - `rider_arriving`: Hello {{1}}, our rider is arriving soon with your Jholzo order #{{2}} 📍 You will get it in 10–15 minutes. Please keep {{3}} ready (cash or UPI).
3. In Meta → WhatsApp → **API Setup**, copy the **Phone number ID**, and make a permanent
   access token (Business settings → System users → Generate token, permission
   `whatsapp_business_messaging`).
4. On your computer, in the project folder:
   ```
   npx supabase login
   npx supabase secrets set WA_TOKEN=<token> WA_PHONE_ID=<phone number id> --project-ref <project ref>
   npx supabase functions deploy notify-whatsapp --project-ref <project ref>
   ```
   (The project ref is the part before `.supabase.co` in your Supabase URL.)
5. **Admin → Settings → Automatic WhatsApp messages → on → Save changes.**

If an automatic message fails (for example a template is not approved yet), the rider page
says so and offers the WhatsApp button instead. Every message is listed under the order.

## Telegram order alerts

Every new order arrives on your phone as a Telegram message with the exact time, name, phone, address
(with a map link), items, totals and payment (Cash on delivery, or UPI with the UTR). Express orders say
**URGENT** and stay pinned at the top of the chat. When a customer submits a UTR later, a second message
shows it. The database sends these itself, so no order is missed even if the customer closes the page.

1. In Telegram open **@BotFather** → `/newbot` → give it a name → copy the **token**. Never paste the token
   in a chat or a file; if it was shared, send `/revoke` to BotFather and use the new one.
2. Open your new bot and tap **Start**.
3. Find your chat id: open **@userinfobot** in Telegram and tap Start; it replies with your **Id** (a number).
4. In a terminal in this project:
   ```
   npx supabase login
   npx supabase secrets set TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<your id> --project-ref <project ref>
   npx supabase functions deploy telegram-notify --no-verify-jwt --project-ref <project ref>
   ```
   For more than one person (you and a rider), put the ids together: `TELEGRAM_CHAT_ID=111,222`.
   Each of them must also tap Start in the bot once.
5. Supabase → **SQL Editor** → paste `migrations/019_telegram_notify.sql` → **Run**.
6. Place a test order on the site: the message should arrive within a few seconds.

## Phone OTP (Message Central VerifyNow)

The first time a number orders (or logs in to "My orders") on a phone, the customer gets a 4-digit SMS
code. After that it is not asked again on that phone. SMS goes through Message Central (no DLT
registration needed on your side). It stays off until you switch it on in Admin → Settings.

1. Sign up at https://www.messagecentral.com → VerifyNow (free test OTPs). Note your
   **Customer ID** (looks like `C-XXXXXXXX`) and your account **password** from the dashboard.
   Add credit when the free OTPs run out.
2. Run `migrations/016_phone_otp.sql` in the SQL Editor (once).
3. On your computer, in the project folder:
   ```
   npx supabase login
   npx supabase secrets set MC_CUSTOMER_ID=C-XXXXXXXX MC_PASSWORD=<your password> --project-ref <project ref>
   npx supabase functions deploy phone-otp --project-ref <project ref>
   ```
   (The project ref is the part before `.supabase.co` in your Supabase URL.)
4. Test it: on the site, log in to "My orders" with your own number and check the SMS arrives.
5. **Admin → Settings → Phone OTP for new phones → on → Save changes.**

At most 5 OTPs per hour go to one number or one phone, so nobody can run up the bill.
