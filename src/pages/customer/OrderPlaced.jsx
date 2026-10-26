import { Link, useParams } from 'react-router-dom'
import { Bookmark, Check, ChevronRight, Clock, House, MapPin, Phone, Store } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card } from '../../components/ui.js'
import { getOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { rupee, slotText } from '../../lib/format.js'

export default function OrderPlaced() {
  const { orderNumber } = useParams()
  const { data, loading } = useData(() => getOrder(orderNumber), [orderNumber])
  if (loading) return null
  if (!data) return <p className="p-10 text-center text-muted">Order not found.</p>
  const { order, items, store } = data
  const trackUrl = `${window.location.host}/track/${order.order_number}`

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to="/" aria-label="Home" className="flex h-11 w-11 items-center justify-center rounded-full border border-line"><House size={20} /></Link>
      </header>

      <div className="mt-8 flex flex-col items-center text-center">
        <div className="relative">
          <span className="absolute -left-8 top-2 h-1 w-5 -rotate-12 rounded bg-accent" />
          <span className="absolute -right-8 top-2 h-1 w-5 rotate-12 rounded bg-accent" />
          <span className="absolute -left-6 bottom-3 h-1 w-4 -rotate-45 rounded bg-accent" />
          <span className="absolute -right-6 bottom-3 h-1 w-4 rotate-45 rounded bg-accent" />
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent">
            <Check size={52} strokeWidth={3.5} className="text-ink" />
          </div>
        </div>
        <h1 className="mt-5 text-4xl font-black">Order placed!</h1>
        <p className="mt-1 text-2xl font-bold text-muted">#{order.order_number}</p>
        <p className="mt-1 text-muted">
          {order.ordered_by_phone ? `We will deliver it to ${order.customer_name} (${order.customer_phone}).` : 'We have received your order.'}
        </p>
      </div>

      <section className={`${card} mt-6 p-4`}>
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <Store size={26} />
          <div>
            <div className="font-bold">{store.name}</div>
            <div className="text-sm text-muted">{order.address}</div>
          </div>
        </div>
        <div className="space-y-2 py-3">
          {items.map((i) => (
            <div key={i.id} className="flex gap-2 text-sm">
              <span className="flex-1 text-muted">{i.name_snapshot}</span>
              <span className="w-8 text-muted">×{i.quantity}</span>
              <span className="w-14 text-right">{rupee(i.line_total)}</span>
            </div>
          ))}
          {order.packaging_fee > 0 && (
            <div className="flex text-sm"><span className="flex-1 text-muted">Packaging charge</span><span>{rupee(order.packaging_fee)}</span></div>
          )}
          {order.delivery_fee > 0 && (
            <div className="flex text-sm"><span className="flex-1 text-muted">Delivery charge</span><span>{rupee(order.delivery_fee)}</span></div>
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-xl font-bold"><span>Total</span><span>{rupee(order.total)}</span></div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Clock size={16} /> Delivery {slotText(order.delivery_date, store)}
        </div>
      </section>

      <div className={`${card} mt-3 flex items-center gap-3 p-4`}>
        <Phone size={24} className="shrink-0 text-accent" />
        <span className="border-l border-line pl-3">
          <span className="block font-semibold">We will call you to confirm.</span>
          <span className="text-sm text-muted">After confirming, we buy your items and deliver them in the evening.</span>
        </span>
      </div>

      <Link to={`/track/${order.order_number}`} className={`${card} mt-3 flex h-14 items-center gap-3 px-4 font-semibold`}>
        <MapPin size={22} /> <span className="flex-1">Track order status</span> <ChevronRight size={20} className="text-muted" />
      </Link>

      <p className="mt-4 flex gap-3 px-1 text-sm text-muted">
        <Bookmark size={20} className="shrink-0" />
        <span>Save this link to track your order later<br /><span className="text-accent">{trackUrl}</span></span>
      </p>
    </main>
  )
}
