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
    ? `leave the store by <b>${clock(o.express_by)}</b>`
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

// Why it was cancelled, in plain words (cancel_reason is free text when the store cancels).
function cancelReason(o: Order) {
  const r = String(o.cancel_reason ?? '').trim()
  if (r === 'Cancelled by customer') return '🙋 By the customer'
  if (r === 'Not paid in time') return '⏱️ UPI not paid in time'
  if (r === 'Expired') return '🗓️ Expired (not delivered for days)'
  if (r === 'No-show') return '📵 Customer not answering (no-show)'
  return r ? `🏪 By the store: ${esc(r)}` : '🏪 By the store'
}

export function cancelMessage(o: Order, items: Item[]) {
  const lines = [
    `❌ <b>Order cancelled — ${esc(o.order_number)}</b>`,
    cancelReason(o),
    `👤 ${esc(o.customer_name)} · 📞 ${esc(o.customer_phone)}`,
    `💰 ${rupee(o.total)} · ${o.payment_method === 'cash' ? 'Cash on delivery' : 'UPI'} · ordered ${stamp(o.created_at)}`,
  ]
  if (items.length) lines.push(`🛒 ${items.map((i) => `${esc(i.name_snapshot)} × ${i.quantity}`).join(', ')}`)
  if (o.payment_status === 'paid') lines.push('⚠️ <b>Paid by UPI: refund the customer.</b>')
  if (o.dispatch) lines.push('🛵 The rider was already on the way.')
  return lines.join('\n')
}

// Jholzo Food (update 064): a new restaurant order, and a cancelled one.
type FoodItem = { name: string; variant?: string; qty: number; line_total: number; from_store?: boolean }
const dish = (i: FoodItem) => `${esc(i.name)}${i.variant ? ` (${esc(i.variant)})` : ''}`

export function foodOrderMessage(o: Order, items: FoodItem[], pickup: { phone?: string; address?: string } = {}) {
  const map = o.lat != null && o.lng != null ? ` · <a href="https://maps.google.com/?q=${o.lat},${o.lng}">Map</a>` : ''
  const lines = [
    `🍲 <b>New FOOD order ${esc(o.order_number)}</b>`,
    `🕐 Ordered: ${stamp(o.created_at)}`,
    `🏪 <b>${esc(o.restaurant_name)}</b>${pickup.phone ? ` · 📞 ${esc(pickup.phone)}` : ''}`,
  ]
  if (pickup.address || o.restaurant_address) lines.push(`   Pickup: ${esc(pickup.address || o.restaurant_address)}`)
  lines.push('', `👤 <b>${esc(o.customer_name)}</b> · 📞 ${esc(o.customer_phone)}`, `📍 ${esc(o.address)}, ${esc(o.area)}${map}`, '', '🍽️ <b>Dishes:</b>')
  for (const i of items.filter((x) => !x.from_store)) lines.push(`• ${dish(i)} × ${i.qty} = ${rupee(i.line_total)}`)
  // Cold drinks (update 071) come from Jholzo's store, not the restaurant.
  const drinks = items.filter((x) => x.from_store)
  if (drinks.length) {
    lines.push('🥤 <b>From Jholzo store</b> (rider picks up at the shop):')
    for (const i of drinks) lines.push(`• ${dish(i)} × ${i.qty} = ${rupee(i.line_total)}`)
  }
  const store = Number(o.store_items_total ?? 0)
  const fees = [`Dishes ${rupee(Number(o.items_total) - store)}`]
  if (store) fees.push(`Drinks ${rupee(store)}`)
  if (o.packing_fee) fees.push(`Packing ${rupee(o.packing_fee)}`)
  fees.push(`Delivery ${o.delivery_fee ? rupee(o.delivery_fee) : 'FREE'}`)
  if (o.platform_fee) fees.push(`Platform ${rupee(o.platform_fee)}`)
  if (o.gst) fees.push(`GST ${rupee(o.gst)}`)
  if (o.discount) fees.push(`🎟️ ${esc(o.coupon_code)} −${rupee(o.discount)}`)
  lines.push(fees.join(' · '), `💰 <b>TOTAL ${rupee(o.total)}</b> · ${o.payment_method === 'cash' ? 'CASH' : 'UPI'} on delivery`,
    `🏪 Pay the restaurant: <b>${rupee(o.menu_total)}</b>`)
  if (o.note) lines.push(`📝 Note: ${esc(o.note)}`)
  lines.push('👉 Call the restaurant, then Confirm in Admin → Food.')
  return lines.join('\n')
}

