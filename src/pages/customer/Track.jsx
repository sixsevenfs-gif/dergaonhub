import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronRight, Phone, X } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import AddToHomeSheet from '../../components/AddToHomeSheet.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { btnAccent, btnOutline, card, cx, field } from '../../components/ui.js'
import { getOrder, ordersByPhone } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone, dayLabel, fmtDateTime, rupee, slotText } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

const STEPS = [
  ['placed', 'Placed', 'Shop ko order mil gaya'],
  ['confirmed', 'Confirmed', 'Shop ne confirm kiya, packing ho rahi hai'],
  ['completed', 'Completed', 'Order mil gaya. Thank you!'],
]

function FindByPhone() {
  const [phone, setPhone] = useState('')
  const [list, setList] = useState(null)
  const find = async (e) => {
    e.preventDefault()
    setList(await ordersByPhone(phone))
  }
  return (
    <section className={`${card} p-4`}>
      <h2 className="font-bold">Phone number se order dhundo</h2>
      <form onSubmit={find} className="mt-3 flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="10 digit number" className={field} />
        <button type="submit" disabled={cleanPhone(phone).length !== 10} className="h-12 shrink-0 rounded-xl bg-accent px-5 font-bold text-ink disabled:opacity-40">Find</button>
      </form>
      {list && (
        <div className="mt-3 space-y-2">
          {list.map((o) => (
            <Link key={o.id} to={`/track/${o.order_number}`} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex-1">
                <span className="block font-semibold">#{o.order_number} · {o.shop_name}</span>
                <span className="text-sm text-muted">{fmtDateTime(o.created_at)} · {rupee(o.total)} · {o.status}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          ))}
          {!list.length && <p className="text-sm text-muted">Is number se koi order nahi mila.</p>}
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
      {orderNumber && data === null && <p className="mt-4 text-muted">Order #{orderNumber} nahi mila.</p>}

      <div className="mt-5">
        <FindByPhone />
      </div>
    </main>
  )
}

function OrderView({ data }) {
  const { order, items, shop } = data
  const cancelled = order.status === 'cancelled'
  const reached = STEPS.findIndex(([s]) => s === order.status)

  return (
    <>
      <section className={`${card} mt-4 p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">#{order.order_number}</div>
            <div className="text-muted">{shop.name}</div>
          </div>
          <div className="text-right text-sm text-muted">
            {order.type === 'delivery' ? 'Delivery' : 'Pickup'}<br />
            {order.type === 'delivery' ? slotText(order.delivery_date, shop) : dayLabel(order.delivery_date)}
          </div>
        </div>

        {cancelled ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-red-500/15 p-3">
            <X size={24} className="text-red-300" />
            <span><span className="block font-bold text-red-200">Cancelled</span><span className="text-sm text-red-200/80">{order.cancel_reason}</span></span>
          </div>
        ) : (
          <ol className="mt-5 space-y-0">
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
          {order.delivery_fee > 0 && <div className="flex"><span className="flex-1 text-muted">Delivery fee</span><span>{rupee(order.delivery_fee)}</span></div>}
          <div className="flex pt-2 text-lg font-bold"><span className="flex-1">Total</span><span>{rupee(order.total)}</span></div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`tel:${shop.phone}`} className={btnOutline}><Phone size={18} /> Call shop</a>
        <a href={waLink(shop.whatsapp, `Order #${order.order_number} ke baare mein`)} target="_blank" rel="noreferrer" className={`${btnAccent} min-h-11 text-base`}>
          <WhatsAppIcon size={18} /> WhatsApp
        </a>
      </div>

      <AddToHomeSheet show={order.status === 'completed'} />
    </>
  )
}
