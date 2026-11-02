import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bike, CalendarDays, Phone, Truck } from 'lucide-react'
import CustomerHint from '../../components/CustomerHint.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { PaymentBadge } from './PaymentCheck.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDark, lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { adminListOrders, assignRider, confirmOrder, getStore, listTeam, setDispatch } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, dayLabel, fmtClock, isExpress, itemsText, rupee } from '../../lib/format.js'
import { toWa, waLink } from '../../lib/whatsapp.js'
import { useRole } from '../../lib/role.js'
import { MessageButton } from '../partner/PartnerOrderCard.jsx'

// New: not on the way yet. Cash orders are confirmed by themselves (update 037), so New holds those too.
const isNew = (o) => (o.status === 'placed' || o.status === 'confirmed') && !o.dispatch
const FILTERS = [
  ['new', 'New', isNew],
  ['on_the_way', 'On the way', (o) => o.status === 'confirmed' && !!o.dispatch],
  ['completed', 'Delivered', (o) => o.status === 'completed'],
  ['cancelled', 'Cancelled', (o) => o.status === 'cancelled'],
  ['all', 'All', () => true],
]
const matches = (key) => FILTERS.find(([k]) => k === key)[2]

// Which day's orders to show, by the day they were placed.
const DAYS = [
  ['all', 'All days'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
]

const placedDay = (o) => dateStr(new Date(o.created_at))

// "Sun, 2 Nov"
function longDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Today / Yesterday / Tomorrow are said too; other days only as "Fri, 30 Oct".
const near = (day) => ['Today', 'Yesterday', 'Tomorrow'].includes(dayLabel(day))

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // sound not allowed until the page is tapped once
  }
}

