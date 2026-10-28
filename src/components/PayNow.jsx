import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BadgeCheck, Clock3, ShieldCheck, Smartphone, XCircle } from 'lucide-react'
import { btnAccent, card, field } from './ui.js'
import { submitUpiRef } from '../lib/store.js'
import { rupee } from '../lib/format.js'
import { upiLink } from '../lib/upi.js'

// "Pay now by UPI" on the order page. There is no gateway: the customer pays to the store's UPI ID,
// then types the UPI reference number (UTR); the admin checks it in the bank app and marks it paid.
// The wording never says "pending": the order is placed, the payment is being verified.
export default function PayNow({ order, store }) {
  const [qr, setQr] = useState('')
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const status = order.payment_status
  const link = store?.upi_id ? upiLink(order, store) : ''

  // QR for paying from another phone (useful when the order was placed on a computer).
  useEffect(() => {
    if (!link || status === 'paid' || status === 'verifying') return
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0B0B0B', light: '#FFFFFF' } }).then((url) => live && setQr(url))
    return () => {
      live = false
    }
  }, [link, status])

  if (order.payment_method !== 'upi_now' || order.status === 'cancelled') return null

  if (status === 'paid') {
    return (
      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <BadgeCheck size={28} className="shrink-0 text-emerald-700" />
        <span>
          <span className="block font-semibold text-emerald-700">Payment confirmed ✓</span>
          <span className="text-sm text-muted">We received {rupee(order.total)}. Your order is confirmed.</span>
        </span>
      </section>
    )
  }

  if (status === 'verifying') {
    return (
      <section className="mt-4 rounded-2xl border border-sky-400/40 bg-sky-500/10 p-4">
        <p className="flex items-center gap-2 font-semibold text-sky-700"><Clock3 size={20} /> Payment received, verifying it</p>
        <p className="mt-1 text-sm text-sky-700/80">
          We are checking your payment with the bank. This usually takes under 10 minutes. We will send your order
          confirmation on WhatsApp as soon as it is confirmed.
        </p>
        <p className="mt-2 text-xs text-muted">UPI Ref No.: {order.upi_ref}</p>
      </section>
    )
  }

  const send = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await submitUpiRef(order.order_number, ref)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className={`${card} mt-4 space-y-3 p-4`}>
      {status === 'failed' ? (
        <p className="flex gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">
          <XCircle size={18} className="mt-0.5 shrink-0" /> We could not find your payment. Please pay again below, or call us.
        </p>
      ) : (
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={20} className="text-brand" /> One last step: pay {rupee(order.total)} by UPI</p>
      )}

      <a href={link} className={`${btnAccent} h-14 text-lg`}>
        <Smartphone size={20} /> Pay {rupee(order.total)} now
      </a>
      <p className="text-center text-xs text-muted">Opens GPay, PhonePe, Paytm or any UPI app · Paying to {store.upi_name || store.name} ({store.upi_id})</p>

      {qr && (
        <details className="rounded-xl border border-line p-3 text-sm">
          <summary className="cursor-pointer text-muted">Paying from another phone? Show QR code</summary>
          <img src={qr} alt="UPI QR code" className="mx-auto mt-3 w-52 rounded-xl" />
        </details>
      )}

      <form onSubmit={send} className="space-y-2 border-t border-line pt-3">
        <label className="block text-sm">
          <span className="font-semibold">After paying, enter the UPI Ref No. (UTR)</span>
          <span className="block text-xs text-muted">It is the 12-digit number shown in your UPI app after the payment.</span>
        </label>
        <div className="flex gap-2">
          <input value={ref} onChange={(e) => setRef(e.target.value)} inputMode="numeric" placeholder="e.g. 601723456789" className={`${field} h-12`} />
          <button type="submit" disabled={busy || ref.trim().length < 6} className="h-12 shrink-0 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-40">
            {busy ? '...' : 'I have paid'}
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </section>
  )
}
