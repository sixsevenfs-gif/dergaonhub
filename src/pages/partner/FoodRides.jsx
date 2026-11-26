import { useEffect, useState } from 'react'
import {
  Bike, Check, CheckCircle2, ChefHat, ChevronDown, Clock, Copy, Home, MapPin, MessageCircle, Navigation, Phone, QrCode,
  ShoppingBag, Store, Trophy, UtensilsCrossed,
} from 'lucide-react'
import { card } from '../../components/ui.js'
import { useData } from '../../lib/useData.js'
import { rupee } from '../../lib/format.js'
import { partnerFoodOrders, partnerFoodStep } from '../../lib/foodAdmin.js'
import UpiQr from './UpiQr.jsx'

// Jholzo Food on the rider page (update 067): each trip is a card with the steps
// Going → At restaurant → Picked up → At the door → Delivered. Every step tells the customer's app.
// The rider sees the cooking countdown, ticks the dishes at the counter, pays the restaurant when it is paid at
// pickup, and collects at the door (cash, or the store's UPI QR). Finished trips add up in "Done today".

const STEPS = [
  { key: 'to_restaurant', label: 'Going', Icon: Bike },
  { key: 'at_restaurant', label: 'Restaurant', Icon: Store },
  { key: 'picked', label: 'Picked up', Icon: ShoppingBag },
  { key: 'arriving', label: 'At door', Icon: Home },
  { key: 'delivered', label: 'Delivered', Icon: CheckCircle2 },
]

/** 0 not started, 1 going, 2 at the restaurant, 3 picked up, 4 at the door, 5 delivered. */
function progress(o) {
  if (o.status === 'delivered') return 5
  if (o.status === 'picked') return o.stage === 'arriving' ? 4 : 3
  if (o.stage === 'at_restaurant') return 2
  if (o.stage === 'to_restaurant') return 1
  return 0
}

const NEXT = [
  (o) => ({ step: 'to_restaurant', emoji: '🛵', label: o.mine ? 'Start: going to the restaurant' : 'Take it: going to the restaurant' }),
  () => ({ step: 'at_restaurant', emoji: '📍', label: 'Reached the restaurant' }),
  () => ({ step: 'picked', emoji: '🥡', label: 'Picked up the food' }),
  () => ({ step: 'arriving', emoji: '🏠', label: 'Reached the customer' }),
  (o) => ({ step: 'delivered', emoji: '✅', label: o.payment === 'upi' ? 'Delivered · paid by UPI' : `Delivered · collected ${rupee(o.total)}` }),
]

const HEADLINE = ['New trip · go and pick it up', 'On the way to the restaurant', 'At the restaurant · waiting for the food', 'Food picked up · going to the customer', 'At the customer\'s door', 'Delivered']

const minutesSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : 0)
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const directions = (lat, lng, link) => link || (lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : '')
const itemCount = (o) => o.items.reduce((s, i) => s + i.qty, 0)
const dishText = (i) => `${i.name}${i.variant ? ` (${i.variant})` : ''}`

export default function FoodRides({ store = {} }) {
  const { data: rides, reload } = useData(partnerFoodOrders)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [cheer, setCheer] = useState('')
  const [, tick] = useState(0)
  useEffect(() => {
    // New trips every 20 seconds; the clocks on the cards every 30.
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20_000)
    const c = setInterval(() => tick((n) => n + 1), 30_000)
    return () => {
      clearInterval(t)
      clearInterval(c)
    }
  }, [reload])
  if (!rides?.length) return null

  const open = rides.filter((o) => o.status !== 'delivered')
  const done = rides.filter((o) => o.status === 'delivered' && o.mine)

  async function go(o, step) {
    setBusy(o.id)
    setMsg('')
    try {
      await partnerFoodStep(o.id, step)
      navigator.vibrate?.(step === 'delivered' ? [60, 60, 120] : 40)
      if (step === 'delivered') {
        setCheer(`Delivered ${o.no}! Great job 🎉`)
        setTimeout(() => setCheer(''), 3500)
      }
      reload()
    } catch (e) {
      setMsg(e.message)
      reload()
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-700">
          <UtensilsCrossed size={16} /> Food trips
          {open.length > 0 && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {open.length} live</span>}
        </h2>
        {done.length > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Trophy size={14} /> {done.length} done today</span>}
      </div>
      {msg && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{msg}</p>}
      {cheer && <p className="rounded-2xl bg-emerald-600 p-3 text-center text-sm font-bold text-white shadow-lg">{cheer}</p>}
      {open.map((o) => <Trip key={o.id} o={o} store={store} busy={busy === o.id} onStep={(s) => go(o, s)} />)}
      {done.length > 0 && <DoneToday rides={done} />}
    </section>
  )
}

