import { useState } from 'react'
import { Bike, Check, ChevronDown, Gift, MapPinned, Navigation, Phone, Repeat, Undo2 } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card } from '../../components/ui.js'
import MapPreview from '../../components/MapPreview.jsx'
import { confirmOrder, logMessage, partnerComplete, partnerUndoDelivered, sendAutoMessage, setDispatch } from '../../lib/store.js'
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
  const [cash, setCash] = useState(String(o.total))
  const [error, setError] = useState('')
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

  const deliver = async () => {
    setError('')
    try {
      await partnerComplete(o.id, isCash ? cash : 0)
      logMessage(o.id, 'delivered').catch(() => {})
    } catch (err) {
      setError(err.message)
    }
  }
  const collected = isCash ? Number(cash) || o.total : 0
  const bill = billMessage({ order: { ...o, status: 'completed', cash_collected: collected, completed_at: new Date().toISOString() }, items: o.items })

  return (
    <article className={`${card} overflow-hidden ${done ? 'opacity-70' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold leading-tight">{o.customer_name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeCls}`}>{badge}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">#{o.order_number} · {o.area}{o.distance_km != null ? ` · ${o.distance_km} km` : ''}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-black">{rupee(o.total)}</div>
          <div className={`text-xs font-semibold ${isCash ? 'text-orange-300' : 'text-sky-300'}`}>{isCash ? 'Collect cash' : 'UPI'}</div>
        </div>
        <ChevronDown size={20} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
          <p className="flex gap-2 text-sm"><MapPinned size={16} className="mt-0.5 shrink-0 text-accent" /> {o.address}, {o.area}</p>
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
                  label="On the way"
                  before={() => setDispatch(o.id, 'on_the_way')} onError={setError}
                />
                <MessageButton
                  order={o} store={store} kind="arriving" auto={auto} icon={MapPinned} primary={stage === 'on_the_way'}
                  label="Arriving soon"
                  before={() => setDispatch(o.id, 'arriving')} onError={setError}
                />
              </div>
              {isCash && (
                <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="flex-1 text-muted">Cash collected</span>
                  ₹<input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" className="w-20 bg-transparent text-right text-lg font-bold focus:outline-none" />
                </label>
              )}
              <a
                href={waLink(toWa(o.customer_phone), bill)}
                target="_blank"
                rel="noreferrer"
                onClick={deliver}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1FAF54] px-4 text-[15px] font-bold text-white active:scale-[.99]"
              >
                <WhatsAppIcon size={18} /> Delivered + send bill
              </a>
            </div>
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
