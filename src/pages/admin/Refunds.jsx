import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, HandCoins } from 'lucide-react'
import { lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminRefunds, recordRefund } from '../../lib/store.js'
import { fmtDateTime, rupee, timeAgo } from '../../lib/format.js'
import { REFUND_WAY_LABEL, refundDue, refundWhy } from '../../lib/refunds.js'
import { useData } from '../../lib/useData.js'

// Money to give back on orders paid online (database update 072).

/** On an order's page: how much to give back and the buttons (owner), or what was given back. */
export function RefundBox({ order, isOwner, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const due = refundDue(order)
  const given = Number(order.refunded_amount) || 0
  if (!due && !given) return null

  async function give(how) {
    const way = how === 'wallet' ? 'added to their Jholzo Money now' : `given back by ${REFUND_WAY_LABEL[how]}`
    if (!window.confirm(`${rupee(due)} ${way} for order #${order.order_number}?`)) return
    setBusy(true)
    setError('')
    try {
      await recordRefund(order.id, how, note)
      setNote('')
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {given > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>
            <b>{rupee(given)} given back</b> by {REFUND_WAY_LABEL[order.refund_how] ?? order.refund_how}
            {order.refunded_at && ` on ${fmtDateTime(order.refunded_at)}`}{order.refund_note && ` · ${order.refund_note}`}
          </span>
        </p>
      )}
      {due > 0 && !isOwner && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Paid {rupee(order.paid_amount)} online. {refundWhy(order)}, so <b>{rupee(due)}</b> goes back to the customer. The owner does this.
        </p>
      )}
      {due > 0 && isOwner && (
        <section className="space-y-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-2 text-red-900">
            <HandCoins size={20} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-black">Give back {rupee(due)}</h2>
              <p className="text-sm">
                Paid {rupee(order.paid_amount)} by UPI{order.paid_at && ` on ${fmtDateTime(order.paid_at)}`}{order.upi_ref && ` (ref ${order.upi_ref})`}.
                {' '}{refundWhy(order)}{order.status !== 'cancelled' && ` (now ${rupee(order.total)})`}.
              </p>
            </div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="UPI reference or a note (optional)" className={`${lfield} bg-white`} />
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={busy} onClick={() => give('upi')} className={`${lbtnDark} h-12`}>Sent back by UPI</button>
            <button type="button" disabled={busy} onClick={() => give('cash')} className={`${lbtnOutline} h-12`}>Gave cash</button>
            <button type="button" disabled={busy || !(order.orderer_id ?? order.customer_id)} onClick={() => give('wallet')} className={`${lbtnOutline} h-12`}
              title={(order.orderer_id ?? order.customer_id) ? 'Added to their balance at once; they use it on the next order' : 'No customer account on this order'}>
              As Jholzo Money
            </button>
          </div>
          <p className="text-xs text-red-800">Send it first (PhonePe / GPay to {order.customer_phone}), then tap. Jholzo Money is added at once.</p>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        </section>
      )}
    </div>
  )
}

/** The owner's Home: every order paid online with money still to give back. Nothing when there is none. */
export function RefundsCard() {
  const { data } = useData(adminRefunds)
  const due = data?.due ?? []
  if (!due.length) return null
  const total = due.reduce((s, o) => s + Number(o.due), 0)
  return (
    <section>
      <h2 className="text-lg font-bold text-red-700">Money to give back ({due.length}) · {rupee(total)}</h2>
      <p className="text-sm text-neutral-500">Paid by UPI, then cancelled or made cheaper. Send it back, then mark it on the order.</p>
      <div className="mt-2 space-y-2">
        {due.map((o) => (
          <Link key={o.id} to={`/admin/orders/${o.id}`} className={`${lcard} flex items-center gap-3 border-red-200 p-4`}>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">#{o.order_number} <span className="font-normal text-neutral-500">{o.customer_name} · {o.customer_phone}</span></span>
              <span className="block text-sm text-neutral-500">{refundWhy(o)} · paid {rupee(o.paid_amount)} · {timeAgo(o.created_at)}</span>
            </span>
            <span className="text-lg font-black text-red-700">{rupee(o.due)}</span>
            <ChevronRight size={18} className="shrink-0 text-neutral-400" />
          </Link>
        ))}
      </div>
    </section>
  )
}
