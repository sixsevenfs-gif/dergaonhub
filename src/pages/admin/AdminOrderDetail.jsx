import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bike, MapPin, Navigation, Phone, Repeat, Trash2 } from 'lucide-react'
import CustomerHint from '../../components/CustomerHint.jsx'
import DeliveredButton from '../../components/DeliveredButton.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import ItemPhoto from '../../components/ItemPhoto.jsx'
import Field from '../../components/Field.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { assignRider, cancelOrder, confirmOrder, deliveryPhotoUrl, getOrderById, listTeam, logMessage, removeOrderItem, reopenOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { deliveryWhen, fmtClock, fmtDateTime, rupee } from '../../lib/format.js'
import { billMessage, customerMessage, messagePhone, toWa, waLink } from '../../lib/whatsapp.js'
import { mapsLink } from '../../lib/delivery.js'
import { CONFIG } from '../../config.js'
import PaymentCheck from './PaymentCheck.jsx'
import DeleteOrdersDialog from '../../components/DeleteOrdersDialog.jsx'
import { useRole } from '../../lib/role.js'
import { orderProfit } from '../../lib/profit.js'

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

const money = (n) => (n < 0 ? `−${rupee(-n)}` : rupee(n))

const MESSAGE_NAMES = { placed: 'Order placed', on_the_way: 'On the way', arriving: 'Arriving soon', delivered: 'Delivered + bill' }