export function foodCancelMessage(o: Order, items: FoodItem[]) {
  const lines = [
    `❌ <b>Food order cancelled — ${esc(o.order_number)}</b>`,
    cancelReason(o),
    `🏪 ${esc(o.restaurant_name)} · 👤 ${esc(o.customer_name)} · 📞 ${esc(o.customer_phone)}`,
    `💰 ${rupee(o.total)} · ordered ${stamp(o.created_at)}`,
  ]
  if (items.length) lines.push(`🍽️ ${items.map((i) => `${dish(i)} × ${i.qty}`).join(', ')}`)
  if (o.confirmed_at) lines.push('⚠️ The restaurant was already told: call them to stop it.')
  return lines.join('\n')
}

/* ---------- Help & support and app customers (update 069) ---------- */

export const TOPIC: Record<string, string> = {
  missing_item: 'Item missing', wrong_item: 'Wrong item', quality: 'Taste or quality', spilled: 'Spilled or damaged',
  damaged: 'Damaged or expired', late: 'Late delivery', rider: 'Rider', payment: 'Payment or bill', cancel: 'Cancel order',
  login: 'Login or OTP', app: 'App problem', wallet: 'Jholzo Money', account: 'My account', suggestion: 'Idea or feedback',
  partner: 'Partnership', other: 'Something else',
}
const KIND: Record<string, string> = { food: '🍲 Food', grocery: '🛒 Grocery', other: '💬 Other' }
const APP: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Website' }
const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const photos = (list: string[] = []) => (list.length ? `📷 ${list.length} photo${list.length > 1 ? 's' : ''}` : '')
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

export function supportNewMessage(t: Row, first?: Row) {
  const urgent = t.priority === 'high'
  return [
    `${urgent ? '🆘' : '🙋'} <b>New help request ${esc(t.ticket_number)}</b>${urgent ? ' · URGENT' : ''}`,
    `${KIND[t.kind] ?? esc(t.kind)} · ${esc(TOPIC[t.topic] ?? t.topic)}${t.order_number ? ` · ${esc(t.order_number)}` : ''}${t.restaurant_name ? ` (${esc(t.restaurant_name)})` : ''}`,
    `👤 ${esc(t.customer_name || 'Customer')} · 📞 ${esc(t.customer_phone)}${APP[t.source] ? ` · ${APP[t.source]}` : ''}`,
    first?.body ? `“${esc(clip(first.body))}”` : '',
    photos(first?.photos),
    `👉 https://jholzo.com/admin/support/${t.id}`,
  ].filter(Boolean).join('\n')
}

export function supportReplyMessage(t: Row, m: Row) {
  return [
    `💬 <b>${esc(t.ticket_number)}</b> · ${esc(t.customer_name || t.customer_phone)} wrote again`,
    m.body ? `“${esc(clip(m.body))}”` : '',
    photos(m.photos),
    `👉 https://jholzo.com/admin/support/${t.id}`,
  ].filter(Boolean).join('\n')
}

export function appUserMessage(i: Row, login: Row) {
  const app = APP[i.platform] ?? 'App'
  return [
    `📱 <b>New app customer</b> · ${app}`,
    `👤 ${esc(i.name || 'No name yet')} · 📞 ${esc(login.phone)}`,
    `${esc(i.device_model || app)}${i.app_version ? ` · app ${esc(i.app_version)}` : ''} · ${stamp(login.at)}`,
  ].join('\n')
}
