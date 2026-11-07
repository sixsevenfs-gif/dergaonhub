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
21. `migrations/022_manual_address.sql`: customers can order without a map pin (map or location not working): they type the address and pick an area, and you call to confirm.
22. `migrations/023_upi_pay_timer.sql`: "Pay now by UPI" orders not paid within 15 minutes (Admin → Settings) are cancelled; paying late and entering the UTR brings the order back.

Later updates (024 onwards) are in the same folder; run each new one once, in order. For example
`migrations/041_delete_account.sql` lets customers delete their own account in the iPhone app
(Account → Delete my account), which the App Store requires.
`migrations/042_cancel_alert_sales.sql` sends a Telegram message when an order is cancelled (deploy
telegram-notify again first) and gives the admin home its sales totals for any dates, since launch.
`migrations/043_rider_shopping.sql` saves the rider's shopping ticks with the order (they stay on another phone),
shows the rider what to pay the shop for each item (buy price, or MRP to bargain on) and lets them add the shop's
bill with a photo when it asked for more; the owner sees that bill on the order.
`migrations/044_rider_returns.sql` (after 043) shows each rider the day's money to give back to the owner
(cash from customers − paid at the shop − already given back) with a UPI QR to pay it; Daily summary shows every rider.
`migrations/045_order_returns.sql` (after 044) lets the rider pay that back per order or all at once, by UPI or as cash
to hand over by 9 PM; the owner taps "Got it" in Daily summary when the cash arrives.
`migrations/046_money_rider.sql` (after 045) counts orders marked delivered from the admin panel for the rider they
are assigned to, so that rider sees the money and the pay button.
`migrations/047_pay_rider.sql` (after 046) lets the owner record paying a rider who is owed money (they paid the shop
for orders the customer paid online): Daily summary → "I paid Ravi ₹X".

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
a small fee per message. Then "order confirmed" goes out by itself the moment an order is saved and
"delivered" the moment it is marked Delivered (the database sends both, update 036), and "On the way"
goes out when the rider or you tap it.
Pay-now UPI orders get their confirmation from you after the payment check. One time:

1. https://business.facebook.com → create a Business account → **WhatsApp Manager** → add a
   phone number for the store. It must not be in use on the WhatsApp app (a new SIM is simplest).
2. **Message templates → Create**, category **Utility**, type **Default**, language **English**,
   variables **Number**, these three (`{{1}}` name, `{{2}}` order number, `{{3}}` / `{{4}}` as shown):
   - `order_confirmed`: Hello {{1}}, your Jholzo order #{{2}} is confirmed ✅ It will be delivered {{3}}. Total: {{4}}. We will call you once before packing your order. For help, call or WhatsApp us at 9181061864. Thank you for shopping with Jholzo!
   - `rider_on_the_way`: Hello {{1}}, our rider has left with your Jholzo order #{{2}} 🛵 You will get it in 10–15 minutes. Please keep {{3}} ready. For help, call us at 9181061864.
   - `order_delivered` (the bill): Hello {{1}}, your Jholzo order #{{2}} has been delivered ✅ / 🧾 Bill: {{3}} /
     Total: {{4}} / Paid: {{5}} / Thank you for shopping with Jholzo! 💚 / Any issue with your order? Report it here:
     https://jholzo.com/report/{{6}} / Download your bill (PDF): https://jholzo.com/bill/{{7}} / Continue shopping
     with us at https://jholzo.com 🛒 (`/` = new line; `{{3}}` is the items and charges in one line, `{{5}}` like
     "Cash ₹250", `{{6}}` and `{{7}}` the order number). No buttons.
3. In Meta → WhatsApp → **API Setup**, copy the **Phone number ID**, and make a permanent
   access token (Business settings → System users → Generate token, permission
   `whatsapp_business_messaging`).
4. On your computer, in the project folder:
   ```
   npx supabase login
   npx supabase secrets set WA_TOKEN=<token> WA_PHONE_ID=<phone number id> --project-ref <project ref>
   npx supabase functions deploy notify-whatsapp --no-verify-jwt --use-api --project-ref <project ref>
   ```
   (The project ref is the part before `.supabase.co` in your Supabase URL.)
5. Supabase → **SQL Editor** → paste `migrations/036_whatsapp_auto.sql` → **Run**.
6. **Admin → Settings → Automatic WhatsApp messages → on → Save changes.**
7. Place a test order with your own number: "order confirmed" should arrive within a few seconds.

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

### MSG91 instead of Message Central

The same `phone-otp` function sends through MSG91's OTP widget when the secret `MSG91_WIDGET_TOKEN` is set
(MSG91 → OTP → Widgets → your widget → Client Side Integration → `tokenAuth`), and checks the code with
`MSG91_AUTHKEY` (MSG91 → Authkey, IP security off). In the widget settings keep **Captcha off** (the server
calls MSG91, not the browser) and give the token a throttle that fits the whole site (all calls come from
Supabase's IP). Remove `MSG91_WIDGET_TOKEN` to go back to Message Central. Until MSG91 KYC is done, MSG91
sends its own demo text instead of the real message.

### App Review login (iPhone app)

Apple's reviewers can't receive an SMS on an Indian number. While the app is in review, set a number you own
and a 4-digit code; that number then logs in with that code and no SMS is sent:
```
npx supabase secrets set REVIEW_PHONE=<a number you own> REVIEW_OTP=<4 digits> --project-ref <project ref>
npx supabase functions deploy phone-otp --project-ref <project ref>
```
Give the same number and code in App Store Connect → App Review Information. After approval remove them:
`npx supabase secrets unset REVIEW_PHONE REVIEW_OTP --project-ref <project ref>`.

## App notifications (Android app)

The Jholzo Android app (folder `jholzo-android` next to this project) shows a notification when an order
is confirmed, on the way, arriving, delivered, cancelled, or its UPI payment is accepted. The database
calls the `push-notify` function, which sends through Firebase Cloud Messaging to every phone that logged
in with that number.

1. https://console.firebase.google.com → **Add project** (name: Jholzo; Google Analytics not needed).
2. In the project: **Add app → Android**, package name `com.jholzo.app` → **Register** → download
   `google-services.json` and put it in `jholzo-android/app/`. Rebuild the app.
3. **Project settings → Service accounts → Generate new private key** → a JSON file downloads. Keep it
   private (never commit or share it). In a terminal in this project:
   ```
   npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat ~/Downloads/<the-file>.json)" --project-ref <project ref>
   npx supabase functions deploy push-notify --no-verify-jwt --project-ref <project ref> --use-api
   ```
   Then delete the downloaded JSON file.
4. Supabase → **SQL Editor** → paste `migrations/028_push_notifications.sql` → **Run**.
5. Test: log in on the app, place an order, confirm it in Admin: the phone should get "Order confirmed ✅".
