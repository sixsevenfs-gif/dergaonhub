import { useEffect, useState } from 'react'
import { MapPin, Phone, Store, UtensilsCrossed } from 'lucide-react'
import { card } from '../../components/ui.js'
import { useData } from '../../lib/useData.js'
import { rupee } from '../../lib/format.js'
import { partnerFoodOrders, partnerFoodStatus } from '../../lib/foodAdmin.js'

const mapLink = (lat, lng, link) => link || (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : '')

// Food orders on the rider page: pick up at the restaurant, then deliver. Checks for new ones every 20 seconds.
export default function FoodRides() {
  const { data: rides, reload } = useData(partnerFoodOrders)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20_000)
    return () => clearInterval(t)
  }, [reload])
  if (!rides?.length) return null

  async function step(o, status) {
    setBusy(o.id)
    setMsg('')
    try {
      await partnerFoodStatus(o.id, status)
      reload()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="mt-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-700"><UtensilsCrossed size={16} /> Food orders</h2>
      {msg && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{msg}</p>}
      {rides.map((o) => {
        const pickupMap = mapLink(o.pickup_lat, o.pickup_lng, o.pickup_map)
        const dropMap = mapLink(o.lat, o.lng)
        return (
          <div key={o.id} className={`${card} space-y-3 border-red-200 p-4`}>
            <div className="flex items-center justify-between gap-2">
              <b>{o.no}</b>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === 'picked' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                {o.status === 'picked' ? 'On the way' : 'Pick up'}
              </span>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold"><Store size={15} /> 1. Pick up: {o.restaurant}</p>
              {o.pickup_address && <p className="mt-0.5 text-ink/80">{o.pickup_address}</p>}
              <p className="mt-1">{o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} ×${i.qty}`).join(', ')}</p>
              {o.note && <p className="mt-1 text-xs">Note: {o.note}</p>}
              <div className="mt-2 flex gap-2">
                {o.pickup_phone && <a href={`tel:+91${o.pickup_phone}`} className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold"><Phone size={14} /> Call</a>}
                {pickupMap && <a href={pickupMap} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold"><MapPin size={14} /> Map</a>}
              </div>
            </div>
            <div className="rounded-xl bg-mint p-3 text-sm">
              <p className="font-semibold">2. Deliver to: {o.name}</p>
              <p className="mt-0.5 text-ink/80">{o.address}, {o.area}</p>
              <p className="mt-1">Collect <b>{rupee(o.total)}</b> · {o.payment === 'upi' ? 'UPI (show QR)' : 'Cash'}</p>
              <div className="mt-2 flex gap-2">
                <a href={`tel:+91${o.phone}`} className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold"><Phone size={14} /> Call</a>
                {dropMap && <a href={dropMap} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold"><MapPin size={14} /> Map</a>}
              </div>
            </div>
            {o.status === 'confirmed' ? (
              <button type="button" disabled={busy === o.id} onClick={() => step(o, 'picked')}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-red-600 font-semibold text-white disabled:opacity-50">
                {busy === o.id ? 'Saving…' : o.mine ? 'Picked up from restaurant' : 'Take it: picked up'}
              </button>
            ) : (
              <button type="button" disabled={busy === o.id} onClick={() => step(o, 'delivered')}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-brand font-semibold text-white disabled:opacity-50">
                {busy === o.id ? 'Saving…' : `Delivered · collected ${rupee(o.total)}`}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}
