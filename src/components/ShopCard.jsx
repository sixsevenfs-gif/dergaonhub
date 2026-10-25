import { Link } from 'react-router-dom'
import { ChevronRight, MapPin, ShoppingCart } from 'lucide-react'
import { card } from './ui.js'
import { isOpenNow } from '../lib/format.js'

export default function ShopCard({ shop }) {
  const open = isOpenNow(shop)
  return (
    <Link to={`/s/${shop.id}`} className={`${card} flex items-center gap-4 p-4 active:bg-white/5`}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5">
        {shop.logo_url ? <img src={shop.logo_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ShoppingCart size={28} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-lg font-bold">{shop.name}</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${open ? 'bg-accent text-ink' : 'bg-white/10 text-muted'}`}>
            {shop.paused ? 'Paused' : open ? 'Open now' : 'Closed'}
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          <MapPin size={14} /> {shop.area}, Dergaon
        </p>
        <div className="mt-2 flex gap-2 text-xs font-semibold">
          {shop.delivery_available && <span className="rounded-full border border-accent px-2.5 py-0.5 text-accent">Delivery</span>}
          {shop.pickup_available && <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">Pickup</span>}
        </div>
      </div>
      <ChevronRight size={20} className="shrink-0 text-muted" />
    </Link>
  )
}
