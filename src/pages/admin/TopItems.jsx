import { useState } from 'react'
import { Download, Search } from 'lucide-react'
import { lbtnOutline, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { listProducts, salesReport } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, dayLabel, rupee } from '../../lib/format.js'
import { downloadCSV, itemsCSV, itemsSold, summarize } from '../../lib/report.js'

const SORTS = [
  ['quantity', 'Most bought'],
  ['orders', 'Most orders'],
  ['amount', 'Most money'],
]

function Tile({ label, value }) {
  return (
    <div className={`${lcard} p-3`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-black">{value}</div>
    </div>
  )
}

// Which items sell the most, how many orders had them and who bought them, for any period.
export default function TopItems() {
  const today = dateStr()
  const periods = {
    week: ['Last 7 days', addDays(today, -6), today],
    month: ['Last 30 days', addDays(today, -29), today],
    thisMonth: ['This month', `${today.slice(0, 8)}01`, today],
    all: ['All time', '2024-01-01', today],
  }
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const [sort, setSort] = useState('quantity')
  const [q, setQ] = useState('')
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : periods[period].slice(1)

  const { data } = useData(() => salesReport(from, to), [from, to])
  const { data: products = [] } = useData(() => listProducts())

  const items = data ? itemsSold(data.orders) : []
  const s = data && summarize(data.orders, data.expenses)
  const sorted = [...items].sort((a, b) => b[sort] - a[sort] || b.quantity - a.quantity)
  const shown = sorted.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
  const top = sorted[0]?.[sort] || 1
  const soldIds = new Set(items.map((i) => i.productId))
  const notSold = products.filter((p) => !soldIds.has(p.id))

  const chip = (key, label) => (
    <button key={key} type="button" onClick={() => setPeriod(key)} className={`h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${period === key ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Top items</h1>
        <p className="text-sm text-neutral-600">What customers buy the most. Only delivered orders are counted.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(periods).map(([key, [label]]) => chip(key, label))}
        {chip('custom', 'Pick dates')}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" className={`${lfieldBase} h-9 w-40`} />
          to
          <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" className={`${lfieldBase} h-9 w-40`} />
        </div>
      )}
      {period !== 'all' && <p className="-mt-2 text-xs text-neutral-500">{dayLabel(from)} to {dayLabel(to)}</p>}

      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Pieces sold" value={s.itemsSold} />
          <Tile label="Different items" value={items.length} />
          <Tile label="Delivered orders" value={s.delivered} />
          <Tile label="Sales" value={rupee(s.sales)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item" className={`${lfield} pl-9`} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className={`${lfieldBase} w-40`}>
          {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button
          type="button"
          disabled={!items.length}
          onClick={() => downloadCSV(`jholzo-top-items-${from}-to-${to}.csv`, itemsCSV({ from, to, items: sorted }))}
          className={`${lbtnOutline} text-sm`}
        >
          <Download size={16} /> Sheet
        </button>
      </div>

      <section className={`${lcard} divide-y divide-neutral-100`}>
        {shown.map((i) => (
          <div key={i.name} className="flex items-center gap-3 p-3">
            <span className="w-7 shrink-0 text-center text-sm font-black text-neutral-400">{sorted.indexOf(i) + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{i.name}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <span className="block h-full rounded-full bg-[#1F6B3A]" style={{ width: `${Math.max(4, (i[sort] / top) * 100)}%` }} />
              </span>
              <span className="mt-1 block text-xs text-neutral-500">
                Ordered {i.orders} time{i.orders === 1 ? '' : 's'} · {i.customers} customer{i.customers === 1 ? '' : 's'} · last {dayLabel(i.lastDate)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-black">× {i.quantity}</span>
              <span className="text-sm text-neutral-500">{rupee(i.amount)}</span>
            </span>
          </div>
        ))}
        {data && !shown.length && <p className="p-4 text-sm text-neutral-500">{items.length ? 'No item matches your search.' : 'Nothing delivered in this period yet.'}</p>}
      </section>

      {data && notSold.length > 0 && (
        <details className={`${lcard} group p-4`}>
          <summary className="cursor-pointer list-none font-bold">
            Not bought in this period ({notSold.length}) <span className="text-sm font-normal text-neutral-500">· tap to see</span>
          </summary>
          <p className="mt-1 text-sm text-neutral-500">Think about a better price, a photo, or removing them.</p>
          <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {notSold.map((p) => <li key={p.id} className="truncate">{p.name} <span className="text-neutral-400">{p.size}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
