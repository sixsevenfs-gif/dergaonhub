import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, Phone, Store } from 'lucide-react'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { WhatsAppIcon } from '../../../components/icons.jsx'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import { useRole } from '../../../lib/role.js'
import { listTeam } from '../../../lib/store.js'
import { rupee } from '../../../lib/format.js'
import { toWa, waLink } from '../../../lib/whatsapp.js'
import { assignFoodRider, foodOrder, foodRestaurants, foodStageText, setFoodStatus, whenText } from '../../../lib/foodAdmin.js'
import { FoodStatus } from './FoodBits.jsx'

const REASONS = ['Restaurant is closed', 'Dish not available', 'Customer asked to cancel', 'No-show', 'Fake or test order']

// One food order: customer, restaurant (to call and pay), dishes, bill, rider, and the next step.
export default function FoodOrderDetail() {
  const { id } = useParams()
  const { isOwner } = useRole()
  const { data: o, error, reload, refresh } = useData(() => foodOrder(id), [id])
  // Live: the rider's steps and the customer's cancel show here every 10 s.
  useAutoRefresh(refresh, 10_000)
  const { data: team } = useData(listTeam)
  const { data: places } = useData(foodRestaurants)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState(REASONS[0])
  const [other, setOther] = useState('')

  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
  if (o === undefined) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!o) return <p className={`${lcard} p-6 text-center`}>Order not found. <Link to="/admin/food/orders" className="underline">Back to food orders</Link></p>

  const place = (places ?? []).find((r) => r.id === o.restaurant_id)
  const placePhone = place?.phone || place?.whatsapp || ''
  const riders = (team ?? []).filter((r) => r.active && (r.role ?? 'rider') === 'rider')
  const open = ['placed', 'confirmed', 'picked'].includes(o.status)
  const map = o.lat != null && o.lng != null ? `https://maps.google.com/?q=${o.lat},${o.lng}` : ''

  async function run(fn) {
    setBusy(true)
    setMsg('')
    try {
      await fn()
      reload()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  const restaurantText = `Jholzo order ${o.order_number}:\n${(o.food_order_items ?? []).map((i) => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.qty}`).join('\n')}${o.note ? `\nNote: ${o.note}` : ''}\nOur rider will pick it up.`

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{o.order_number}</h1>
          <p className="text-sm text-neutral-500">{whenText(o.created_at)}</p>
        </div>
        <div className="text-right">
          <FoodStatus status={o.status} />
          {open && <p className="mt-1 text-xs font-semibold text-neutral-600">{foodStageText(o)}</p>}
        </div>
      </div>
      {o.status === 'cancelled' && <p className="rounded-xl bg-neutral-100 p-3 text-sm">Cancelled: {o.cancel_reason || '—'}</p>}
      {msg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      {o.status !== 'cancelled' && <Trip o={o} />}

      <div className={`${lcard} space-y-2 p-4`}>
        <p className="text-xs font-semibold uppercase text-neutral-500">Customer</p>
        <p className="font-bold">{o.customer_name} · {o.customer_phone}</p>
        <p className="text-sm">{o.address}, {o.area}</p>
        {o.note && <p className="rounded-lg bg-amber-50 p-2 text-sm">Note: {o.note}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`tel:+91${o.customer_phone}`} className={`${lbtnOutline} min-h-10 px-3 text-sm`}><Phone size={15} /> Call</a>
          <a href={waLink(toWa(o.customer_phone))} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-10 px-3 text-sm`}><WhatsAppIcon size={15} /> WhatsApp</a>
          {map && <a href={map} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-10 px-3 text-sm`}><MapPin size={15} /> Map</a>}
        </div>
      </div>

      <div className={`${lcard} space-y-2 p-4`}>
        <p className="text-xs font-semibold uppercase text-neutral-500">Restaurant</p>
        <p className="flex items-center gap-2 font-bold"><Store size={16} /> {o.restaurant_name}</p>
        {(place?.address || o.restaurant_address) && <p className="text-sm">{place?.address || o.restaurant_address}</p>}
        <p className="text-sm">Pay the restaurant: <b>{rupee(o.menu_total)}</b> <span className="text-neutral-500">(their menu price)</span></p>
        {placePhone && (
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={`tel:+91${placePhone}`} className={`${lbtnOutline} min-h-10 px-3 text-sm`}><Phone size={15} /> Call restaurant</a>
            <a href={waLink(toWa(placePhone), restaurantText)} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-10 px-3 text-sm`}><WhatsAppIcon size={15} /> Send order</a>
          </div>
        )}
      </div>

      <div className={`${lcard} p-4`}>
        <p className="text-xs font-semibold uppercase text-neutral-500">Dishes</p>
        <div className="mt-2 divide-y divide-neutral-100 text-sm">
          {(o.food_order_items ?? []).map((i) => (
            <div key={i.id} className="flex justify-between gap-2 py-1.5">
              <span>{i.name}{i.variant ? ` (${i.variant})` : ''} × {i.qty}</span>
              <span>{rupee(i.line_total)} {isOwner && <span className="text-xs text-neutral-400">menu {rupee(Number(i.menu_price) * i.qty)}</span>}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
          <Row label="Dishes" value={rupee(o.items_total)} />
          {o.packing_fee > 0 && <Row label="Packing" value={rupee(o.packing_fee)} />}
          <Row label="Delivery" value={o.delivery_fee ? rupee(o.delivery_fee) : 'FREE'} />
          {o.platform_fee > 0 && <Row label="Platform fee" value={rupee(o.platform_fee)} />}
          {o.gst > 0 && <Row label="GST" value={rupee(o.gst)} />}
          <Row label={`Total · ${o.payment_method === 'upi' ? 'UPI' : 'Cash'} on delivery`} value={rupee(o.total)} bold />
          {isOwner && <Row label="Your markup on dishes" value={rupee(o.items_total - Number(o.menu_total))} muted />}
        </div>
      </div>

      {open && (
        <div className={`${lcard} space-y-2 p-4`}>
          <p className="text-xs font-semibold uppercase text-neutral-500">Rider</p>
          <select className={lfield} value={o.rider_id ?? ''} disabled={busy} onChange={(e) => run(() => assignFoodRider(o.id, e.target.value))}>
            <option value="">No rider yet</option>
            {riders.map((r) => <option key={r.user_id} value={r.user_id}>{r.name || r.phone}</option>)}
          </select>
          <p className="text-xs text-neutral-500">The rider app rings for confirmed orders: the chosen rider, or every rider when nobody is chosen.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {o.status === 'placed' && <button type="button" disabled={busy} onClick={() => run(() => setFoodStatus(o.id, 'confirmed'))} className={lbtnDark}>Confirm: restaurant said yes</button>}
        {o.status === 'confirmed' && <button type="button" disabled={busy} onClick={() => run(() => setFoodStatus(o.id, 'picked'))} className={lbtnDark}>Picked up from restaurant</button>}
        {(o.status === 'confirmed' || o.status === 'picked') && <button type="button" disabled={busy} onClick={() => run(() => setFoodStatus(o.id, 'delivered'))} className={o.status === 'picked' ? lbtnDark : lbtnOutline}>Delivered</button>}
        {open && !cancelling && <button type="button" disabled={busy} onClick={() => setCancelling(true)} className={lbtnDanger}>Cancel order</button>}
        {isOwner && !open && <button type="button" disabled={busy} onClick={() => run(() => setFoodStatus(o.id, 'confirmed'))} className={lbtnOutline}>Undo: back to Preparing</button>}
      </div>

      {cancelling && (
        <div className={`${lcard} space-y-2 border-red-200 p-4`}>
          <p className="font-bold">Why is it cancelled?</p>
          <select className={lfield} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
            <option value="other">Other…</option>
          </select>
          {reason === 'other' && <input className={lfield} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Write the reason" />}
          {reason === 'No-show' && <p className="text-xs text-red-600">A no-show on a cash order counts towards blocking this number (2 strikes).</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={lbtnDanger}
              onClick={() => run(async () => { await setFoodStatus(o.id, 'cancelled', reason === 'other' ? other : reason); setCancelling(false) })}>
              Cancel this order
            </button>
            <button type="button" onClick={() => setCancelling(false)} className={lbtnOutline}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  )
}

// The order's way, with the time of each step the rider pressed (update 067). The customer's app shows the same.
const TRIP = [
  ['created_at', 'Placed'], ['confirmed_at', 'Restaurant confirmed'], ['to_restaurant_at', 'Rider going to the restaurant'],
  ['at_restaurant_at', 'Rider at the restaurant'], ['picked_at', 'Picked up'], ['arriving_at', 'Rider at the door'], ['delivered_at', 'Delivered'],
]
function Trip({ o }) {
  const time = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return (
    <div className={`${lcard} p-4`}>
      <p className="text-xs font-semibold uppercase text-neutral-500">Trip{o.rider_name ? ` · ${o.rider_name}` : ''}</p>
      <ol className="mt-2 space-y-1.5">
        {TRIP.map(([key, label]) => (
          <li key={key} className={`flex items-center gap-2 text-sm ${o[key] ? '' : 'text-neutral-400'}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o[key] ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
            <span className="flex-1">{label}</span>
            {o[key] && <span className="text-xs text-neutral-500">{time(o[key])}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Row({ label, value, bold, muted }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'text-base font-bold' : ''} ${muted ? 'text-neutral-500' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
