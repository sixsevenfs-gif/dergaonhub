import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lcard } from '../../components/ui.js'
import { adminListShops } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'

const FILTERS = ['', 'pending', 'live', 'draft', 'rejected', 'hidden', 'suspended']

export default function AdminShops() {
  const [filter, setFilter] = useState('')
  const { data: shops = [] } = useData(adminListShops)
  const shown = shops.filter((s) => !filter || s.status === filter)

  return (
    <div>
      <h1 className="text-2xl font-black">Shops</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f || 'all'} type="button" onClick={() => setFilter(f)} className={`h-9 rounded-full border px-3 text-sm font-semibold capitalize ${filter === f ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
            {f || 'All'} ({shops.filter((s) => !f || s.status === f).length})
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {shops.length > 0 && shown.map((s) => (
          <Link key={s.id} to={`/admin/shops/${s.id}`} className={`${lcard} flex items-center gap-3 p-4`}>
            <span className="flex-1">
              <span className="flex items-center gap-2 font-bold">{s.name} <StatusBadge status={s.status} />{s.paused && <span className="text-xs text-neutral-500">(paused)</span>}</span>
              <span className="text-sm text-neutral-500">{s.area} · {s.product_count} products · {s.owner_email}</span>
            </span>
            <ChevronRight size={18} className="text-neutral-400" />
          </Link>
        ))}
        {!shown.length && <p className="py-6 text-center text-neutral-500">Koi shop nahi.</p>}
      </div>
    </div>
  )
}
