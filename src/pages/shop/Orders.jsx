import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ChevronRight, Phone, ShoppingBag, Truck } from 'lucide-react'
import CustomerHint from '../../components/CustomerHint.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDark, lbtnOutline, lcard } from '../../components/ui.js'
import { completeOrder, confirmOrder, listMyOrders } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dayLabel, fmtClock, rupee } from '../../lib/format.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

const FILTERS = [
  ['placed', 'New'],
  ['confirmed', 'Confirmed'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
]

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // sound not allowed until the owner taps the page once
  }
}

export default function Orders() {
  const { shop } = useOutletContext()
  const [filter, setFilter] = useState('placed')
  const { data: orders = [], reload } = useData(listMyOrders)
  const seen = useRef(null)

  // Check for new orders every 15 seconds and beep when one arrives.
  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  useEffect(() => {
    const ids = orders.filter((o) => o.status === 'placed').map((o) => o.id)
    if (seen.current && ids.some((id) => !seen.current.has(id))) beep()
    seen.current = new Set(ids)
  }, [orders])

  const shown = orders.filter((o) => o.status === filter)
  const count = (s) => orders.filter((o) => o.status === s).length

  return (
    <div>
      {shop.status !== 'live' && (
        <Link to="/shop/status" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="flex-1">
            <b>Shop abhi live nahi hai.</b> {shop.status === 'pending' ? 'Verification chal raha hai.' : 'Products add karo aur Go Live dabao.'}
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      <h1 className="text-2xl font-black">Orders</h1>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}
          >
            {label} {count(key) > 0 && <span className={key === 'placed' && filter !== key ? 'ml-1 rounded-full bg-accent px-1.5 text-ink' : 'ml-1'}>{count(key)}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {shown.map((o) => (
          <div key={o.id} className={`${lcard} p-4 ${o.status === 'placed' ? 'border-2 border-neutral-900 shadow-[0_0_0_4px_#E8FF3A]' : ''}`}>
            <Link to={`/shop/orders/${o.id}`} className="block">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold">#{o.order_number} <StatusBadge status={o.status} /></span>
                <span className="text-sm text-neutral-500">{fmtClock(o.created_at)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>
                  <span className="block font-semibold">{o.customer_name}</span>
                  <span className="text-sm text-neutral-500">{o.customer_phone}</span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold">{rupee(o.total)}</span>
                  <span className="text-sm text-neutral-500">{o.item_count} items · {o.payment_method === 'cash' ? 'Cash' : 'UPI'}</span>
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-600">
                {o.type === 'delivery' ? <><Truck size={15} /> Delivery {dayLabel(o.delivery_date)} · {o.area}</> : <><ShoppingBag size={15} /> Pickup {dayLabel(o.delivery_date)}</>}
              </p>
              {o.status === 'cancelled' && <p className="mt-1 text-sm text-neutral-500">Reason: {o.cancel_reason}</p>}
              <div className="mt-1"><CustomerHint hint={o.hint} /></div>
            </Link>
            {(o.status === 'placed' || o.status === 'confirmed') && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a href={`tel:${o.customer_phone}`} className={lbtnOutline}><Phone size={17} /> Call</a>
                <a href={waLink(toWa(o.customer_phone), `Namaste ${o.customer_name}, aapka order #${o.order_number} mila hai.`)} target="_blank" rel="noreferrer" className={lbtnOutline}>
                  <WhatsAppIcon size={17} />
                </a>
                {o.status === 'placed' ? (
                  <button type="button" onClick={() => confirmOrder(o.id)} className={lbtnDark}>Confirm</button>
                ) : (
                  <button type="button" onClick={() => completeOrder(o.id)} className={lbtnDark}>Done</button>
                )}
              </div>
            )}
          </div>
        ))}
        {!shown.length && (
          <p className="py-10 text-center text-neutral-500">
            {filter === 'placed' ? 'Koi naya order nahi. Naya order aate hi yahan dikhega (sound ke saath).' : 'Yahan koi order nahi.'}
          </p>
        )}
      </div>
    </div>
  )
}
