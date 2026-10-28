import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, BadgePercent, Banknote, BookUser, Clock, Gift, LocateFixed, MapPin, Phone, Repeat, Route, Smartphone, Ticket, User, UserRound, WalletMinimal, Zap } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import GlassTabs from '../../components/GlassTabs.jsx'
import LocationPicker from '../../components/LocationPicker.jsx'
import OutOfArea from '../../components/OutOfArea.jsx'
import { btnAccent, card, cx } from '../../components/ui.js'
import { codAllowed, currentCustomer, customerSignIn, myWallet, nextDeliveryDate, phoneVerified, placeOrder, sendAutoMessage } from '../../lib/store.js'
import { clearRefCode, savedRefCode, walletRules, walletToUse } from '../../lib/wallet.js'
import OtpSheet from '../../components/OtpSheet.jsx'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { cleanPhone, fmtTime, rupee, slotDate, slotText, slotWords } from '../../lib/format.js'
import { useCartDetails } from '../../lib/useCartDetails.js'
import { currentPosition, deliveryQuote, deliveryRules, expressStatus, expressTimeText, packagingFee, validPoint } from '../../lib/delivery.js'
import { getSavedDetails, getSavedLocation, getSavedReceiver, placeName, saveDetails, saveLocation, saveReceiver } from '../../lib/customerLocation.js'

function InputRow({ icon: Icon, label, children, action }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 focus-within:border-brand">
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
  <span className={cx('h-5 w-5 shrink-0 rounded-full border-2', on ? 'border-brand bg-[radial-gradient(circle,#1F6B3A_45%,transparent_50%)]' : 'border-line')} />
)

