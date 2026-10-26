import { dayLabel, fmtDateTime, fmtTime, rupee } from './format.js'

export const waLink = (number, text = '') =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const toWa = (phone10) => `91${phone10}`

const trackUrl = (order) => `${window.location.origin}/track/${order.order_number}`
const itemLines = (items) =>
  items.map((i) => `- ${i.name_snapshot} x${i.quantity} = ${rupee(i.line_total)}${i.note ? ` (${i.note})` : ''}`)

// Bill sent to the customer on WhatsApp after delivery.
export function billMessage({ order, items }) {
  const paid = order.payment_method === 'cash' ? `Cash ${rupee(order.cash_collected || order.total)}` : `UPI ${rupee(order.total)}`
  return [
    `*Dergaon Hub – Bill #${order.order_number}*`,
    fmtDateTime(order.completed_at ?? new Date().toISOString()),
    '',
    ...itemLines(items),
    `Delivery charge: ${order.delivery_fee ? rupee(order.delivery_fee) : 'FREE'}`,
    ...(order.packaging_fee ? [`Packaging charge: ${rupee(order.packaging_fee)}`] : []),
    '-------------------------',
    `*Total: ${rupee(order.total)}*`,
    `Paid: ${paid}`,
    '',
    `Bill (PDF): ${window.location.origin}/bill/${order.order_number}`,
    '',
    'Thank you for shopping with Dergaon Hub! If anything is wrong, report it here:',
    `${window.location.origin}/report/${order.order_number}`,
  ].join('\n')
}

// Messages to the customer while the order is on its way. Same words as the WhatsApp
// templates used by the notify-whatsapp Edge Function (see supabase/README.md).
const firstName = (order) => order.customer_name.split(' ')[0] || 'there'
function slotWords(order, store) {
  const day = dayLabel(order.delivery_date)
  const when = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : `on ${day}`
  return `${when} between ${fmtTime(store.slot_start)} and ${fmtTime(store.slot_end)}`
}

// "Order placed" goes to whoever ordered (for someone else: the orderer); rider messages go to the receiver.
export const messagePhone = (kind, order) => (kind === 'placed' && order.ordered_by_phone) || order.customer_phone

export function customerMessage(kind, { order, store }) {
  const name = firstName(order)
  const total = rupee(order.total)
  if (kind === 'placed') {
    const orderer = order.ordered_by_phone ? order.ordered_by_name.split(' ')[0] || 'there' : name
    return [
      `Hello ${orderer}, your Dergaon Hub order #${order.order_number}${order.ordered_by_phone ? ` for ${order.customer_name}` : ''} is placed successfully ✅`,
      `It will be delivered ${slotWords(order, store)}. Total: ${total}.`,
      '',
      `Track your order: ${trackUrl(order)}`,
    ].join('\n')
  }
  if (kind === 'on_the_way') {
    return `Hello ${name}, our rider has left with your Dergaon Hub order #${order.order_number} 🛵\nYou will get it in 10–15 minutes. Please keep ${total} ready (cash or UPI).`
  }
  return `Hello ${name}, our rider is arriving soon with your Dergaon Hub order #${order.order_number} 📍\nYou will get it in 10–15 minutes. Please keep ${total} ready (cash or UPI).`
}
