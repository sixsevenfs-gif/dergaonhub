# dergaon.

Mobile-first website where people in Dergaon order from local shops.
Full plan: "Dergaon Project: Complete Plan for the AI Builder" (PDF).

## Run on your computer

```bash
npm install
npm run dev
```

Then open the link it prints (usually http://localhost:5173).

## Folders

| Folder | What is inside |
|---|---|
| `src/pages/customer/` | Customer site: home, shop page, cart, checkout (no login) |
| `src/pages/shop/` | Shop owner dashboard (`/shop`) |
| `src/pages/admin/` | Founder-only admin panel (`/admin`) |
| `src/components/` | Small reusable pieces (logo, buttons, cards) |
| `src/lib/` | Connection to Supabase (database + login) |
| `supabase/` | Database tables and security rules (SQL) |
| `data/` | Master product library CSV and import script |
| `public/` | Files served as-is (icon, `_redirects` for Cloudflare Pages) |

## Secrets

Copy `.env.example` to `.env` and fill in the Supabase keys. `.env` is never
pushed to GitHub. On Cloudflare Pages, add the same two values under
Settings -> Environment variables.

## Build progress (plan section 11)

- [x] 0a. Vite + React + Tailwind app, design colours, home page, git
- [ ] 0b. GitHub repo, Cloudflare Pages deploy, domain connected
- [ ] 1. Database tables, security rules, library CSV import
- [ ] 2. Shop signup and settings
- [ ] 3. Add products from library
- [ ] 4. Customer site: shop page, cart, checkout, WhatsApp
- [ ] 5. Shop dashboard orders + today's delivery sheet
- [ ] 6. Admin panel + daily settlement summary
- [ ] 7. Directory listings
- [ ] 8. Phone testing + onboard Sharma Grocery
- [ ] 9. Launch
