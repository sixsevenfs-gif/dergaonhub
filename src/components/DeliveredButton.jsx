import { WhatsAppIcon } from './icons.jsx'
import { completeOrder } from '../lib/store.js'
import { billMessage, toWa, waLink } from '../lib/whatsapp.js'

// One tap: marks the order delivered and opens WhatsApp with the bill for the customer.
// It is a link (not a script) so phones never block WhatsApp from opening.
export default function DeliveredButton({ order, items, cash, className = '' }) {
  const collected = order.payment_method === 'cash' ? Number(cash ?? order.total) || order.total : 0
  const done = { ...order, status: 'completed', cash_collected: collected, completed_at: new Date().toISOString() }
  return (
    <a
      href={waLink(toWa(order.customer_phone), billMessage({ order: done, items }))}
      target="_blank"
      rel="noreferrer"
      onClick={() => completeOrder(order.id, collected)}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1FAF54] px-4 font-semibold text-white active:scale-[.99] ${className}`}
    >
      <WhatsAppIcon size={18} /> Delivered + send bill
    </a>
  )
}
