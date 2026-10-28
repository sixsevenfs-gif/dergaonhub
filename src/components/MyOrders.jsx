import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Headphones, Package, Phone, RotateCcw, Truck } from 'lucide-react'
import { WhatsAppIcon } from './icons.jsx'
import { btnAccent, btnOutline, card, cx } from './ui.js'
import { listProducts, ordersByPhone } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { useCart } from '../lib/cart-context.js'
import { dayLabel, fmtClock, fmtDateTime, isExpress, itemsText, rupee, statusLabel } from '../lib/format.js'
import { waLink } from '../lib/whatsapp.js'

const STATUS_STYLE = {
  placed: 'bg-brand text-white', confirmed: 'bg-blue-500/20 text-blue-700',
  completed: 'bg-green-500/20 text-green-700', cancelled: 'bg-black/10 text-muted',
}

// Every order of the logged-in number, newest first, with "Order again" and "Report problem".
export function OrderList({ phone }) {
  const navigate = useNavigate()
  const { setQty } = useCart()
  const { data: products = [] } = useData(listProducts)
  const { data: orders, loading } = useData(() => ordersByPhone(phone), [phone])
  const [note, setNote] = useState('')

  // Adds the items of a past order to the cart again (skipping ones that are out of stock).
  const reorder = (o) => {
    let added = 0
    for (const i of o.items) {
      const p = products.find((x) => x.id === i.product_id)
      if (p?.available) {
        setQty(p.id, i.quantity)
        added++
      }
    }
    if (added) navigate('/cart')
    else setNote('Items from this order are not available right now.')
  }

  if (loading && !orders) return null
  const list = orders ?? []
  return (
    <section>
      {note && <p className="mb-2 text-sm text-orange-700">{note}</p>}
      <div className="space-y-3">
        {list.map((o) => (
          <div key={o.id} className={`${card} p-4`}>
            <Link to={`/track/${o.order_number}`} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><Package size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    <span className="whitespace-nowrap">#{o.order_number}</span>
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[o.status])}>{statusLabel(o.status)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap font-semibold">{rupee(o.total)} <ChevronRight size={18} className="text-muted" /></span>
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">{fmtDateTime(o.created_at)} · {itemsText(o.item_count)}</span>
                <span className="block text-[13px] text-muted">{isExpress(o) ? <b className="font-semibold text-amber-700">⚡ Express, by {fmtClock(o.express_by)}</b> : <>Delivery {dayLabel(o.delivery_date)}</>}</span>
              </span>
            </Link>
            <p className="mt-2 line-clamp-1 text-xs text-muted">{o.items.map((i) => `${i.name_snapshot} ×${i.quantity}`).join(', ')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => reorder(o)} className={`${btnOutline} min-h-10 text-sm`}><RotateCcw size={16} /> Order again</button>
              <Link to={`/report/${o.order_number}`} className={`${btnOutline} min-h-10 text-sm`}>Report problem</Link>
            </div>
          </div>
        ))}
        {!list.length && (
          <div className={`${card} py-8 text-center`}>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mint text-brand"><Package size={26} /></span>
            <p className="mt-3 text-muted">No orders yet.</p>
            <Link to="/" className={`${btnAccent} mx-auto mt-4 max-w-60`}>Start shopping</Link>
          </div>
        )}
      </div>
    </section>
  )
}

// Call or WhatsApp the store, and the policies people ask about most.
export function HelpSupport({ store, phone }) {
  return (
    <section className={`${card} p-4`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><Headphones size={20} /></span>
        <span>
          <h2 className="font-semibold">Help & Support</h2>
          <p className="text-[13px] text-muted">A problem with an order, or a question? We are here.</p>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`tel:${store.phone}`} className={`${btnOutline} min-h-10 text-sm`}><Phone size={16} /> Call us</a>
        <a href={waLink(store.whatsapp, `Hello Jholzo, I'm writing from +91 ${phone}.`)} target="_blank" rel="noreferrer" className={`${btnOutline} min-h-10 text-sm`}>
          <WhatsAppIcon size={16} /> WhatsApp
        </a>
      </div>
      <div className="mt-3 divide-y divide-line text-sm">
        {[
          [FileText, 'Refund & cancellation', 'refund'],
          [Truck, 'Delivery times and areas', 'delivery'],
        ].map(([Icon, label, slug]) => (
          <Link key={slug} to={`/policy/${slug}`} className="flex items-center gap-3 py-2.5">
            <Icon size={17} className="text-muted" />
            <span className="flex-1">{label}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Wrong, missing or damaged item? Tap "Report problem" on that order.</p>
    </section>
  )
}
