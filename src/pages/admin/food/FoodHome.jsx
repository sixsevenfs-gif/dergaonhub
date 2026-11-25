import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, ClipboardList, Store } from 'lucide-react'
import { lcard } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import { useRole } from '../../../lib/role.js'
import { addDays, dateStr, rupee } from '../../../lib/format.js'
import { foodRestaurants, foodSales, fssaiDaysLeft } from '../../../lib/foodAdmin.js'
import { SalesBars } from '../DayReport.jsx'
import { NeedsUpdate } from './FoodBits.jsx'

const RANGES = [
  ['today', 'Today', 0],
  ['yesterday', 'Yesterday', -1],
  ['week', 'Last 7 days', 6],
  ['month', 'Last 30 days', 29],
]

function rangeOf(key) {
  const today = dateStr()
  if (key === 'today') return [today, today]
  if (key === 'yesterday') return [addDays(today, -1), addDays(today, -1)]
  const [, , days] = RANGES.find(([k]) => k === key)
  return [addDays(today, -days), today]
}

function Tile({ label, value, note, hot, to }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-neutral-500">{note}</p>}
    </>
  )
  const cls = `${lcard} block p-4 ${hot ? 'ring-2 ring-red-500' : ''}`
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

// Food home: today at a glance, sales and earnings for a range, the chart, top dishes, each restaurant,
// and restaurants whose FSSAI licence ends soon.
export default function FoodHome() {
  const { isOwner } = useRole()
  const [range, setRange] = useState('today')
  const [from, to] = rangeOf(range)
  const { data: s, error, refresh: refreshRange } = useData(() => foodSales(from, to), [from, to])
  const { data: today, refresh: refreshToday } = useData(() => foodSales(dateStr(), dateStr()), [])
  // Live: today's food orders and sales every 15 s.
  useAutoRefresh(() => {
    refreshRange()
    refreshToday()
  }, 15_000)
  const { data: places } = useData(foodRestaurants)

  if (s === null) return <NeedsUpdate n="064" what="food orders and their numbers" />
  const live = (places ?? []).filter((r) => r.status === 'live' && r.fssai_number?.trim())
  const ending = (places ?? []).filter((r) => r.status !== 'dropped' && r.fssai_number?.trim())
    .map((r) => ({ ...r, left: fssaiDaysLeft(r.fssai_expiry) })).filter((r) => r.left !== null && r.left <= 60)
  const many = from !== to

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Food</h1>
          <p className="text-sm text-neutral-500">{live.length} restaurant{live.length === 1 ? '' : 's'} live in the app</p>
        </div>
        <Link to="/admin/food/orders" className="flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white">
          <ClipboardList size={16} /> Food orders
        </Link>
      </div>

      {today && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Waiting now" value={today.open} note="new, preparing or on the way" hot={today.open > 0} to="/admin/food/orders" />
          <Tile label="Orders today" value={today.orders} note={`${today.delivered} delivered · ${today.cancelled} cancelled`} />
          <Tile label="Sales today" value={rupee(today.sales)} note="delivered orders" />
          {isOwner ? <Tile label="Your markup today" value={rupee(today.markup)} note="price − restaurant's menu" />
            : <Tile label="Customers today" value={today.customers} />}
        </div>
      )}

      {ending.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> FSSAI licence ending</p>
          {ending.map((r) => (
            <p key={r.id} className="mt-1">{r.name.trim()}: {r.left < 0 ? `ended ${-r.left} days ago` : r.left === 0 ? 'ends today' : `ends in ${r.left} days`} ({r.fssai_expiry})</p>
          ))}
          <p className="mt-1 text-xs">The app stops showing a restaurant when you remove its number in the Food Desk.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {RANGES.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setRange(k)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${range === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Orders" value={s.orders} note={`${s.delivered} delivered · ${s.cancelled} cancelled`} />
            <Tile label="Sales" value={rupee(s.sales)} note={`Cash ${rupee(s.cash)} · UPI ${rupee(s.upi)}`} />
            <Tile label="Customers" value={s.customers} />
            {isOwner && <Tile label="Your markup" value={rupee(s.markup)} note="on dishes" />}
            {isOwner && <Tile label="Fees kept" value={rupee(Number(s.delivery_fees) + Number(s.platform_fees))} note={`Delivery ${rupee(s.delivery_fees)} · Platform ${rupee(s.platform_fees)}`} />}
            {isOwner && <Tile label="Owed to restaurants" value={rupee(s.menu_total)} note="menu price of delivered dishes" to="/admin/food/payouts" />}
          </div>
          {isOwner && Number(s.gst) > 0 && (
            <p className="text-xs text-neutral-500">GST collected on these orders: {rupee(s.gst)} (to be paid as your CA says).</p>
          )}

          {many && (
            <SalesBars from={from} to={to} byDay={(s.by_day ?? []).map((d) => ({ date: d.day, sales: Number(d.sales), delivered: d.delivered }))} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`${lcard} p-4`}>
              <h3 className="font-bold">Top dishes</h3>
              {(s.top_dishes ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">No delivered food orders in these days.</p>
              ) : (
                <ol className="mt-2 divide-y divide-neutral-100 text-sm">
                  {s.top_dishes.map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="truncate"><span className="mr-2 text-neutral-400">{i + 1}</span>{d.name}</span>
                      <span className="shrink-0 text-neutral-500">×{d.qty} · <b className="text-neutral-900">{rupee(d.sales)}</b></span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className={`${lcard} p-4`}>
              <h3 className="font-bold">By restaurant</h3>
              {(s.by_restaurant ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">No orders in these days.</p>
              ) : (
                <div className="mt-2 divide-y divide-neutral-100 text-sm">
                  {s.by_restaurant.map((r) => (
                    <div key={r.id ?? r.name} className="py-1.5">
                      <div className="flex justify-between gap-2"><b className="truncate">{r.name}</b><b>{rupee(r.sales)}</b></div>
                      <p className="text-xs text-neutral-500">
                        {r.orders} orders · {r.delivered} delivered{isOwner ? ` · markup ${rupee(r.markup)} · owed ${rupee(r.menu_total)}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Link to="/admin/food/restaurants" className={`${lcard} flex items-center gap-3 p-4`}>
        <Store size={20} className="text-neutral-500" />
        <span className="flex-1">
          <b>Restaurants</b>
          <span className="block text-sm text-neutral-500">{(places ?? []).length} in the Food Desk · {live.length} live in the app</span>
        </span>
        <ChevronRight size={18} className="text-neutral-400" />
      </Link>
    </div>
  )
}
