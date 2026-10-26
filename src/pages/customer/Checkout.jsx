import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, BadgePercent, Banknote, BookUser, Clock, Gift, LocateFixed, MapPin, Phone, Repeat, Route, Smartphone, User, UserRound } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import GlassTabs from '../../components/GlassTabs.jsx'
import LocationPicker from '../../components/LocationPicker.jsx'
import OutOfArea from '../../components/OutOfArea.jsx'
import { btnAccent, card, cx } from '../../components/ui.js'
import { codAllowed, currentCustomer, customerSignIn, nextDeliveryDate, placeOrder, sendAutoMessage } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { cleanPhone, fmtTime, rupee, slotDate, slotText, slotWords } from '../../lib/format.js'
import { useCartDetails } from '../../lib/useCartDetails.js'
import { currentPosition, deliveryQuote, packagingFee, validPoint } from '../../lib/delivery.js'
import { getSavedDetails, getSavedLocation, getSavedReceiver, placeName, saveDetails, saveLocation, saveReceiver } from '../../lib/customerLocation.js'

function InputRow({ icon: Icon, label, children, action }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 focus-within:border-accent">
      <Icon size={20} className="shrink-0 text-muted" />
      <span className="flex-1">
        <span className="block text-xs text-muted">{label}</span>
        {children}
      </span>
      {action}
    </label>
  )
}

const Radio = ({ on }) => (
  <span className={cx('h-5 w-5 shrink-0 rounded-full border-2', on ? 'border-accent bg-[radial-gradient(circle,#E8FF3A_45%,transparent_50%)]' : 'border-line')} />
)

const inputCls = 'w-full bg-transparent text-white placeholder:text-muted/60 focus:outline-none'

// Android Chrome can open the phone's contacts; elsewhere the button is hidden.
const canPickContact = typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window

async function pickContact() {
  const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false })
  if (!c) return null
  return { name: c.name?.[0] ?? '', phone: cleanPhone(c.tel?.[0] ?? '').slice(-10) }
}

const FOR_OPTIONS = [
  { value: 'me', label: 'For me', icon: User },
  { value: 'other', label: 'For someone else', icon: Gift },
]

