import { useState } from 'react'
import { Plus, Search, Upload } from 'lucide-react'
import Field from '../../components/Field.jsx'
import PhotoPicker from '../../components/PhotoPicker.jsx'
import Toggle from '../../components/Toggle.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { lbtnDark, lbtnOutline, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { addProduct, importProductsCSV, listCategories, listProducts, setProductPhoto, updateProduct } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { rupee, timeAgo } from '../../lib/format.js'

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
      <h2 className="font-bold">Naya product</h2>
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
      <Field label="Search keywords" hint="Hindi/English spellings, jaise: atta, aata, flour, gehu">
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
      <h2 className="font-bold">Bahut saare products ek saath (CSV)</h2>
      <p className="text-sm text-neutral-500">Google Sheet ko CSV mein download karo. Columns: <code>name,size,category,keywords,price</code></p>
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
  const [adding, setAdding] = useState(false)
  const { data: products = [] } = useData(() => listProducts({ q, categoryId: cat, includeHidden: true }), [q, cat])
  const { data: categories = [] } = useData(listCategories)
  const shown = products.filter((p) => !onlyOut || !p.available)
  const outCount = products.filter((p) => !p.available).length

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Products</h1>
          <p className="text-sm text-neutral-500">{products.length} products · {outCount} out of stock · photo badalne ke liye box pe tap karo</p>
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
            <PriceEdit key={p.price} product={p} />
            <div className="flex items-center gap-2">
              <span className={`w-14 text-right text-xs font-semibold ${p.available ? 'text-green-700' : 'text-neutral-500'}`}>{p.available ? 'In stock' : 'Out'}</span>
              <Toggle checked={p.available} onChange={(v) => updateProduct(p.id, { available: v })} label={`${p.name} available`} />
              <button type="button" onClick={() => updateProduct(p.id, { status: p.status === 'active' ? 'hidden' : 'active' })} className={`${lbtnOutline} min-h-9 px-3 text-xs`}>
                {p.status === 'active' ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        ))}
        {!shown.length && <p className="py-8 text-center text-neutral-500">Koi product nahi mila.</p>}
      </div>
    </div>
  )
}
