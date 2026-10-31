import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { salesReport } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, dayLabel, fmtClock, rupee } from '../../lib/format.js'
import { downloadCSV, itemsSold, reportCSV, summarize } from '../../lib/report.js'

const ITEMS_SHOWN = 8

function Tile({ label, value, sub }) {
  return (
    <div className={`${lcard} p-3`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-black">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  )
}

const longDate = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Any day's numbers on the admin home, plus the sheet for a day, a week or a month.
export default function DayReport() {
  const today = dateStr()
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const { data } = useData(() => salesReport(date, date), [date])

  const ranges = {
    day: [date, date],
    week: [addDays(date, -6), date],
    month: [`${date.slice(0, 8)}01`, date],
  }
  const download = async (kind) => {
    const [from, to] = ranges[kind]
    setBusy(kind)
    setError('')
    try {
      const r = await salesReport(from, to)
      downloadCSV(`jholzo-sales-${from === to ? from : `${from}-to-${to}`}.csv`, reportCSV({ from, to, ...r }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const s = data && summarize(data.orders, data.expenses)
  const items = data ? itemsSold(data.orders) : []
  const chip = (d, label) => (
    <button type="button" onClick={() => setDate(d)} className={`h-9 rounded-full px-3 text-sm font-semibold ${date === d ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>
      {label}
    </button>
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Sales report · {dayLabel(date)}</h2>
          <p className="text-sm text-neutral-500">{longDate(date)}. Sales count delivered orders only.</p>
        </div>
        <div className="flex items-center gap-2">
          {chip(today, 'Today')}
          {chip(addDays(today, -1), 'Yesterday')}
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a day" className={`${lfieldBase} h-9 w-40`} />
        </div>
      </div>

      {s && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Orders" value={`${s.delivered} / ${s.orders}`} sub="delivered / all" />
            <Tile label="Sales" value={rupee(s.sales)} sub={s.delivered ? `avg ${rupee(s.avgOrder)} per order` : 'no deliveries'} />
            <Tile label="Cash · UPI" value={`${rupee(s.cash)} · ${rupee(s.upi)}`} />
            <Tile label="Items sold" value={s.itemsSold} sub={`${s.customers} customer${s.customers === 1 ? '' : 's'}`} />
            <Tile label="Cancelled" value={s.cancelled} sub={s.pending ? `${s.pending} not delivered yet` : undefined} />
            <Tile label="Delivery + packaging" value={rupee(s.deliveryFees + s.packaging)} sub="included in sales" />
            <Tile label="Spent at shops" value={rupee(s.spent)} sub={<Link to="/admin/summary" className="underline">enter in Daily summary</Link>} />
            <Tile label={s.profit >= 0 ? 'Profit' : 'Loss'} value={rupee(s.profit)} sub="received − spent" />
          </div>

          {items.length > 0 && (
            <div className={`${lcard} p-4`}>
              <h3 className="font-bold">What sold</h3>
              <div className="mt-2 divide-y divide-neutral-100 text-sm">
                {items.slice(0, ITEMS_SHOWN).map((i) => (
                  <div key={i.name} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">{i.name}</span>
                    <span className="shrink-0 text-neutral-500">× {i.quantity} · <b className="text-neutral-900">{rupee(i.amount)}</b></span>
                  </div>
                ))}
              </div>
              {items.length > ITEMS_SHOWN && <p className="mt-1 text-xs text-neutral-500">and {items.length - ITEMS_SHOWN} more in the sheet</p>}
            </div>
          )}

          <div className={`${lcard} p-4`}>
            <h3 className="font-bold">Orders this day ({data.orders.length})</h3>
            <div className="mt-2 divide-y divide-neutral-100">
              {data.orders.map((o) => (
                <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">#{o.order_number} <StatusBadge status={o.status} /></span>
                    <span className="block truncate text-neutral-500">{o.customer_name} · {o.area} · {fmtClock(o.created_at)}</span>
                  </span>
                  <span className="font-bold">{rupee(o.total)}</span>
                  <ChevronRight size={16} className="text-neutral-400" />
                </Link>
              ))}
              {!data.orders.length && <p className="py-1 text-sm text-neutral-500">No orders for this day.</p>}
            </div>
          </div>
        </>
      )}

      <div className={`${lcard} p-4`}>
        <h3 className="font-bold">Download sheet</h3>
        <p className="text-sm text-neutral-500">Opens in Excel or Google Sheets: day by day totals, every order with items, and what sold.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[['day', dayLabel(date)], ['week', 'Last 7 days'], ['month', 'This month']].map(([kind, label]) => (
            <button key={kind} type="button" disabled={!!busy} onClick={() => download(kind)} className={`${lbtnOutline} px-2 text-sm`}>
              <Download size={16} /> {busy === kind ? 'Making…' : label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Last 7 days: {dayLabel(ranges.week[0])} to {dayLabel(date)}. This month: from the 1st to {dayLabel(date)}.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  )
}