function Trip({ o, store, busy, onStep }) {
  const p = progress(o)
  const next = NEXT[Math.min(p, 4)](o)
  const [ticked, setTicked] = useState({})
  const [armed, setArmed] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  const allTicked = o.items.every((_, k) => ticked[k])
  const readyIn = o.prep_minutes && o.confirmed_at ? o.prep_minutes - minutesSince(o.confirmed_at) : null
  const payAtPickup = o.pay_when === 'pickup'
  const pickupMap = directions(o.pickup_lat, o.pickup_lng, o.pickup_map)
  const dropMap = directions(o.lat, o.lng)
  const since = minutesSince(o.confirmed_at || o.created_at)

  function press() {
    // Delivered needs a second tap, so a pocket tap can't finish an order.
    if (next.step === 'delivered' && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onStep(next.step)
  }

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(o.restaurant_upi)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // the UPI ID stays visible to type
    }
  }

  return (
    <article className={`${card} overflow-hidden border-red-200`}>
      {/* Header: number, time, step bar */}
      <div className="bg-gradient-to-br from-red-600 via-red-500 to-orange-500 p-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{o.no} · {o.restaurant}</p>
            <p className="mt-0.5 text-lg font-black leading-tight">{HEADLINE[p]}</p>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${since >= 40 ? 'bg-white text-red-700' : 'bg-white/20'}`}>
            <Clock size={13} /> {since} min
          </span>
        </div>
        <ol className="mt-4 flex items-start">
          {STEPS.map(({ key, label, Icon }, k) => {
            const doneStep = k < p
            const now = k === p
            return (
              <li key={key} className="flex flex-1 flex-col items-center gap-1 text-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${k === 0 ? 'opacity-0' : k <= p ? 'bg-white' : 'bg-white/30'}`} />
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${doneStep ? 'bg-white text-red-600' : now ? 'bg-white/30 text-white ring-2 ring-white' : 'bg-white/15 text-white/60'}`}>
                    {doneStep ? <Check size={16} strokeWidth={3} /> : <Icon size={15} />}
                  </span>
                  <span className={`h-0.5 flex-1 ${k === STEPS.length - 1 ? 'opacity-0' : k < p ? 'bg-white' : 'bg-white/30'}`} />
                </div>
                <span className={`text-[10px] font-semibold ${now ? 'text-white' : 'text-white/75'}`}>{label}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="space-y-3 p-4">
        {/* 1. Pickup */}
        <div className={`rounded-2xl p-3 ${p <= 2 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-neutral-50 opacity-80'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Store size={15} className="text-red-600" /> Pick up · {o.restaurant}</p>
              {o.pickup_address && <p className="mt-0.5 text-xs text-ink/75">{o.pickup_address}{o.pickup_area ? `, ${o.pickup_area}` : ''}</p>}
            </div>
            {p <= 2 && readyIn != null && (
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${readyIn > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                <ChefHat size={13} /> {readyIn > 0 ? `Ready in ~${readyIn} min` : 'Should be ready'}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {o.pickup_phone && <a href={`tel:+91${o.pickup_phone}`} className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Phone size={14} /> Call</a>}
            {pickupMap && <a href={pickupMap} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Navigation size={14} /> Directions</a>}
          </div>
          {payAtPickup && p <= 2 && (
            <div className="mt-3 rounded-xl bg-white p-3 text-sm shadow-sm">
              <p className="font-semibold">Pay the restaurant <span className="text-red-700">{rupee(o.menu_total)}</span> at pickup</p>
              {o.restaurant_upi && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setQr('restaurant')} className="flex h-9 items-center gap-1 rounded-full bg-red-600 px-3 text-xs font-bold text-white"><QrCode size={14} /> Pay by UPI</button>
                  <button type="button" onClick={copyUpi} className="flex h-9 items-center gap-1 rounded-full bg-neutral-100 px-3 text-xs font-semibold"><Copy size={13} /> {copied ? 'Copied' : o.restaurant_upi}</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dishes: tick at the counter */}
        <div className="rounded-2xl border border-line p-3">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted">
            <span>Check the bag · {itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'}</span>
            {allTicked && <span className="text-emerald-700">All there ✓</span>}
          </p>
          {o.items.some((i) => i.from_store) && (
            <p className="mt-2 rounded-xl bg-sky-50 p-2 text-xs font-semibold text-sky-900">
              🥤 Cold drinks come from the Jholzo store, not the restaurant: pick them up at the shop first.
            </p>
          )}
          <ul className="mt-2 space-y-1.5">
            {o.items.map((i, k) => (
              <li key={k}>
                <button type="button" onClick={() => setTicked({ ...ticked, [k]: !ticked[k] })}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition ${ticked[k] ? 'bg-emerald-50 text-emerald-900' : 'bg-neutral-50'}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${ticked[k] ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white'}`}>
                    {ticked[k] && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className={`flex-1 ${ticked[k] ? 'line-through decoration-emerald-600/60' : ''}`}>
                    {dishText(i)}
                    {i.from_store && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">Jholzo store</span>}
                  </span>
                  <b className="text-base">×{i.qty}</b>
                </button>
              </li>
            ))}
          </ul>
          {o.note && <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"><MessageCircle size={14} className="mt-0.5 shrink-0" /> {o.note}</p>}
        </div>

        {/* 2. Drop */}
        <div className={`rounded-2xl p-3 ${p >= 3 ? 'bg-mint ring-1 ring-emerald-200' : 'bg-neutral-50'}`}>
          <p className="flex items-center gap-1.5 text-sm font-bold"><MapPin size={15} className="text-emerald-700" /> Deliver to · {o.name}</p>
          <p className="mt-0.5 text-xs text-ink/75">{o.address}{o.area ? `, ${o.area}` : ''}{o.distance_km ? ` · ${Number(o.distance_km).toFixed(1)} km` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={`tel:+91${o.phone}`} className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Phone size={14} /> Call</a>
            {dropMap && <a href={dropMap} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Navigation size={14} /> Directions</a>}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{o.payment === 'upi' ? 'UPI at the door' : 'Collect cash'}</p>
              <p className="text-2xl font-black leading-tight">{rupee(o.total)}</p>
            </div>
            {o.payment === 'upi' && store.upi_id && p >= 3 && (
              <button type="button" onClick={() => setQr('customer')} className="flex h-10 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 text-sm font-bold text-white"><QrCode size={16} /> Show QR</button>
            )}
          </div>
        </div>

        {/* The next step */}
        <button type="button" disabled={busy} onClick={press}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
            next.step === 'delivered' ? (armed ? 'animate-pulse bg-emerald-700' : 'bg-emerald-600') : 'bg-red-600'}`}>
          {busy ? 'Saving…' : armed ? 'Tap again to confirm: delivered' : <><span className="text-xl">{next.emoji}</span> {next.label}</>}
        </button>
        {p === 1 && (
          <button type="button" disabled={busy} onClick={() => onStep('picked')} className="block w-full text-center text-xs font-semibold text-muted underline">
            Already picked up? Skip to Picked up
          </button>
        )}
        {p === 3 && (
          <button type="button" disabled={busy} onClick={() => { setArmed(false); onStep('delivered') }} className="block w-full text-center text-xs font-semibold text-muted underline">
            Handed it over already? Mark Delivered
          </button>
        )}
      </div>

      {qr === 'customer' && (
        <UpiQr order={{ total: o.total, order_number: o.no }} store={store} onClose={() => setQr('')}
          onPaid={() => { setQr(''); onStep('delivered') }} />
      )}
      {qr === 'restaurant' && (
        <UpiQr order={{ total: Number(o.menu_total), upi_note: `Jholzo ${o.no}` }} store={{ upi_id: o.restaurant_upi, upi_name: o.restaurant, name: o.restaurant }}
          apps footnote={`Pay ${o.restaurant} for ${o.no}`} tip="Pay from your UPI app, then show the restaurant the payment."
          paidLabel="Paid" onClose={() => setQr('')} onPaid={() => setQr('')} />
      )}
    </article>
  )
}

function DoneToday({ rides }) {
  const [openList, setOpenList] = useState(false)
  const cash = rides.filter((o) => o.payment === 'cash').reduce((s, o) => s + o.total, 0)
  const paidOut = rides.filter((o) => o.pay_when === 'pickup').reduce((s, o) => s + Number(o.menu_total), 0)
  return (
    <div className={`${card} overflow-hidden border-emerald-200`}>
      <button type="button" onClick={() => setOpenList(!openList)} className="flex w-full items-center gap-3 bg-gradient-to-r from-emerald-50 to-white p-4 text-left">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-xl">🏆</span>
        <span className="flex-1">
          <b className="block">{rides.length} food {rides.length === 1 ? 'trip' : 'trips'} done today</b>
          <span className="text-xs text-muted">Cash {rupee(cash)}{paidOut ? ` · paid restaurants ${rupee(paidOut)} · give back ${rupee(cash - paidOut)}` : ''}</span>
        </span>
        <ChevronDown size={20} className={`text-muted transition-transform ${openList ? 'rotate-180' : ''}`} />
      </button>
      {openList && (
        <ul className="divide-y divide-line/60 border-t border-line px-4 text-sm">
          {rides.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <b>{o.no}</b> <span className="text-muted">· {o.restaurant} → {o.name}</span>
                <span className="block text-xs text-muted">{o.delivered_at ? clock(o.delivered_at) : ''} · {o.payment === 'upi' ? 'UPI' : 'Cash'}</span>
              </span>
              <b>{rupee(o.total)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
