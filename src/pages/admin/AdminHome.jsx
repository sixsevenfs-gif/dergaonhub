import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { lcard } from '../../components/ui.js'
import { adminListShops, adminStats } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { rupee, timeAgo } from '../../lib/format.js'

function Stat({ label, value, to }) {
  return (
    <Link to={to} className={`${lcard} block p-4`}>
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </Link>
  )
}

export default function AdminHome() {
  const { data: stats } = useData(adminStats)
  const { data: shops = [] } = useData(adminListShops)
  const pending = shops.filter((s) => s.status === 'pending')
  if (!stats) return null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today's orders" value={stats.todayOrders} to="/admin/delivery" />
        <Stat label="Today's value" value={rupee(stats.todayValue)} to="/admin/settlement" />
        <Stat label="Pending shops" value={stats.pendingShops} to="/admin/shops" />
        <Stat label="Products to review" value={stats.pendingProducts} to="/admin/library" />
      </div>

      <section>
        <h2 className="text-lg font-bold">Pending shops</h2>
        <p className="text-sm text-neutral-500">Shop owners ko "aaj hi verify" bola hai. Inhe jaldi dekho.</p>
        <div className="mt-2 space-y-2">
          {pending.map((s) => (
            <Link key={s.id} to={`/admin/shops/${s.id}`} className={`${lcard} flex items-center gap-3 p-4`}>
              <span className="flex-1">
                <span className="block font-bold">{s.name}</span>
                <span className="text-sm text-neutral-500">{s.category} · {s.area} · {s.product_count} products · {s.owner_email}</span>
                <span className="block text-xs text-neutral-400">Created {timeAgo(s.created_at)}</span>
              </span>
              <ChevronRight size={18} className="text-neutral-400" />
            </Link>
          ))}
          {!pending.length && <p className={`${lcard} p-4 text-neutral-500`}>Koi pending shop nahi.</p>}
        </div>
      </section>

      {stats.pendingDirectory > 0 && (
        <Link to="/admin/directory" className={`${lcard} flex items-center justify-between p-4`}>
          <span><b>{stats.pendingDirectory}</b> directory listing review ke liye</span>
          <ChevronRight size={18} />
        </Link>
      )}
    </div>
  )
}
