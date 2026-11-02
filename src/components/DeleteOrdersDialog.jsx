import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { lbtnOutline, lfield } from './ui.js'
import { adminDeleteOrders } from '../lib/store.js'
import { rupee } from '../lib/format.js'

// The database answers "function not found" until update 029 is run.
const friendly = (msg) =>
  /admin_delete_orders|schema cache|does not exist/i.test(msg ?? '')
    ? 'Run supabase/migrations/029_admin_delete_orders.sql in Supabase first.'
    : msg

// Last step before orders leave the database for good: type DELETE to confirm.
// onDone({ orders, customers }) after they are deleted.
export default function DeleteOrdersDialog({ orders, onClose, onDone }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const ok = typed.trim().toUpperCase() === 'DELETE'

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      onDone(await adminDeleteOrders(orders.map((o) => o.id)))
    } catch (err) {
      setError(friendly(err.message))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertTriangle size={22} /></span>
          <h2 className="text-lg font-bold leading-tight">
            Delete {orders.length === 1 ? `order #${orders[0].order_number}` : `${orders.length} orders`} for good?
          </h2>
        </div>
        <p className="mt-3 text-sm text-neutral-600">
          {orders.length === 1 ? 'It is' : 'They are'} removed from the database and count nowhere: sales, daily summary,
          reports, top items, customers and Jholzo Money. Customers with no other orders are removed too.
          <b className="text-neutral-900"> This cannot be undone.</b> Use it only for test or demo orders.
        </p>
        <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-neutral-50 p-3 text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex justify-between gap-2">
              <span className="truncate">#{o.order_number} · {o.customer_name}</span>
              <span className="shrink-0 font-semibold">{rupee(o.total)}</span>
            </li>
          ))}
        </ul>
        {orders.length > 1 && <p className="mt-1 text-right text-xs text-neutral-500">Together {rupee(total)}</p>}
        <label className="mt-4 block text-sm font-semibold">
          Type <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-700">DELETE</span> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" className={`${lfield} mt-1.5 font-mono`} placeholder="DELETE" />
        </label>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${lbtnOutline} flex-1`}>Keep</button>
          <button
            type="button"
            onClick={remove}
            disabled={!ok || busy}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white disabled:bg-red-200"
          >
            <Trash2 size={17} /> {busy ? 'Deleting…' : 'Delete for good'}
          </button>
        </div>
      </div>
    </div>
  )
}
