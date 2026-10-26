import { useState } from 'react'
import { BadgeCheck, XCircle } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { setPaymentStatus } from '../../lib/store.js'
import { rupee } from '../../lib/format.js'
import { messagePhone, paymentMessage, toWa, waLink } from '../../lib/whatsapp.js'

const LABELS = {
  awaiting: ['Not paid yet', 'bg-neutral-100 text-neutral-600'],
  verifying: ['Check payment', 'bg-amber-100 text-amber-800'],
  paid: ['Paid online ✓', 'bg-green-100 text-green-800'],
  failed: ['Payment not received', 'bg-red-100 text-red-700'],
}

export const PaymentBadge = ({ order }) => {
  if (order.payment_method !== 'upi_now') return null
  const [label, cls] = LABELS[order.payment_status] ?? LABELS.awaiting
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
}

// "Pay now by UPI" orders: open your bank / UPI app, find this amount (and UPI Ref No.), then tap.
// After "Payment received", send the customer the confirmation on WhatsApp.
export default function PaymentCheck({ order, store, onPaid }) {
  const [error, setError] = useState('')
  if (order.payment_method !== 'upi_now') return null
  const set = (status) =>
    setPaymentStatus(order.id, status)
      .then(() => status === 'paid' && onPaid?.(order.id))
      .catch((err) => setError(err.message))
  const st = order.payment_status

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>UPI payment {rupee(order.total)}</b> <PaymentBadge order={order} />
      </div>
      <p className="text-neutral-600">
        {order.upi_ref ? <>UPI Ref No. (UTR): <b className="font-mono">{order.upi_ref}</b></> : 'The customer has not entered a UPI Ref No. yet.'}
        {' '}Check your bank or UPI app for {rupee(order.total)} before tapping.
      </p>
      {st !== 'paid' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set('paid')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-green-700 px-3 font-semibold text-white">
            <BadgeCheck size={16} /> Payment received
          </button>
          {st !== 'failed' && (
            <button type="button" onClick={() => set('failed')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 font-semibold text-red-600">
              <XCircle size={16} /> Not received
            </button>
          )}
        </div>
      ) : (
        <a
          href={waLink(toWa(messagePhone('placed', order)), paymentMessage(order, store))}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#1FAF54] px-3 font-semibold text-white"
        >
          <WhatsAppIcon size={16} /> Send confirmation on WhatsApp
        </a>
      )}
      {st === 'failed' && <p className="text-xs text-red-600">Marked not received. Above {rupee(store?.cod_limit ?? 350)} the order is not handed over until it is paid.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
