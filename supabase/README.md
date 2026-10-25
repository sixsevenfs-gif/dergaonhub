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

## Logins

- **Customers:** each phone gets an automatic anonymous login (no OTP, free). Orders are tied
  to that phone's browser, so nobody can see someone else's orders by typing a number.
  Phone OTP can be added later.
- **Admin:** email + password, created in Supabase and added to the `admins` table.

## Important functions

- `place_order(...)`: the only way to create an order. It prices items from `products`,
  works out distance and fee from the home location, checks min order, first-order limit,
  no-shows, blocked numbers, the cut-off time (India time) and the 15-per-evening cap.
- `delivery_quote(lat, lng)`: distance and fee (same rule as `src/lib/delivery.js`).
- `get_order(order_number)`: order page from the bill link; hides address and phone unless
  it is your own order or you are admin.
- `cancel_order(id, reason)`: admin cancel; "No-show" also counts against the number.
- `expire_old_orders()`: marks past-day unfinished orders as Expired.

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
