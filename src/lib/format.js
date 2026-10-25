export const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

export function dateStr(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(str, n) {
  const [y, m, d] = str.split('-').map(Number)
  return dateStr(new Date(y, m - 1, d + n))
}

const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const hh = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  return m ? `${hh}:${String(m).padStart(2, '0')} ${ampm}` : `${hh} ${ampm}`
}

export function dayLabel(str) {
  const today = dateStr()
  if (str === today) return 'Today'
  if (str === addDays(today, 1)) return 'Tomorrow'
  if (str === addDays(today, -1)) return 'Yesterday'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export const slotText = (date, shop) =>
  `${dayLabel(date)}, ${fmtTime(shop.slot_start)} – ${fmtTime(shop.slot_end)}`

// Orders before the cut-off go to today's slot, later ones to tomorrow's.
export function slotDate(shop, now = new Date()) {
  const today = dateStr(now)
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= toMinutes(shop.cutoff_time) ? addDays(today, 1) : today
}

export function isOpenNow(shop, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes()
  return !shop.paused && mins >= toMinutes(shop.open_time) && mins < toMinutes(shop.close_time)
}

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const fmtClock = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export const cleanPhone = (p) => String(p ?? '').replace(/\D/g, '').slice(-10)

// Search that tolerates spelling variants: "aata" and "atta" both become "ata".
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/w/g, 'v')
    .replace(/(.)\1+/g, '$1')
}

// Every typed word must be the start of some word in the text ("ata" finds "Atta", not "Patanjali").
// A plural also finds the single word: "drinks" finds "drink", "biscuits" finds "biscuit".
export function matches(text, query) {
  const words = normalize(text).split(/\s+/)
  const found = (q) => words.some((w) => w.startsWith(q))
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => found(q) || (q.length > 3 && q.endsWith('s') && found(q.slice(0, -1))))
}

export const statusLabel = (s) => ({ placed: 'Placed', confirmed: 'Confirmed', completed: 'Delivered', cancelled: 'Cancelled' })[s] ?? s
