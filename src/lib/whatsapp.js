import { fmtDateTime, rupee, slotText } from './format.js'

export const waLink = (number, text = '') =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const toWa = (phone10) => `91${phone10}`

const trackUrl = (order) => `${window.location.origin}/track/${order.order_number}`
const itemLines = (items) =>
  items.map((i) => `- ${i.name_snapshot} x${i.quantity} = ${rupee(i.line_total)}${i.note ? ` (${i.note})` : ''}`)

// Order message the customer can send to the store. The saved order is the truth; this is a convenience.
export function orderMessage({ order, items, store }) {
  return [
    `New order ${order.order_number} – Dergaon Hub`,
    '',
    `Name: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    `Address: ${order.address}, ${order.area}`,
    ...(order.location ? [`Map: https://maps.google.com/?q=${order.location.lat},${order.location.lng} (${order.distance_km} km)`] : []),
    `Slot: ${slotText(order.delivery_date, store)}`,
    '',
    'Items:',
    ...itemLines(items),
    '',
    `Subtotal: ${rupee(order.subtotal)}`,
    `Delivery fee: ${rupee(order.delivery_fee)}`,
    `Total: ${rupee(order.total)}`,
    `Payment: ${order.payment_method === 'cash' ? 'Cash on delivery' : 'UPI on delivery'}`,
    `Similar brand chalega: ${order.allow_substitute ? 'Haan' : 'Nahi'}`,
    ...(order.note ? [`Note: ${order.note}`] : []),
    '',
    `Track: ${trackUrl(order)}`,
  ].join('\n')
}

// Bill sent to the customer on WhatsApp after delivery.
export function billMessage({ order, items }) {
  const paid = order.payment_method === 'cash' ? `Cash ${rupee(order.cash_collected || order.total)}` : `UPI ${rupee(order.total)}`
  return [
    `*Dergaon Hub – Bill #${order.order_number}*`,
    fmtDateTime(order.completed_at ?? new Date().toISOString()),
    '',
    ...itemLines(items),
    `Delivery fee: ${rupee(order.delivery_fee)}`,
    '-------------------------',
    `*Total: ${rupee(order.total)}*`,
    `Paid: ${paid} ✅`,
    '',
    'Thank you! Koi problem ho toh is link pe report karo:',
    trackUrl(order),
  ].join('\n')
}
