// Telegram message text for the admin (HTML mode). Kept free of Deno APIs so it can be tested with Node.

type Order = Record<string, any>
type Item = { name_snapshot: string; quantity: number; line_total: number; note?: string }
type Store = { slot_start: string; slot_end: string }

const IST = 'Asia/Kolkata'

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const rupee = (n: unknown) => {
  const v = Math.round((Number(n) || 0) * 100) / 100
  return '₹' + v.toLocaleString('en-IN', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// "28 Oct, 5:45:12 pm" in India time
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true })

// "17:00" -> "5 PM"
function fmtTime(t: string) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

function dayWord(date: string, now: number) {
  const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10)
  const tomorrow = new Date(now + 29.5 * 3600_000).toISOString().slice(0, 10)
  return date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : date.split('-').reverse().join('-')
}

function paymentLine(o: Order) {
  if (o.payment_method === 'cash') return '💵 Payment: <b>CASH ON DELIVERY</b>'
  if (o.payment_status === 'paid') return `✅ Payment: <b>UPI PAID</b>${o.upi_ref ? ` · UTR <code>${esc(o.upi_ref)}</code>` : ''}`
  if (o.upi_ref) return `📲 Payment: <b>UPI</b> · UTR <code>${esc(o.upi_ref)}</code> (check in bank app)`
  return '📲 Payment: <b>UPI</b> · waiting for UTR'
}

export function orderMessage(o: Order, items: Item[], store: Store, now = Date.now()) {
  const express = o.delivery_type === 'express'
  const when = express && o.express_by
    ? `deliver by <b>${clock(o.express_by)}</b>`
    : `${dayWord(o.delivery_date, now)} ${fmtTime(store.slot_start)}–${fmtTime(store.slot_end)}`
  const head = express
    ? `🚨🚨 <b>URGENT — EXPRESS ORDER</b> 🚨🚨\n⚡ <b>${esc(o.order_number)}</b> · ${when}`
    : `🛍️ <b>New order ${esc(o.order_number)}</b> · ${when}`

  const map = o.lat != null && o.lng != null ? ` · <a href="https://maps.google.com/?q=${o.lat},${o.lng}">Map</a>` : ''
  const km = o.distance_km != null ? ` (${Number(o.distance_km).toFixed(1)} km)` : ''
  const lines = [
    head,
    `🕐 Ordered: ${stamp(o.created_at)}`,
    '',
    `👤 <b>${esc(o.customer_name)}</b> · 📞 ${esc(o.customer_phone)}`,
  ]
  if (o.ordered_by_phone) lines.push(`🙋 Ordered for them by ${esc(o.ordered_by_name)} · ${esc(o.ordered_by_phone)}`)
  lines.push(`📍 ${esc(o.address)}, ${esc(o.area)}${km}${map}`, '', '🛒 <b>Items:</b>')
  for (const i of items) {
    lines.push(`• ${esc(i.name_snapshot)} × ${i.quantity} = ${rupee(i.line_total)}${i.note ? ` (${esc(i.note)})` : ''}`)
  }

  const fees = [`Subtotal ${rupee(o.subtotal)}`, `Delivery ${o.delivery_fee ? rupee(o.delivery_fee) : 'FREE'}`]
  if (o.express_fee) fees.push(`Express ${rupee(o.express_fee)}`)
  if (o.packaging_fee) fees.push(`Packing ${rupee(o.packaging_fee)}`)
  if (Number(o.wallet_used) > 0) fees.push(`Jholzo Money −${rupee(o.wallet_used)}`)
  lines.push(fees.join(' · '), `💰 <b>TOTAL ${rupee(o.total)}</b>`, paymentLine(o))
  if (!o.allow_substitute) lines.push('🚫 No substitutes')
  if (o.note) lines.push(`📝 Note: ${esc(o.note)}`)
  return lines.join('\n')
}

export function utrMessage(o: Order) {
  return [
    `💳 <b>UTR received — ${esc(o.order_number)}</b>`,
    `UTR: <code>${esc(o.upi_ref)}</code>`,
    `Amount: <b>${rupee(o.total)}</b> · ${esc(o.customer_name)} · ${esc(o.customer_phone)}`,
    '👉 Check it in the bank app, then mark Paid in Admin.',
  ].join('\n')
}
