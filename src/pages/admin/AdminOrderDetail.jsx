import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Navigation, Phone, Repeat, Trash2 } from 'lucide-react'
import CustomerHint from '../../components/CustomerHint.jsx'
import DeliveredButton from '../../components/DeliveredButton.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Field from '../../components/Field.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { cancelOrder, confirmOrder, deliveryPhotoUrl, getOrderById, logMessage, removeOrderItem, reopenOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime, rupee, slotText } from '../../lib/format.js'
import { billMessage, customerMessage, messagePhone, toWa, waLink } from '../../lib/whatsapp.js'
import { mapsLink } from '../../lib/delivery.js'
import { CONFIG } from '../../config.js'
import PaymentCheck from './PaymentCheck.jsx'

// Photo the rider took of the items at the customer's door.
function DeliveryPhoto({ path }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let live = true
    deliveryPhotoUrl(path).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [path])
  return (
    <section className={`${lcard} p-4`}>
      <h2 className="font-bold">Delivery photo</h2>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Items at the door" className="mt-2 max-h-80 w-full rounded-xl object-cover" /></a>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">Loading...</p>
      )}
    </section>
  )
}

export default function AdminOrderDetail() {
  const { orderId } = useParams()
  const { data } = useData(() => getOrderById(orderId), [orderId])
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [cash, setCash] = useState('')
  const [error, setError] = useState('')

  if (data === undefined) return null
  if (!data) return <p className="py-10 text-center text-neutral-500">Order not found.</p>
  const { order, items, store, hint, complaints } = data
  const editable = order.status === 'placed' || order.status === 'confirmed'

  const run = async (fn) => {
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-3">
      <Link to="/admin/orders" className="flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={18} /> Orders</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">#{order.order_number}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-sm text-neutral-500">Placed {fmtDateTime(order.created_at)}</p>

      <section className={`${lcard} p-4`}>
        <div className="font-semibold">{order.customer_name}</div>
        <div className="text-neutral-600">{order.customer_phone}</div>
        <div className="mt-1"><CustomerHint hint={hint} /></div>
        {order.ordered_by_phone && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ordered for them by <b>{order.ordered_by_name}</b> · <a href={`tel:${order.ordered_by_phone}`} className="font-semibold underline">{order.ordered_by_phone}</a>
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${order.customer_phone}`} className={lbtnOutline}><Phone size={17} /> Call</a>
          <a href={waLink(toWa(messagePhone('placed', order)), customerMessage('placed', { order, store }))} target="_blank" rel="noreferrer" onClick={() => logMessage(order.id, 'placed').catch(() => {})} className={lbtnOutline}>
            <WhatsAppIcon size={17} /> WhatsApp
          </a>
        </div>
        <p className="mt-3 flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 shrink-0" /> {order.address} · {slotText(order.delivery_date, store)}</p>
        {order.location && (
          <a href={mapsLink(order.location)} target="_blank" rel="noreferrer" className={`${lbtnOutline} mt-2 w-full`}>
            <Navigation size={17} /> Directions in Google Maps · {order.distance_km} km
          </a>
        )}
        <p className={`mt-2 flex gap-2 text-sm font-semibold ${order.allow_substitute ? 'text-green-700' : 'text-orange-600'}`}>
          <Repeat size={16} className="mt-0.5 shrink-0" /> {order.allow_substitute ? 'Similar brand is OK' : 'Only this brand'}
        </p>
      </section>

      {order.payment_method === 'upi_now' && <section className={`${lcard} p-4`}><PaymentCheck order={order} store={store} /></section>}
      {order.delivery_photo && <DeliveryPhoto path={order.delivery_photo} />}

      <section className={`${lcard} p-4`}>
        <h2 className="font-bold">Items</h2>
        {editable && <p className="text-xs text-neutral-500">If an item isn't available at the shop, remove it. The total updates automatically. Let the customer know.</p>}
        <div className="mt-2 divide-y divide-neutral-100">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">
                <span className="block">{i.name_snapshot}</span>
                <span className="text-sm text-neutral-500">{rupee(i.price_snapshot)} × {i.quantity}{i.note ? ` · "${i.note}"` : ''}</span>
              </span>
              <span className="font-semibold">{rupee(i.line_total)}</span>
              {editable && items.length > 1 && (
                <button type="button" aria-label="Remove item" onClick={() => run(() => removeOrderItem(order.id, i.id))} className="flex h-10 w-10 items-center justify-center text-neutral-400">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 text-sm">
          <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{rupee(order.subtotal)}</span></div>
          <div className="flex justify-between text-neutral-600"><span>Delivery charge{order.distance_km != null && ` (${order.distance_km} km)`}</span><span>{rupee(order.delivery_fee)}</span></div>
          <div className="flex justify-between text-neutral-600"><span>Packaging charge</span><span>{rupee(order.packaging_fee ?? 0)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{rupee(order.total)}</span></div>
          <div className="flex justify-between text-neutral-600"><span>Payment</span><span>{order.payment_method === 'cash' ? 'Cash on delivery' : 'UPI on delivery'}</span></div>
          {order.status === 'completed' && order.payment_method === 'cash' && (
            <div className="flex justify-between text-neutral-600"><span>Cash collected</span><span>{rupee(order.cash_collected)}</span></div>
          )}
        </div>
        {order.note && <p className="mt-3 rounded-xl bg-neutral-100 p-3 text-sm">Note: {order.note}</p>}
        {order.status === 'cancelled' && <p className="mt-3 text-sm text-neutral-600">Cancelled: {order.cancel_reason}</p>}
      </section>

      {complaints.length > 0 && (
        <Link to="/admin/complaints" className={`${lcard} block p-4 text-sm`}>
          <b>{complaints.length} complaint(s)</b> on this order: {complaints.map((k) => `${k.type} (${k.status})`).join(', ')}
        </Link>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {editable && !cancelling && (
        <section className="space-y-2">
          {order.status === 'placed' && (
            <button type="button" onClick={() => run(() => confirmOrder(order.id))} className={`${lbtnDark} h-12 w-full`}>Confirm order (after calling)</button>
          )}
          {order.status === 'confirmed' && (
            <div className={`${lcard} space-y-2 p-4`}>
              {order.payment_method === 'cash' && (
                <Field label="Cash collected (₹)">
                  <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={String(order.total)} className={lfield} />
                </Field>
              )}
              <DeliveredButton order={order} items={items} cash={cash === '' ? undefined : cash} className="h-12 w-full" />
            </div>
          )}
          <button type="button" onClick={() => setCancelling(true)} className={`${lbtnDanger} w-full`}>Cancel order</button>
        </section>
      )}

      {order.status === 'completed' && (
        <div className="grid grid-cols-2 gap-2">
          <a href={waLink(toWa(order.customer_phone), billMessage({ order, items }))} target="_blank" rel="noreferrer" className={lbtnOutline}>
            <WhatsAppIcon size={17} /> Send bill again
          </a>
          <button type="button" onClick={() => run(() => reopenOrder(order.id))} className={lbtnOutline}>Undo delivered</button>
        </div>
      )}

      {cancelling && (
        <section className={`${lcard} space-y-3 p-4`}>
          <h2 className="font-bold">Why cancel?</h2>
          <div className="flex flex-wrap gap-2">
            {CONFIG.CANCEL_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`h-10 rounded-full border px-3 text-sm font-semibold ${reason === r ? 'border-red-600 bg-red-600 text-white' : 'border-neutral-300'}`}>
                {r}
              </button>
            ))}
          </div>
          {reason === 'No-show' && <p className="text-xs text-neutral-500">This adds 1 no-show to this number. After {CONFIG.NO_SHOW_LIMIT} no-shows it can't order online.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setCancelling(false)} className={lbtnOutline}>Back</button>
            <button type="button" disabled={!reason} onClick={() => run(() => cancelOrder(order.id, reason)).then(() => setCancelling(false))} className={`${lbtnDanger} flex-1`}>
              Cancel order
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