export default function AdminOrders() {
  const [filter, setFilter] = useState('new')
  const [day, setDay] = useState('all') // 'all', 'today', 'yesterday' or a date like 2026-11-02
  const { data: orders = [], reload } = useData(adminListOrders)
  const { data: team = [] } = useData(listTeam)
  const { data: store } = useData(getStore)
  const { isOwner } = useRole()
  const nameOf = (id) => team.find((t) => t.user_id === id)?.name || 'Owner'
  const riders = team.filter((t) => t.role === 'rider' && t.active)
  // Riders get orders only from here or the order page (update 033); a deactivated rider still shows on their orders.
  const riderOptions = (o) => (o.rider_id && !riders.some((r) => r.user_id === o.rider_id) ? [...riders, { user_id: o.rider_id, name: nameOf(o.rider_id) }] : riders)
  const seen = useRef(null)

  // Check for new orders every 15 seconds and beep when one arrives.
  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  useEffect(() => {
    const ids = orders.filter(isNew).map((o) => o.id)
    if (seen.current && ids.some((id) => !seen.current.has(id))) beep()
    seen.current = new Set(ids)
  }, [orders])

  const today = dateStr()
  const dayKey = day === 'today' ? today : day === 'yesterday' ? addDays(today, -1) : day
  const dayOrders = day === 'all' ? orders : orders.filter((o) => placedDay(o) === dayKey)
  const shown = dayOrders.filter(matches(filter))
  const count = (key) => dayOrders.filter(matches(key)).length
  // New orders hidden by the chosen day must not be missed.
  const newElsewhere = day === 'all' ? 0 : orders.filter((o) => isNew(o) && placedDay(o) !== dayKey).length
  // Newest first, so orders of one day sit together: one heading per day.
  const groups = []
  for (const o of shown) {
    const d = placedDay(o)
    if (groups.at(-1)?.day !== d) groups.push({ day: d, orders: [] })
    groups.at(-1).orders.push(o)
  }
  const chip = (on) => `h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div>
      <h1 className="text-2xl font-black">Orders</h1>
      <p className="text-sm text-neutral-500">Cash orders are confirmed by themselves. Call the customer once before packing, then tap On the way.</p>
      <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {DAYS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setDay(key)} className={chip(day === key)}>{label}</button>
        ))}
        <label className={`${chip(/^\d{4}-/.test(day))} flex items-center gap-1.5`}>
          <CalendarDays size={16} />
          <input
            type="date"
            value={/^\d{4}-/.test(day) ? day : ''}
            max={today}
            onChange={(e) => setDay(e.target.value || 'all')}
            aria-label="Pick a day"
            className="bg-transparent text-sm font-semibold outline-none [color-scheme:light]"
          />
        </label>
      </div>
      <p className="mt-2 text-sm font-semibold text-neutral-700">
        {day === 'all' ? 'Showing all days' : `Showing orders placed ${near(dayKey) ? `${dayLabel(dayKey)}, ` : ''}${longDay(dayKey)}`}
      </p>
      {newElsewhere > 0 && (
        <button type="button" onClick={() => setDay('all')} className="mt-2 w-full rounded-xl bg-accent px-3 py-2 text-left text-sm font-semibold text-ink">
          {newElsewhere} new order{newElsewhere === 1 ? '' : 's'} on other days · show all days
        </button>
      )}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}
          >
            {label} {count(key) > 0 && <span className={key === 'new' && filter !== key ? 'ml-1 rounded-full bg-accent px-1.5 text-ink' : 'ml-1'}>{count(key)}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {groups.map((g) => {
          const amount = g.orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + Number(o.total || 0), 0)
          return (
          <section key={g.day} className="space-y-3">
            <h2 className="sticky top-14 z-[1] -mx-4 flex items-baseline justify-between bg-neutral-100/95 px-4 py-2 backdrop-blur sm:top-[6.25rem]">
              <span className="font-black">{near(g.day) ? <>{dayLabel(g.day)} <span className="font-semibold text-neutral-500">· {longDay(g.day)}</span></> : longDay(g.day)}</span>
              <span className="text-sm text-neutral-600">{g.orders.length} order{g.orders.length === 1 ? '' : 's'}{amount > 0 && <> · <b className="text-neutral-900">{rupee(amount)}</b></>}</span>
            </h2>
        {g.orders.map((o) => (
          <div key={o.id} className={`${lcard} p-4 ${isNew(o) ? 'border-2 border-neutral-900 shadow-[0_0_0_4px_#E8FF3A]' : ''}`}>
            <Link to={`/admin/orders/${o.id}`} className="block">
              <div className="flex items-center justify-between">
                <span className="flex flex-wrap items-center gap-2 font-bold">#{o.order_number} <StatusBadge status={o.status} /> <PaymentBadge order={o} /></span>
                <span className="text-sm text-neutral-500">Placed {fmtClock(o.created_at)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>
                  <span className="block font-semibold">{o.customer_name}</span>
                  <span className="text-sm text-neutral-500">{o.customer_phone}</span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold">{rupee(o.total)}</span>
                  <span className="text-sm text-neutral-500">{itemsText(o.item_count)} · {o.payment_method === 'cash' ? 'Cash' : 'UPI'}</span>
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-600">
                <Truck size={15} /> {isExpress(o) ? <b className="text-amber-700">⚡ Express by {fmtClock(o.express_by)}</b> : <>Delivery {dayLabel(o.delivery_date)}</>}{o.distance_km != null ? ` · ${o.distance_km} km` : ''}
              </p>
              {o.status === 'cancelled' && <p className="mt-1 text-sm text-neutral-500">Reason: {o.cancel_reason}</p>}
              <div className="mt-1"><CustomerHint hint={o.hint} /></div>
            </Link>
            {o.status === 'placed' && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a href={`tel:${o.customer_phone}`} className={lbtnOutline}><Phone size={17} /> Call</a>
                <a href={waLink(toWa(o.customer_phone), `Hello ${o.customer_name}, this is Jholzo. We have received your order #${o.order_number}.`)} target="_blank" rel="noreferrer" className={lbtnOutline}>
                  <WhatsAppIcon size={17} />
                </a>
                {/* Pay-now UPI order: the owner checks the payment first (the database refuses others). */}
                {!isOwner && o.payment_method === 'upi_now' && o.payment_status !== 'paid' ? (
                  <span className="flex items-center justify-center rounded-xl bg-amber-50 px-2 text-center text-xs font-semibold text-amber-800">Owner checks payment</span>
                ) : (
                  <button type="button" onClick={() => confirmOrder(o.id).catch((err) => window.alert(err.message))} className={lbtnDark}>Confirm</button>
                )}
              </div>
            )}
            {/* The owner sends it out from here (the rider page has the same button); executives can't. */}
            {isOwner && store && o.status === 'confirmed' && !o.dispatch && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`tel:${o.customer_phone}`} className={lbtnOutline}><Phone size={17} /> Call</a>
                <MessageButton
                  order={o} store={store} kind="on_the_way" auto={!!store.whatsapp_auto} icon={Bike} primary label="On the way"
                  before={async () => { await setDispatch(o.id, 'on_the_way'); reload() }} onError={(m) => window.alert(m)}
                />
              </div>
            )}
            {(o.status === 'placed' || o.status === 'confirmed') && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <Bike size={16} className="shrink-0 text-neutral-500" />
                <span className="shrink-0 font-semibold text-neutral-600">Rider</span>
                <select
                  value={o.rider_id ?? ''}
                  onChange={(e) => assignRider(o.id, e.target.value).catch((err) => window.alert(err.message))}
                  className={`${lfieldBase} h-10 min-w-0 flex-1 ${o.rider_id ? '' : 'border-amber-400 bg-amber-50'}`}
                >
                  <option value="">Choose a rider</option>
                  {riderOptions(o).map((r) => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
                </select>
              </label>
            )}
          </div>
        ))}
          </section>
          )
        })}
        {!shown.length && (
          <p className="py-10 text-center text-neutral-500">
            {filter === 'new' ? 'No new orders. New orders show up here with a sound.' : day === 'all' ? 'No orders here.' : 'No orders here on this day.'}
          </p>
        )}
      </div>
    </div>
  )
}
