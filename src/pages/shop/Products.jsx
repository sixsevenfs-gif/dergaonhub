import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Plus, Search, Trash2 } from 'lucide-react'
import Toggle from '../../components/Toggle.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { lbtnDark, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { listCategories, listShopProducts, removeShopProduct, updateShopProduct } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { matches, rupee, timeAgo } from '../../lib/format.js'

// Price edit in two taps: tap the price, type, tap Save.
function PriceEdit({ product }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(product.price))
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    try {
      await updateShopProduct(product.id, { price: value })
      setEditing(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => { setValue(String(product.price)); setEditing(true) }} className="h-10 rounded-lg border border-dashed border-neutral-300 px-3 text-lg font-bold">
        {rupee(product.price)}
      </button>
    )
  }
  return (
    <form onSubmit={save} className="flex items-center gap-1">
      <input autoFocus type="number" inputMode="numeric" min="1" value={value} onChange={(e) => setValue(e.target.value)} className={`${lfieldBase} h-10 w-20 px-2`} />
      <button type="submit" className={`${lbtnDark} min-h-10 px-3 text-sm`}>Save</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}

export default function Products() {
  const { shop } = useOutletContext()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const { data: products = [] } = useData(() => listShopProducts(shop.id), [shop.id])
  const { data: categories = [] } = useData(listCategories)
  const shown = products.filter((p) => (!cat || p.category_id === cat) && (!q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q)))
  const outCount = products.filter((p) => !p.available).length

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black">Products</h1>
          <p className="text-sm text-neutral-500">{products.length} products · {outCount} out of stock</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${lfield} pl-9`} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${lfieldBase} w-36`}>
          <option value="">All</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        {shown.map((p) => (
          <div key={p.id} className={`${lcard} flex items-center gap-3 p-3`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
              <CategoryIcon id={p.category_id} size={22} className="text-neutral-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold leading-tight">{p.name}</div>
              <div className="text-sm text-neutral-500">{p.size}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                Updated {timeAgo(p.updated_at)}
                {p.review_status === 'pending' && <span className="rounded-full bg-amber-100 px-2 font-semibold text-amber-800">Review pending</span>}
                {p.review_status === 'rejected' && <span className="rounded-full bg-red-100 px-2 font-semibold text-red-700">Rejected</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PriceEdit key={p.price} product={p} />
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${p.available ? 'text-green-700' : 'text-neutral-500'}`}>{p.available ? 'In stock' : 'Out'}</span>
                <Toggle checked={p.available} onChange={(v) => updateShopProduct(p.id, { available: v })} label={`${p.name} available`} />
                <button type="button" aria-label="Remove" onClick={() => window.confirm(`${p.name} hatana hai?`) && removeShopProduct(p.id)} className="flex h-8 w-8 items-center justify-center text-neutral-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {!products.length && <p className="py-10 text-center text-neutral-500">Abhi koi product nahi. Library se add karo, sirf price daalna hai.</p>}
      </div>

      <Link to="/shop/products/add" className={`${lbtnDark} fixed bottom-20 right-4 h-14 rounded-full px-5 shadow-lg`}>
        <Plus size={20} /> Add products
      </Link>
    </div>
  )
}
