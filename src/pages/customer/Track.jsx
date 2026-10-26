import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Phone, X } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import AddToHomeSheet from '../../components/AddToHomeSheet.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { btnAccent, btnOutline, card, cx, field } from '../../components/ui.js'
import { cancelMyOrder, getOrder, ordersByPhone } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone, fmtDateTime, rupee, slotText, statusLabel } from '../../lib/format.js'
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
    return <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-muted">Our rider is on the way, so this order can't be cancelled now.</p>
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
            <button type="button" onClick={cancel} className="h-11 flex-1 rounded-xl bg-red-500 font-semibold text-white">Yes, cancel</button>
            <button type="button" onClick={() => setAsking(false)} className={`${btnOutline} flex-1`}>Keep order</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={`${btnOutline} w-full text-red-300`}>Cancel order</button>
      )}
      <p className="mt-1.5 text-center text-xs text-muted">You can cancel until our rider is on the way.</p>
      {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
    </div>
  )
}

function FindByPhone() {
  const [phone, setPhone] = useState('')
  const [list, setList] = useState(null)
  const find = async (e) => {
    e.preventDefault()
    setList(await ordersByPhone(phone))
  }
  return (
    <section className={`${card} p-4`}>
      <h2 className="font-bold">Find an order by phone number</h2>
      <form onSubmit={find} className="mt-3 flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="10 digit number" className={field} />
        <button type="submit" disabled={cleanPhone(phone).length !== 10} className="h-12 shrink-0 rounded-xl bg-accent px-5 font-bold text-ink disabled:opacity-40">Find</button>
      </form>
      {list && (
        <div className="mt-3 space-y-2">
          {list.map((o) => (
            <Link key={o.id} to={`/track/${o.order_number}`} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex-1">
                <span className="block font-semibold">#{o.order_number}</span>
                <span className="text-sm text-muted">{fmtDateTime(o.created_at)} · {rupee(o.total)} · {statusLabel(o.status)}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          ))}
          {!list.length && <p className="text-sm text-muted">No orders found for this number.</p>}
        </div>
      )}
    </section>
  )
}

export default function Track() {
  const { orderNumber } = useParams()
  const { data } = useData(() => (orderNumber ? getOrder(orderNumber) : null), [orderNumber])

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">Order status</h1>

      {data && <OrderView data={data} />}
      {orderNumber && data === null && <p className="mt-4 text-muted">Order #{orderNumber} not found.</p>}

      <div className="mt-5">
        <FindByPhone />
      </div>
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
            <div className="text-2xl font-bold">#{order.order_number}</div>
            <div className="text-sm text-muted">{fmtDateTime(order.created_at)}</div>
          </div>
          <div className="text-right text-sm text-muted">Delivery<br />{slotText(order.delivery_date, store)}</div>
        </div>

        {cancelled ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-red-500/15 p-3">
            <X size={24} className="text-red-300" />
            <span><span className="block font-bold text-red-200">Cancelled</span><span className="text-sm text-red-200/80">{order.cancel_reason}</span></span>
          </div>
        ) : (
          <ol className="mt-5">
            {STEPS.map(([key, title, note], i) => {
              const done = i <= reached
              return (
                <li key={key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', done ? 'bg-accent text-ink' : 'border border-line text-muted')}>
                      {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </span>
                    {i < STEPS.length - 1 && <span className={cx('h-8 w-0.5', i < reached ? 'bg-accent' : 'bg-line')} />}
                  </div>
                  <div className="pb-4">
                    <div className={cx('font-bold', !done && 'text-muted')}>{title}</div>
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
          {order.packaging_fee > 0 && <div className="flex"><span className="flex-1 text-muted">Packaging charge</span><span>{rupee(order.packaging_fee)}</span></div>}
          <div className="flex pt-2 text-lg font-bold"><span className="flex-1">Total</span><span>{rupee(order.total)}</span></div>
        </div>
        <CancelOrder order={order} mine={data.mine} />
        {order.status === 'completed' && (
          <Link to={`/bill/${order.order_number}`} className={`${btnOutline} mt-3 w-full`}>View / download bill (PDF)</Link>
        )}
      </section>

      {complaints.length > 0 && (
        <section className={`${card} mt-3 space-y-2 p-4`}>
          <h2 className="font-bold">Your complaint</h2>
          {complaints.map((k) => (
            <div key={k.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{k.type}</span>
                <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', k.status === 'open' ? 'bg-orange-500/20 text-orange-300' : 'bg-green-500/20 text-green-300')}>
                  {k.status === 'open' ? 'Looking into it' : 'Solved'}
                </span>
              </div>
              {k.message && <p className="mt-1 text-muted">{k.message}</p>}
              {k.admin_note && <p className="mt-1 text-accent">Reply: {k.admin_note}</p>}
            </div>
          ))}
        </section>
      )}

      <Link to={`/report/${order.order_number}`} className={`${card} mt-3 flex h-14 items-center gap-3 px-4 font-semibold`}>
        <AlertTriangle size={20} className="text-orange-300" /> <span className="flex-1">Report a problem</span> <ChevronRight size={20} className="text-muted" />
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
