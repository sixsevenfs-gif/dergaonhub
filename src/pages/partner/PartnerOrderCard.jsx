import { useEffect, useState } from 'react'
import { Banknote, Bike, Camera, Check, ChevronDown, FileText, Gift, Lock, MapPinned, Navigation, Phone, PhoneOff, Repeat, Smartphone, Undo2 } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card } from '../../components/ui.js'
import MapPreview from '../../components/MapPreview.jsx'
import {
  confirmOrder, deliveryPhotoUrl, logMessage, partnerComplete, partnerNoShow, partnerUndoDelivered, sendAutoMessage, setDispatch, uploadDeliveryPhoto,
} from '../../lib/store.js'
import { compressImage } from '../../lib/image.js'
import { rupee } from '../../lib/format.js'
import { mapsLink } from '../../lib/delivery.js'
import { billMessage, customerMessage, messagePhone, toWa, waLink } from '../../lib/whatsapp.js'
import { stageOf } from './stage.js'

const STAGES = {
  new: ['Waiting for confirm', 'bg-orange-500/15 text-orange-200'],
  ready: ['To shop', 'bg-white/10 text-white'],
  on_the_way: ['On the way', 'bg-sky-500/15 text-sky-200'],
  arriving: ['Arriving', 'bg-accent/15 text-accent'],
  done: ['Delivered', 'bg-emerald-500/15 text-emerald-300'],
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
      const small = await compressImage(file, 1000, 0.7)
      setPreview(small)
      onPhoto(await uploadDeliveryPhoto(orderId, small))
    } catch (err) {
      onPhoto('')
      onError(`Photo not saved: ${err.message}`)
    }
    setBusy(false)
  }

  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${photo ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-accent/60 bg-accent/[0.06]'}`}>
      <input type="file" accept="image/*" capture="environment" onChange={take} className="sr-only" />
      {preview ? (
        <img src={preview} alt="Delivery photo" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"><Camera size={24} /></span>
      )}
      <span className="flex-1 text-sm">
        <span className="block font-bold">{busy ? 'Saving photo...' : photo ? 'Photo saved ✓' : 'Photo of the items (required)'}</span>
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
      <button type="button" onClick={() => setAsking(true)} className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-orange-300">
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
        <button type="button" onClick={mark} className="h-10 flex-1 rounded-xl bg-orange-500 font-semibold text-white">Yes, no-show</button>
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
const billCaption = (o) =>
  `Dergaon Hub bill #${o.order_number} · Total ${rupee(o.total)} · Paid by ${o.payment_method === 'cash' ? 'cash' : 'UPI'}. Thank you!`

const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

// Items ticked while shopping, remembered on this phone.
function usePicked(orderId) {
  const key = `dergaonhub-picked-${orderId}`
  const [picked, setPicked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? []
    } catch {
      return []
    }
  })
  const toggle = (id) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // storage blocked: ticks last until the page reloads
    }
  }
  return [picked, toggle]
}

