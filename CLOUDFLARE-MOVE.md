# Moving jholzo.com from Netlify to Cloudflare Pages

Cloudflare Pages (free): unlimited visits and bandwidth, 500 builds a month. The domain stays registered at
Hostinger; only its nameservers point to Cloudflare. Google Search keeps working (same domain, same pages).

## Part 1: prepare now (live site not touched)

1. Make a free account at https://dash.cloudflare.com/sign-up (same Gmail as Search Console).
2. **Workers & Pages → Create → Pages → Connect to Git** → GitHub → allow the `sixsevenfs-gif` account →
   choose `dergaonhub`.
3. Settings:
   - Project name: `jholzo` (test address becomes jholzo.pages.dev)
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty
   - Environment variables (copy the values from `.env`, or from Netlify → Project configuration →
     Environment variables):
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `NODE_VERSION` = `22`
4. **Save and Deploy.** Then open https://jholzo.pages.dev/?preview=store and check: products, photos,
   cart → "Create account", an info page such as /policy/about.
   (Photos load full size here; they get smaller once Transformations is on for jholzo.com, Part 2 step 6.)

Every push to `main` now also builds on Cloudflare (free). Netlify still serves jholzo.com.

## Part 2: tonight (the switch)

1. GitHub Desktop → **Push origin** (sends the code that works on both hosts; one last Netlify deploy).
2. Cloudflare → **Add a domain** → `jholzo.com` → **Free** plan. It reads the current records. Make the list
   look like this (add anything missing; mail records must be **DNS only**, grey cloud):

   | Type  | Name                         | Value                                     | Proxy    |
   |-------|------------------------------|-------------------------------------------|----------|
   | MX    | @                            | mx1.hostinger.com (priority 5)            | DNS only |
   | MX    | @                            | mx2.hostinger.com (priority 10)           | DNS only |
   | TXT   | @                            | v=spf1 include:_spf.mail.hostinger.com ~all | DNS only |
   | TXT   | @                            | google-site-verification=diQRpaNPcPkLU5aLkdn6TDDmopP-77KIWqZnkAu6eHY (keep: Search Console) | DNS only |
   | TXT   | _dmarc                       | v=DMARC1; p=none                          | DNS only |
   | CNAME | autodiscover                 | autodiscover.mail.hostinger.com           | DNS only |
   | CNAME | autoconfig                   | autoconfig.mail.hostinger.com             | DNS only |
   | CNAME | hostingermail-a._domainkey   | hostingermail-a.dkim.mail.hostinger.com   | DNS only |
   | CNAME | hostingermail-b._domainkey   | hostingermail-b.dkim.mail.hostinger.com   | DNS only |
   | CNAME | hostingermail-c._domainkey   | hostingermail-c.dkim.mail.hostinger.com   | DNS only |

   **Delete** the old Netlify ones: `A @ 75.2.60.5` and `CNAME www jholzo.netlify.app`.
3. Hostinger → Domains → jholzo.com → **DNS / Nameservers → Change nameservers** → the two Cloudflare
   nameservers shown on screen (replace `horizon.dns-parking.com` and `orbit.dns-parking.com`).
4. Wait until Cloudflare shows the domain as **Active** (often 10–30 minutes, can take a few hours).
   The old site keeps working meanwhile.
5. Pages project `jholzo` → **Custom domains** → add `jholzo.com`, then `www.jholzo.com`.
6. Photos: Cloudflare → jholzo.com → **Images → Transformations → Enable for zone**; under sources choose
   **Specified origins** and add `nyzwehemganasxwcxeai.supabase.co`.
7. www to jholzo.com: **Rules → Redirect Rules → Create from template → "Redirect from WWW to root"**.
8. **SSL/TLS → Edge Certificates → Always Use HTTPS: On.**

## Part 3: check, then switch Netlify off

- https://jholzo.com opens, has the lock, shows products with photos; https://www.jholzo.com and
  http://jholzo.com go to https://jholzo.com.
- Cart → Create account → OTP SMS arrives → place a test order → Telegram alert → cancel it.
- https://jholzo.com/policy/about opens with the title "About us | Jholzo".
- Email: send a mail to support@jholzo.com and check it arrives.
- Then Netlify → Project configuration → Build & deploy → **Stop builds** (pushes stop using credits).
  Keep the Netlify project a week, then delete it.
