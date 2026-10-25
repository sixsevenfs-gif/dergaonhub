import { useState } from 'react'
import { Upload } from 'lucide-react'
import Field from '../../components/Field.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import {
  addLibraryProduct, adminListLibrary, importLibraryCSV, listCategories, listReviewQueue, reviewCustomProduct, setLibraryStatus,
} from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { matches, rupee } from '../../lib/format.js'

function ReviewQueue() {
  const { data: queue = [] } = useData(listReviewQueue)
  return (
    <section>
      <h2 className="font-bold">Review queue ({queue.length})</h2>
      <p className="text-sm text-neutral-500">Shops ke custom products. Approve = customers ko dikhega. Promote = library mein bhi add.</p>
      <div className="mt-2 space-y-2">
        {queue.map((p) => (
          <div key={p.id} className={`${lcard} flex flex-wrap items-center gap-2 p-3`}>
            <span className="min-w-40 flex-1">
              <span className="block font-semibold">{p.name} <span className="font-normal text-neutral-500">{p.size}</span></span>
              <span className="text-sm text-neutral-500">{p.shop_name} · {rupee(p.price)}</span>
            </span>
            <button type="button" onClick={() => reviewCustomProduct(p.id, 'approve')} className={`${lbtnDark} min-h-9 text-sm`}>Approve</button>
            <button type="button" onClick={() => reviewCustomProduct(p.id, 'promote')} className={`${lbtnOutline} min-h-9 text-sm`}>Promote to library</button>
            <button type="button" onClick={() => reviewCustomProduct(p.id, 'reject')} className={`${lbtnDanger} min-h-9 text-sm`}>Reject</button>
          </div>
        ))}
        {!queue.length && <p className={`${lcard} p-3 text-sm text-neutral-500`}>Kuch review karne ko nahi.</p>}
      </div>
    </section>
  )
}

function ImportCSV() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const readFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
  }
  const run = async () => setResult(await importLibraryCSV(text))
  return (
    <section className={`${lcard} space-y-2 p-4`}>
      <h2 className="font-bold">Import CSV</h2>
      <p className="text-sm text-neutral-500">Columns: <code>name,size,category,keywords</code>. Category id (jaise <code>atta</code>) ya naam.</p>
      <input type="file" accept=".csv,text/csv" onChange={readFile} className="block text-sm" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={'name,size,category,keywords\nSaffola Gold Oil,1 L,oil,"oil tel saffola"'} className={`${lfield} h-auto py-2 font-mono text-sm`} />
      <button type="button" disabled={!text.trim()} onClick={run} className={lbtnDark}><Upload size={17} /> Import</button>
      {result && (
        <p className="text-sm">
          <b>{result.added}</b> added.{result.skipped.length > 0 && <> Skipped: {result.skipped.join(', ')}</>}
        </p>
      )}
    </section>
  )
}

export default function AdminLibrary() {
  const { data: items = [] } = useData(adminListLibrary)
  const { data: categories = [] } = useData(listCategories)
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ name: '', size: '', category_id: 'atta', keywords: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const catName = (id) => categories.find((c) => c.id === id)?.short ?? id
  const shown = items.filter((l) => !q.trim() || matches(`${l.name} ${l.size} ${l.keywords}`, q))

  const add = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await addLibraryProduct(form)
      setForm({ ...form, name: '', size: '', keywords: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Master library</h1>
      <ReviewQueue />

      <form onSubmit={add} className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Add product</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input required value={form.name} onChange={set('name')} className={lfield} /></Field>
          <Field label="Size"><input value={form.size} onChange={set('size')} placeholder="1 kg" className={lfield} /></Field>
          <Field label="Category">
            <select value={form.category_id} onChange={set('category_id')} className={lfield}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Keywords" hint="Hindi/English spellings, jaise: atta, aata, flour">
            <input value={form.keywords} onChange={set('keywords')} className={lfield} />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className={lbtnDark}>Add to library</button>
      </form>

      <ImportCSV />

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">All products ({items.length})</h2>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${lfield} max-w-52`} />
        </div>
        <div className={`${lcard} mt-2 divide-y divide-neutral-100`}>
          {shown.map((l) => (
            <div key={l.id} className={`flex items-center gap-3 px-4 py-2 ${l.status !== 'active' ? 'opacity-50' : ''}`}>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{l.name} <span className="font-normal text-neutral-500">{l.size}</span></span>
                <span className="text-xs text-neutral-500">{catName(l.category_id)} · {l.keywords} · {l.photo_url ? 'photo' : 'no photo'} · {l.shop_count} shops</span>
              </span>
              <button type="button" onClick={() => setLibraryStatus(l.id, l.status === 'active' ? 'hidden' : 'active')} className={`${lbtnOutline} min-h-9 text-sm`}>
                {l.status === 'active' ? 'Hide' : 'Show'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
