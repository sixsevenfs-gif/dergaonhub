import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bike, ChevronRight, Phone } from 'lucide-react'
import { lbtnDark, lbtnOutline, lcard } from '../../../components/ui.js'
import { WhatsAppIcon } from '../../../components/icons.jsx'
import { useData } from '../../../lib/useData.js'
import { listTeam } from '../../../lib/store.js'
import { rupee } from '../../../lib/format.js'
import { toWa, waLink } from '../../../lib/whatsapp.js'
import { agoText, foodItemsText, foodOrders, setFoodStatus, whenText } from '../../../lib/foodAdmin.js'
import { FoodStatus, NeedsUpdate } from './FoodBits.jsx'

const TABS = [
  ['placed', 'New'],
  ['confirmed', 'Preparing'],
  ['picked', 'On the way'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
]

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 660
    gain.gain.value = 0.25
    osc.start()
    osc.stop(ctx.currentTime + 0.45)
  } catch {
    // sound is allowed only after the page is tapped once
  }
}

// What the desk does next with an order, as one button.
const NEXT = {
  placed: ['confirmed', 'Confirm (restaurant said yes)'],
  confirmed: ['picked', 'Picked up'],
  picked: ['delivered', 'Delivered'],
}

// Food orders of the last 7 days. New ones beep; the list checks for news every 15 seconds while it is open.
export default function FoodOrders() {
  const [tab, setTab] = useState('placed')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const { data: orders, error, reload } = useData(() => foodOrders(7))
  const { data: team } = useData(listTeam)
  const seen = useRef(null)

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 15_000)
    return () => clearInterval(t)
  }, [reload])
  useEffect(() => {
    if (!orders) return
    const fresh = orders.filter((o) => o.status === 'placed').map((o) => o.id)
    if (seen.current && fresh.some((id) => !seen.current.has(id))) beep()
    seen.current = new Set(fresh)
  }, [orders])

  if (orders === null) return <NeedsUpdate n="064" what="food orders" />
  const riders = Object.fromEntries((team ?? []).map((r) => [r.user_id, r.name]))
  const count = (k) => (orders ?? []).filter((o) => k === 'all' || o.status === k).length
  const shown = (orders ?? []).filter((o) => tab === 'all' || o.status === tab)

  async function next(o) {
    const [to] = NEXT[o.status]
    setBusy(o.id)
    setMsg('')
    try {
      await setFoodStatus(o.id, to)
      reload()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Food orders</h1>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${tab === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`}>
            {label}
            {k !== 'all' && count(k) > 0 && <span className={`rounded-full px-1.5 text-xs ${k === 'placed' ? 'bg-red-500 text-white' : 'bg-neutral-200 text-neutral-700'}`}>{count(k)}</span>}
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {msg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      {orders === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
      {orders && shown.length === 0 && (
        <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>
          {tab === 'placed' ? 'No new food orders. New ones beep here (tap the page once so the sound may play).' : 'Nothing here in the last 7 days.'}
        </p>
      )}
      <div className="space-y-3">
        {shown.map((o) => (
          <div key={o.id} className={`${lcard} p-4 ${o.status === 'placed' ? 'ring-2 ring-red-500' : ''}`}>
            <Link to={`/admin/food/orders/${o.id}`} className="block">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{o.order_number}</span>
                <span className="flex items-center gap-2">
                  <FoodStatus status={o.status} />
                  <ChevronRight size={16} className="text-neutral-400" />
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">{o.status === 'placed' ? agoText(o.created_at) : whenText(o.created_at)} · {o.restaurant_name}</p>
              <p className="mt-2 text-sm">{foodItemsText(o)}</p>
              <p className="mt-1 text-sm">
                <b>{rupee(o.total)}</b> <span className="text-neutral-500">· {o.payment_method === 'upi' ? 'UPI' : 'Cash'} on delivery · pay restaurant {rupee(o.menu_total)}</span>
              </p>
              <p className="mt-1 text-sm text-neutral-700">{o.customer_name} · {o.area}{o.rider_id ? <span className="ml-2 inline-flex items-center gap-1 text-neutral-500"><Bike size={14} />{riders[o.rider_id] ?? 'Rider'}</span> : ''}</p>
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:+91${o.customer_phone}`} className={`${lbtnOutline} min-h-10 px-3 text-sm`}><Phone size={15} /> Call</a>
              <a href={waLink(toWa(o.customer_phone))} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-10 px-3 text-sm`}><WhatsAppIcon size={15} /> WhatsApp</a>
              {NEXT[o.status] && (
                <button type="button" disabled={busy === o.id} onClick={() => next(o)} className={`${lbtnDark} min-h-10 px-3 text-sm`}>
                  {busy === o.id ? 'Saving…' : NEXT[o.status][1]}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
