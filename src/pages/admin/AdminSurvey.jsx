import { useState } from 'react'
import { Download, ExternalLink, FileSpreadsheet, Trash2 } from 'lucide-react'
import { lbtnDanger, lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { deleteSurveyItem, listSurvey, listTeam, updateSurveyItem } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime, rupee } from '../../lib/format.js'

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Price pending'],
  ['priced', 'Priced'],
  ['done', 'Added to products'],
]

// Margin against MRP: what you save per piece when you sell at MRP.
const marginOf = (i) => (i.mrp && i.shop_price != null ? { rupees: i.mrp - i.shop_price, percent: Math.round(((i.mrp - i.shop_price) / i.mrp) * 100) } : null)

// What the price collector brought from the wholesaler (jholzo.com/collect, update 040): photo, size / name,
// MRP and the shop's price. The owner only: these are buy prices.
export default function AdminSurvey() {
  const { data: items = [], reload } = useData(listSurvey)
  const { data: team = [] } = useData(listTeam)
  const [shop, setShop] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const nameOf = (id) => team.find((t) => t.user_id === id)?.name || 'Owner'
  const shops = [...new Set(items.map((i) => i.shop).filter(Boolean))]
  const atShop = items.filter((i) => !shop || i.shop === shop)
  const shown = atShop.filter((i) =>
    filter === 'pending' ? i.shop_price == null : filter === 'priced' ? i.shop_price != null && !i.done : filter === 'done' ? i.done : true)
  const priced = atShop.filter((i) => marginOf(i))
  const avg = priced.length ? Math.round(priced.reduce((s, i) => s + marginOf(i).percent, 0) / priced.length) : null

  const run = (fn) => fn().then(reload).catch((err) => setError(err.message))

  // Spreadsheet of what is shown (opens in Excel / Google Sheets).
  const exportCSV = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Size / name', 'MRP', 'Shop price', 'Margin ₹', 'Margin %', 'Shop', 'Added', 'By', 'Added to products']]
    for (const i of shown) {
      const m = marginOf(i)
      rows.push([i.details, i.mrp ?? '', i.shop_price ?? '', m?.rupees ?? '', m?.percent ?? '', i.shop, fmtDateTime(i.created_at), nameOf(i.created_by), i.done ? 'Yes' : ''])
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `jholzo-wholesale-prices${shop ? `-${shop.replace(/\W+/g, '-').toLowerCase()}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Wholesale prices</h1>
        <p className="text-sm text-neutral-500">
          From the price collector at <b>{window.location.host}/collect</b>: photo, size, MRP and the shop's price. Add a "Price
          collector" in Settings → Team. Only you see this page.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Products" value={atShop.length} />
        <Stat label="Price pending" value={atShop.filter((i) => i.shop_price == null).length} />
        <Stat label="Avg. margin" value={avg == null ? '—' : `${avg}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={shop} onChange={(e) => setShop(e.target.value)} className={lfieldBase} aria-label="Shop">
          <option value="">All shops</option>
          {shops.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`h-9 rounded-full border px-3 text-sm font-semibold ${filter === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportCSV} disabled={!shown.length} className={`${lbtnOutline} ml-auto`}><FileSpreadsheet size={17} /> Excel / CSV</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((i) => {
          const m = marginOf(i)
          return (
            <article key={i.id} className={`${lcard} overflow-hidden ${i.done ? 'opacity-60' : ''}`}>
              <a href={i.photo_url} target="_blank" rel="noreferrer" className="block bg-white">
                {i.photo_url ? <img src={i.photo_url} alt="" loading="lazy" className="h-56 w-full object-contain" /> : <div className="flex h-32 items-center justify-center text-neutral-400">No photo</div>}
              </a>
              <div className="space-y-2 border-t border-neutral-100 p-3">
                <div className="font-semibold">{i.details || 'No size written'}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-neutral-50 p-1.5"><div className="text-[11px] text-neutral-500">MRP</div><div className="font-bold">{i.mrp != null ? rupee(i.mrp) : '—'}</div></div>
                  <div className="rounded-lg bg-neutral-50 p-1.5"><div className="text-[11px] text-neutral-500">Shop price</div><div className="font-bold">{i.shop_price != null ? rupee(i.shop_price) : <span className="text-amber-700">Pending</span>}</div></div>
                  <div className={`rounded-lg p-1.5 ${m ? (m.rupees > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700') : 'bg-neutral-50'}`}>
                    <div className="text-[11px] opacity-70">Margin</div>
                    <div className="font-bold">{m ? `${rupee(m.rupees)} · ${m.percent}%` : '—'}</div>
                  </div>
                </div>
                <div className="text-xs text-neutral-500">{i.shop} · {fmtDateTime(i.created_at)} · by {nameOf(i.created_by)}</div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={i.done} onChange={(e) => run(() => updateSurveyItem(i.id, { done: e.target.checked }))} className="h-4 w-4 accent-neutral-900" />
                    Added to products
                  </label>
                  {i.photo_url && (
                    <>
                      <a href={i.photo_url} target="_blank" rel="noreferrer" className={`${lbtnOutline} ml-auto min-h-9 px-3 text-sm`}><ExternalLink size={15} /> Open</a>
                      <a href={i.photo_url} download={`${(i.details || 'product').replace(/\W+/g, '-').toLowerCase()}.jpg`} className={`${lbtnOutline} min-h-9 px-3 text-sm`} aria-label="Download photo"><Download size={15} /></a>
                    </>
                  )}
                  <button type="button" onClick={() => window.confirm('Delete this product and its photo?') && run(() => deleteSurveyItem(i.id))} className={`${lbtnDanger} min-h-9 px-3 text-sm`} aria-label="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {!shown.length && <p className={`${lcard} p-6 text-center text-neutral-500`}>{items.length ? 'Nothing here with this filter.' : 'Nothing yet. The price collector adds products at /collect.'}</p>}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className={`${lcard} p-3`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-black">{value}</div>
    </div>
  )
}
