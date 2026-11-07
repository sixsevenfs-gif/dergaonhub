import { useEffect, useState } from 'react'
import { Banknote, Bike, Camera, Check, ChevronDown, FileText, Gift, Lock, MapPinned, Navigation, Phone, PhoneOff, QrCode, Receipt, Repeat, Smartphone, Undo2 } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card } from '../../components/ui.js'
import MapPreview from '../../components/MapPreview.jsx'
import ItemPhoto from '../../components/ItemPhoto.jsx'
import {
  confirmOrder, deliveryPhotoUrl, logMessage, partnerComplete, partnerNoShow, partnerPaidByQr, partnerUndoDelivered, removeShopBill, saveShopBill, sendAutoMessage,
  setDispatch, setPicked, uploadDeliveryPhoto, uploadShopBill,
} from '../../lib/store.js'
import { compressImage } from '../../lib/image.js'
import { fmtClock, isExpress, rupee } from '../../lib/format.js'
import { mapsLink } from '../../lib/delivery.js'
import { billMessage, customerMessage, messagePhone, toWa, waLink } from '../../lib/whatsapp.js'
import { stageOf } from './stage.js'
import UpiQr from './UpiQr.jsx'
import PayBack, { CASH_BY } from './PayBack.jsx'

const STAGES = {
  new: ['Waiting for confirm', 'bg-orange-500/15 text-orange-700'],
  ready: ['To shop', 'bg-black/10 text-ink'],
  on_the_way: ['On the way', 'bg-sky-500/15 text-sky-700'],
  arriving: ['Arriving', 'bg-brand/15 text-brand'],
  done: ['Delivered', 'bg-emerald-500/15 text-emerald-700'],
}

// Required before "Delivered": a photo of all the items at the customer's door (opens the phone camera).
function PhotoStep({ orderId, photo, onPhoto, onError }) {
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  const take = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    onError('')
    try {
      const small = await compressImage(file, 1000, 100) // proof photo: big enough to see the items, at most 100 KB
      setPreview(small)
      onPhoto(await uploadDeliveryPhoto(orderId, small))
    } catch (err) {
      onPhoto('')
      onError(`Photo not saved: ${err.message}`)
    }
    setBusy(false)
  }

  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${photo ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-brand/60 bg-brand/[0.06]'}`}>
      <input type="file" accept="image/*" capture="environment" onChange={take} className="sr-only" />
      {preview ? (
        <img src={preview} alt="Delivery photo" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand"><Camera size={24} /></span>
      )}
      <span className="flex-1 text-sm">
        <span className="block font-semibold">{busy ? 'Saving photo...' : photo ? 'Photo saved ✓' : 'Photo of the items (required)'}</span>
        <span className="text-xs text-muted">{photo ? 'Tap to take it again' : 'At the door, with all the items clearly visible'}</span>
      </span>
    </label>
  )
}

// The customer does not pick up the phone at the door: after 4-5 calls the rider marks a no-show.
// The order is cancelled, and a number with repeated no-shows can no longer choose cash on delivery.
function NoAnswer({ orderId, onError }) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-orange-700">
        <PhoneOff size={16} /> Customer not answering
      </button>
    )
  }
  const mark = async () => {
    try {
      await partnerNoShow(orderId)
    } catch (err) {
      onError(err.message)
      setAsking(false)
    }
  }
  return (
    <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-3 text-sm">
      <p>Called 4–5 times and no answer? This cancels the order as a <b>no-show</b>.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={mark} className="h-10 flex-1 rounded-xl bg-orange-500 font-semibold text-ink">Yes, no-show</button>
        <button type="button" onClick={() => setAsking(false)} className="h-10 flex-1 rounded-xl border border-line font-semibold">Go back</button>
      </div>
    </div>
  )
}

// The delivery photo of a finished order.
function SavedPhoto({ path }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let live = true
    deliveryPhotoUrl(path).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line p-2 text-sm text-muted">
      <img src={url} alt="Delivery photo" className="h-14 w-14 rounded-lg object-cover" /> Delivery photo
    </a>
  )
}

