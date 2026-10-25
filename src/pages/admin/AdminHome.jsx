import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import Toggle from '../../components/Toggle.jsx'
import { lcard } from '../../components/ui.js'
import { adminListComplaints, adminListOrders, adminStats, setPaused } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtClock, rupee, timeAgo } from '../../lib/format.js'

function Stat({ label, value, to, hot }) {
  return (
    <Link to={to} className={`${lcard} block p-4 ${hot ? 'border-2 border-neutral-900 shadow-[0_0_0_3px_#E8FF3A]' : ''}`}>
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </Link>
  )
}

export default function AdminHome() {
  const { data: stats } = useData(adminStats)
  const { data: newOrders = [] } = useData(() => adminListOrders({ status: 'placed' }))
  const { data: complaints = [] } = useData(() => adminListComplaints({ status: 'open' }))
  if (!stats) return null

  return (
    <div className="space-y-5">
      <section className={`${lcard} flex items-center justify-between gap-3 p-4`}>
        <span>
          <span className="block font-bold">{stats.paused ? 'Store band hai (paused)' : 'Store khula hai'}</span>
          <span className="text-sm text-neutral-500">Baarish, chhutti ya bheed ho toh pause karo. Customers order nahi kar payenge.</span>
        </span>
        <Toggle checked={!stats.paused} onChange={(open) => setPaused(!open)} label="Store open" />
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New orders" value={stats.newOrders} to="/admin/orders" hot={stats.newOrders > 0} />
        <Stat label="Today's deliveries" value={stats.todayOrders} to="/admin/delivery" />
        <Stat label="Today's value" value={rupee(stats.todayValue)} to="/admin/summary" />
        <Stat label="Open complaints" value={stats.openComplaints} to="/admin/complaints" hot={stats.openComplaints > 0} />
      </div>

      <section>
        <h2 className="text-lg font-bold">Naye orders: call karke confirm karo</h2>
        <div className="mt-2 space-y-2">
          {newOrders.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className={`${lcard} flex items-center gap-3 p-4`}>
              <span className="flex-1">
                <span className="flex items-center gap-2 font-bold">#{o.order_number} <StatusBadge status={o.status} /></span>
                <span className="text-sm text-neutral-500">{o.customer_name} · {o.area} · {o.item_count} items · {fmtClock(o.created_at)}</span>
              </span>
              <span className="font-bold">{rupee(o.total)}</span>
              <ChevronRight size={18} className="text-neutral-400" />
            </Link>
          ))}
          {!newOrders.length && <p className={`${lcard} p-4 text-neutral-500`}>Koi naya order nahi.</p>}
        </div>
      </section>

      {complaints.length > 0 && (
        <section>
          <h2 className="text-lg font-bold">Open complaints</h2>
          <div className="mt-2 space-y-2">
            {complaints.slice(0, 3).map((k) => (
              <Link key={k.id} to="/admin/complaints" className={`${lcard} block p-4`}>
                <span className="block font-semibold">#{k.order_number} · {k.type}</span>
                <span className="text-sm text-neutral-500">{k.customer_name} · {timeAgo(k.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.outOfStock > 0 && (
        <Link to="/admin/products" className={`${lcard} flex items-center justify-between p-4 text-sm`}>
          <span><b>{stats.outOfStock}</b> products out of stock hain</span>
          <ChevronRight size={18} />
        </Link>
      )}
    </div>
  )
}