export default function Checkout() {
  const { clear } = useCart()
  const { cart, store, lines, subtotal, savings, problems, ready } = useCartDetails()
  const [forWho, setForWho] = useState('me')
  const other = forWho === 'other'
  // The customer (the person ordering).
  const [form, setForm] = useState(() => {
    const saved = getSavedDetails()
    const me = currentCustomer()
    return { name: me?.name || saved.name || '', phone: me?.phone || saved.phone || '', address: saved.address ?? '', area: saved.area ?? '' }
  })
  // The receiver, when ordering for someone else (last one is remembered).
  const [receiver, setReceiver] = useState(() => {
    const r = getSavedReceiver()
    return { name: r.name ?? '', phone: r.phone ?? '', address: r.address ?? '', area: r.area ?? '' }
  })
  const [myLocation, setMyLocationState] = useState(() => getSavedLocation() ?? (validPoint(getSavedDetails().location) ? getSavedDetails().location : null))
  const [theirLocation, setTheirLocation] = useState(() => (validPoint(getSavedReceiver().location) ? getSavedReceiver().location : null))
  const location = other ? theirLocation : myLocation
  const [here, setHere] = useState(null)
  const [focus, setFocus] = useState(0)
  // My own pin is remembered for the header and My account too; the receiver's is not.
  const setMyLocation = (p) => {
    setMyLocationState(p)
    saveLocation(p, getSavedLocation()?.label ?? '')
    placeName(p).then((label) => label && saveLocation(p, label))
  }
  const setLocation = (p) => (other ? setTheirLocation(p) : setMyLocation(p))
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [payment, setPayment] = useState('cash')
  const [substitute, setSubstitute] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)

  const locate = async () => {
    setLocating(true)
    setLocError('')
    try {
      const p = await currentPosition()
      setHere(p)
      setLocation({ lat: p.lat, lng: p.lng })
      setFocus((n) => n + 1)
    } catch (err) {
      setLocError(err.denied ? 'Location is off for this site. Move the map to put the pin on the home.' : 'Could not find your location. Move the map to put the pin on the home.')
    }
    setLocating(false)
  }

  // Ask for the phone's location as soon as checkout opens (unless one was saved last time).
  useEffect(() => {
    if (!myLocation) locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real delivery day: a full evening moves orders to the next free day.
  const { data: deliveryDay } = useData(nextDeliveryDate)

  // Repeated no-shows on these numbers take away cash on delivery (the database checks this again).
  const [codOk, setCodOk] = useState(true)
  const phonesKey = forWho === 'other' ? `${receiver.phone}|${form.phone}` : form.phone
  useEffect(() => {
    let live = true
    Promise.all(phonesKey.split('|').map((ph) => codAllowed(ph))).then((all) => {
      if (!live) return
      const ok = all.every(Boolean)
      setCodOk(ok)
      if (!ok) setPayment((p) => (p === 'cash' ? 'upi' : p))
    })
    return () => {
      live = false
    }
  }, [phonesKey])

  // Checked first: clearing the cart after placing must not bounce back to the empty cart.
  if (placed) return <Navigate to={`/order/${placed}`} replace />
  if (!ready) return null
  if (!lines.length || problems.length || subtotal < store.min_order) return <Navigate to="/cart" replace />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setR = (k) => (e) => setReceiver({ ...receiver, [k]: e.target.value })
  // Address fields belong to whoever receives the order.
  const addr = other ? receiver : form
  const setAddr = other ? setR : set
  const quote = deliveryQuote(store, location, subtotal)
  const fee = quote && !quote.tooFar ? quote.fee : null
  const packaging = packagingFee(store, subtotal)
  const total = subtotal + (fee ?? 0) + packaging
  const firstName = receiver.name.trim().split(' ')[0]

  const fromContacts = async () => {
    try {
      const c = await pickContact()
      if (c) setReceiver({ ...receiver, name: c.name || receiver.name, phone: c.phone || receiver.phone })
    } catch {
      // closed the contact list
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (other && cleanPhone(receiver.phone) === cleanPhone(form.phone)) {
      setError("The receiver's number is the same as yours. Choose \"For me\", or enter their number.")
      return
    }
    setBusy(true)
    try {
      const order = await placeOrder({
        lines: lines.map((l) => ({ productId: l.id, qty: l.qty, note: l.note })),
        ...(other ? { ...receiver, orderer: { name: form.name, phone: form.phone } } : form),
        // No area to choose any more: the map pin says where. The database still wants one of the store's areas.
        area: store.delivery_area[0] ?? '',
        location,
        note: cart.note,
        payment_method: payment,
        allow_substitute: substitute,
      })
      if (other) {
        saveDetails({ name: form.name, phone: form.phone })
        saveReceiver({ ...receiver, location })
      } else {
        saveDetails(form)
      }
      // "Order placed" on WhatsApp, if the admin has switched on automatic messages. It never blocks the order.
      if (store.whatsapp_auto) sendAutoMessage({ orderNumber: order.order_number, kind: 'placed' })
      // The phone of the person ordering becomes the login, so "My orders" works right away.
      await customerSignIn(form.phone, form.name)
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
      <p className="text-muted">{other ? 'Send groceries to your family or friends in Dergaon' : 'Fill in your details and place your order'}</p>

      <GlassTabs options={FOR_OPTIONS} value={forWho} onChange={setForWho} className="mt-4" />

      <form onSubmit={submit} className="mt-3 space-y-3">
        {other && (
          <p className="flex gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3 text-sm leading-snug">
            <Gift size={20} className="mt-0.5 shrink-0 text-accent" />
            <span>Living outside Dergaon? Order here and we deliver to them. <span className="text-muted">You get the order updates; our rider calls them at delivery.</span></span>
          </p>
        )}

        <section className={`${card} space-y-3 p-3`}>
          <h2 className="px-1 pt-1 font-bold">Your details</h2>
          <InputRow icon={User} label={other ? 'Your name' : 'Name'}>
            <input required value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" className={inputCls} />
          </InputRow>
          <InputRow icon={Phone} label={other ? 'Your phone (for order updates)' : 'Phone'}>
            <input required value={form.phone} onChange={set('phone')} placeholder="10 digit mobile number" inputMode="numeric" autoComplete="tel" className={inputCls} />
          </InputRow>
        </section>

        {other && (
          <section className={`${card} space-y-3 p-3`}>
            <h2 className="px-1 pt-1 font-bold">Who will receive it?</h2>
            <InputRow
              icon={UserRound}
              label="Their name"
              action={canPickContact && (
                <button type="button" onClick={fromContacts} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-accent/50 px-3 text-xs font-semibold text-accent">
                  <BookUser size={15} /> Contacts
                </button>
              )}
            >
              <input required value={receiver.name} onChange={setR('name')} placeholder="e.g. Maa, Ritu Das" autoComplete="off" className={inputCls} />
            </InputRow>
            <InputRow icon={Phone} label="Their phone (rider will call)">
              <input required value={receiver.phone} onChange={setR('phone')} placeholder="10 digit mobile number" inputMode="numeric" autoComplete="off" className={inputCls} />
            </InputRow>
          </section>
        )}

        <section className={`${card} space-y-3 p-3`}>
          <h2 className="px-1 pt-1 font-bold">{other ? 'Their address' : 'Delivery address'}</h2>
          <InputRow icon={MapPin} label="Address / Landmark">
            <input required value={addr.address} onChange={setAddr('address')} placeholder="House no., area, landmark..." autoComplete={other ? 'off' : 'street-address'} className={inputCls} />
          </InputRow>

          <div className="relative overflow-hidden rounded-2xl border border-line">
            {/* A new map when switching between me and them, so each starts at its own pin. */}
            <LocationPicker key={forWho} value={location} onChange={setLocation} start={store.location} home={store.location} here={here} focus={focus} fixedPin className="h-60 [&_.leaflet-bottom]:mb-0" />
            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3">
              <p className="rounded-lg bg-ink/90 px-3 py-1 text-center text-[11px] text-white shadow-lg">
                Move the map to place the pin on {other ? 'their' : 'your'} door
              </p>
            </div>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="absolute bottom-7 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-accent/70 bg-ink px-4 text-xs font-semibold text-accent shadow-[0_6px_20px_rgb(0_0_0/0.35)] disabled:opacity-80"
            >
              <LocateFixed size={15} className={locating ? 'animate-pulse' : ''} /> {locating ? 'Finding you...' : other ? 'I am at their home' : 'Use current location'}
            </button>
          </div>
          {locError && <p className="px-1 text-xs text-orange-200">{locError}</p>}

          {!location ? (
            <p className="rounded-xl bg-white/5 p-3 text-sm text-muted">Set the pin on the map to see the delivery charge.</p>
          ) : quote.tooFar ? (
            <OutOfArea location={location} label={other ? '' : getSavedLocation()?.label} km={quote.km} compact={other} />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"><Route size={21} /></span>
              <span className="flex-1">
                <span className="block font-bold">{quote.km} km from our store</span>
                <span className="text-xs text-muted">Road distance to the pin</span>
              </span>
              <span className="text-right">
                {quote.free ? (
                  <>
                    <span className="block text-xs text-muted line-through">{rupee(quote.fullFee)}</span>
                    <span className="block font-ui text-lg font-black text-emerald-400">FREE</span>
                  </>
                ) : (
                  <>
                    <span className="block text-lg font-black text-accent">{rupee(quote.fee)}</span>
                    <span className="text-[11px] text-muted">{quote.small ? 'small order' : 'delivery'}</span>
                  </>
                )}
              </span>
            </div>
          )}

          {quote && !quote.tooFar && quote.small && quote.small.save > 0 && (
            <Link to="/" className="flex items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xl">💡</span>
              <span className="flex-1 text-sm">
                <span className="block font-bold text-emerald-300">Add {rupee(quote.small.addMore)} more, save {rupee(quote.small.save)} on delivery</span>
                <span className="text-muted">
                  Orders below {rupee(store.small_order_below)} pay {rupee(quote.fee)} delivery. From {rupee(store.small_order_below)} it is {quote.fullFee && store.free_delivery ? 'FREE' : rupee(quote.fee - quote.small.save)}.
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-bold text-ink">Add items</span>
            </Link>
          )}

          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <Clock size={26} className="shrink-0 text-accent" />
            <span>
              <span className="block font-bold text-accent">Delivery {slotText(deliveryDay ?? slotDate(store), store)}</span>
              {deliveryDay && deliveryDay > slotDate(store) && (
                <span className="block text-sm text-orange-200">We are facing heavy traffic today, so we will deliver your order {slotWords(deliveryDay, store)}.</span>
              )}
              <span className="text-sm text-muted">Orders after {fmtTime(store.cutoff_time)} are delivered the next day</span>
            </span>
          </div>
        </section>

        <button type="button" onClick={() => setSubstitute(!substitute)} className={`${card} flex w-full items-center gap-3 p-4 text-left`}>
          <Repeat size={22} className="shrink-0 text-muted" />
          <span className="flex-1">
            <span className="block font-semibold">If this brand isn't available, a similar brand is OK</span>
            <span className="text-xs text-muted">Same type and size, about the same price</span>
          </span>
          <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', substitute ? 'bg-accent' : 'bg-white/20')}>
            <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-ink transition-all', substitute ? 'left-[22px]' : 'left-0.5 bg-white')} />
          </span>
        </button>

        <section className={`${card} space-y-2 p-3`}>
          <h2 className="px-1 pt-1 font-bold">Payment method</h2>
          {other && <p className="px-1 text-xs text-muted">{firstName || 'The receiver'} pays when the items arrive. Want to pay yourself? Call us after ordering.</p>}
          {[
            ['cash', Banknote, 'Cash on delivery', other ? `${firstName || 'They'} pay cash at the door` : 'Pay cash when you receive your items'],
            ['upi', Smartphone, 'UPI on delivery', other ? `${firstName || 'They'} scan our QR at the door` : 'Scan our QR and pay at delivery'],
          ].map(([value, Icon, title, note]) => {
            const off = value === 'cash' && !codOk
            return (
              <button key={value} type="button" disabled={off} onClick={() => setPayment(value)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', payment === value ? 'border-accent' : 'border-line', off && 'opacity-60')}>
                <Radio on={payment === value} />
                <Icon size={24} />
                <span>
                  <span className="block font-semibold">{title}</span>
                  {off ? (
                    <span className="text-xs text-red-300">Due to misuse of cash on delivery, we have temporarily restricted it for this number.</span>
                  ) : (
                    <span className="text-xs text-muted">{note}</span>
                  )}
                </span>
              </button>
            )
          })}
        </section>

        <section className={`${card} p-4`}>
          <h2 className="font-bold">Bill summary</h2>
          <div className="mt-2 flex justify-between text-muted"><span>Items ({lines.reduce((s, l) => s + l.qty, 0)})</span><span>{rupee(subtotal)}</span></div>
          <div className="mt-1 flex justify-between text-muted">
            <span>Delivery charge{fee !== null ? ` (${quote.km} km)` : ''}</span>
            <span>
              {fee === null ? 'Set the pin' : quote.free ? (
                <><s className="mr-1.5 text-xs">{rupee(quote.fullFee)}</s><b className="font-ui text-emerald-400">FREE</b></>
              ) : rupee(fee)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-muted"><span>Packaging charge</span><span>{rupee(packaging)}</span></div>
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-bold"><span>Total Amount</span><span>{rupee(total)}</span></div>
          {savings > 0 && (
            <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-300">
              <BadgePercent size={16} /> You save {rupee(savings)} on this order
            </p>
          )}
        </section>

        {/* Cloudflare Turnstile (free CAPTCHA) goes here when the site is deployed. */}

        {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy || fee === null} className={`${btnAccent} h-14`}>
          {busy ? 'Placing...' : other && firstName ? `Place order for ${firstName}` : 'Place order'}
        </button>
        <p className="text-center text-xs text-muted">
          {other
            ? 'We will call you or them to confirm the order. You can cancel it until our rider is on the way.'
            : 'We will call you to confirm your order. You can cancel it until our rider is on the way.'}
        </p>
        <p className="text-center text-xs text-muted">
          By placing an order you agree to our <Link to="/policy/terms" className="underline">Terms</Link>,{' '}
          <Link to="/policy/refund" className="underline">Refund policy</Link> and{' '}
          <Link to="/policy/privacy" className="underline">Privacy policy</Link>.
        </p>
      </form>
    </main>
  )
}