const inputCls = 'w-full bg-transparent text-ink placeholder:text-muted/60 focus:outline-none'

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
  const [otpFor, setOtpFor] = useState(null) // phone waiting for its OTP
  const [useWallet, setUseWallet] = useState(true)
  const [wantExpress, setWantExpress] = useState(false)
  const [refCode, setRefCode] = useState(savedRefCode)
  const formRef = useRef(null)

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
      if (!ok) setPayment((p) => (p === 'cash' ? 'upi_now' : p))
    })
    return () => {
      live = false
    }
  }, [phonesKey])

  // Jholzo Money and the invite code belong to the person ordering (update 017; null before it).
  const { data: wallet } = useData(() => myWallet(form.phone), [cleanPhone(form.phone)])

  // Checked first: clearing the cart after placing must not bounce back to the empty cart.
  if (placed) return <Navigate to={`/order/${placed}`} replace />
  if (!ready) return null
  if (!lines.length || problems.length || subtotal < store.min_order) return <Navigate to="/cart" replace />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setR = (k) => (e) => setReceiver({ ...receiver, [k]: e.target.value })
  // Address fields belong to whoever receives the order.
  const addr = other ? receiver : form
  const setAddr = other ? setR : set
  // Express (within the hour) only while it is switched on and open; otherwise the evening slot.
  const ex = expressStatus(store)
  const express = wantExpress && ex.ok
  const dRules = deliveryRules(store)
  const quote = deliveryQuote(store, location, subtotal, express)
  const fee = quote && !quote.tooFar ? quote.fee : null
  const packaging = packagingFee(store, subtotal)
  const fullTotal = Math.round((subtotal + (fee ?? 0) + packaging) * 100) / 100
  const rules = walletRules(store)
  const walletBalance = wallet && !wallet.locked ? wallet.balance : 0
  const walletUse = useWallet ? walletToUse(walletBalance, store, fullTotal) : 0
  const total = Math.round((fullTotal - walletUse) * 100) / 100
  // Invite code box: only for a number with no orders yet (the database checks this again).
  const showInvite = !!wallet && rules.on && (wallet.locked || (!wallet.has_orders && !wallet.referred))
  // Pay now by UPI needs the store's UPI ID; above cod_limit it is the only way to pay.
  const canPayNow = !!store.upi_id
  const overLimit = store.cod_limit != null && total > store.cod_limit
  const method = overLimit ? 'upi_now' : payment === 'upi_now' && !canPayNow ? 'cash' : payment
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
    // OTP once per new phone: the number of the person ordering, before placing the order.
    if (store.otp_required && cleanPhone(form.phone).length === 10 && !(await phoneVerified(form.phone))) {
      setOtpFor(cleanPhone(form.phone))
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
        payment_method: method,
        allow_substitute: substitute,
        use_wallet: walletUse > 0,
        express,
        ref_code: showInvite ? refCode : '',
      })
      if (showInvite && refCode) clearRefCode()
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
      <h1 className="mt-5 text-2xl font-semibold">Checkout</h1>
      <p className="text-muted">{other ? 'Send groceries to your family or friends in Dergaon' : 'Fill in your details and place your order'}</p>

      <GlassTabs options={FOR_OPTIONS} value={forWho} onChange={setForWho} className="mt-4" />

      {otpFor && (
        <OtpSheet
          phone={otpFor}
          onClose={() => setOtpFor(null)}
          onVerified={() => {
            setOtpFor(null)
            formRef.current?.requestSubmit() // verified: place the order now
          }}
        />
      )}

      <form ref={formRef} onSubmit={submit} className="mt-3 space-y-3">
        {other && (
          <p className="flex gap-3 rounded-2xl border border-brand/30 bg-brand/[0.06] p-3 text-sm leading-snug">
            <Gift size={20} className="mt-0.5 shrink-0 text-brand" />
            <span>Living outside Dergaon? Order here and we deliver to them. <span className="text-muted">You get the order updates; our rider calls them at delivery.</span></span>
          </p>
        )}

        <section className={`${card} space-y-3 p-3`}>
          <h2 className="px-1 pt-1 font-semibold">Your details</h2>
          <InputRow icon={User} label={other ? 'Your name' : 'Name'}>
            <input required value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" className={inputCls} />
          </InputRow>
          <InputRow icon={Phone} label={other ? 'Your phone (for order updates)' : 'Phone'}>
            <input required value={form.phone} onChange={set('phone')} placeholder="10 digit mobile number" inputMode="numeric" autoComplete="tel" className={inputCls} />
          </InputRow>
        </section>

        {other && (
          <section className={`${card} space-y-3 p-3`}>
            <h2 className="px-1 pt-1 font-semibold">Who will receive it?</h2>
            <InputRow
              icon={UserRound}
              label="Their name"
              action={canPickContact && (
                <button type="button" onClick={fromContacts} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand/50 px-3 text-xs font-semibold text-brand">
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
          <h2 className="px-1 pt-1 font-semibold">{other ? 'Their address' : 'Delivery address'}</h2>
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
              className="absolute bottom-7 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-brand/70 bg-white px-4 text-xs font-semibold text-brand shadow-[0_6px_20px_rgb(0_0_0/0.35)] disabled:opacity-80"
            >
              <LocateFixed size={15} className={locating ? 'animate-pulse' : ''} /> {locating ? 'Finding you...' : other ? 'I am at their home' : 'Use current location'}
            </button>
          </div>
          {locError && <p className="px-1 text-xs text-orange-700">{locError}</p>}

          {!location ? (
            <p className="rounded-xl bg-black/5 p-3 text-sm text-muted">Set the pin on the map to see the delivery charge.</p>
          ) : quote.tooFar ? (
            <OutOfArea location={location} label={other ? '' : getSavedLocation()?.label} km={quote.km} compact={other} />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-black/[0.03] p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Route size={21} /></span>
              <span className="flex-1">
                <span className="block font-semibold">{quote.km} km from our store</span>
                <span className="text-xs text-muted">Road distance to the pin</span>
              </span>
              <span className="text-xs font-semibold text-brand">We deliver here ✓</span>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="px-1 pt-1 text-sm font-semibold">When should we deliver?</h3>
            <button type="button" onClick={() => setWantExpress(false)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', !express ? 'border-brand bg-mint-soft' : 'border-line')}>
              <Radio on={!express} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><Clock size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Evening · {slotText(deliveryDay ?? slotDate(store), store)}</span>
                {deliveryDay && deliveryDay > slotDate(store) ? (
                  <span className="block text-xs text-orange-700">We are facing heavy traffic today, so we will deliver your order {slotWords(deliveryDay, store)}.</span>
                ) : (
                  <span className="block text-xs text-muted">Orders after {fmtTime(store.cutoff_time)} come the next evening</span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm font-semibold">
                {quote && !quote.tooFar ? (quote.free ? <span className="text-brand">FREE</span> : rupee(quote.eveningFee)) : ''}
              </span>
            </button>
            <button type="button" disabled={!ex.ok} onClick={() => setWantExpress(true)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', express ? 'border-brand bg-mint-soft' : 'border-line', !ex.ok && 'opacity-55')}>
              <Radio on={express} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF4D6] text-[#B7791F]"><Zap size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Express · within {expressTimeText(dRules.expressMinutes)}</span>
                <span className="block text-xs text-muted">
                  {ex.ok ? 'A rider brings it straight to you' : ex.off ? 'Not available right now' : `Available ${fmtTime(ex.from)} – ${fmtTime(ex.until)}`}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold">+{rupee(dRules.expressFee)}</span>
            </button>
          </div>

          {quote && !quote.tooFar && quote.next && quote.next.save > 0 && (
            <Link to="/" className="flex items-center gap-3 rounded-xl bg-mint p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl">💡</span>
              <span className="flex-1 text-sm">
                <span className="block font-semibold text-brand">
                  Add {rupee(quote.next.addMore)} more{quote.eveningFee - quote.next.save === 0 ? ' for FREE delivery' : `, save ${rupee(quote.next.save)} on delivery`}
                </span>
                <span className="text-xs text-muted">Evening delivery: {rupee(dRules.smallFee)} below {rupee(dRules.smallBelow)}, {store.free_delivery ? 'FREE' : rupee(dRules.midFee)} up to {rupee(dRules.freeAbove - 1)}, FREE from {rupee(dRules.freeAbove)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Add items</span>
            </Link>
          )}
        </section>

        <button type="button" onClick={() => setSubstitute(!substitute)} className={`${card} flex w-full items-center gap-3 p-4 text-left`}>
          <Repeat size={22} className="shrink-0 text-muted" />
          <span className="flex-1">
            <span className="block font-semibold">If this brand isn't available, a similar brand is OK</span>
            <span className="text-xs text-muted">Same type and size, about the same price</span>
          </span>
          <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', substitute ? 'bg-brand' : 'bg-black/20')}>
            <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all', substitute ? 'left-[22px]' : 'left-0.5 bg-white')} />
          </span>
        </button>

        <section className={`${card} space-y-2 p-3`}>
          <h2 className="px-1 pt-1 font-semibold">Payment method</h2>
          {overLimit && (
            <p className="px-1 text-xs text-brand">
              {canPayNow
                ? `Orders above ${rupee(store.cod_limit)} are paid now by UPI.`
                : `Orders above ${rupee(store.cod_limit)} need online payment, which is not available right now. Please remove a few items or call us.`}
            </p>
          )}
          {[
            ...(canPayNow ? [['upi_now', Zap, 'Pay now by UPI', other ? 'You pay now with GPay, PhonePe or Paytm' : 'GPay, PhonePe, Paytm or any UPI app']] : []),
            ['cash', Banknote, 'Cash on delivery', other ? `${firstName || 'They'} pay cash / UPI at the door` : 'Pay cash / UPI on delivery'],
          ].map(([value, Icon, title, note]) => {
            const noCod = value === 'cash' && !codOk
            const off = noCod || (overLimit && value !== 'upi_now')
            return (
              <button key={value} type="button" disabled={off} onClick={() => setPayment(value)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left', method === value ? 'border-brand' : 'border-line', off && 'opacity-50')}>
                <Radio on={method === value} />
                <Icon size={24} />
                <span>
                  <span className="block font-semibold">{title}</span>
                  {noCod ? (
                    <span className="text-xs text-red-700">Due to misuse of cash on delivery, we have temporarily restricted it for this number.</span>
                  ) : off ? (
                    <span className="text-xs text-muted">Only for orders up to {rupee(store.cod_limit)}</span>
                  ) : (
                    <span className="text-xs text-muted">{note}</span>
                  )}
                </span>
              </button>
            )
          })}
        </section>

        {(walletBalance > 0 || showInvite) && (
          <section className={`${card} space-y-3 p-4`}>
            {walletBalance > 0 && (
              <button type="button" onClick={() => setUseWallet(!useWallet)} className="flex w-full items-center gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><WalletMinimal size={20} /></span>
                <span className="flex-1">
                  <span className="block font-semibold">Use Jholzo Money</span>
                  <span className="text-xs text-muted">
                    Balance {rupee(walletBalance)} · up to {rupee(rules.maxPerOrder)} per order
                  </span>
                </span>
                <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', useWallet ? 'bg-brand' : 'bg-black/20')}>
                  <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all', useWallet ? 'left-[22px]' : 'left-0.5')} />
                </span>
              </button>
            )}
            {showInvite && (
              <InputRow icon={Ticket} label={`Invite code (first order) · get ${rupee(rules.friendReward)} after delivery`}>
                <input
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="e.g. RAHUL482"
                  maxLength={12}
                  className={`${inputCls} font-semibold tracking-wider`}
                />
              </InputRow>
            )}
          </section>
        )}

        <section className={`${card} p-4`}>
          <h2 className="font-semibold">Bill summary</h2>
          <div className="mt-2 flex justify-between text-muted"><span>Items ({lines.reduce((s, l) => s + l.qty, 0)})</span><span>{rupee(subtotal)}</span></div>
          <div className="mt-1 flex justify-between text-muted">
            <span>Delivery charge</span>
            <span>
              {fee === null ? 'Set the pin' : quote.free ? (
                <>{quote.fullFee > 0 && <s className="mr-1.5 text-xs">{rupee(quote.fullFee)}</s>}<b className="text-brand">FREE</b></>
              ) : rupee(quote.eveningFee)}
            </span>
          </div>
          {express && fee !== null && (
            <div className="mt-1 flex justify-between text-muted"><span>Express delivery</span><span>{rupee(quote.expressFee)}</span></div>
          )}
          <div className="mt-1 flex justify-between text-muted"><span>Packaging charge</span><span>{rupee(packaging)}</span></div>
          {walletUse > 0 && (
            <div className="mt-1 flex justify-between font-medium text-brand"><span>Jholzo Money</span><span>−{rupee(walletUse)}</span></div>
          )}
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-semibold"><span>Total Amount</span><span>{rupee(total)}</span></div>
          {savings > 0 && (
            <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-700">
              <BadgePercent size={16} /> You save {rupee(savings)} on this order
            </p>
          )}
        </section>

        {/* Cloudflare Turnstile (free CAPTCHA) goes here when the site is deployed. */}

        {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || fee === null || (overLimit && !canPayNow)} className={`${btnAccent} h-14`}>
          {busy ? 'Placing...' : method === 'upi_now' ? `Place order & pay ${rupee(total)}` : other && firstName ? `Place order for ${firstName}` : 'Place order'}
        </button>
        <p className="text-center text-xs text-muted">
          {method === 'upi_now'
            ? 'Next you pay by UPI. We verify the payment (usually within 10 minutes) and send the confirmation on WhatsApp.'
            : other
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
