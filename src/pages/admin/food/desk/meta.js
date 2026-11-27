// Lists the desk picks from, and the "what's still missing" check for a restaurant.

export const STATUSES = [
  { id: 'talking', label: 'Talking', tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'agreed', label: 'Agreed', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'ready', label: 'Ready', tone: 'bg-violet-50 text-violet-800 border-violet-200' },
  { id: 'live', label: 'Live', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'paused', label: 'Paused', tone: 'bg-stone-100 text-stone-700 border-stone-200' },
  { id: 'dropped', label: 'Not doing', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
]
export const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0]

// Same cuisines as the Food section of the app, so restaurants show up under them later.
export const CUISINES = ['Biryani', 'Momos', 'Chinese', 'Rolls', 'Thali', 'Pizza', 'Burger', 'Chicken', 'Fast food',
  'North Indian', 'South Indian', 'Assamese', 'Sweets', 'Cakes', 'Bakery', 'Chai', 'Juice', 'Ice cream', 'Fries']

export const FOOD_TYPES = [
  { id: 'veg', label: 'Pure veg' },
  { id: 'both', label: 'Veg + non-veg' },
  { id: 'nonveg', label: 'Mostly non-veg' },
]

export const DIETS = [
  { id: 'veg', label: 'Veg', dot: 'bg-fd-veg', ring: 'border-fd-veg' },
  { id: 'nonveg', label: 'Non-veg', dot: 'bg-fd-nonveg', ring: 'border-fd-nonveg' },
  { id: 'egg', label: 'Egg', dot: 'bg-fd-egg', ring: 'border-fd-egg' },
]

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const DEALS = [
  { id: 'markup', label: 'Markup', unit: '%', hint: 'We add this % on the menu price in the app' },
  { id: 'commission', label: 'Commission', unit: '%', hint: 'Restaurant gives us this % of each order' },
  { id: 'monthly', label: 'Monthly fee', unit: '₹', hint: 'Fixed amount every month' },
]

export const PAY_WHEN = [
  { id: 'pickup', label: 'At pickup' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
]

// Papers and photos kept in the private bucket.
export const FILE_KINDS = [
  { id: 'fssai', label: 'FSSAI licence', hint: 'Photo of the certificate (front). Number and expiry go above.' },
  { id: 'menu', label: 'Menu card', hint: 'Every page, straight from the top, prices readable.' },
  { id: 'upi', label: 'UPI QR', hint: 'The QR we pay the restaurant on.' },
  { id: 'agreement', label: 'Signed agreement', hint: 'Photo of the signed page.' },
  { id: 'gst', label: 'GST', hint: 'Only if they have one.' },
  { id: 'trade', label: 'Trade licence', hint: 'Municipal / shop licence, if they have one.' },
  { id: 'shop', label: 'Shop & kitchen', hint: 'Shop front, counter, kitchen.' },
  { id: 'other', label: 'Other', hint: 'Anything else.' },
]

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== ''

// What is still missing. Nothing here is required to save; it only tells you what to ask for next.
export function checklist(r, { itemCount = 0, fileKinds = [] } = {}) {
  const has = (k) => fileKinds.includes(k)
  return [
    { id: 'phone', label: 'Phone', done: filled(r.phone) || filled(r.whatsapp), tab: 'details' },
    { id: 'place', label: 'Location', done: filled(r.address) || filled(r.area) || filled(r.maps_link) || r.lat != null, tab: 'details' },
    { id: 'timing', label: 'Timings', done: filled(r.opens_at) && filled(r.closes_at), tab: 'details' },
    { id: 'prep', label: 'Ready time', done: r.prep_minutes != null, tab: 'details' },
    { id: 'fssai', label: 'FSSAI', done: filled(r.fssai_number) || has('fssai'), tab: 'papers' },
    { id: 'menu', label: 'Menu', done: itemCount > 0 || has('menu'), tab: 'menu' },
    { id: 'deal', label: 'Deal', done: filled(r.deal_type), tab: 'details' },
    { id: 'agreement', label: 'Agreement', done: !!r.agreement_signed || has('agreement'), tab: 'papers' },
    { id: 'upi', label: 'UPI', done: filled(r.upi_id) || has('upi'), tab: 'details' },
    { id: 'cover', label: 'Cover photo', done: filled(r.cover_photo), tab: 'details' },
    { id: 'sticker', label: 'Sticker', done: !!r.sticker_given, tab: 'details' },
  ]
}

export const money = (n) => (n == null || n === '' ? '' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)

// "9876543210" → "919876543210" for wa.me links; keeps numbers that already have 91.
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length === 10) return `91${d}`
  if (d.length === 12 && d.startsWith('91')) return d
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`
  return d
}

export function priceText(item) {
  const v = (item.variants || []).filter((x) => x && (filled(x.label) || x.price != null))
  if (v.length) return v.map((x) => `${x.label || '—'} ${money(x.price)}`.trim()).join(' · ')
  return money(item.price)
}
