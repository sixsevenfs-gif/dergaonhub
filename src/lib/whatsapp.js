import { rupee, slotText } from './format.js'

export const waLink = (number, text = '') =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const toWa = (phone10) => `91${phone10}`

// Order message the customer sends to the shop. The database order is the truth; this is a convenience.
export function orderMessage({ order, items, shop }) {
  const lines = [
    `New order ${order.order_number} from dergaon.`,
    '',
    `Name: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    order.type === 'delivery' ? `Delivery: ${order.address}, ${order.area}` : 'Pickup from shop',
    `Slot: ${slotText(order.delivery_date, shop)}`,
    '',
    'Items:',
    ...items.map((i) => `- ${i.name_snapshot} x${i.quantity} = ${rupee(i.line_total)}${i.note ? ` (${i.note})` : ''}`),
    '',
    `Subtotal: ${rupee(order.subtotal)}`,
    ...(order.delivery_fee ? [`Delivery fee: ${rupee(order.delivery_fee)}`] : []),
    `Total: ${rupee(order.total)}`,
    `Payment: ${order.payment_method === 'cash' ? 'Cash on delivery' : 'UPI to shop'}`,
    ...(order.note ? [`Note: ${order.note}`] : []),
    '',
    `Track: ${window.location.origin}/track/${order.order_number}`,
  ]
  return lines.join('\n')
}
