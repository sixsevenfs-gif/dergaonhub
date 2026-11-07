import { useState } from 'react'
import { Banknote, QrCode } from 'lucide-react'
import { partnerReturn } from '../../lib/store.js'
import { dayLabel, rupee } from '../../lib/format.js'
import UpiQr from './UpiQr.jsx'

// Cash given back has to reach the owner by this time the same evening.
export const CASH_BY = '9 PM'

// Buttons to give the owner's money back: by UPI (the store's QR with app buttons, amount filled in), or in cash to
// hand over by 9 PM. orderId: for one delivered order (update 045); empty for the whole balance.
export default function PayBack({ amount, date, store, riderName, orderId = null, orderNumber, onError }) {
  const [showQr, setShowQr] = useState(false)
  const [cashAsk, setCashAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const due = Math.round(Number(amount) * 100) / 100
  const pay = async (method) => {
    setBusy(true)
    onError('')
    try {
      await partnerReturn(date, due, method, orderId)
      setShowQr(false)
      setCashAsk(false)
    } catch (err) {
      onError(err.message)
    }
    setBusy(false)
  }
  const what = orderNumber ? `order #${orderNumber}` : 'all orders'

  return (
    <div className="space-y-2">
      {store.upi_id && (
        <button type="button" disabled={busy} onClick={() => setShowQr(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[15px] font-semibold text-white disabled:opacity-50">
          <QrCode size={18} /> Pay {rupee(due)} to admin by UPI
        </button>
      )}
      {cashAsk ? (
        <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-3 text-sm">
          <p>Hand <b>{rupee(due)}</b> cash to the admin <b>by {CASH_BY} today</b>. The admin marks it received.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => pay('cash')} className="h-11 flex-1 rounded-xl bg-orange-500 font-semibold text-ink disabled:opacity-50">Yes, I'll give cash</button>
            <button type="button" onClick={() => setCashAsk(false)} className="h-11 flex-1 rounded-xl border border-line font-semibold">Go back</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setCashAsk(true)} className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-muted">
          <Banknote size={16} /> Give cash to the admin instead (by {CASH_BY})
        </button>
      )}
      {showQr && (
        <UpiQr
          order={{ total: due, upi_note: `Jholzo return ${riderName ?? ''} ${orderNumber ?? date}`.replace(/\s+/g, ' ').trim() }} store={store}
          footnote={`Money back · ${what} · ${dayLabel(date)}`}
          tip={`Pay ${rupee(due)} from your UPI app, then tap “I paid”. The admin checks it in the bank.`}
          paidLabel={`I paid ${rupee(due)}`} apps
          onPaid={() => pay('upi')} onClose={() => setShowQr(false)}
        />
      )}
    </div>
  )
}
