import { useEffect, useState } from 'react'
import {
  BellRing, Check, ChevronDown, Clock, Copy, MapPin, MessageCircle, Navigation, Phone, QrCode, Store, Trophy, UtensilsCrossed,
} from 'lucide-react'
import { card } from '../../components/ui.js'
import { useData } from '../../lib/useData.js'
import { rupee } from '../../lib/format.js'
import { partnerFoodOrders, partnerFoodStep } from '../../lib/foodAdmin.js'
import { partnerAppTook } from '../../lib/partnerApp.js'
import UpiQr from './UpiQr.jsx'

// Jholzo Food on the rider page (update 073). A new food order rings every rider (the Partner app rings like a
// call); the first rider to take it does four things:
//   1. calls the restaurant and taps "Restaurant has the order",
//   2. leaves at the time shown, pays the restaurant there when it is paid at pickup, taps "Picked up",
//   3. delivers, collects the money, taps "Delivered".
// Before the restaurant has the order the rider can give it back to the others, or say the restaurant can't make it.

const STEPS = ['Taken', 'Restaurant', 'Picked up', 'Delivered']

/** 0 new (not taken), 1 taken: call the restaurant, 2 the restaurant has it, 3 picked up, 4 delivered. */
function progress(o) {
  if (o.status === 'delivered') return 4
  if (o.status === 'picked') return 3
  if (o.status === 'confirmed') return 2
  return o.mine ? 1 : 0
}

const minutesSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : 0)
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const directions = (lat, lng, link) => link || (lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : '')
const itemCount = (o) => o.items.reduce((s, i) => s + i.qty, 0)
const dishText = (i) => `${i.name}${i.variant ? ` (${i.variant})` : ''}`
const PAID_WORD = { daily: 'every day', weekly: 'every week' }

export default function FoodRides({ store = {} }) {
  const { data: rides, reload } = useData(partnerFoodOrders)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [cheer, setCheer] = useState('')
  const [, tick] = useState(0)
  useEffect(() => {
    // New orders every 15 seconds (the Partner app also asks at once when it rang), the clocks every 20.
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 15_000)
    const c = setInterval(() => tick((n) => n + 1), 20_000)
    window.addEventListener('focus', reload)
    return () => {
      clearInterval(t)
      clearInterval(c)
      window.removeEventListener('focus', reload)
    }
  }, [reload])
  if (!rides?.length) return null

  const fresh = rides.filter((o) => !o.mine && !o.rider_id && (o.status === 'placed' || o.status === 'confirmed'))
  const mine = rides.filter((o) => o.mine && o.status !== 'delivered')
  const done = rides.filter((o) => o.status === 'delivered' && o.mine)
  if (!fresh.length && !mine.length && !done.length) return null

  async function go(o, step, after = '') {
    setBusy(o.id)
    setMsg('')
    try {
      await partnerFoodStep(o.id, step)
      if (step === 'take') partnerAppTook(o.id)
      navigator.vibrate?.(step === 'delivered' ? [60, 60, 120] : 40)
      if (after) {
        setCheer(after)
        setTimeout(() => setCheer(''), 3500)
      }
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy('')
      reload()
    }
  }

  return (
    <section className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-700">
          <UtensilsCrossed size={16} /> Food
          {fresh.length > 0 && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {fresh.length} new</span>}
        </h2>
        {done.length > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Trophy size={14} /> {done.length} done today</span>}
      </div>
      {msg && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{msg}</p>}
      {cheer && <p className="rounded-2xl bg-emerald-600 p-3 text-center text-sm font-bold text-white shadow-lg">{cheer}</p>}
      {fresh.map((o) => (
        <NewOrder key={o.id} o={o} busy={busy === o.id} onTake={() => go(o, 'take', `${o.no} is yours. Call ${o.restaurant} now.`)} />
      ))}
      {mine.map((o) => (
        <Trip key={o.id} o={o} store={store} busy={busy === o.id}
          onStep={(s) => go(o, s, s === 'delivered' ? `Delivered ${o.no}! Great job 🎉` : '')} />
      ))}
      {done.length > 0 && <DoneToday rides={done} />}
    </section>
  )
}

