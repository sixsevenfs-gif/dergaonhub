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
    ...(order.location ? [`Map: https://maps.google.com/?q=${order.location.lat},${order.location.lng}`] : []),
    `Slot: ${slotText(order.delivery_date, store)}`,
    '',
    'Items:',
    ...itemLines(items),
    '',
    `Subtotal: ${rupee(order.subtotal)}`,
    `Delivery charge: ${rupee(order.delivery_fee)}`,
    ...(order.packaging_fee ? [`Packaging charge: ${rupee(order.packaging_fee)}`] : []),
    `Total: ${rupee(order.total)}`,
    `Payment: ${order.payment_method === 'cash' ? 'Cash on delivery' : 'UPI on delivery'}`,
    `Similar brand OK: ${order.allow_substitute ? 'Yes' : 'No'}`,
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
    `Delivery charge: ${rupee(order.delivery_fee)}`,
    ...(order.packaging_fee ? [`Packaging charge: ${rupee(order.packaging_fee)}`] : []),
    '-------------------------',
    `*Total: ${rupee(order.total)}*`,
    `Paid: ${paid} ✅`,
    '',
    'Thank you! If anything is wrong, report it here:',
    trackUrl(order),
  ].join('\n')
}
