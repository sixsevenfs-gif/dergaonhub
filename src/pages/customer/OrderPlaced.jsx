import { Link, useParams } from 'react-router-dom'
import { Bookmark, Check, ChevronRight, Clock, Clock3, House, MapPin, Phone, Store, WalletCards, XCircle } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card } from '../../components/ui.js'
import PayNow from '../../components/PayNow.jsx'
import { getOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { deliveryWhen, fmtClock, isExpress, rupee } from '../../lib/format.js'

export default function OrderPlaced() {
  const { orderNumber } = useParams()
  const { data, loading } = useData(() => getOrder(orderNumber), [orderNumber])
  if (loading) return null
  if (!data) return <p className="p-10 text-center text-muted">Order not found.</p>
  const { order, items, store } = data
  const trackUrl = `${window.location.host}/track/${order.order_number}`
  // "Pay now by UPI" orders are only placed once paid: until then the page asks for the payment.
  const upiNow = order.payment_method === 'upi_now' && order.status !== 'cancelled'
  const stage = order.status === 'cancelled' ? 'cancelled'
    : !upiNow || order.payment_status === 'paid' ? 'placed'
    : order.payment_status === 'verifying' ? 'verifying'
    : 'pay'

  return (
    <main className={`mx-auto min-h-screen max-w-md px-4 pt-4 ${stage === 'pay' && data.mine !== false ? 'pb-28' : 'pb-10'}`}>
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to="/" aria-label="Home" className="flex h-11 w-11 items-center justify-center rounded-full border border-line"><House size={20} /></Link>
      </header>

      {stage === 'placed' ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="relative">
            <span className="absolute -left-8 top-2 h-1 w-5 -rotate-12 rounded bg-brand" />
            <span className="absolute -right-8 top-2 h-1 w-5 rotate-12 rounded bg-brand" />
            <span className="absolute -left-6 bottom-3 h-1 w-4 -rotate-45 rounded bg-brand" />
            <span className="absolute -right-6 bottom-3 h-1 w-4 rotate-45 rounded bg-brand" />
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand">
              <Check size={52} strokeWidth={3.5} className="text-white" />
            </div>
          </div>
          <h1 className="mt-5 text-4xl font-semibold">Order placed!</h1>
          <p className="mt-1 text-2xl font-semibold text-muted">#{order.order_number}</p>
          <p className="mt-1 text-muted">
            {order.ordered_by_phone ? `We will deliver it to ${order.customer_name} (${order.customer_phone}).` : 'We have received your order.'}
          </p>
        </div>
      ) : stage === 'cancelled' ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-red-600"><XCircle size={44} /></div>
          <h1 className="mt-4 text-3xl font-semibold">Order cancelled</h1>
          <p className="mt-1 text-xl font-semibold text-muted">#{order.order_number}</p>
          {order.cancel_reason === 'Not paid in time' ? (
            <p className="mt-1 text-muted">The payment was not made within {store.upi_pay_minutes ?? 15} minutes.</p>
          ) : (
            order.cancel_reason && <p className="mt-1 text-muted">{order.cancel_reason}</p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${stage === 'pay' ? 'bg-amber-400/15 text-amber-600' : 'bg-sky-500/10 text-sky-600'}`}>
              {stage === 'pay' ? <WalletCards size={22} /> : <Clock3 size={22} />}
            </span>
            <span className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight">{stage === 'pay' ? 'Complete your payment' : 'Payment received'}</h1>
              <p className="text-[13px] text-muted">
                {stage === 'pay'
                  ? <>Order <b className="text-ink">#{order.order_number}</b> is saved. Pay to place it.</>
                  : <>Order <b className="text-ink">#{order.order_number}</b> is placed once we confirm it.</>}
              </p>
            </span>
          </div>
          <ol className="mx-auto mt-3 flex max-w-xs items-start justify-between text-[10px] font-medium">
            {[['Order saved', true], ['Payment', stage === 'verifying'], ['Confirmed', false]].map(([label, done], i) => (
              <li key={label} className="relative flex flex-1 flex-col items-center gap-0.5">
                {i > 0 && <span className={`absolute right-1/2 top-2.5 -z-10 h-0.5 w-full ${done || (i === 1 && stage === 'pay') ? 'bg-brand' : 'bg-line'}`} />}
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${done ? 'border-brand bg-brand text-white' : i === 1 ? 'border-brand bg-white text-brand' : 'border-line bg-white text-muted'}`}>
                  {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                </span>
                <span className={done || i === 1 ? 'text-ink' : 'text-muted'}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.mine !== false && <PayNow order={order} store={store} sticky />}

      <section className={`${card} mt-6 p-4`}>
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <Store size={26} />
          <div>
            <div className="font-semibold">{store.name}</div>
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
          {order.express_fee > 0 && (
            <div className="flex text-sm"><span className="flex-1 text-muted">Express delivery</span><span>{rupee(order.express_fee)}</span></div>
          )}
          {order.wallet_used > 0 && (
            <div className="flex text-sm font-medium text-brand"><span className="flex-1">Jholzo Money</span><span>−{rupee(order.wallet_used)}</span></div>
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-xl font-semibold"><span>Total</span><span>{rupee(order.total)}</span></div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Clock size={16} /> Delivery {deliveryWhen(order, store)}
        </div>
      </section>

      {stage !== 'cancelled' && <div className={`${card} mt-3 flex items-center gap-3 p-4`}>
        <Phone size={24} className="shrink-0 text-brand" />
        <span className="border-l border-line pl-3">
          <span className="block font-semibold">{order.payment_method === 'upi_now' ? 'We will confirm it on WhatsApp.' : 'We will call you to confirm.'}</span>
          <span className="text-sm text-muted">
            {order.payment_method === 'upi_now'
              ? 'As soon as your payment is verified (usually within 10 minutes), we send the confirmation on WhatsApp and pack your order.'
              : isExpress(order)
              ? `Express: we call you right away, then a rider brings it by ${fmtClock(order.express_by)}.`
              : 'Once confirmed, we pack your order at our store and deliver it in the evening.'}
          </span>
        </span>
      </div>}

      <Link to={`/track/${order.order_number}`} className={`${card} mt-3 flex h-14 items-center gap-3 px-4 font-semibold`}>
        <MapPin size={22} /> <span className="flex-1">Track order status</span> <ChevronRight size={20} className="text-muted" />
      </Link>

      <p className="mt-4 flex gap-3 px-1 text-sm text-muted">
        <Bookmark size={20} className="shrink-0" />
        <span>Save this link to track your order later<br /><span className="text-brand">{trackUrl}</span></span>
      </p>
    </main>
  )
}