// A new order nobody has taken: what it is, and one button.
function NewOrder({ o, busy, onTake }) {
  return (
    <article className={`${card} overflow-hidden border-2 border-red-500`}>
      <div className="flex items-center justify-between gap-2 bg-red-600 px-4 py-2.5 text-white">
        <p className="flex items-center gap-2 text-sm font-bold"><BellRing size={16} className="animate-pulse" /> New food order · {o.no}</p>
        <span className="flex items-center gap-1 text-xs font-semibold"><Clock size={13} /> {minutesSince(o.created_at)} min</span>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xl font-black leading-tight">{o.restaurant}</p>
        <p className="text-sm text-ink/80">
          {itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'} · <b>{rupee(o.total)}</b> {o.payment === 'upi' ? 'UPI' : 'cash'} · to {o.name}, {o.area}
          {o.distance_km ? ` (${Number(o.distance_km).toFixed(1)} km)` : ''}
        </p>
        <p className="text-xs text-muted">{o.items.map((i) => `${dishText(i)} ×${i.qty}`).join(', ')}</p>
        <button type="button" disabled={busy} onClick={onTake}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-60">
          {busy ? 'Taking…' : '✋ Take this order'}
        </button>
        <p className="text-center text-xs text-muted">The first rider to take it gets it.</p>
      </div>
    </article>
  )
}

function Trip({ o, store, busy, onStep }) {
  const p = progress(o)
  const [ticked, setTicked] = useState({})
  const [armed, setArmed] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(''), 5000)
    return () => clearTimeout(t)
  }, [armed])

  const payAtPickup = o.pay_when === 'pickup'
  const pickupMap = directions(o.pickup_lat, o.pickup_lng, o.pickup_map)
  const dropMap = directions(o.lat, o.lng)
  const allTicked = o.items.every((_, k) => ticked[k])
  const leaveIn = o.leave_at ? Math.ceil((new Date(o.leave_at).getTime() - Date.now()) / 60000) : null

  // "Delivered", "the restaurant said no" and "give it back" need a second tap, so a pocket tap can't do them.
  function twice(key, step) {
    if (armed !== key) return setArmed(key)
    setArmed('')
    onStep(step)
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

  const headline = [
    '', `Call ${o.restaurant} and give the order`,
    leaveIn == null ? `Go to ${o.restaurant}` : leaveIn > 0 ? `Leave at ${clock(o.leave_at)}` : `Leave now for ${o.restaurant}`,
    `Deliver to ${o.name}`, 'Delivered',
  ][p]

  return (
    <article className={`${card} overflow-hidden border-red-200`}>
      <div className="bg-gradient-to-br from-red-600 via-red-500 to-orange-500 p-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{o.no} · {o.restaurant}</p>
            <p className="mt-0.5 text-lg font-black leading-tight">{headline}</p>
          </div>
          {p === 2 && leaveIn != null && (
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${leaveIn > 0 ? 'bg-white/20' : 'animate-pulse bg-white text-red-700'}`}>
              <Clock size={13} /> {leaveIn > 0 ? `in ${leaveIn} min` : 'now'}
            </span>
          )}
        </div>
        <ol className="mt-4 flex items-start">
          {STEPS.map((label, k) => {
            // p steps are done (Taken is done once it is the rider's); the next one is the one to do now.
            const doneStep = k < p
            const now = k === p
            return (
              <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${k === 0 ? 'opacity-0' : k <= p ? 'bg-white' : 'bg-white/30'}`} />
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${doneStep ? 'bg-white text-red-600' : now ? 'bg-white/30 text-white ring-2 ring-white' : 'bg-white/15 text-white/60'}`}>
                    {doneStep ? <Check size={15} strokeWidth={3} /> : k + 1}
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
        {/* 1. Call the restaurant: read out the dishes. */}
        {p === 1 && (
          <>
            {o.pickup_phone ? (
              <a href={`tel:+91${o.pickup_phone}`} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-600 bg-white text-lg font-bold text-red-700">
                <Phone size={20} /> Call {o.restaurant}
              </a>
            ) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No phone number for {o.restaurant}. Call the owner.</p>}
            <Dishes o={o} ticked={ticked} setTicked={setTicked} title="Tell them" tick={false} />
            <p className="rounded-xl bg-neutral-50 p-3 text-sm">
              Restaurant's bill: <b>{rupee(o.menu_total)}</b>
              {payAtPickup ? ' · you pay this when you pick it up' : ` · Jholzo pays them ${PAID_WORD[o.pay_when] ?? 'later'}, don't pay`}
            </p>
            <button type="button" disabled={busy} onClick={() => onStep('confirmed')}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-60">
              {busy ? 'Saving…' : '✅ Restaurant has the order'}
            </button>
            <div className="flex justify-center gap-4 text-xs font-semibold">
              <button type="button" disabled={busy} onClick={() => twice('no', 'restaurant_no')} className={armed === 'no' ? 'text-red-700 underline' : 'text-muted underline'}>
                {armed === 'no' ? 'Tap again: cancel the order' : 'Restaurant said no'}
              </button>
              <button type="button" disabled={busy} onClick={() => twice('back', 'release')} className={armed === 'back' ? 'text-red-700 underline' : 'text-muted underline'}>
                {armed === 'back' ? 'Tap again: give it back' : "Can't go? Give it back"}
              </button>
            </div>
          </>
        )}

        {/* 2. The restaurant has it: leave on time, pay, pick up. */}
        {p === 2 && (
          <>
            <div className="rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Store size={15} className="text-red-600" /> Pick up · {o.restaurant}</p>
              {o.pickup_address && <p className="mt-0.5 text-xs text-ink/75">{o.pickup_address}{o.pickup_area ? `, ${o.pickup_area}` : ''}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {o.pickup_phone && <a href={`tel:+91${o.pickup_phone}`} className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Phone size={14} /> Call</a>}
                {pickupMap && <a href={pickupMap} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"><Navigation size={14} /> Directions</a>}
              </div>
              <div className="mt-3 rounded-xl bg-white p-3 text-sm shadow-sm">
                {payAtPickup ? (
                  <>
                    <p className="font-semibold">Pay {o.restaurant} <span className="text-red-700">{rupee(o.menu_total)}</span></p>
                    {o.restaurant_upi && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setQr('restaurant')} className="flex h-9 items-center gap-1 rounded-full bg-red-600 px-3 text-xs font-bold text-white"><QrCode size={14} /> Pay by UPI</button>
                        <button type="button" onClick={copyUpi} className="flex h-9 items-center gap-1 rounded-full bg-neutral-100 px-3 text-xs font-semibold"><Copy size={13} /> {copied ? 'Copied' : o.restaurant_upi}</button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="font-semibold">Don't pay here: Jholzo pays {o.restaurant} {PAID_WORD[o.pay_when] ?? 'later'}.</p>
                )}
              </div>
            </div>
            <Dishes o={o} ticked={ticked} setTicked={setTicked} title="Check the bag" tick allTicked={allTicked} />
            <button type="button" disabled={busy} onClick={() => onStep('picked')}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-60">
              {busy ? 'Saving…' : `🥡 Picked up${payAtPickup ? ` · paid ${rupee(o.menu_total)}` : ''}`}
            </button>
            <button type="button" disabled={busy} onClick={() => twice('no', 'restaurant_no')}
              className={`block w-full text-center text-xs font-semibold underline ${armed === 'no' ? 'text-red-700' : 'text-muted'}`}>
              {armed === 'no' ? 'Tap again: cancel the order' : 'Restaurant can\'t make it?'}
            </button>
          </>
        )}

        {/* 3. Deliver and collect. */}
        {p === 3 && (
          <>
            <div className="rounded-2xl bg-mint p-3 ring-1 ring-emerald-200">
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
                {o.payment === 'upi' && store.upi_id && (
                  <button type="button" onClick={() => setQr('customer')} className="flex h-10 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 text-sm font-bold text-white"><QrCode size={16} /> Show QR</button>
                )}
              </div>
              {o.note && <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"><MessageCircle size={14} className="mt-0.5 shrink-0" /> {o.note}</p>}
            </div>
            <button type="button" disabled={busy} onClick={() => twice('done', 'delivered')}
              className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${armed === 'done' ? 'animate-pulse bg-emerald-700' : 'bg-emerald-600'}`}>
              {busy ? 'Saving…' : armed === 'done' ? 'Tap again to confirm: delivered'
                : `✅ Delivered · ${o.payment === 'upi' ? 'paid by UPI' : `collected ${rupee(o.total)}`}`}
            </button>
          </>
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

// The dishes: to read out on the call, or to tick at the counter.
function Dishes({ o, ticked, setTicked, title, tick, allTicked }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <p className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted">
        <span>{title} · {itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'}</span>
        {tick && allTicked && <span className="text-emerald-700">All there ✓</span>}
      </p>
      {o.items.some((i) => i.from_store) && (
        <p className="mt-2 rounded-xl bg-sky-50 p-2 text-xs font-semibold text-sky-900">
          🥤 Cold drinks come from the Jholzo store, not the restaurant: pick them up at the shop.
        </p>
      )}
      <ul className="mt-2 space-y-1.5">
        {o.items.map((i, k) => (
          <li key={k}>
            {tick ? (
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
            ) : (
              <div className={`flex items-center gap-3 rounded-xl px-2 py-2 text-sm ${i.from_store ? 'bg-sky-50/60 text-muted' : 'bg-neutral-50'}`}>
                <span className="flex-1">
                  {dishText(i)}
                  {i.from_store && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">Jholzo store, not them</span>}
                </span>
                <b className="text-base">×{i.qty}</b>
              </div>
            )}
          </li>
        ))}
      </ul>
      {o.note && <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"><MessageCircle size={14} className="mt-0.5 shrink-0" /> {o.note}</p>}
    </div>
  )
}

function DoneToday({ rides }) {
  const [openList, setOpenList] = useState(false)
  const cash = rides.filter((o) => o.payment === 'cash').reduce((s, o) => s + Number(o.total), 0)
  const paidOut = rides.reduce((s, o) => s + Number(o.restaurant_paid ?? 0), 0)
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
