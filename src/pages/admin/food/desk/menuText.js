// Turns pasted menu text into items. Works with what ChatGPT gives back for the prompt below, and with
// most hand-typed lists:
//   BIRYANI                          ← a line without a price is a section
//   Chicken Biryani | 180            ← name and price
//   Veg Momos | Half 60 | Full 100   ← half / full (or any labels)
//   Paneer Roll ₹90 (V)              ← ₹, "-", ":", dots between, (V) (NV) (E) marks
//   Chicken Chowmein 80/120          ← two prices without labels = Half / Full

export const CHATGPT_PROMPT = `Read this restaurant menu photo. Write every item on its own line, in exactly this format, and nothing else:

SECTION NAME (on its own line, like BIRYANI or MOMOS)
Item name | price
Item name | Half 120 | Full 200   (when there are two prices)

Put (V) after veg items, (NV) after non-veg items and (E) after egg items. Keep the names as on the menu. Do not add items that are not on the menu.`

const NONVEG = /\b(chicken|mutton|fish|prawn|prawns|keema|kheema|beef|pork|duck|crab|lamb|meat|non[\s-]?veg|tandoori chicken|murg|murgh|machli|mach)\b/i
const EGG = /\b(egg|eggs|anda|omelet|omelette|omlet)\b/i
const VEG = /\b(veg|veggie|paneer|aloo|mushroom|gobi|dal|daal|chana|rajma|corn|cheese|sweet|kulfi|ice cream|cake|lassi|tea|chai|coffee|juice|shake|soda|water|raita|curd|dahi|roti|naan|nan|paratha|puri|kulcha|rice|pulao|khichdi|salad|papad|idli|dosa|vada|samosa|pakora|chaat|halwa|gulab jamun|rasgulla)\b/i

const NUM = /(?:₹|rs\.?|inr)?\s*(\d{1,5}(?:\.\d{1,2})?)(?:\s*\/-)?/i

function dietFrom(text, sectionDiet) {
  if (/\((nv|non[\s-]?veg)\)|🔴|🟥/i.test(text)) return 'nonveg'
  if (/\((e|egg)\)|🟤|🟫/i.test(text)) return 'egg'
  if (/\((v|veg)\)|🟢|🟩/i.test(text)) return 'veg'
  if (NONVEG.test(text)) return 'nonveg'
  if (EGG.test(text)) return 'egg'
  if (VEG.test(text)) return 'veg'
  return sectionDiet || ''
}

const tidy = (s) =>
  s.replace(/\((nv|non[\s-]?veg|v|veg|e|egg)\)/gi, '')
    .replace(/[🔴🟥🟢🟩🟤🟫]/gu, '')
    .replace(/[.·•…_]{2,}/g, ' ')
    .replace(/\s*[-–—:|]+\s*$/g, '')
    .replace(/^\s*[-–—•*#\d.)]+\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s)

export function parseMenu(text, defaultSection = '') {
  const items = []
  let section = defaultSection
  let sectionDiet = ''
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim()
    if (!line) continue
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean)
    const hasNumber = /\d/.test(line.replace(/\b\d+\s*(pcs?|pieces?|ml|l|kg|gm?s?|inch|")\b/gi, ''))
    if (!hasNumber) {
      // A section heading ("## Biryani", "STARTERS:", "Veg Momos" without a price).
      section = titleCase(tidy(line.replace(/^#+\s*/, '').replace(/:$/, '')))
      sectionDiet = /\bnon[\s-]?veg\b/i.test(line) ? 'nonveg' : /\bveg\b/i.test(line) ? 'veg' : ''
      continue
    }
    let name = ''
    const variants = []
    if (parts.length >= 2) {
      // "Name | 120" or "Name | Half 120 | Full 200"
      name = parts[0]
      for (const p of parts.slice(1)) {
        const m = p.match(NUM)
        if (!m) continue
        const label = tidy(p.replace(m[0], '').replace(/\((nv|non[\s-]?veg|v|veg|e|egg)\)/gi, ''))
        variants.push({ label, price: Number(m[1]) })
      }
    } else {
      // "Chicken Biryani ...... ₹180", "Veg Momos 60/100", "Paneer Roll - 90"
      const m = line.match(/^(.*?)(?:\s|[-–—:.·]|₹|rs)+((?:₹|rs\.?\s*)?\d{1,5}(?:\.\d{1,2})?(?:\s*\/-)?(?:\s*[/|,]\s*(?:₹|rs\.?\s*)?\d{1,5}(?:\.\d{1,2})?)*)\s*(\(.*\))?\s*$/i)
      if (m) {
        name = m[1]
        const prices = m[2].split(/[/|,]/).map((p) => p.match(NUM)).filter(Boolean).map((x) => Number(x[1]))
        prices.forEach((price) => variants.push({ label: '', price }))
        if (m[3]) name += ` ${m[3]}`
      } else {
        name = line
      }
    }
    const diet = dietFrom(line, sectionDiet)
    name = titleCase(tidy(name))
    if (!name) continue
    // Two prices without labels are almost always half / full on Indian menus.
    if (variants.length === 2 && variants.every((v) => !v.label)) {
      variants[0].label = 'Half'
      variants[1].label = 'Full'
    }
    const single = variants.length === 1
    items.push({
      section,
      name,
      diet,
      price: variants.length ? Math.min(...variants.map((v) => v.price)) : null,
      variants: single ? [] : variants.map((v, i) => ({ label: v.label || `Option ${i + 1}`, price: v.price })),
    })
  }
  return items
}
