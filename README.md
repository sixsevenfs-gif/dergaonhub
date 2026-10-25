# Dergaon Hub

Mobile-first website where people in Dergaon order from local shops.
Full plan: "Dergaon Project: Complete Plan for the AI Builder" (PDF).

## Run on your computer

```bash
npm install
npm run dev
```

Then open the link it prints (usually http://localhost:5173).

## Demo mode (right now)

Supabase is not connected yet, so all data is saved **in this browser only**
(`src/lib/store.js`, localStorage). Demo shops, products and orders load
automatically. Shop dashboard → Settings → "Reset demo data" starts fresh.

| Try this | Where |
|---|---|
| Customer site | `/` |
| Shop dashboard (Sharma Grocery) | `/shop`, login with `sharma@demo.in` |
| New shop signup | `/shop`, login with any new email |
| Admin panel | `/admin` (no login in demo mode) |

All phone and WhatsApp numbers in the demo data are fake (`90000...`).

## Pages

**Customer (dark):** Home `/`, Shop `/s/:id`, Cart `/cart`, Checkout `/checkout`,
Order placed `/order/:number`, Order status `/track`, Directory `/directory`,
List your business `/directory/add`.

**Shop owner (light):** Login, Create shop (3 steps), Orders, Order detail,
Products (two-tap price edit, stock switch), Add from library, Custom product,
Settings (delivery rules, pause shop), Status (draft / pending / rejected / live).

**Admin (light):** Home (stats + pending shops), Shops + review (approve, reject,
hide, suspend), Delivery sheet, Settlement, Orders, Customers (no-shows, block),
Library (add, CSV import, review queue), Directory.

## Rules built in (plan sections 4 and 8)

Change the numbers in `src/config.js`.

- Order before the shop's cut-off (2 pm) → delivered today 5–8 pm, else tomorrow.
- Max 15 delivery orders per evening; extra orders move to the next day.
- First-time phone number: max ₹500 order.
- 2 no-shows → number can't order online. Admin can block a number.
- Orders not delivered on their day are auto-cancelled ("Expired").
- Order items keep the price at the time of order (later price edits don't change them).

## Folders

| Folder | What is inside |
|---|---|
| `src/pages/customer/` | Customer site pages |
| `src/pages/shop/` | Shop owner dashboard (`/shop`) |
| `src/pages/admin/` | Founder-only admin panel (`/admin`) |
| `src/components/` | Small reusable pieces (logo, buttons, cards, icons) |
| `src/lib/store.js` | **All data reads/writes.** Only this file changes when Supabase is connected |
| `src/lib/seed.js` | Demo data and the starter product library (67 products) |
| `src/config.js` | Pilot rules: limits, areas, cancel reasons |
| `supabase/` | Database tables and security rules (SQL), next step |
| `public/` | Icon, app manifest, `_redirects` for Cloudflare Pages |

## Photos

Product photos are not copied from other sites (copyright). Add your own:

- **Admin → Library:** tap the box next to a product to add its photo. Every shop selling it shows that photo.
- **Shop → Products:** tap a product's box to use the shop's own photo instead.
- **Shop → Settings:** shop logo.

Photos are shrunk automatically. Products without a photo show a category icon.
In demo mode photos are saved in the browser, which has limited space (roughly 100+ photos).

## Not done yet

- Supabase database + real Google/email login (data is per-browser for now)
- Cloudflare Turnstile CAPTCHA on checkout
- GitHub repo, Cloudflare Pages deploy, domain

## Secrets

Copy `.env.example` to `.env` and fill in the Supabase keys. `.env` is never
pushed to GitHub. On Cloudflare Pages, add the same two values under
Settings → Environment variables.
