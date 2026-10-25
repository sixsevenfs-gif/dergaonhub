import { useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Search } from 'lucide-react'
import { CategoryIcon } from '../../components/icons.jsx'
import { lbtnAccent, lbtnDark, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { addFromLibrary, listCategories, listLibrary, listShopProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'

function LibraryRow({ item, added }) {
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const add = async (e) => {
    e.preventDefault()
    try {
      await addFromLibrary(item.id, price)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className={`${lcard} flex items-center gap-3 p-3`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
        <CategoryIcon id={item.category_id} size={20} className="text-neutral-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">{item.name}</div>
        <div className="text-sm text-neutral-500">{item.size}</div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
      {added ? (
        <span className="flex items-center gap-1 text-sm font-semibold text-green-700"><Check size={18} /> Added</span>
      ) : (
        <form onSubmit={add} className="flex items-center gap-1">
          <span className="text-neutral-500">₹</span>
          <input type="number" inputMode="numeric" min="1" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className={`${lfieldBase} h-10 w-20 px-2`} />
          <button type="submit" className={`${lbtnDark} min-h-10 px-3 text-sm`}>Add</button>
        </form>
      )}
    </div>
  )
}

export default function AddFromLibrary() {
  const { shop } = useOutletContext()
  const [params] = useSearchParams()
  const onboarding = params.get('onboarding') === '1' || shop.status === 'draft'
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const { data: library = [] } = useData(() => listLibrary({ q, categoryId: cat }), [q, cat])
  const { data: categories = [] } = useData(listCategories)
  const { data: mine = [] } = useData(() => listShopProducts(shop.id), [shop.id])
  const addedIds = new Set(mine.map((p) => p.library_product_id))

  return (
    <div>
      {onboarding ? (
        <p className="text-sm font-semibold text-neutral-500">Step 3 of 3</p>
      ) : (
        <Link to="/shop/products" className="flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={18} /> Products</Link>
      )}
      <h1 className="mt-1 text-2xl font-black">Add from library</h1>
      <p className="text-sm text-neutral-500">Product chuno, apna price daalo, Add dabao. Hindi ya English dono mein search karo.</p>

      <div className="relative mt-3">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="aata, chawal, sabun..." className={`${lfield} pl-9`} />
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {[{ id: '', short: 'All' }, ...categories].map((c) => (
          <button key={c.id || 'all'} type="button" onClick={() => setCat(c.id)} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${cat === c.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
            {c.short}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-neutral-500">{mine.length} products aapki shop mein</p>
      <div className="mt-2 space-y-2">
        {library.map((item) => <LibraryRow key={item.id} item={item} added={addedIds.has(item.id)} />)}
        {!library.length && <p className="py-6 text-center text-neutral-500">Library mein nahi mila.</p>}
      </div>

      <Link to="/shop/products/custom" className="mt-4 block text-center font-semibold underline">Product nahi mila? Custom product add karo</Link>

      {onboarding && (
        <Link to="/shop/status" className={`${lbtnAccent} fixed inset-x-4 bottom-20 mx-auto h-14 max-w-md shadow-lg`}>
          Done, ab Go Live <ArrowRight size={20} />
        </Link>
      )}
    </div>
  )
}