// Sends one message to the customer. Automatic (WhatsApp API) when it is switched on,
// otherwise WhatsApp opens with the text ready and the rider taps Send.
// It is a link in that case (not a script) so phones never block WhatsApp from opening.
function MessageButton({ order, store, kind, auto, before, label, icon: Icon, primary, onError }) {
  const [fallback, setFallback] = useState(false)
  const [busy, setBusy] = useState(false)
  const text = customerMessage(kind, { order, store })
  const cls = `flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-bold active:scale-[.99] disabled:opacity-50 ${
    primary ? 'bg-accent text-ink' : 'border border-line bg-white/[0.03] text-white'
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

export default function PartnerOrderCard({ order: o, store, isAdmin, auto }) {
  const stage = stageOf(o)
  const done = stage === 'done'
  const [open, setOpen] = useState(!done)
  const [picked, toggle] = usePicked(o.id)
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState('') // storage path of the delivery photo
  useEffect(() => {
    if (open && !done) loadPdf()
  }, [open, done])
  const [badge, badgeCls] = STAGES[stage]
  const sent = (kind) => o.messages?.filter((m) => m.kind === kind && m.ok).at(-1)
  const allPicked = o.items.length > 0 && o.items.every((i) => picked.includes(i.id))
  const isCash = o.payment_method === 'cash'

  const run = (fn) => async () => {
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    }
  }

  const collected = isCash ? o.total : 0
  const doneOrder = { ...o, status: 'completed', cash_collected: collected, completed_at: new Date().toISOString() }
  // On a phone: the bill goes as a PDF file through the share sheet (pick WhatsApp and the customer).
  // Where files can't be shared (most computers), WhatsApp opens with the text bill instead.
  const deliver = async () => {
    setError('')
    const pdf = await loadPdf()
    const shared = await pdf.shareBill({ order: doneOrder, items: o.items, store }, billCaption(doneOrder))
    try {
      await partnerComplete(o.id, isCash ? o.total : 0, photo)
      logMessage(o.id, 'delivered').catch(() => {})
    } catch (err) {
      setError(err.message)
      return
    }
    if (!shared) window.open(waLink(toWa(o.customer_phone), billMessage({ order: doneOrder, items: o.items })), '_blank')
  }

  return (
    <article className={`${card} overflow-hidden ${done ? 'opacity-70' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold leading-tight">{o.customer_name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeCls}`}>{badge}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">#{o.order_number}{o.distance_km != null ? ` · ${o.distance_km} km away` : ''}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-black">{rupee(o.total)}</div>
          <div className={`text-xs font-semibold ${done ? 'text-emerald-300' : isCash ? 'text-orange-300' : 'text-sky-300'}`}>
            {done ? (isCash ? 'Cash received ✓' : 'Paid by UPI ✓') : isCash ? 'Collect cash' : 'UPI'}
          </div>
        </div>
        <ChevronDown size={20} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
          <p className="flex gap-2 text-sm"><MapPinned size={16} className="mt-0.5 shrink-0 text-accent" /> {o.address}</p>
          {o.location ? (
            !done && <MapPreview point={o.location} home={store.location} />
          ) : (
            <p className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-200">No map pin on this order. Call the customer for directions.</p>
          )}
          {o.ordered_by_phone && (
            <p className="flex items-center gap-2 rounded-lg bg-accent/[0.07] px-3 py-2 text-sm">
              <Gift size={16} className="shrink-0 text-accent" />
              <span className="flex-1">Ordered by <b>{o.ordered_by_name}</b> for {o.customer_name}</span>
              <a href={`tel:${o.ordered_by_phone}`} className="font-semibold text-accent underline">{o.ordered_by_phone}</a>
            </p>
          )}
          {o.note && <p className="rounded-lg bg-white/5 px-3 py-2 text-sm">Note: {o.note}</p>}

          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${o.customer_phone}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><Phone size={16} /> Call</a>
            {o.location ? (
              <a href={mapsLink(o.location)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><Navigation size={16} /> Map</a>
            ) : <span />}
            <a href={waLink(toWa(o.customer_phone))} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold"><WhatsAppIcon size={16} /> Chat</a>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Items {!done && <span className="font-normal text-muted">· tick as you pick</span>}</h3>
              {!o.allow_substitute && <span className="flex items-center gap-1 text-xs font-semibold text-orange-300"><Repeat size={12} /> Only this brand</span>}
            </div>
            <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line">
              {o.items.map((i) => {
                const on = picked.includes(i.id) || done
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={on} disabled={done} onChange={() => toggle(i.id)} className="peer sr-only" />
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-accent bg-accent text-ink' : 'border-line'}`}>
                        {on && <Check size={15} strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 text-sm ${on ? 'text-muted line-through' : ''}`}>
                        {i.name_snapshot}
                        {i.note && <span className="block text-xs text-orange-200 no-underline">“{i.note}”</span>}
                      </span>
                      <span className="text-base font-black">×{i.quantity}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {allPicked && !done && <p className="mt-1.5 text-xs font-semibold text-emerald-300">All items picked. Ready to go!</p>}
          </div>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          {stage === 'new' && (
            <div className="space-y-2">
              <p className="text-sm text-orange-200">The admin must confirm this order (call the customer) before it goes out.</p>
              {isAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={run(() => confirmOrder(o.id))} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-bold text-ink"><Check size={18} /> Confirm order</button>
                  {!sent('placed') && <MessageButton order={o} store={store} kind="placed" auto={auto} label="Order placed msg" icon={Check} onError={setError} />}
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
              {/* The amount is fixed: the rider collects exactly the order total. */}
              <p className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-base font-bold ${isCash ? 'border-orange-400/40 bg-orange-500/10 text-orange-200' : 'border-sky-400/40 bg-sky-500/10 text-sky-200'}`}>
                {isCash ? <Banknote size={19} /> : <Smartphone size={19} />}
                {isCash ? `Collect ${rupee(o.total)} cash` : `Collect ${rupee(o.total)} by UPI`}
              </p>
              <PhotoStep orderId={o.id} photo={photo} onPhoto={setPhoto} onError={setError} />
              {photo ? (
                <button
                  type="button"
                  onClick={deliver}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1FAF54] px-4 text-[15px] font-bold text-white active:scale-[.99]"
                >
                  <WhatsAppIcon size={18} /> Delivered + send bill (PDF)
                </button>
              ) : (
                <p className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm text-muted">
                  <Lock size={15} /> Take the photo to mark delivered
                </p>
              )}
            </div>
          )}

          {done && o.delivery_photo && <SavedPhoto path={o.delivery_photo} />}
          {done && (
            <button type="button" onClick={run(async () => {
              const pdf = await loadPdf()
              const data = { order: o, items: o.items, store }
              if (!(await pdf.shareBill(data))) pdf.downloadBill(data)
            })} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#1FAF54]/60 text-sm font-semibold text-[#3ddc84]">
              <FileText size={17} /> Share bill PDF (WhatsApp)
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
                  {m.ok ? <Check size={13} className="text-emerald-400" /> : <span className="text-red-300">✕</span>}
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
