import { useState } from 'react'
import { adminPayRider } from '../lib/store.js'
import { rupee } from '../lib/format.js'

// The owner pays a rider who is owed money (they paid the shop for orders the customer paid online), then records
// it here so the rider's balance goes back to zero (update 047).
export default function PayRider({ row, date, onError }) {
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const owed = -Number(row.to_return)
  if (!(owed > 0)) return null
  const pay = async (method) => {
    setBusy(true)
    try {
      await adminPayRider(row.rider_id, date, owed, method)
      setAsk(false)
    } catch (err) {
      onError(err.message)
    }
    setBusy(false)
  }
  if (!ask) {
    return (
      <button type="button" onClick={() => setAsk(true)} className="mt-1.5 rounded-lg border border-sky-600/40 px-2.5 py-1 text-xs font-semibold text-sky-700">
        I paid {row.name} {rupee(owed)}
      </button>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <span>Paid {row.name} {rupee(owed)} by</span>
      <button type="button" disabled={busy} onClick={() => pay('upi')} className="rounded-lg bg-neutral-900 px-2.5 py-1 font-semibold text-white disabled:opacity-50">UPI</button>
      <button type="button" disabled={busy} onClick={() => pay('cash')} className="rounded-lg bg-neutral-900 px-2.5 py-1 font-semibold text-white disabled:opacity-50">Cash</button>
      <button type="button" onClick={() => setAsk(false)} className="font-semibold text-neutral-500 underline">Cancel</button>
    </div>
  )
}