// What the customer was already sent, with how many times, so nobody sends a message twice.
function SentMessages({ messages }) {
  if (!messages?.length) return null
  const kinds = [...new Set(messages.map((m) => m.kind))]
  return (
    <section className={`${lcard} p-4`}>
      <h2 className="font-bold">Messages to the customer</h2>
      <div className="mt-2 space-y-2 text-sm">
        {kinds.map((k) => {
          const ok = messages.filter((m) => m.kind === k && m.ok)
          const failed = messages.filter((m) => m.kind === k && !m.ok)
          return (
            <div key={k}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{MESSAGE_NAMES[k] ?? k}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ok.length > 1 ? 'bg-orange-100 text-orange-800' : ok.length ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                  {ok.length ? `Sent ${ok.length}×` : 'Not sent'}
                </span>
              </div>
              <ul className="mt-0.5 space-y-0.5 text-xs text-neutral-500">
                {[...ok, ...failed].sort((a, b) => String(a.at).localeCompare(String(b.at))).map((m, n) => (
                  <li key={n}>
                    {m.ok ? '✓' : '✕'} {m.channel === 'auto' ? 'Automatic' : 'By hand on WhatsApp'} · {fmtClock(m.at)}
                    {!m.ok && m.error ? ` · ${m.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The shop asked the rider for more than the buy prices (update 043): what they paid, with the bill's photo.
function ShopBillCard({ bill }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let live = true
    deliveryPhotoUrl(bill.photo).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [bill.photo])
  const extra = Number(bill.paid) - Number(bill.expected)
  return (
    <section className={`${lcard} p-4`}>
      <h2 className="font-bold">Rider paid the shop <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Only you</span></h2>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between text-neutral-600"><span>Should pay (buy prices, MRP where none)</span><span>{rupee(bill.expected)}</span></div>
        <div className="flex justify-between font-semibold"><span>Paid at the shop</span><span>{rupee(bill.paid)}</span></div>
        {extra !== 0 && (
          <div className={`flex justify-between font-semibold ${extra > 0 ? 'text-red-600' : 'text-green-700'}`}>
            <span>{extra > 0 ? 'More than the buy prices' : 'Less than the buy prices'}</span><span>{rupee(Math.abs(extra))}</span>
          </div>
        )}
        {bill.note && <p className="rounded-lg bg-neutral-100 px-3 py-2">“{bill.note}”</p>}
        <p className="text-xs text-neutral-500">Added {fmtDateTime(bill.created_at)}</p>
      </div>
      {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Shop bill" className="mt-2 max-h-96 w-full rounded-xl object-contain" /></a>}
    </section>
  )
}

// What this order earns you: items (selling − buy price) + fees − Jholzo Money − rider and petrol − bag.
function ProfitCard({ order, items, costs, rules, shopBill }) {
  const p = orderProfit(order, items, costs, rules)
  // The shop took more than the buy prices (rider's bill, update 043): that comes off the profit.
  const extra = shopBill ? Math.max(0, Number(shopBill.paid) - Number(shopBill.expected)) : 0
  const profit = p.profit - extra
  const line = (label, value) => <div className="flex justify-between text-neutral-600"><span>{label}</span><span>{value}</span></div>
  return (
    <section className={`${lcard} p-4`}>
      <h2 className="font-bold">Your profit on this order <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Only you</span></h2>
      <div className="mt-2 space-y-1 text-sm">
        {line('Items (selling − buy price)', money(p.itemsEarned))}
        {line('Delivery, packaging, express fees', money(p.fees))}
        {p.discount > 0 && line('Jholzo Money used', `−${rupee(p.discount)}`)}
        {line(`Rider + petrol${order.distance_km != null ? ` (${order.distance_km} km)` : ''}`, `−${rupee(p.rider)}`)}
        {line('Bag / packing', `−${rupee(p.packing)}`)}
        {extra > 0 && line('Shop asked for more (bill)', `−${rupee(extra)}`)}
        <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-black">
          <span>Profit</span><span className={profit >= 0 ? 'text-green-700' : 'text-red-600'}>{money(profit)}</span>
        </div>
      </div>
      {p.missing.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No buy price yet for {p.missing.join(', ')}, so their margin is not counted. <Link to="/admin/products" className="font-semibold underline">Add it in Products</Link>
        </p>
      )}
    </section>
  )
}

export default function AdminOrderDetail() {
  const { orderId } = useParams()
  const { data, reload } = useData(() => getOrderById(orderId), [orderId])
  // A rider marks steps on their own phone: check again every 15 seconds and when the page comes back to the front.
  useEffect(() => {
    const t = setInterval(reload, 15000)
    const back = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', back)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', back)
    }
  }, [reload])
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [cash, setCash] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const { data: team = [] } = useData(listTeam)
  const { isOwner } = useRole()
  const nameOf = (id) => team.find((t) => t.user_id === id)?.name || 'Owner'

  if (data === undefined) return null
  if (!data) return <p className="py-10 text-center text-neutral-500">Order not found.</p>
  const { order, items, store, hint, complaints, costs, rules, shopBill, messages } = data
  const editable = order.status === 'placed' || order.status === 'confirmed'
  // Pay-now UPI order: the owner checks the payment before anyone else may confirm it.
  const payFirst = !isOwner && order.payment_method === 'upi_now' && order.payment_status !== 'paid'
  const riders = team.filter((t) => t.role === 'rider' && t.active)
  if (order.rider_id && !riders.some((r) => r.user_id === order.rider_id)) riders.push({ user_id: order.rider_id, name: nameOf(order.rider_id) })

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
      <p className="text-sm text-neutral-500">
        Placed {fmtDateTime(order.created_at)}
        {order.confirmed_by && <> · confirmed by {nameOf(order.confirmed_by)}</>}
        {order.cancelled_by && <> · cancelled by {nameOf(order.cancelled_by)}</>}
      </p>

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
        <p className="mt-3 flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 shrink-0" /> {order.address} · {deliveryWhen(order, store)}</p>
        {order.location ? (
          <a href={mapsLink(order.location)} target="_blank" rel="noreferrer" className={`${lbtnOutline} mt-2 w-full`}>
            <Navigation size={17} /> Directions in Google Maps · {order.distance_km} km
          </a>
        ) : (
          <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">
            No map pin: the address was typed by hand. Call to confirm the place before delivery.
          </p>
        )}
        <p className={`mt-2 flex gap-2 text-sm font-semibold ${order.allow_substitute ? 'text-green-700' : 'text-orange-600'}`}>
          <Repeat size={16} className="mt-0.5 shrink-0" /> {order.allow_substitute ? 'Similar brand is OK' : 'Only this brand'}
        </p>
      </section>

      {/* Who delivers it (updates 032, 033): the desk assigns a rider; only that rider sees the order. */}
      {(editable || order.status === 'completed') && (
        <section className={`${lcard} flex flex-wrap items-center gap-3 p-4`}>
          <Bike size={20} className="shrink-0 text-neutral-500" />
          {order.status === 'completed' ? (
            <span className="flex-1 text-sm">Delivered by <b>{nameOf(order.delivered_by)}</b>{order.completed_at && <> · {fmtClock(order.completed_at)}</>}</span>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Rider</span>
                <span className="text-sm text-neutral-500">
                  {order.rider_id ? <>{nameOf(order.rider_id)}{order.assigned_at && ` · since ${fmtClock(order.assigned_at)}`}</> : 'No rider yet. Choose one: only they will see this order.'}
                </span>
              </span>
              <select value={order.rider_id ?? ''} onChange={(e) => run(() => assignRider(order.id, e.target.value))} aria-label="Rider" className={`${lfieldBase} h-11 w-40`}>
                <option value="">No rider</option>
                {riders.map((r) => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
              </select>
            </>
          )}
        </section>
      )}

      {order.payment_method === 'upi_now' && <section className={`${lcard} p-4`}><PaymentCheck order={order} store={store} /></section>}
      {order.delivery_photo && <DeliveryPhoto path={order.delivery_photo} />}
      <SentMessages messages={messages} />

      <section className={`${lcard} p-4`}>
        <h2 className="font-bold">Items</h2>
        {editable && <p className="text-xs text-neutral-500">If an item isn't available at the shop, remove it. The total updates automatically. Let the customer know.</p>}
        <div className="mt-2 divide-y divide-neutral-100">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 py-2">
              <ItemPhoto item={i} size="h-20 w-20 sm:h-24 sm:w-24" className="mr-1" />
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
          {Number(order.express_fee) > 0 && (
            <div className="flex justify-between font-semibold text-amber-700"><span>⚡ Express delivery</span><span>{rupee(order.express_fee)}</span></div>
          )}
          {Number(order.wallet_used) > 0 && (
            <div className="flex justify-between font-semibold text-green-700"><span>Jholzo Money (wallet)</span><span>−{rupee(order.wallet_used)}</span></div>
          )}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{rupee(order.total)}</span></div>
          <div className="flex justify-between text-neutral-600"><span>Payment</span><span>{order.payment_method === 'cash' ? 'Cash on delivery' : 'UPI on delivery'}</span></div>
          {order.status === 'completed' && order.payment_method === 'cash' && (
            <div className="flex justify-between text-neutral-600"><span>Cash collected</span><span>{rupee(order.cash_collected)}</span></div>
          )}
        </div>
        {order.note && <p className="mt-3 rounded-xl bg-neutral-100 p-3 text-sm">Note: {order.note}</p>}
        {order.status === 'cancelled' && <p className="mt-3 text-sm text-neutral-600">Cancelled: {order.cancel_reason}</p>}
      </section>

      {/* The owner's profit on this order from buy prices (update 034). */}
      {isOwner && shopBill && <ShopBillCard bill={shopBill} />}
      {isOwner && order.status !== 'cancelled' && rules && <ProfitCard order={order} items={items} costs={costs} rules={rules} shopBill={shopBill} />}

      {complaints.length > 0 && (
        <Link to="/admin/complaints" className={`${lcard} block p-4 text-sm`}>
          <b>{complaints.length} complaint(s)</b> on this order: {complaints.map((k) => `${k.type} (${k.status})`).join(', ')}
        </Link>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {editable && !cancelling && (
        <section className="space-y-2">
          {order.status === 'placed' && (payFirst ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Pay-now order: the owner checks the UPI payment first. It confirms by itself once marked paid.</p>
          ) : (
            <button type="button" onClick={() => run(() => confirmOrder(order.id))} className={`${lbtnDark} h-12 w-full`}>Confirm order (after calling)</button>
          ))}
          {/* Delivered with the cash amount: the owner (riders mark it on their page). */}
          {order.status === 'confirmed' && isOwner && (
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
          {isOwner && <button type="button" onClick={() => run(() => reopenOrder(order.id))} className={lbtnOutline}>Undo delivered</button>}
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

      {/* Test or demo orders only: gone from the database, counts nowhere (update 029). The owner only. */}
      {isOwner && (
        <button type="button" onClick={() => setDeleting(true)} className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-red-600">
          <Trash2 size={16} /> Delete this order permanently (test / demo)
        </button>
      )}
      {deleting && (
        <DeleteOrdersDialog
          orders={[order]}
          onClose={() => setDeleting(false)}
          onDone={() => navigate('/admin/orders', { replace: true })}
        />
      )}
    </div>
  )
}
