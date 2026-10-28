import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Phone, X } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import BottomNav from '../../components/BottomNav.jsx'
import AddToHomeSheet from '../../components/AddToHomeSheet.jsx'
import PayNow from '../../components/PayNow.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { btnAccent, btnOutline, card, cx } from '../../components/ui.js'
import { cancelMyOrder, currentCustomer, getOrder, getStore } from '../../lib/store.js'
import { HelpSupport, OrderList } from '../../components/MyOrders.jsx'
import { useData } from '../../lib/useData.js'
import { deliveryWhen, fmtClock, fmtDateTime, isExpress, rupee } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

const STEPS = [
  ['placed', 'Placed', 'We have received your order'],
  ['confirmed', 'Confirmed', 'Confirmed, arriving this evening'],
  ['on_the_way', 'On the way', 'Our rider is coming to you'],
  ['completed', 'Delivered', 'Delivered. Thank you!'],
]

// Which step the order has reached (the rider's "On the way" / "Arriving" count as on the way).
const stepOf = (o) => (o.status === 'completed' ? 3 : o.dispatch ? 2 : o.status === 'confirmed' ? 1 : 0)

// Cancel from this phone until the rider leaves; after that the button explains why it is gone.
function CancelOrder({ order, mine }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  if (!mine || order.status === 'cancelled' || order.status === 'completed') return null
  if (order.dispatch) {
    return <p className="mt-3 rounded-xl bg-black/5 p-3 text-sm text-muted">Our rider is on the way, so this order can't be cancelled now.</p>
  }
  const cancel = async () => {
    setError('')
    try {
      await cancelMyOrder(order.order_number)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="mt-3">
      {asking ? (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3">
          <p className="text-sm">Cancel order #{order.order_number}?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={cancel} className="h-11 flex-1 rounded-xl bg-red-500 font-semibold text-ink">Yes, cancel</button>
            <button type="button" onClick={() => setAsking(false)} className={`${btnOutline} flex-1`}>Keep order</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={`${btnOutline} w-full text-red-700`}>Cancel order</button>
      )}
      <p className="mt-1.5 text-center text-xs text-muted">You can cancel until our rider is on the way.</p>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export default function Track() {
  const { orderNumber } = useParams()
  const me = currentCustomer()
  const { data: store } = useData(getStore)
  const { data } = useData(() => (orderNumber ? getOrder(orderNumber) : null), [orderNumber])

  // One order (from a link or the list), or every order of the logged-in number.
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-4">
      <TopBar />
      {orderNumber ? (
        <>
          <Link to="/track" className="mt-4 flex w-fit items-center gap-1 text-sm font-medium text-brand"><ArrowLeft size={16} /> All my orders</Link>
          <h1 className="mt-2 text-2xl font-semibold">Order status</h1>
          {data && <OrderView data={data} />}
          {data === null && <p className="mt-4 text-muted">Order #{orderNumber} not found.</p>}
        </>
      ) : (
        <>
          <h1 className="mt-5 text-2xl font-semibold">My orders</h1>
          {me && <p className="text-sm text-muted">Orders of +91 {me.phone}</p>}
          <div className="mt-4 space-y-4">
            {me && <OrderList phone={me.phone} />}
            {store && <HelpSupport store={store} phone={me?.phone ?? ''} />}
          </div>
        </>
      )}
      <BottomNav />
    </main>
  )
}

function OrderView({ data }) {
  const { order, items, store, complaints } = data
  const cancelled = order.status === 'cancelled'
  const reached = stepOf(order)

  return (
    <>
      <section className={`${card} mt-4 p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">#{order.order_number}</div>
            <div className="text-sm text-muted">{fmtDateTime(order.created_at)}</div>
          </div>
          <div className="text-right text-sm text-muted">Delivery<br />{deliveryWhen(order, store)}</div>
        </div>

        {cancelled ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-red-500/15 p-3">
            <X size={24} className="text-red-700" />
            <span><span className="block font-semibold text-red-700">Cancelled</span><span className="text-sm text-red-700/80">{order.cancel_reason}</span></span>
          </div>
        ) : (
          <ol className="mt-5">
            {STEPS.map(([key, title, step], i) => {
              const done = i <= reached
              const note = key === 'confirmed' && isExpress(order) ? `Confirmed, arriving by ${fmtClock(order.express_by)}` : step
              return (
                <li key={key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', done ? 'bg-brand text-white' : 'border border-line text-muted')}>
                      {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </span>
                    {i < STEPS.length - 1 && <span className={cx('h-8 w-0.5', i < reached ? 'bg-brand' : 'bg-line')} />}
                  </div>
                  <div className="pb-4">
                    <div className={cx('font-semibold', !done && 'text-muted')}>{title}</div>
                    <div className="text-sm text-muted">{note}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-2 space-y-1 border-t border-line pt-3 text-sm">
          {items.map((i) => (
            <div key={i.id} className="flex"><span className="flex-1 text-muted">{i.name_snapshot} ×{i.quantity}</span><span>{rupee(i.line_total)}</span></div>
          ))}
          <div className="flex"><span className="flex-1 text-muted">Delivery charge</span><span>{order.delivery_fee ? rupee(order.delivery_fee) : 'FREE'}</span></div>
          {Number(order.express_fee) > 0 && <div className="flex"><span className="flex-1 text-muted">Express delivery</span><span>{rupee(order.express_fee)}</span></div>}
          {order.packaging_fee > 0 && <div className="flex"><span className="flex-1 text-muted">Packaging charge</span><span>{rupee(order.packaging_fee)}</span></div>}
          {order.wallet_used > 0 && <div className="flex font-medium text-brand"><span className="flex-1">Jholzo Money</span><span>−{rupee(order.wallet_used)}</span></div>}
          <div className="flex pt-2 text-lg font-semibold"><span className="flex-1">Total</span><span>{rupee(order.total)}</span></div>
        </div>
        {data.mine && <PayNow order={order} store={store} />}
        <CancelOrder order={order} mine={data.mine} />
        {order.status === 'completed' && (
          <Link to={`/bill/${order.order_number}`} className={`${btnOutline} mt-3 w-full`}>View / download bill (PDF)</Link>
        )}
      </section>

      {complaints.length > 0 && (
        <section className={`${card} mt-3 space-y-2 p-4`}>
          <h2 className="font-semibold">Your complaint</h2>
          {complaints.map((k) => (
            <div key={k.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{k.type}</span>
                <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', k.status === 'open' ? 'bg-orange-500/20 text-orange-700' : 'bg-green-500/20 text-green-700')}>
                  {k.status === 'open' ? 'Looking into it' : 'Solved'}
                </span>
              </div>
              {k.message && <p className="mt-1 text-muted">{k.message}</p>}
              {k.admin_note && <p className="mt-1 text-brand">Reply: {k.admin_note}</p>}
            </div>
          ))}
        </section>
      )}

      <Link to={`/report/${order.order_number}`} className={`${card} mt-3 flex h-14 items-center gap-3 px-4 font-semibold`}>
        <AlertTriangle size={20} className="text-orange-700" /> <span className="flex-1">Report a problem</span> <ChevronRight size={20} className="text-muted" />
      </Link>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`tel:${store.phone}`} className={btnOutline}><Phone size={18} /> Call us</a>
        <a href={waLink(store.whatsapp, `About order #${order.order_number}`)} target="_blank" rel="noreferrer" className={`${btnAccent} min-h-11 text-base`}>
          <WhatsAppIcon size={18} /> WhatsApp
        </a>
      </div>

      <AddToHomeSheet show={order.status === 'completed'} />
    </>
  )
}