// The PDF code is big: it loads when a card opens, so it is ready when the rider taps.
const loadPdf = () => import('../../lib/billPdf.js')

// Short message that goes with the PDF.
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

// Items ticked while shopping. A tick means "I bought this". From update 043 on they are saved with the order
// (they stay after logging out and on another phone) and only the saved ticks count: ticks a phone kept before
// that update are forgotten. Before update 043 they stay on this phone only.
function usePicked(order, locked, onError) {
  const key = `dergaonhub-picked-${order.id}`
  const onServer = order.items.some((i) => 'picked' in i)
  const local = () => {
    if (onServer) return []
    try {
      return JSON.parse(localStorage.getItem(key)) ?? []
    } catch {
      return []
    }
  }
  const savedKey = order.items.filter((i) => i.picked).map((i) => i.id).join()
  const [picked, setState] = useState(() => [...savedKey.split(',').filter(Boolean), ...local()])
  // The list reloads every 30 seconds: follow what is saved (another phone may have ticked).
  useEffect(() => {
    setState([...savedKey.split(',').filter(Boolean), ...local()])
    if (onServer) {
      try {
        localStorage.removeItem(key)
      } catch {
        // storage blocked: nothing kept there anyway
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, onServer])

  const save = async (next, itemId, on) => {
    const before = picked
    setState(next)
    try {
      if (await setPicked(order.id, itemId, on)) return
      localStorage.setItem(key, JSON.stringify(next)) // before update 043: this phone only
    } catch (err) {
      setState(before)
      onError(err.message)
    }
  }
  const toggle = (id) => {
    if (locked.includes(id)) return
    const on = !picked.includes(id)
    save(on ? [...picked, id] : picked.filter((x) => x !== id), id, on)
  }
  // The owner's ticks stay: the database does not let a rider change them.
  const clear = () => save(picked.filter((id) => locked.includes(id)), null, false)
  return [picked, toggle, clear]
}

// What the rider pays the shop for one item (update 043): the buy price, or the MRP when there is none yet.
const shopUnit = (i) => Number(i.buy_price ?? i.mrp ?? i.price_snapshot)

// Price line under an item on the shopping list.
function ShopPrice({ item: i }) {
  if (i.buy_price == null && i.mrp == null) return null
  const unit = shopUnit(i)
  const line = i.quantity > 1 ? `${rupee(unit)} × ${i.quantity} = ${rupee(unit * i.quantity)}` : rupee(unit)
  return i.buy_price != null ? (
    <span className="block text-xs font-semibold text-emerald-700 no-underline">Pay {line}</span>
  ) : (
    <span className="block text-xs font-semibold text-amber-700 no-underline">MRP {line} · bargain, pay less</span>
  )
}

// The owner's money from one delivered order (update 045): the customer's cash minus what this rider paid the
// shop for it, minus what was already given back for it. Paid from here by UPI, or as cash to hand over by 9 PM.
// balance: the rider's whole balance; once it is paid (or the owner owes the rider) nothing is asked per order.
function OrderPayBack({ order: o, userId, balance, date, store, riderName, onError }) {
  const cash = o.payment_method === 'cash' ? Number(o.cash_collected || o.total) : 0
  const bill = o.shop_bill
  const shop = bill
    ? (bill.created_by === userId ? Number(bill.paid) : 0)
    : o.items.filter((i) => i.picked && i.picked_by === userId).reduce((s, i) => s + shopUnit(i) * i.quantity, 0)
  const back = (o.returns ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const own = Math.round((cash - shop - back) * 100) / 100
  const due = Math.min(own, Math.max(0, balance))
  const line = (label, value, key) => <div key={key} className="flex justify-between gap-3"><span>{label}</span><span className="shrink-0">{value}</span></div>
  return (
    <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
      <div className="flex items-center justify-between font-semibold">
        <span>Admin's money from this order</span>
        <span className={due > 0 ? 'text-orange-700' : 'text-emerald-700'}>{due > 0 ? rupee(due) : own < 0 ? `Admin owes you ${rupee(-own)}` : 'Given ✓'}</span>
      </div>
      <div className="space-y-0.5 text-xs text-muted">
        {line(o.payment_method === 'cash' ? 'Cash from the customer' : 'Customer paid the store by UPI', rupee(cash))}
        {line('You paid the shop', `− ${rupee(shop)}`)}
        {(o.returns ?? []).map((r, n) => line(
          r.method === 'cash' ? (r.confirmed_at ? 'Cash given to admin ✓' : `Cash to give the admin by ${CASH_BY}`) : 'Paid to admin by UPI',
          `− ${rupee(r.amount)}`, n,
        ))}
      </div>
      {due > 0 && <PayBack amount={due} date={date} store={store} riderName={riderName} orderId={o.id} orderNumber={o.order_number} onError={onError} />}
    </div>
  )
}

// The shop asked for more than the prices above: the rider writes what they paid and takes a photo of the
// shop's bill. The owner sees it on the order.
function ShopBill({ order: o, expected, onError }) {
  const bill = o.shop_bill
  const [open, setOpen] = useState(false)
  const [paid, setPaid] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  const take = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    onError('')
    try {
      const small = await compressImage(file, 1400, 200) // the bill's numbers must stay readable
      setPreview(small)
      setPhoto(await uploadShopBill(o.id, small))
    } catch (err) {
      setPhoto('')
      onError(`Photo not saved: ${err.message}`)
    }
    setBusy(false)
  }
  const save = async () => {
    onError('')
    if (!(Number(paid) > 0)) return onError('Write what you paid at the shop.')
    if (!photo) return onError("Take a photo of the shop's bill first.")
    setBusy(true)
    try {
      await saveShopBill(o.id, paid, photo, note.trim())
      setOpen(false)
    } catch (err) {
      onError(err.message)
    }
    setBusy(false)
  }

  if (bill && !open) {
    const extra = Number(bill.paid) - Number(bill.expected)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-black/[0.03] px-3 py-2 text-sm">
        <Receipt size={18} className="shrink-0 text-muted" />
        <span className="flex-1">
          Paid <b>{rupee(bill.paid)}</b> at the shop{extra > 0 ? <> · <b className="text-orange-700">{rupee(extra)} more</b></> : ''} · bill photo ✓
        </span>
        {o.status === 'confirmed' && (
          <button type="button" onClick={() => removeShopBill(o.id).catch((err) => onError(err.message))} className="text-xs font-semibold text-muted underline">Remove</button>
        )}
      </div>
    )
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-orange-700">
        <Receipt size={16} /> Shop asked for more?
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-orange-400/40 bg-orange-500/[0.07] p-3 text-sm">
      <p>Pay the shop <b>{rupee(expected)}</b>. If they ask for more, pay it, then write what you paid and take a photo of their bill.</p>
      <input
        type="number" inputMode="decimal" min="1" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Paid at the shop (₹)"
        className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink"
      />
      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${photo ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-line bg-white'}`}>
        <input type="file" accept="image/*" capture="environment" onChange={take} className="sr-only" />
        {preview ? (
          <img src={preview} alt="Shop bill" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-700"><Camera size={24} /></span>
        )}
        <span className="flex-1">
          <span className="block font-semibold">{busy && !photo ? 'Saving photo...' : photo ? 'Bill photo saved ✓' : "Photo of the shop's bill (required)"}</span>
          <span className="text-xs text-muted">{photo ? 'Tap to take it again' : 'All prices and the total clearly visible'}</span>
        </span>
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why more? (optional, e.g. price went up)" className="h-11 w-full rounded-xl border border-line bg-white px-3 text-ink" />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="h-11 flex-1 rounded-xl bg-orange-500 font-semibold text-ink disabled:opacity-50">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl border border-line font-semibold">Cancel</button>
      </div>
    </div>
  )
}

// "Customer paid by QR", remembered on this phone until Delivered (taking the photo can reload the page).
function usePaidByQr(orderId) {
  const key = `dergaonhub-qr-${orderId}`
  const [paid, setPaid] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const set = (on) => {
    setPaid(on)
    try {
      if (on) localStorage.setItem(key, '1')
      else localStorage.removeItem(key)
    } catch {
      // storage blocked: it lasts until the page reloads
    }
  }
  return [paid, set]
}

// Sends one message to the customer. Automatic (WhatsApp API) when it is switched on,
// otherwise WhatsApp opens with the text ready and the rider taps Send.
// It is a link in that case (not a script) so phones never block WhatsApp from opening.
export function MessageButton({ order, store, kind, auto, before, label, icon: Icon, primary, onError }) {
  const [fallback, setFallback] = useState(false)
  const [busy, setBusy] = useState(false)
  const text = customerMessage(kind, { order, store })
  const cls = `flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-semibold active:scale-[.99] disabled:opacity-50 ${
    primary ? 'bg-brand text-white' : 'border border-line bg-black/[0.03] text-ink'
  }`

  const step = async () => {
    try {
      await before?.()
      return true
    } catch (err) {
      onError(err.message)
      return false
    }
  }

  if (auto && !fallback) {
    const send = async () => {
      setBusy(true)
      if (await step()) {
        const res = await sendAutoMessage({ orderId: order.id, kind })
        if (!res.sent) {
          setFallback(true)
          onError(`Automatic message not sent${res.error ? ` (${res.error})` : ''}. Send it on WhatsApp instead.`)
        }
      }
      setBusy(false)
    }
    return (
      <button type="button" disabled={busy} onClick={send} className={cls}>
        <Icon size={18} /> {busy ? 'Sending...' : label}
      </button>
    )
  }

  return (
    <a
      href={waLink(toWa(messagePhone(kind, order)), text)}
      target="_blank"
      rel="noreferrer"
      onClick={async () => {
        if (await step()) logMessage(order.id, kind).catch(() => {})
      }}
      className={cls}
    >
      <WhatsAppIcon size={18} /> {label}
    </a>
  )
}

// A rider sees only the orders the order desk assigned to them; the owner sees every order with its
// rider (updates 032, 033). Riders confirm new orders only when the owner allows it in Settings.
export default function PartnerOrderCard({ order: o, store, isAdmin, userId, auto, date, balance, riderName }) {
  const stage = stageOf(o)
  const mayConfirm = isAdmin || !!store.riders_confirm
  const done = stage === 'done'
  const [open, setOpen] = useState(!done)
  const [error, setError] = useState('')
  // Items someone else ticked (the owner bought them): a rider can't change those ticks or pay for them.
  const locked = isAdmin ? [] : o.items.filter((i) => i.picked && i.picked_by && i.picked_by !== userId).map((i) => i.id)
  const [picked, toggle, untickAll] = usePicked(o, locked, setError)
  const [byQr, setByQr] = usePaidByQr(o.id)
  const [showQr, setShowQr] = useState(false)
  const [photo, setPhoto] = useState('') // storage path of the delivery photo
  useEffect(() => {
    if (open && !done) loadPdf()
  }, [open, done])
  const [badge, badgeCls] = STAGES[stage]
  const sent = (kind) => o.messages?.filter((m) => m.kind === kind && m.ok).at(-1)
  const allPicked = o.items.length > 0 && o.items.every((i) => picked.includes(i.id))
  // Shop prices come with the order from update 043 on; without them the list shows no prices.
  const priced = o.items.some((i) => i.buy_price != null || i.mrp != null)
  const toBuy = o.items.filter((i) => !locked.includes(i.id))
  const shopTotal = toBuy.reduce((s, i) => s + shopUnit(i) * i.quantity, 0)
  const atMrp = toBuy.filter((i) => i.buy_price == null)
  const isCash = o.payment_method === 'cash'
  const payNow = o.payment_method === 'upi_now'
  const paidOnline = payNow && o.payment_status === 'paid'

  const run = (fn) => async () => {
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    }
  }

  // Delivered first, then the bill goes as a WhatsApp text message (with the PDF link) from a plain link.
  // Sharing the PDF file to WhatsApp often fails on Android ("Can't send empty message"), so it is only the
  // second option below.
  const deliver = run(async () => {
    // Paid by QR: a cash order becomes "UPI on delivery" first (update 031), so it is not counted as cash the
    // rider must hand over. Before update 031 that call fails and the order is saved as cash, as before.
    if (byQr && isCash) await partnerPaidByQr(o.id).catch(() => {})
    await partnerComplete(o.id, isCash && !byQr ? o.total : 0, photo)
  })
  const billSent = !!sent('delivered')
  // Automatic WhatsApp on: the "delivered" message carries the bill (update 036), so the button shows only
  // if that message failed (for example the template is not approved yet).
  const autoBillFailed = !!o.messages?.some((m) => m.kind === 'delivered' && m.channel === 'auto' && !m.ok) && !billSent
  const showBillButton = !auto || autoBillFailed

  return (
    <article className={`${card} overflow-hidden ${done && billSent ? 'opacity-70' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold leading-tight">{o.customer_name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeCls}`}>{badge}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            #{o.order_number}{o.distance_km != null ? ` · ${o.distance_km} km away` : ''}
            {isAdmin && !done && <> · {o.rider_id ? <>🛵 <b className="text-ink">{o.rider_name || 'Rider'}</b></> : 'No rider'}</>}
          </p>
          {isExpress(o) && <p className="mt-1 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">⚡ EXPRESS · deliver by {fmtClock(o.express_by)}</p>}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{rupee(o.total)}</div>
          <div className={`text-xs font-semibold ${done || paidOnline || byQr ? 'text-emerald-700' : payNow ? (o.payment_status === 'failed' ? 'text-red-700' : 'text-amber-700') : isCash ? 'text-orange-700' : 'text-sky-700'}`}>
            {paidOnline ? 'Paid online ✓' : done ? (isCash ? 'Cash received ✓' : 'Paid by UPI ✓') : byQr ? 'Paid by QR ✓' : payNow ? (o.payment_status === 'failed' ? 'NOT PAID' : 'Payment checking') : isCash ? 'Collect cash' : 'UPI'}
          </div>
        </div>
        <ChevronDown size={20} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
          <p className="flex gap-2 text-sm"><MapPinned size={16} className="mt-0.5 shrink-0 text-brand" /> {o.address}</p>
          {o.location ? (
            !done && <MapPreview point={o.location} home={store.location} />
          ) : (
            <p className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-700">No map pin on this order. Call the customer for directions.</p>
          )}
          {o.ordered_by_phone && (
            <p className="flex items-center gap-2 rounded-lg bg-brand/[0.07] px-3 py-2 text-sm">
              <Gift size={16} className="shrink-0 text-brand" />
              <span className="flex-1">Ordered by <b>{o.ordered_by_name}</b> for {o.customer_name}</span>
              <a href={`tel:${o.ordered_by_phone}`} className="font-semibold text-brand underline">{o.ordered_by_phone}</a>
            </p>
          )}
          {o.note && <p className="rounded-lg bg-black/5 px-3 py-2 text-sm">Note: {o.note}</p>}

          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${o.customer_phone}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><Phone size={16} /> Call</a>
            {o.location ? (
              <a href={mapsLink(o.location)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><Navigation size={16} /> Map</a>
            ) : <span />}
            <a href={waLink(toWa(o.customer_phone))} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><WhatsAppIcon size={16} /> Chat</a>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items {!done && <span className="font-normal text-muted">· tick as you pick</span>}</h3>
              {!o.allow_substitute && <span className="flex items-center gap-1 text-xs font-semibold text-orange-700"><Repeat size={12} /> Only this brand</span>}
            </div>
            <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line">
              {o.items.map((i) => {
                const on = picked.includes(i.id) || done
                const byAdmin = locked.includes(i.id)
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={on} disabled={done || byAdmin} onChange={() => toggle(i.id)} className="peer sr-only" />
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                        {on && <Check size={15} strokeWidth={3} />}
                      </span>
                      <ItemPhoto item={i} size="size-18" className={on ? 'opacity-40' : ''} />
                      <span className={`flex-1 text-sm ${on ? 'text-muted line-through' : ''}`}>
                        {i.name_snapshot}
                        {i.note && <span className="block text-xs text-orange-700 no-underline">“{i.note}”</span>}
                        {byAdmin ? (
                          <span className="block text-xs font-semibold text-sky-700 no-underline">Bought by the admin · don't pay for it</span>
                        ) : (
                          !done && <ShopPrice item={i} />
                        )}
                      </span>
                      <span className="text-base font-semibold">×{i.quantity}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {priced && !done && (
              <div className="mt-2 rounded-xl bg-emerald-500/[0.08] px-3 py-2.5">
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Pay at the shop</span><span>{rupee(shopTotal)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {atMrp.length === 0
                    ? 'Fixed shop prices. Pay exactly this.'
                    : `${atMrp.length === toBuy.length ? 'All items' : `${atMrp.length} item${atMrp.length > 1 ? 's' : ''}`} at MRP (no shop price yet): bargain and pay less if you can.`}
                  {locked.length > 0 && ' Items the admin bought are left out.'}
                </p>
              </div>
            )}
            {allPicked && !done && (
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">All items picked. Ready to go!</p>
                <button type="button" onClick={untickAll} className="text-xs font-semibold text-muted underline">Untick all</button>
              </div>
            )}
          </div>

          {priced && (!done || o.shop_bill) && <ShopBill order={o} expected={shopTotal} onError={setError} />}

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}

          {stage === 'new' && (
            <div className="space-y-2">
              <p className="text-sm text-orange-700">{mayConfirm ? 'Call the customer, then confirm.' : 'The admin must confirm this order (call the customer) before it goes out.'}</p>
              {mayConfirm && (
                <div className="flex gap-2">
                  <button type="button" onClick={run(() => confirmOrder(o.id))} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-3 font-semibold text-white"><Check size={18} /> Confirm order</button>
                  {isAdmin && !sent('placed') && <MessageButton order={o} store={store} kind="placed" auto={auto} label="Order placed msg" icon={Check} onError={setError} />}
                </div>
              )}
            </div>
          )}

          {(stage === 'ready' || stage === 'on_the_way' || stage === 'arriving') && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <MessageButton
                  order={o} store={store} kind="on_the_way" auto={auto} icon={Bike} primary={stage === 'ready'}
                  label={stage === 'ready' ? 'On the way' : 'Send "On the way" again'}
                  before={() => setDispatch(o.id, 'on_the_way')} onError={setError}
                />
              </div>
              {stage !== 'ready' && <NoAnswer orderId={o.id} onError={setError} />}
              {/* The amount is fixed: the rider collects exactly the order total (or nothing if paid online). */}
              {paidOnline ? (
                <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-base font-semibold text-emerald-700">
                  <Check size={19} /> Paid online · don't collect money
                </p>
              ) : payNow ? (
                <p className={`rounded-xl border px-3 py-2.5 text-center text-sm font-semibold ${o.payment_status === 'failed' ? 'border-red-400/40 bg-red-500/10 text-red-700' : 'border-amber-400/40 bg-amber-500/10 text-amber-700'}`}>
                  {o.payment_status === 'failed'
                    ? `NOT PAID: collect ${rupee(o.total)} before handing over, or call the admin.`
                    : `Payment of ${rupee(o.total)} is being checked by the admin. Call the admin before handing over.`}
                </p>
              ) : byQr ? (
                <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-base font-semibold text-emerald-700">
                  <Check size={19} /> Paid {rupee(o.total)} by QR
                </p>
              ) : (
                <p className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-base font-semibold ${isCash ? 'border-orange-400/40 bg-orange-500/10 text-orange-700' : 'border-sky-400/40 bg-sky-500/10 text-sky-700'}`}>
                  {isCash ? <Banknote size={19} /> : <Smartphone size={19} />}
                  {isCash ? `Collect ${rupee(o.total)} cash` : `Collect ${rupee(o.total)} by UPI`}
                </p>
              )}
              {/* Exact-amount UPI QR for the customer to scan, instead of a personal GPay QR (no ₹82.80 → ₹82). */}
              {!payNow && store.upi_id && store.upi_on !== false && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowQr(true)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-black/[0.03] px-3 text-[15px] font-semibold active:scale-[.99]">
                    <QrCode size={18} /> {byQr ? 'Show QR again' : `Show QR · ${rupee(o.total)}`}
                  </button>
                  {byQr && (
                    <button type="button" onClick={() => setByQr(false)} className="min-h-12 rounded-xl border border-line px-4 text-sm font-semibold text-muted">
                      Undo
                    </button>
                  )}
                </div>
              )}
              {showQr && (
                <UpiQr
                  order={o} store={store} onClose={() => setShowQr(false)}
                  onPaid={() => {
                    setByQr(true)
                    setShowQr(false)
                  }}
                />
              )}
              <PhotoStep orderId={o.id} photo={photo} onPhoto={setPhoto} onError={setError} />
              {photo ? (
                <button
                  type="button"
                  onClick={deliver}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1FAF54] px-4 text-[15px] font-semibold text-ink active:scale-[.99]"
                >
                  <Check size={18} /> Delivered
                </button>
              ) : (
                <p className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm text-muted">
                  <Lock size={15} /> Take the photo to mark delivered
                </p>
              )}
            </div>
          )}

          {/* Per-order pay back (update 045 adds o.returns): the rider who delivered it, once the money card is in. */}
          {done && !isAdmin && o.delivered_by === userId && balance != null && Array.isArray(o.returns) && (
            <OrderPayBack order={o} userId={userId} balance={balance} date={date} store={store} riderName={riderName} onError={setError} />
          )}
          {done && o.delivery_photo && <SavedPhoto path={o.delivery_photo} />}
          {done && showBillButton && (
            <a
              href={waLink(toWa(o.customer_phone), billMessage({ order: o, items: o.items }))}
              target="_blank"
              rel="noreferrer"
              onClick={() => logMessage(o.id, 'delivered').catch(() => {})}
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold active:scale-[.99] ${billSent ? 'border border-[#1FAF54]/60 text-[#3ddc84]' : 'bg-[#1FAF54] text-ink'}`}
            >
              <WhatsAppIcon size={18} /> {billSent ? 'Send bill again on WhatsApp' : 'Send bill on WhatsApp'}
            </a>
          )}
          {done && (
            <button type="button" onClick={run(async () => {
              const pdf = await loadPdf()
              const data = { order: o, items: o.items, store }
              if (!(await pdf.shareBill(data))) pdf.downloadBill(data)
            })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-muted">
              <FileText size={16} /> Share bill as PDF file
            </button>
          )}

          {done && (
            <button type="button" onClick={run(() => partnerUndoDelivered(o.id))} className="flex h-10 items-center gap-2 text-sm font-semibold text-muted">
              <Undo2 size={16} /> Undo delivered (tapped by mistake)
            </button>
          )}

          {o.messages?.length > 0 && (
            <ul className="space-y-1 border-t border-line/60 pt-3 text-xs text-muted">
              {o.messages.map((m, n) => (
                <li key={n} className="flex items-center gap-1.5">
                  {m.ok ? <Check size={13} className="text-emerald-700" /> : <span className="text-red-700">✕</span>}
                  {MESSAGE_NAMES[m.kind]} {m.channel === 'auto' ? 'sent automatically' : 'sent on WhatsApp'} · {clock(m.at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

const MESSAGE_NAMES = { placed: '“Order placed”', on_the_way: '“On the way”', arriving: '“Arriving soon”', delivered: 'Bill' }
