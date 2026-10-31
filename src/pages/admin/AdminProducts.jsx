import { useState } from 'react'
import { BadgePercent, Plus, Search, Star, Trash2, Upload } from 'lucide-react'
import Field from '../../components/Field.jsx'
import PhotoPicker from '../../components/PhotoPicker.jsx'
import Toggle from '../../components/Toggle.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { lbtnDark, lbtnOutline, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { addProduct, addProductPhoto, deleteProduct, importProductsCSV, listCategories, listProducts, removeProductPhoto, setProductPhoto, updateProduct } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { percentOff, rupee, timeAgo } from '../../lib/format.js'
import { DEMO_MODE } from '../../config.js'

const MAX_EXTRA_PHOTOS = 4 // besides the main photo

// Price edit in two taps: tap the price, type, tap Save.
function PriceEdit({ product }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(product.price))
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    try {
      await updateProduct(product.id, { price: value })
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

// Sale price: type the discount price (or tap 5% / 10% ...), the % off and saving update as you type.
// Saving keeps the old price as "price before discount"; customers see it struck out.
function DiscountEdit({ product }) {
  const original = product.compare_price ?? product.price
  const [open, setOpen] = useState(false)
  const [base, setBase] = useState(String(original))
  const [sale, setSale] = useState(String(product.compare_price ? product.price : ''))
  const [error, setError] = useState('')
  const b = Number(base) || 0
  const s = Number(sale) || 0
  const pct = percentOff(b, s)
  const on = !!product.compare_price

  const save = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (!(s > 0 && s < b)) throw new Error('Discount price must be lower than the original price.')
      // Order matters for the database rule (price before discount > price).
      await updateProduct(product.id, { price: s, compare_price: b })
      setOpen(false)
    } catch (err) {
      setError(err.message)
    }
  }
  const remove = async () => {
    setError('')
    try {
      await updateProduct(product.id, { price: product.compare_price, compare_price: null })
      setSale('')
      setOpen(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!open) {
    return on ? (
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-left">
        <span className="text-sm text-neutral-400 line-through">{rupee(product.compare_price)}</span>
        <span className="text-lg font-bold">{rupee(product.price)}</span>
        <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{percentOff(product.compare_price, product.price)}% OFF</span>
      </button>
    ) : (
      <span className="flex items-center gap-1.5">
        <PriceEdit key={product.price} product={product} />
        <button type="button" onClick={() => { setBase(String(product.price)); setOpen(true) }} className="flex h-10 items-center gap-1 rounded-lg border border-dashed border-emerald-300 px-2.5 text-xs font-semibold text-emerald-700">
          <BadgePercent size={15} /> Discount
        </button>
      </span>
    )
  }

  return (
    <form onSubmit={save} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:w-auto">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-600">
          Original price
          <input type="number" min="1" value={base} onChange={(e) => setBase(e.target.value)} className={`${lfieldBase} mt-1 block h-10 w-24 px-2`} />
        </label>
        <label className="text-xs text-neutral-600">
          Discount price
          <input autoFocus type="number" min="1" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="e.g. 250" className={`${lfieldBase} mt-1 block h-10 w-24 px-2`} />
        </label>
        <div className="flex gap-1">
          {[5, 10, 15, 20].map((p) => (
            <button key={p} type="button" onClick={() => setSale(String(Math.floor(b * (1 - p / 100))))} className="h-10 rounded-lg border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-700">
              {p}%
            </button>
          ))}
        </div>
      </div>
      {/* Live preview: exactly what the customer will see. */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-neutral-400 line-through">{rupee(b)}</span>
        <span className="text-xl font-black">{s ? rupee(s) : '₹—'}</span>
        {pct > 0 && <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">{pct}% OFF</span>}
        {pct > 0 && <span className="text-xs text-emerald-700">Customer saves {rupee(b - s)}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={`${lbtnDark} min-h-10 px-4 text-sm`}>Save discount</button>
        {on && <button type="button" onClick={remove} className={`${lbtnOutline} min-h-10 px-3 text-sm`}>Remove discount</button>}
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-2 text-sm text-neutral-500">Cancel</button>
      </div>
    </form>
  )
}

function AddProduct({ categories, onDone }) {
  const [form, setForm] = useState({ name: '', size: '', category_id: 'atta', keywords: '', price: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await addProduct(form)
      setForm({ ...form, name: '', size: '', keywords: '', price: '' })
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <form onSubmit={submit} className={`${lcard} space-y-3 p-4`}>
      <h2 className="font-bold">New product</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input required value={form.name} onChange={set('name')} className={lfield} /></Field>
        <Field label="Size"><input value={form.size} onChange={set('size')} placeholder="1 kg" className={lfield} /></Field>
        <Field label="Category">
          <select value={form.category_id} onChange={set('category_id')} className={lfield}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Price (₹)"><input required type="number" min="1" value={form.price} onChange={set('price')} className={lfield} /></Field>
      </div>
      <Field label="Search keywords" hint="Hindi/English spellings, e.g. atta, aata, flour, gehu">
        <input value={form.keywords} onChange={set('keywords')} className={lfield} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className={lbtnDark}>Add product</button>
    </form>
  )
}

function ImportCSV() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const readFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
  }
  return (
    <section className={`${lcard} space-y-2 p-4`}>
      <h2 className="font-bold">Add many products at once (CSV)</h2>
      <p className="text-sm text-neutral-500">Download your Google Sheet as CSV. Columns: <code>name,size,category,keywords,price</code></p>
      <input type="file" accept=".csv,text/csv" onChange={readFile} className="block text-sm" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={'name,size,category,keywords,price\nSaffola Gold Oil,1 L,oil,"oil tel saffola",190'} className={`${lfield} h-auto py-2 font-mono text-sm`} />
      <button type="button" disabled={!text.trim()} onClick={async () => setResult(await importProductsCSV(text))} className={lbtnDark}><Upload size={17} /> Import</button>
      {result && <p className="text-sm"><b>{result.added}</b> added.{result.skipped.length > 0 && <> Skipped: {result.skipped.join(', ')}</>}</p>}
    </section>
  )
}

export default function AdminProducts() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [onlyNoPhoto, setOnlyNoPhoto] = useState(false)
  const [adding, setAdding] = useState(false)
  const { data: products = [] } = useData(() => listProducts({ q, categoryId: cat, includeHidden: true }), [q, cat])
  const { data: categories = [] } = useData(listCategories)
  const shown = products.filter((p) => (!onlyOut || !p.available) && (!onlyNoPhoto || !p.photo_url))
  const outCount = products.filter((p) => !p.available).length
  const noPhotoCount = products.filter((p) => !p.photo_url).length

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name} ${p.size}"? This cannot be undone. Old orders keep the item name. To stop selling for a while, use Hide instead.`)) return
    try {
      await deleteProduct(p.id)
    } catch (err) {
      window.alert(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Products</h1>
          <p className="text-sm text-neutral-500">{products.length} products · {outCount} out of stock · tap the box to change a photo, + to add more photos · ⭐ = shown in Popular on home</p>
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className={adding ? lbtnOutline : lbtnDark}><Plus size={18} /> {adding ? 'Close' : 'Add'}</button>
      </div>

      {adding && (
        <>
          <AddProduct categories={categories} onDone={() => setAdding(false)} />
          <ImportCSV />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${lfield} pl-9`} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${lfieldBase} w-40`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
        </select>
        <button type="button" onClick={() => setOnlyOut(!onlyOut)} className={`h-11 rounded-xl border px-3 text-sm font-semibold ${onlyOut ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
          Out of stock ({outCount})
        </button>
        <button type="button" onClick={() => setOnlyNoPhoto(!onlyNoPhoto)} className={`h-11 rounded-xl border px-3 text-sm font-semibold ${onlyNoPhoto ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
          No photo ({noPhotoCount})
        </button>
      </div>

      <div className="space-y-2">
        {shown.map((p) => (
          <div key={p.id} className={`${lcard} flex flex-wrap items-center gap-3 p-3 ${p.status !== 'active' ? 'opacity-50' : ''}`}>
            <PhotoPicker photoUrl={p.photo_url} onSave={(url) => setProductPhoto(p.id, url)} fallback={<CategoryIcon id={p.category_id} size={22} />} className="h-14 w-14" />
            <div className="min-w-32 flex-1">
              <div className="font-semibold leading-tight">{p.name}</div>
              <div className="text-sm text-neutral-500">{p.size}</div>
              <div className="text-xs text-neutral-400">Updated {timeAgo(p.updated_at)}{p.status !== 'active' && ' · hidden from customers'}</div>
            </div>
            <button
              type="button"
              onClick={() => updateProduct(p.id, { featured: !p.featured })}
              aria-label={p.featured ? 'Remove from popular' : 'Show in popular'}
              title="Show in 'Popular essentials' on home"
              className={`flex h-10 w-10 items-center justify-center rounded-lg border ${p.featured ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-neutral-200 text-neutral-300'}`}
            >
              <Star size={18} fill={p.featured ? 'currentColor' : 'none'} />
            </button>
            <DiscountEdit key={`${p.price}-${p.compare_price}`} product={p} />
            <div className="flex items-center gap-2">
              <span className={`w-14 text-right text-xs font-semibold ${p.available ? 'text-green-700' : 'text-neutral-500'}`}>{p.available ? 'In stock' : 'Out'}</span>
              <Toggle checked={p.available} onChange={(v) => updateProduct(p.id, { available: v })} label={`${p.name} available`} />
              <button type="button" onClick={() => updateProduct(p.id, { status: p.status === 'active' ? 'hidden' : 'active' })} className={`${lbtnOutline} min-h-9 px-3 text-xs`}>
                {p.status === 'active' ? 'Hide' : 'Show'}
              </button>
              <button type="button" onClick={() => remove(p)} aria-label={`Delete ${p.name}`} title="Delete product" className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
            {/* More photos: on the home page they slide when the customer touches or hovers the product. */}
            {p.photo_url && (p.photos !== undefined || DEMO_MODE) && (
              <div className="flex w-full flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
                <span className="text-xs text-neutral-500">More photos</span>
                {(p.photos ?? []).map((url) => (
                  <PhotoPicker key={url} photoUrl={url} onSave={async (u) => {
                    await removeProductPhoto(p.id, url)
                    if (u) await addProductPhoto(p.id, u)
                  }} label="photo" className="h-10 w-10" />
                ))}
                {(p.photos ?? []).length < MAX_EXTRA_PHOTOS && (
                  <PhotoPicker photoUrl="" onSave={(u) => u && addProductPhoto(p.id, u)} label="another photo" fallback={<Plus size={16} />} className="h-10 w-10" />
                )}
              </div>
            )}
          </div>
        ))}
        {!shown.length && <p className="py-8 text-center text-neutral-500">No products found.</p>}
      </div>
    </div>
  )
}
