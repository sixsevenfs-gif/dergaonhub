import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Banknote, ChevronDown, Clock, Map, MapPin, Phone, Repeat, Smartphone, User } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { btnAccent, card, cx } from '../../components/ui.js'
import { currentCustomer, customerSignIn, placeOrder } from '../../lib/store.js'
import { useCart } from '../../lib/cart-context.js'
import { fmtTime, rupee, slotDate, slotText } from '../../lib/format.js'
import { useCartDetails } from '../../lib/useCartDetails.js'

const SAVED_KEY = 'dergaonhub-checkout'
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? {}
  } catch {
    return {}
  }
}

function InputRow({ icon: Icon, label, children }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 focus-within:border-accent">
      <Icon size={20} className="shrink-0 text-muted" />
      <span className="flex-1">
        <span className="block text-xs text-muted">{label}</span>
        {children}
      </span>
    </label>
  )
}

const Radio = ({ on }) => (
  <span className={cx('h-5 w-5 shrink-0 rounded-full border-2', on ? 'border-accent bg-[radial-gradient(circle,#E8FF3A_45%,transparent_50%)]' : 'border-line')} />
)

const inputCls = 'w-full bg-transparent text-white placeholder:text-muted/60 focus:outline-none'

export default function Checkout() {
  const { clear } = useCart()
  const { cart, store, lines, subtotal, problems, ready } = useCartDetails()
  const [form, setForm] = useState(() => {
    const saved = loadSaved()
    const me = currentCustomer()
    return { name: me?.name || saved.name || '', phone: me?.phone || saved.phone || '', address: saved.address ?? '', area: saved.area ?? '' }
  })
  const [payment, setPayment] = useState('cash')
  const [substitute, setSubstitute] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)

  // Checked first: clearing the cart after placing must not bounce back to the empty cart.
  if (placed) return <Navigate to={`/order/${placed}`} replace />
  if (!ready) return null
  if (!lines.length || problems.length || subtotal < store.min_order) return <Navigate to="/cart" replace />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const total = subtotal + store.delivery_fee

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const order = await placeOrder({
        lines: lines.map((l) => ({ productId: l.id, qty: l.qty, note: l.note })),
        ...form,
        note: cart.note,
        payment_method: payment,
        allow_substitute: substitute,
      })
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(form))
      } catch {
        // not saved: customer types details again next time
      }
      // The phone used for the order becomes the customer's login, so "My orders" works right away.
      await customerSignIn(order.customer_phone, order.customer_name)
      setPlaced(order.order_number)
      clear()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to="/cart" className="flex items-center gap-2 text-muted"><ArrowLeft size={20} /> Back</Link>
      </header>
      <h1 className="mt-5 text-3xl font-black">Checkout</h1>
      <p className="text-muted">Apni details bharo aur order place karo</p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <section className={`${card} space-y-3 p-3`}>
          <InputRow icon={User} label="Name">
            <input required value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" className={inputCls} />
          </InputRow>
          <InputRow icon={Phone} label="Phone">
            <input required value={form.phone} onChange={set('phone')} placeholder="10 digit mobile number" inputMode="numeric" autoComplete="tel" className={inputCls} />
          </InputRow>
          <InputRow icon={MapPin} label="Address / Landmark">
            <input required value={form.address} onChange={set('address')} placeholder="House no., area, landmark..." autoComplete="street-address" className={inputCls} />
          </InputRow>
          <InputRow icon={Map} label="Area">
            <span className="relative block">
              <select required value={form.area} onChange={set('area')} className={`${inputCls} appearance-none pr-6`}>
                <option value="" className="bg-card">Select area</option>
                {store.delivery_area.map((a) => <option key={a} value={a} className="bg-card">{a}</option>)}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted" />
            </span>
          </InputRow>

          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <Clock size={26} className="shrink-0 text-accent" />
            <span>
              <span className="block font-bold text-accent">Order before {fmtTime(store.cutoff_time)},</span>
              delivery {slotText(slotDate(store), store)}
            </span>
          </div>
        </section>

        <button type="button" onClick={() => setSubstitute(!substitute)} className={`${card} flex w-full items-center gap-3 p-4 text-left`}>
          <Repeat size={22} className="shrink-0 text-muted" />
          <span className="flex-1">
            <span className="block font-semibold">Ye brand na mile toh similar brand chalega</span>
            <span className="text-xs text-muted">Same type aur size, price lagbhag same</span>
          </span>
          <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', substitute ? 'bg-accent' : 'bg-white/20')}>
            <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-ink transition-all', substitute ? 'left-[22px]' : 'left-0.5 bg-white')} />
          </span>
        </button>

        <section className={`${card} space-y-2 p-3`}>
          <h2 className="px-1 pt-1 font-bold">Payment method</h2>
          {[
            ['cash', Banknote, 'Cash on delivery', 'Saman milne pe cash do'],
            ['upi', Smartphone, 'UPI on delivery', 'Delivery pe QR scan karke pay karo'],
          ].map(([value, Icon, title, note]) => (
            <button key={value} type="button" onClick={() => setPayment(value)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', payment === value ? 'border-accent' : 'border-line')}>
              <Radio on={payment === value} />
              <Icon size={24} />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-xs text-muted">{note}</span>
              </span>
            </button>
          ))}
        </section>

        <section className={`${card} p-4`}>
          <h2 className="font-bold">Bill summary</h2>
          <div className="mt-2 flex justify-between text-muted"><span>Items ({lines.reduce((s, l) => s + l.qty, 0)})</span><span>{rupee(subtotal)}</span></div>
          <div className="mt-1 flex justify-between text-muted"><span>Delivery fee</span><span>{rupee(store.delivery_fee)}</span></div>
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-bold"><span>Total Amount</span><span>{rupee(total)}</span></div>
        </section>

        {/* Cloudflare Turnstile (free CAPTCHA) goes here when the site is deployed. */}

        {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnAccent} h-14`}>{busy ? 'Placing...' : 'Place order'}</button>
        <p className="text-center text-xs text-muted">
          Hum aapko call karke order confirm karenge. Confirm hone ke baad saman kharid liya jaata hai, isliye uske baad cancel nahi hoga.
        </p>
        <p className="text-center text-xs text-muted">
          Order karke aap hamari <Link to="/policy/terms" className="underline">Terms</Link>,{' '}
          <Link to="/policy/refund" className="underline">Refund policy</Link> aur{' '}
          <Link to="/policy/privacy" className="underline">Privacy policy</Link> se agree karte ho.
        </p>
      </form>
    </main>
  )
}
