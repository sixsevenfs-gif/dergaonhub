# Dergaon Hub

One grocery store website for Dergaon. Customers order online; the founder confirms
by phone, buys everything from local shops in one trip, and delivers in the evening.

## Run on your computer

```bash
npm install
npm run dev
```

Then open the link it prints (usually http://localhost:5173).

## Demo mode (right now)

No database is connected yet, so all data is saved **in this browser only**
(`src/lib/store.js`, localStorage). Demo products and orders load automatically.
Admin → Settings → "Reset demo data" starts fresh.

| Try this | Where |
|---|---|
| Customer store | `/` |
| My orders (phone login, no OTP in demo) | `/account` |
| Admin panel | `/admin` (no login in demo mode) |

All phone and WhatsApp numbers in the demo data are fake (`90000...`).

## How a day works

1. Customer orders before 2 pm (cut-off) → delivery today 5–8 pm, else tomorrow.
2. **Admin → Orders:** call the customer, tap **Confirm**.
3. **Admin → Delivery sheet:** one **shopping list** of every confirmed item. Buy it all in one trip.
   An item not found? Open the order and remove it; the total updates.
4. Deliver area by area. Tap **Delivered + send bill**: the order is marked delivered and
   WhatsApp opens with the bill for the customer (you tap Send).
5. **Admin → Daily summary:** enter what you spent at the shops; it shows the day's profit.
6. Complaints from customers ("Report a problem") show up in **Admin → Complaints**.
   Your reply is shown on the customer's order page.

## Pages

**Customer (dark):** Store home with search and categories `/`, Cart, Checkout,
Order placed, Order status `/track`, Login `/login`, My orders `/account`,
Report a problem `/report/:order`.

**Admin (light):** Home (new orders, open complaints, pause store), Orders, Order detail,
Delivery sheet (shopping list + deliveries), Daily summary, Products (price, stock,
photo, hide, CSV import), Complaints, Customers (no-shows, block), Settings (store
details, timings, delivery fee, areas).

## Rules built in

Change the numbers in `src/config.js`; store timings and fees in Admin → Settings.

- Order before the cut-off (2 pm) → delivered today, else tomorrow.
- Max 15 orders per evening; extra orders move to the next day.
- First-time phone number: max ₹500 order. Minimum order ₹200.
- 2 no-shows → number can't order online. Admin can block a number.
- Customer chooses whether a similar brand is OK if theirs is not found.
- Orders not delivered on their day are auto-cancelled ("Expired").
- Order items keep the price at the time of order.

## Photos

In **Admin → Products**, tap the box next to a product to add a photo (it is shrunk
automatically), and tap ⭐ to show it in "Popular essentials" on the home page.

`public/photos/` holds the founder's own photos (home banner, and atta, rice, toor dal,
sunflower oil).

**Demo pictures:** every demo product has a simple drawing (marked DEMO) in
`public/demo/products/`, made by `node scripts/make-demo-photos.mjs`. They are not real
packages: replace them with your own photos before launch.

## Logo

`public/brand/`: Dergaon Hub logo (powered by Malchetra Groups) as SVG and PNG for dark and
light backgrounds, the app icon, and `preview.html` to see them all. The website header
draws the same logo in code (`src/components/Wordmark.jsx`); browser tab and phone app
icons are `public/favicon.svg` and `public/icons/`.

## Folders

| Folder | What is inside |
|---|---|
| `src/pages/customer/` | Customer store pages |
| `src/pages/admin/` | Founder-only admin panel (`/admin`) |
| `src/components/` | Small reusable pieces (logo, buttons, cards, icons) |
| `src/lib/store.js` | **All data reads/writes.** Only this file changes when the database is connected |
| `src/lib/seed.js` | Demo data and the starter product list (67 products) |
| `src/config.js` | Pilot rules: limits, areas, cancel reasons, complaint types |
| `scripts/` | Demo picture generator |
| `supabase/` | Database tables and security rules (SQL), next step |
| `public/` | Icon, app manifest, demo pictures, `_redirects` for Cloudflare Pages |

## Not done yet

- Database (Supabase or Firebase) with phone OTP login for customers and a real admin login
- Cloudflare Turnstile CAPTCHA on checkout
- Cloudflare Pages deploy and domain

## Secrets

Copy `.env.example` to `.env` and fill in the database keys. `.env` is never
pushed to GitHub. On Cloudflare Pages, add the same values under
Settings → Environment variables.
