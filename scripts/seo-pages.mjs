// After `vite build`: one HTML file per info page (dist/policy/about.html ...), each with its own title,
// description and canonical address. Netlify serves these files before the app's catch-all, so Google
// sees separate pages (and can show them as links under jholzo.com in search) instead of copies of home.
// Titles match src/content/policies.jsx.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const PAGES = {
  about: ['About us', 'About Jholzo: online grocery delivery in Dergaon, Assam, live since 1 November 2026. Daily essentials at better prices, delivered to your door. Powered by Malchetra Group.'],
  contact: ['Contact us', 'Contact Jholzo in Dergaon, Assam: call or WhatsApp 9181061864, or email support@jholzo.com for orders, delivery and help.'],
  delivery: ['Delivery policy', 'Jholzo delivery policy: delivery areas in Dergaon, delivery times and slots, delivery charges and free delivery.'],
  refund: ['Refund & cancellation', 'Jholzo refund and cancellation policy: how to cancel an order, report a damaged or missing item, and get a refund.'],
  privacy: ['Privacy policy', 'Jholzo privacy policy: what details we collect when you order (name, phone, address), how we use them and keep them safe.'],
  terms: ['Terms & conditions', 'Jholzo terms and conditions for ordering groceries online in Dergaon, Assam: orders, prices, payments and delivery.'],
  'delete-account': ['Delete your Jholzo account', 'How to delete your Jholzo account and data: in the app (Account → Delete my account) or by asking on WhatsApp or email.'],
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const html = readFileSync('dist/index.html', 'utf8')

// Replaces one tag's value and stops the build if the tag is missing, so a change to index.html can't
// silently leave every page with the home page's details.
function swap(page, pattern, value) {
  if (!pattern.test(page)) throw new Error(`seo-pages: ${pattern} not found in dist/index.html`)
  return page.replace(pattern, value)
}

mkdirSync('dist/policy', { recursive: true })
for (const [slug, [title, description]] of Object.entries(PAGES)) {
  const url = `https://jholzo.com/policy/${slug}`
  const full = esc(`${title} | Jholzo`)
  let page = html
  page = swap(page, /<title>[^<]*<\/title>/, `<title>${full}</title>`)
  page = swap(page, /(<meta name="description" content=")[^"]*"/, `$1${esc(description)}"`)
  page = swap(page, /(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
  page = swap(page, /(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
  page = swap(page, /(<meta property="og:title" content=")[^"]*"/, `$1${full}"`)
  page = swap(page, /(<meta property="og:description" content=")[^"]*"/, `$1${esc(description)}"`)
  page = swap(page, /(<meta name="twitter:title" content=")[^"]*"/, `$1${full}"`)
  writeFileSync(`dist/policy/${slug}.html`, page)
}
console.log(`seo-pages: wrote ${Object.keys(PAGES).length} pages in dist/policy/`)
