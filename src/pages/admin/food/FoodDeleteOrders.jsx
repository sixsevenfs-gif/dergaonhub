import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Lock, Search, Trash2 } from 'lucide-react'
import DeleteCodeGate from '../../../components/DeleteCodeGate.jsx'
import { deleteCode, lockDelete } from '../../../lib/deleteCode.js'
import { lcard, lfield } from '../../../components/ui.js'
import { foodOrders } from '../../../lib/foodAdmin.js'
import { deletedInDemo } from '../../../lib/foodDelete.js'
import { useData } from '../../../lib/useData.js'
import { addDays, cleanPhone, dateStr, rupee } from '../../../lib/format.js'
import { FoodStatus, NeedsUpdate } from './FoodBits.jsx'
import FoodDeleteDialog from './FoodDeleteDialog.jsx'

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

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Owner: test or demo food orders out of the database for good (update 075), the same way as grocery's Delete
// orders. Opens only with the delete code (the same one), which the database checks.
export default function FoodDeleteOrders() {
  const [unlocked, setUnlocked] = useState(() => !!deleteCode())
  if (!unlocked) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black">Delete food orders</h1>
        <div className={`${lcard} p-6`}><DeleteCodeGate onUnlocked={() => setUnlocked(true)} /></div>
      </div>
    )
  }
  return <List onLock={() => { lockDelete(); setUnlocked(false) }} />
}

function List({ onLock }) {
  // The last 90 days (test orders are usually recent); the newest first.
  const { data, error, reload } = useData(() => foodOrders(90))
  const [q, setQ] = useState('')
  const [range, setRange] = useState('all')
  const [picked, setPicked] = useState(() => new Set())
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState('')

  if (data === null) return <NeedsUpdate n="064" what="food orders" />
  const orders = (data ?? []).filter((o) => !deletedInDemo(o.id))
  const query = q.trim().toLowerCase()
  const digits = cleanPhone(q)
  const shown = orders.filter((o) =>
    inRange(o.created_at, range) &&
    (!query ||
      o.order_number.toLowerCase().includes(query.replace(/^#/, '')) ||
      (o.customer_name ?? '').toLowerCase().includes(query) ||
      (o.restaurant_name ?? '').toLowerCase().includes(query) ||
      (digits.length >= 4 && (o.customer_phone ?? '').includes(digits))),
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Delete food orders</h1>
          <button type="button" onClick={onLock} className="flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 text-sm font-semibold">
            <Lock size={15} /> Lock
          </button>
        </div>
        <p className="text-sm text-neutral-600">
          For test or demo food orders. A deleted order is gone from the database and counts nowhere: food sales, payouts,
          coupons used, reports and the CSV. The customer no longer sees it in their app. Real orders: cancel them instead.
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {done && <p className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800"><Check size={17} /> {done}</p>}

      <label className="relative block">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, name, phone or restaurant" className={`${lfield} pl-10`} />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {RANGES.map(([k, label]) => <button key={k} type="button" onClick={() => setRange(k)} className={chip(range === k)}>{label}</button>)}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">{shown.length} order{shown.length === 1 ? '' : 's'}</span>
        {shown.length > 0 && (
          <button type="button" className="font-semibold text-neutral-700 underline underline-offset-4"
            onClick={() => setPicked(allShown ? new Set([...picked].filter((id) => !shown.some((o) => o.id === id))) : new Set([...picked, ...shown.map((o) => o.id)]))}>
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
                  <span className="flex flex-wrap items-center gap-2 font-bold">{o.order_number} <FoodStatus status={o.status} /></span>
                  <span className="block truncate text-sm text-neutral-600">{o.customer_name} · {o.customer_phone} · {o.restaurant_name}</span>
                  <span className="block text-xs text-neutral-500">{when(o.created_at)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{rupee(o.total)}</span>
                  <Link to={`/admin/food/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-neutral-500 underline">Open</Link>
                </span>
              </label>
            </li>
          )
        })}
        {!shown.length && <li className="p-6 text-center text-sm text-neutral-500">{orders.length ? 'No orders match.' : 'No food orders in the last 90 days.'}</li>}
      </ul>

      {chosen.length > 0 && (
        <div className="sticky bottom-20 z-10 sm:bottom-4">
          <button type="button" onClick={() => setAsking(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-base font-bold text-white shadow-lg">
            <Trash2 size={19} /> Delete {chosen.length} food order{chosen.length === 1 ? '' : 's'} for good
          </button>
        </div>
      )}

      {asking && (
        <FoodDeleteDialog
          orders={chosen}
          onClose={() => setAsking(false)}
          onDone={(res) => {
            setAsking(false)
            setPicked(new Set())
            setDone(`Deleted ${res.orders} food order${res.orders === 1 ? '' : 's'}.`)
            reload()
          }}
        />
      )}
    </div>
  )
}
