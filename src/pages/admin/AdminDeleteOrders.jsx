import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Search, Trash2 } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import DeleteOrdersDialog from '../../components/DeleteOrdersDialog.jsx'
import { lcard, lfield } from '../../components/ui.js'
import { adminListOrders } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, cleanPhone, dateStr, fmtDateTime, rupee } from '../../lib/format.js'

const RANGES = [
  ['all', 'All'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
]

function inRange(iso, range) {
  const day = dateStr(new Date(iso))
  const today = dateStr()
  if (range === 'today') return day === today
  if (range === 'yesterday') return day === addDays(today, -1)
  if (range === 'week') return day >= addDays(today, -6)
  return true
}

// Test or demo orders out of the database for good (update 029), so they count nowhere.
export default function AdminDeleteOrders() {
  const { data: orders = [], error } = useData(adminListOrders)
  const [q, setQ] = useState('')
  const [range, setRange] = useState('all')
  const [picked, setPicked] = useState(() => new Set())
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState('')

  const query = q.trim().toLowerCase()
  const digits = cleanPhone(q)
  const shown = orders.filter((o) =>
    inRange(o.created_at, range) &&
    (!query ||
      o.order_number.toLowerCase().includes(query.replace(/^#/, '')) ||
      o.customer_name.toLowerCase().includes(query) ||
      (o.ordered_by_name ?? '').toLowerCase().includes(query) ||
      (digits.length >= 4 && (o.customer_phone.includes(digits) || (o.ordered_by_phone ?? '').includes(digits)))),
  )
  const chosen = orders.filter((o) => picked.has(o.id))
  const toggle = (id) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const allShown = shown.length > 0 && shown.every((o) => picked.has(o.id))
  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Delete orders</h1>
        <p className="text-sm text-neutral-600">
          For test or demo orders. A deleted order is gone from the database and counts nowhere: sales, daily summary,
          reports, top items, customers, Jholzo Money. Real orders: cancel them instead.
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {done && <p className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800"><Check size={17} /> {done}</p>}

      <label className="relative block">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, name or phone" className={`${lfield} pl-10`} />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {RANGES.map(([k, label]) => <button key={k} type="button" onClick={() => setRange(k)} className={chip(range === k)}>{label}</button>)}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">{shown.length} order{shown.length === 1 ? '' : 's'}</span>
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => setPicked(allShown ? new Set([...picked].filter((id) => !shown.some((o) => o.id === id))) : new Set([...picked, ...shown.map((o) => o.id)]))}
            className="font-semibold text-neutral-700 underline underline-offset-4"
          >
            {allShown ? 'Unselect these' : 'Select these'}
          </button>
        )}
      </div>

      <ul className={`${lcard} divide-y divide-neutral-100`}>
        {shown.map((o) => {
          const on = picked.has(o.id)
          return (
            <li key={o.id}>
              <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${on ? 'bg-red-50' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="peer sr-only" />
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-red-600 bg-red-600 text-white' : 'border-neutral-300'}`}>
                  {on && <Check size={15} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-bold">#{o.order_number} <StatusBadge status={o.status} /></span>
                  <span className="block truncate text-sm text-neutral-600">
                    {o.customer_name} · {o.customer_phone}{o.ordered_by_phone ? ` · by ${o.ordered_by_name}` : ''}
                  </span>
                  <span className="block text-xs text-neutral-500">{fmtDateTime(o.created_at)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{rupee(o.total)}</span>
                  <Link to={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-neutral-500 underline">Open</Link>
                </span>
              </label>
            </li>
          )
        })}
        {!shown.length && <li className="p-6 text-center text-sm text-neutral-500">{orders.length ? 'No orders match.' : 'No orders yet.'}</li>}
      </ul>

      {chosen.length > 0 && (
        <div className="sticky bottom-20 z-10 sm:bottom-4">
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-base font-bold text-white shadow-lg"
          >
            <Trash2 size={19} /> Delete {chosen.length} order{chosen.length === 1 ? '' : 's'} for good
          </button>
        </div>
      )}

      {asking && (
        <DeleteOrdersDialog
          orders={chosen}
          onClose={() => setAsking(false)}
          onDone={(res) => {
            setAsking(false)
            setPicked(new Set())
            setDone(`Deleted ${res.orders} order${res.orders === 1 ? '' : 's'}${res.customers ? ` and ${res.customers} customer${res.customers === 1 ? '' : 's'} with no other orders` : ''}.`)
          }}
        />
      )}
    </div>
  )
}
