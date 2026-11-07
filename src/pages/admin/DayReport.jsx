import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { adminSales, salesReport } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, dayLabel, fmtClock, rupee } from '../../lib/format.js'
import { downloadCSV, reportCSV } from '../../lib/report.js'
import { useRole } from '../../lib/role.js'
import { LAUNCH_AT } from '../../config.js'

const LAUNCH_DAY = LAUNCH_AT.slice(0, 10)
const ITEMS_SHOWN = 8
// The order list shows for short ranges; longer ones are in the sheet.
const LIST_DAYS = 7

const toDate = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
const shortDate = (d) => toDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const longDate = (d) => toDate(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const daysIn = (from, to) => Math.round((toDate(to) - toDate(from)) / 86_400_000) + 1

function Tile({ label, value, sub }) {
  return (
    <div className={`${lcard} p-3`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-black">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  )
}

// Sales per day (or per month for long ranges) as bars; hover or tap a bar for its numbers.
function SalesBars({ from, to, byDay }) {
  const monthly = daysIn(from, to) > 62
  const map = {}
  for (const d of byDay) {
    const key = monthly ? d.date.slice(0, 7) : d.date
    const row = (map[key] ??= { sales: 0, delivered: 0 })
    row.sales += d.sales
    row.delivered += d.delivered
  }
  const bars = []
  if (monthly) {
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
      bars.push({ key: m, label: toDate(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), ...(map[m] ?? { sales: 0, delivered: 0 }) })
      const next = toDate(`${m}-01`)
      next.setMonth(next.getMonth() + 1)
      m = dateStr(next).slice(0, 7)
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) bars.push({ key: d, label: shortDate(d), ...(map[d] ?? { sales: 0, delivered: 0 }) })
  }
  const top = Math.max(...bars.map((b) => b.sales), 1)
  const best = bars.reduce((a, b) => (b.sales > a.sales ? b : a), bars[0])
  const labelEvery = Math.ceil(bars.length / 7)

  return (
    <div className={`${lcard} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">Sales {monthly ? 'by month' : 'by day'}</h3>
        {best?.sales > 0 && <span className="text-xs text-neutral-500">Best: {best.label} · {rupee(best.sales)}</span>}
      </div>
      <div className="mt-3 flex h-36 items-end gap-0.5 border-b border-neutral-200">
        {bars.map((b) => (
          <div key={b.key} tabIndex={0} aria-label={`${b.label}: ${rupee(b.sales)} from ${b.delivered} delivered order${b.delivered === 1 ? '' : 's'}`}
            className="group relative flex h-full flex-1 items-end outline-none">
            <div className="mx-auto w-full max-w-10 rounded-t bg-neutral-800 group-hover:bg-neutral-950 group-focus:bg-neutral-950"
              style={{ height: b.sales ? `${Math.max(2, (b.sales / top) * 100)}%` : 0 }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block">
              <b>{b.label}</b> · {rupee(b.sales)} · {b.delivered} order{b.delivered === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-neutral-500">
        {bars.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">{i % labelEvery === 0 || i === bars.length - 1 ? b.label : ''}</span>
        ))}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-500">Show as a table</summary>
        <div className="mt-1 divide-y divide-neutral-100">
          {bars.filter((b) => b.delivered).map((b) => (
            <div key={b.key} className="flex justify-between py-1">
              <span>{b.label}</span>
              <span className="text-neutral-500">{b.delivered} order{b.delivered === 1 ? '' : 's'} · <b className="text-neutral-900">{rupee(b.sales)}</b></span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// Sales on the admin home: since launch at the top, then any day or dates. Delivered orders only, so
// cancelled and test orders never count.
export default function DayReport() {
  const today = dateStr()
  const presets = [
    ['today', 'Today', today, today],
    ['yesterday', 'Yesterday', addDays(today, -1), addDays(today, -1)],
    ['week', 'Last 7 days', addDays(today, -6), today],
    ['month', 'This month', `${today.slice(0, 8)}01`, today],
    ['launch', 'Since launch', LAUNCH_DAY, today],
  ]
  const [range, setRange] = useState({ key: 'today', from: today, to: today })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { isOwner } = useRole()
  const { data: life } = useData(() => adminSales(LAUNCH_DAY, today), [today])
  const { data: s } = useData(() => adminSales(range.from, range.to), [range.from, range.to])
  const days = daysIn(range.from, range.to)
  const { data: list } = useData(() => (days <= LIST_DAYS ? salesReport(range.from, range.to) : Promise.resolve(null)), [range.from, range.to])

  const pick = (key, from, to) => setRange({ key, from, to })
  const setDates = (from, to) => {
    if (!from || !to) return
    setRange({ key: 'custom', from: from <= to ? from : to, to: from <= to ? to : from })
  }
  const title = range.from === range.to ? dayLabel(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`
  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await salesReport(range.from, range.to)
      const name = range.from === range.to ? range.from : `${range.from}-to-${range.to}`
      downloadCSV(`jholzo-sales-${name}.csv`, reportCSV({ from: range.from, to: range.to, ...r, withCosts: isOwner }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const chip = ([key, label, from, to]) => (
    <button key={key} type="button" onClick={() => pick(key, from, to)}
      className={`h-9 rounded-full px-3 text-sm font-semibold ${range.key === key ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>
      {label}
    </button>
  )
  const profit = s ? s.cash + s.upi - s.spent : 0

  return (
    <section className="space-y-3">
      {life && (
        <button type="button" onClick={() => pick('launch', LAUNCH_DAY, today)}
          className="block w-full rounded-2xl bg-neutral-900 p-4 text-left text-white">
          <span className="block text-sm text-neutral-300">Total sales since launch · {longDate(LAUNCH_DAY)}</span>
          <span className="mt-1 block text-3xl font-black">{rupee(life.sales)}</span>
          <span className="mt-1 block text-sm text-neutral-300">
            {life.delivered} order{life.delivered === 1 ? '' : 's'} delivered · {life.customers} customer{life.customers === 1 ? '' : 's'} · avg {rupee(life.avgOrder)} per order
          </span>
        </button>
      )}

      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">Sales · {title}</h2>
          <p className="text-sm text-neutral-500">Only delivered orders count. Cancelled and test orders are never added.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{presets.map(chip)}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">From</span>
          <input type="date" value={range.from} max={today} onChange={(e) => setDates(e.target.value, range.to)} aria-label="From date" className={`${lfieldBase} h-9 w-40`} />
          <span className="text-neutral-500">to</span>
          <input type="date" value={range.to} max={today} onChange={(e) => setDates(range.from, e.target.value)} aria-label="To date" className={`${lfieldBase} h-9 w-40`} />
        </div>
      </div>

      {s && (
        <>
          <div className={`${lcard} p-4`}>
            <div className="text-sm text-neutral-500">Sales · {range.from === range.to ? longDate(range.from) : `${longDate(range.from)} to ${longDate(range.to)}`}</div>
            <div className="mt-1 text-3xl font-black">{rupee(s.sales)}</div>
            <div className="text-sm text-neutral-500">from {s.delivered} delivered order{s.delivered === 1 ? '' : 's'}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Orders" value={`${s.delivered} / ${s.orders}`} sub="delivered / all" />
            <Tile label="Average order" value={s.delivered ? rupee(s.avgOrder) : '—'} sub={`${s.customers} customer${s.customers === 1 ? '' : 's'}`} />
            <Tile label="Cash · UPI" value={`${rupee(s.cash)} · ${rupee(s.upi)}`} />
            <Tile label="Items sold" value={s.itemsSold} />
            <Tile label="Cancelled (not counted)" value={s.cancelled} sub={s.pending ? `${s.pending} not delivered yet` : undefined} />
            <Tile label="Delivery + packaging" value={rupee(s.deliveryFees + s.packaging)} sub="included in sales" />
            {isOwner && <Tile label="Spent at shops" value={rupee(s.spent)} sub={<Link to="/admin/summary" className="underline">enter in Daily summary</Link>} />}
            {isOwner && <Tile label={profit >= 0 ? 'Profit' : 'Loss'} value={rupee(profit)} sub="received − spent" />}
          </div>

          {days > 1 && <SalesBars from={range.from} to={range.to} byDay={s.byDay} />}

          {s.topItems.length > 0 && (
            <div className={`${lcard} p-4`}>
              <h3 className="font-bold">What sold</h3>
              <div className="mt-2 divide-y divide-neutral-100 text-sm">
                {s.topItems.slice(0, ITEMS_SHOWN).map((i) => (
                  <div key={i.name} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">{i.name}</span>
                    <span className="shrink-0 text-neutral-500">× {i.quantity} · <b className="text-neutral-900">{rupee(i.amount)}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {list && (
            <div className={`${lcard} p-4`}>
              <h3 className="font-bold">Orders ({list.orders.length})</h3>
              <div className="mt-2 divide-y divide-neutral-100">
                {list.orders.map((o) => (
                  <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">#{o.order_number} <StatusBadge status={o.status} /></span>
                      <span className="block truncate text-neutral-500">{o.customer_name} · {o.area} · {fmtClock(o.created_at)}</span>
                    </span>
                    <span className={`font-bold ${o.status === 'cancelled' ? 'text-neutral-400 line-through' : ''}`}>{rupee(o.total)}</span>
                    <ChevronRight size={16} className="text-neutral-400" />
                  </Link>
                ))}
                {!list.orders.length && <p className="py-1 text-sm text-neutral-500">No orders in these days.</p>}
              </div>
            </div>
          )}
        </>
      )}

      <div className={`${lcard} p-4`}>
        <h3 className="font-bold">Download sheet · {title}</h3>
        <p className="text-sm text-neutral-500">Opens in Excel or Google Sheets: day by day totals, every order with items, and what sold.</p>
        <button type="button" disabled={busy} onClick={download} className={`${lbtnOutline} mt-3 px-3 text-sm`}>
          <Download size={16} /> {busy ? 'Making…' : 'Download'}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  )
}
