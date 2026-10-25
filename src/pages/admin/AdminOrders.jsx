import { useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lcard, lfield } from '../../components/ui.js'
import { adminListOrders, adminListShops } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dayLabel, fmtDateTime, rupee } from '../../lib/format.js'

export default function AdminOrders() {
  const [f, setF] = useState({ shopId: '', status: '', date: '' })
  const { data: orders = [] } = useData(() => adminListOrders(f), [f.shopId, f.status, f.date])
  const { data: shops = [] } = useData(adminListShops)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Orders</h1>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select value={f.shopId} onChange={set('shopId')} className={lfield}>
          <option value="">All shops</option>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={f.status} onChange={set('status')} className={lfield}>
          <option value="">All statuses</option>
          {['placed', 'confirmed', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={f.date} onChange={set('date')} className={lfield} />
      </div>
      <p className="text-sm text-neutral-500">{orders.length} orders · {rupee(orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0))}</p>
      <div className={`${lcard} divide-y divide-neutral-100`}>
        {orders.map((o) => (
          <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1">
              <span className="flex flex-wrap items-center gap-2 font-semibold">#{o.order_number} <StatusBadge status={o.status} /></span>
              <span className="block text-sm text-neutral-500">{o.shop_name} · {o.customer_name} · {o.customer_phone}</span>
              <span className="block text-xs text-neutral-400">
                Placed {fmtDateTime(o.created_at)} · {o.type} {dayLabel(o.delivery_date)}{o.cancel_reason ? ` · ${o.cancel_reason}` : ''}
              </span>
            </span>
            <span className="font-bold">{rupee(o.total)}</span>
          </Link>
        ))}
        {!orders.length && <p className="p-4 text-neutral-500">Koi order nahi.</p>}
      </div>
    </div>
  )
}
