import { rupee } from './format.js'

// What the product page says about an item, and which other items it shows below it.

// The placeholder pack drawings (public/demo/) are not real photos.
export const realPhoto = (url) => !!url && !url.includes('/demo/')
export const photosOf = (p) => [p.photo_url, ...(p.photos ?? [])].filter(realPhoto)

// One plain line per category, used until the owner writes the product's own description (products.description).
const ABOUT = {
  atta: 'Flour for everyday cooking: rotis, parathas, pakoras and sweets.',
  rice: 'Rice and poha for daily meals, pulao and breakfast.',
  daal: 'Pulses for everyday daal, curries and khichdi.',
  oil: 'For frying, tadka and everyday cooking.',
  masala: 'A kitchen basic that goes into almost every meal.',
  dairy: 'For breakfast, tea and everyday cooking.',
  snacks: 'A ready-to-eat snack for tea time, tiffin or guests.',
  beverages: 'For a fresh cup at home, any time of the day.',
  colddrinks: 'Best served chilled.',
  personal: 'A daily personal care essential.',
  cleaning: 'For a clean home, kitchen and laundry.',
  vegetables: 'Picked for your order on the day of delivery.',
  dryfruits: 'For snacking, sweets and gifting.',
  pooja: 'For daily pooja and festivals.',
  home: 'A useful everyday item for your home and kitchen.',
  party: 'For birthdays and celebrations.',
}
const STORAGE = {
  atta: 'Store in a cool, dry place in an airtight container.',
  rice: 'Store in a cool, dry place in an airtight container.',
  daal: 'Store in a cool, dry place in an airtight container.',
  oil: 'Store in a cool, dry place, away from sunlight.',
  masala: 'Store in a cool, dry place. Keep the pack closed.',
  snacks: 'Store in a cool, dry place. Keep the pack closed after opening.',
  beverages: 'Store in a cool, dry place.',
  dryfruits: 'Store in an airtight container, away from moisture.',
  dairy: 'Keep refrigerated.',
  vegetables: 'Wash before use.',
}

export const aboutText = (p) => p.description?.trim() || `${p.name}, ${p.size}. ${ABOUT[p.category_id] ?? 'Delivered to your door in Dergaon.'}`
export const storageTip = (p) => STORAGE[p.category_id] ?? ''

const words = (s = '') => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
const brand = (p) => words(p.name)[0] ?? ''

// Same shelf first: other sizes of the same item, then the same brand, then items that share search words.
export function similarTo(p, products, limit = 10) {
  const mine = new Set(words(`${p.name} ${p.keywords ?? ''}`))
  const score = (x) =>
    (x.name === p.name ? 8 : 0) + (brand(x) === brand(p) ? 3 : 0) + words(`${x.name} ${x.keywords ?? ''}`).filter((w) => mine.has(w)).length + (x.available ? 2 : 0)
  return products
    .filter((x) => x.id !== p.id && x.category_id === p.category_id)
    .map((x) => [score(x), x])
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, x]) => x)
}

// From the other shelves: the store's popular items (starred in Admin) in their saved order, at most two from
// one category so the row is a mix and not ten cold drinks.
export function alsoLike(p, products, limit = 10) {
  const others = products.filter((x) => x.category_id !== p.category_id && x.available)
  const rank = (x) => x.featured_rank ?? Infinity
  const starred = others.filter((x) => x.featured).sort((a, b) => rank(a) - rank(b))
  const taken = {}
  return [...starred, ...others.filter((x) => !x.featured)]
    .filter((x) => (taken[x.category_id] = (taken[x.category_id] ?? 0) + 1) <= 2)
    .slice(0, limit)
}

// Per-kg price only where people compare by weight (staples, loose produce, dry fruits),
// not on chocolates, snacks, drinks or soaps where it reads oddly.
const UNIT_PRICE_CATEGORIES = new Set(['atta', 'rice', 'daal', 'oil', 'masala', 'vegetables', 'dryfruits'])

// "5 kg" at ₹285 → "₹57/kg"; grams per kg. Nothing for litres (oil, ghee), pieces or packs.
export function unitPrice(price, size = '', categoryId = '') {
  if (!UNIT_PRICE_CATEGORIES.has(categoryId)) return ''
  const m = size.trim().toLowerCase().match(/^([\d.]+)\s*(kg|g)$/)
  if (!m) return ''
  const n = Number(m[1])
  if (!(n > 0)) return ''
  const [qty, unit] = { kg: [n, 'kg'], g: [n / 1000, 'kg'] }[m[2]]
  if (qty === 1) return ''
  return `${rupee(price / qty)}/${unit}`
}
