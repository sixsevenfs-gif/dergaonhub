import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, ImagePlus, ListChecks, LogIn, LogOut, Pencil, Search, ShieldCheck, Store, Tag, Trash2, X } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { btnAccent, btnOutline, card, cx, field } from '../../components/ui.js'
import { addSurveyItem, adminSignOut, collectSession, collectSignIn, deleteSurveyItem, listSurvey, updateSurveyItem } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { compressImage } from '../../lib/image.js'
import { rupee } from '../../lib/format.js'
import { DEMO_MODE } from '../../config.js'

// jholzo.com/collect: the price collector at the wholesaler (update 040).
// Step 1, product by product: photo, size / name, MRP. Step 2, later at the counter: the shop's price for each.
// Only price collectors (Admin → Settings → Team) and the owner can open it; the database checks this too.
export default function Collect() {
  const { data: session, error, reload } = useData(collectSession)
  if (session === undefined && !error) return null
  if (!session?.role) return <CollectLogin onDone={reload} denied={!!session?.email} />
  return <CollectRun session={session} />
}

function CollectLogin({ onDone, denied }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(denied ? 'This login is not a price collector.' : '')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await collectSignIn(email, password)
      onDone()
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
    }
    setBusy(false)
  }
  return (
    <main className="mx-auto min-h-screen max-w-sm px-4 pt-8 font-ui">
      <Wordmark />
      <form onSubmit={submit} className="mt-10 space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
          <ShieldCheck size={14} /> Price collector
        </span>
        <h1 className="text-2xl font-semibold leading-tight">Log in to add products</h1>
        <p className="pb-2 text-sm text-muted">Only people added by Jholzo can open this page.</p>
        <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        <input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnAccent} h-12`}><LogIn size={18} /> {busy ? 'Logging in...' : 'Log in'}</button>
      </form>
    </main>
  )
}

const SHOP_KEY = 'jholzo-collect-shop'
const readShop = () => {
  try {
    return localStorage.getItem(SHOP_KEY) || ''
  } catch {
    return ''
  }
}

function CollectRun({ session }) {
  const { data: items = [], reload } = useData(listSurvey)
  const [tab, setTab] = useState('add')
  const [shop, setShopState] = useState(readShop)
  const setShop = (v) => {
    setShopState(v)
    try {
      localStorage.setItem(SHOP_KEY, v)
    } catch {
      // only a convenience
    }
  }
  const shops = [...new Set(items.map((i) => i.shop).filter(Boolean))]
  const mine = items.filter((i) => !shop || i.shop === shop)
  const pending = mine.filter((i) => i.shop_price == null).slice().reverse() // oldest first: the order they were added

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-3 font-ui">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">Collector</span>
          {!DEMO_MODE && (
            <button type="button" aria-label="Log out" title={session.email} onClick={async () => { await adminSignOut(); window.location.reload() }} className="flex h-11 w-10 items-center justify-center text-muted"><LogOut size={20} /></button>
          )}
        </div>
      </header>

      <ShopPicker shop={shop} shops={shops} onChange={setShop} />

      <nav className="sticky top-0 z-10 -mx-4 mt-3 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-mint p-1">
          {[
            ['add', '1. Add', Camera],
            ['prices', `2. Prices${pending.length ? ` (${pending.length})` : ''}`, Tag],
            ['list', `List (${mine.length})`, ListChecks],
          ].map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold', tab === key ? 'bg-brand text-white shadow' : 'text-brand')}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'add' && <AddStep shop={shop} count={mine.length} onSaved={reload} />}
      {tab === 'prices' && <PriceStep pending={pending} total={mine.length} onSaved={reload} onDone={() => setTab('list')} />}
      {tab === 'list' && <ItemList items={mine} userId={session.userId} isAdmin={session.role === 'admin'} onChanged={reload} />}
    </main>
  )
}

// Which wholesaler the products are from (remembered on this phone).
function ShopPicker({ shop, shops, onChange }) {
  const [editing, setEditing] = useState(!shop)
  const [value, setValue] = useState(shop)
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className={`${card} mt-3 flex w-full items-center gap-3 p-3 text-left`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint text-brand"><Store size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Shop / wholesaler</span>
          <span className="block truncate font-semibold">{shop}</span>
        </span>
        <Pencil size={16} className="text-muted" />
      </button>
    )
  }
  const save = (v) => {
    if (!v.trim()) return
    onChange(v.trim())
    setEditing(false)
  }
  return (
    <div className={`${card} mt-3 space-y-2 p-3`}>
      <label className="block text-sm font-semibold">Which shop are you at?</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Sharma Wholesale, Dergaon" className={field} />
        <button type="button" onClick={() => save(value)} className="h-12 shrink-0 rounded-xl bg-brand px-4 font-semibold text-white">OK</button>
      </div>
      {shops.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shops.map((s) => <button key={s} type="button" onClick={() => save(s)} className="rounded-full border border-line px-3 py-1.5 text-sm">{s}</button>)}
        </div>
      )}
    </div>
  )
}

const SIZES = ['1 L', '500 ml', '200 ml', '5 L', '1 kg', '500 g', '250 g', '100 g', '5 kg', '10 kg', 'Pack']

// Step 1: photo, size / name, MRP, save, next. The shop's price comes later in step 2.
function AddStep({ shop, count, onSaved }) {
  const [photo, setPhoto] = useState('')
  const [details, setDetails] = useState('')
  const [mrp, setMrp] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(0)
  const camera = useRef(null)
  const gallery = useRef(null)
  const mrpRef = useRef(null)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy('photo')
    try {
      // Big and clear enough to use as the product photo later.
      setPhoto(await compressImage(file, DEMO_MODE ? 900 : 1600, DEMO_MODE ? 120 : 400))
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  const save = async () => {
    setError('')
    if (!shop) return setError('First write which shop you are at (top of the page).')
    if (!photo) return setError('Take the photo first.')
    if (!(Number(mrp) > 0)) return setError('Write the MRP printed on the pack.')
    setBusy('save')
    try {
      await addSurveyItem({ shop, details, mrp, photo })
      setPhoto('')
      setDetails('')
      setMrp('')
      setSaved((n) => n + 1)
      onSaved()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  return (
    <section className="mt-2 space-y-4">
      {saved > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-brand">
          <Check size={18} /> Saved! {saved} added now · {count} at this shop. Next product:
        </p>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      <input ref={gallery} type="file" accept="image/*" onChange={pick} className="hidden" />

      {photo ? (
        <div className="relative">
          <img src={photo} alt="Product" className="max-h-80 w-full rounded-2xl border border-line bg-white object-contain" />
          <button type="button" onClick={() => camera.current?.click()} className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-black/70 px-4 text-sm font-semibold text-white">
            <Camera size={16} /> Retake
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy === 'photo'} onClick={() => camera.current?.click()} className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 bg-mint/50 text-brand active:bg-mint">
          <Camera size={44} />
          <span className="text-lg font-semibold">{busy === 'photo' ? 'Getting photo...' : 'Take photo'}</span>
          <span className="text-xs text-muted">Front of the pack, MRP visible if you can</span>
        </button>
      )}
      {!photo && (
        <button type="button" onClick={() => gallery.current?.click()} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-brand">
          <ImagePlus size={16} /> Choose from gallery
        </button>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold">Size / quantity <span className="font-normal text-muted">(name too, if you like)</span></label>
        <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. 1 L Fortune Soyabean Oil" className={`${field} h-14 text-lg`} />
        <div className="mt-2 flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} type="button" onClick={() => { setDetails((d) => (d.trim() ? `${d.trim()} ${s}` : s)); mrpRef.current?.focus() }} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium active:bg-mint">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold">MRP <span className="font-normal text-muted">(printed on the pack)</span></label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted">₹</span>
          <input ref={mrpRef} inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" className={`${field} h-14 pl-9 text-2xl font-semibold`} />
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="text-center text-xs text-muted">The shop's price comes later, in step 2.</p>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <button type="button" onClick={save} disabled={!!busy} className={`${btnAccent} mx-auto h-14 max-w-md text-lg`}>
          {busy === 'save' ? 'Saving...' : <>Save &amp; next <ChevronRight size={20} /></>}
        </button>
      </div>
    </section>
  )
}

// Step 2: one product at a time with its photo, size and MRP; type what the shop asks for it.
function PriceStep({ pending, total, onSaved, onDone }) {
  const [skipped, setSkipped] = useState([])
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(false)
  const input = useRef(null)
  const queue = useMemo(() => [...pending.filter((i) => !skipped.includes(i.id)), ...pending.filter((i) => skipped.includes(i.id))], [pending, skipped])
  const item = queue[0]
  const done = total - pending.length

  useEffect(() => {
    setPrice('')
    setError('')
    input.current?.focus()
  }, [item?.id])

  if (!total) return <p className="mt-10 text-center text-muted">Add products in step 1 first.</p>
  if (!item) {
    return (
      <div className="mt-12 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="mt-3 text-xl font-semibold">All prices done!</h2>
        <p className="text-muted">{total} products have the shop's price.</p>
        <button type="button" onClick={onDone} className={`${btnOutline} mx-auto mt-5`}>See the list</button>
      </div>
    )
  }

  const p = Number(price)
  const off = item.mrp && p > 0 ? item.mrp - p : null
  const save = async () => {
    if (!(p > 0)) return setError("Write the shop's price.")
    // A slip of the finger (1520 for 152) is easy at the counter.
    if (item.mrp && p > item.mrp && !window.confirm(`${rupee(p)} is more than the MRP ${rupee(item.mrp)}. Save anyway?`)) return
    setBusy(true)
    try {
      await updateSurveyItem(item.id, { shop_price: p })
      setSkipped((s) => s.filter((x) => x !== item.id))
      onSaved()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className="mt-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{pending.length} left</span>
        <span className="text-muted">{done} of {total} done</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / total) * 100}%` }} /></div>

      <div className={`${card} mt-3 overflow-hidden`}>
        <button type="button" onClick={() => setZoom(true)} className="block w-full bg-white">
          {item.photo_url ? <img src={item.photo_url} alt="" className="h-52 w-full object-contain" /> : <div className="flex h-40 items-center justify-center text-muted">No photo</div>}
        </button>
        <div className="border-t border-line p-4">
          <div className="text-xl font-semibold leading-snug">{item.details || 'No size written'}</div>
          <div className="mt-1 text-lg">MRP <b>{item.mrp != null ? rupee(item.mrp) : '—'}</b></div>
        </div>
      </div>

      <label className="mt-4 mb-1 block text-sm font-semibold">Shop's price for this</label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted">₹</span>
        <input
          ref={input} inputMode="decimal" value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="0" className={`${field} h-16 pl-10 text-3xl font-bold`}
        />
      </div>
      {off != null && (
        <p className={cx('mt-1.5 text-sm font-semibold', off > 0 ? 'text-brand' : 'text-red-700')}>
          {off > 0 ? `${rupee(off)} less than MRP (${Math.round((off / item.mrp) * 100)}% off)` : off === 0 ? 'Same as MRP' : `${rupee(-off)} more than MRP!`}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <button type="button" onClick={() => setSkipped((s) => [...s.filter((x) => x !== item.id), item.id])} className={`${btnOutline} h-14 w-28 shrink-0`}>Skip</button>
          <button type="button" onClick={save} disabled={busy} className={`${btnAccent} h-14 text-lg`}>{busy ? 'Saving...' : <>Save &amp; next <ChevronRight size={20} /></>}</button>
        </div>
      </div>
      {zoom && <PhotoZoom url={item.photo_url} onClose={() => setZoom(false)} />}
    </section>
  )
}

function PhotoZoom({ url, onClose }) {
  return (
    <button type="button" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3">
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      <X className="absolute right-4 top-4 text-white" />
    </button>
  )
}

// Everything at this shop; tap one to fix its size, MRP or price, or delete it.
function ItemList({ items, userId, isAdmin, onChanged }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const shown = items.filter((i) => !q.trim() || i.details.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <section className="mt-2">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by size or name" className={`${field} pl-10`} />
      </div>
      <ul className="mt-3 space-y-2">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setOpen(i)} className={`${card} flex w-full items-center gap-3 p-2.5 text-left`}>
              {i.photo_url ? <img src={i.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-line bg-white object-contain" /> : <span className="h-16 w-16 shrink-0 rounded-xl bg-line" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.details || 'No size written'}</span>
                <span className="block text-sm text-muted">MRP {i.mrp != null ? rupee(i.mrp) : '—'}</span>
              </span>
              {i.shop_price != null
                ? <span className="shrink-0 text-right"><span className="block text-xs text-muted">Shop</span><b>{rupee(i.shop_price)}</b></span>
                : <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Price pending</span>}
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="mt-10 text-center text-muted">{items.length ? 'Nothing matches.' : 'No products yet. Start in step 1.'}</p>}
      {open && <EditSheet item={open} canDelete={isAdmin || open.created_by === userId} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </section>
  )
}

function EditSheet({ item, canDelete, onClose, onChanged }) {
  const [details, setDetails] = useState(item.details)
  const [mrp, setMrp] = useState(item.mrp ?? '')
  const [price, setPrice] = useState(item.shop_price ?? '')
  const [error, setError] = useState('')
  const save = async () => {
    try {
      await updateSurveyItem(item.id, { details: details.trim(), mrp: mrp === '' ? null : Number(mrp), shop_price: price === '' ? null : Number(price) })
      onChanged()
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  const remove = async () => {
    if (!window.confirm('Delete this product and its photo?')) return
    try {
      await deleteSurveyItem(item.id)
      onChanged()
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  const num = (set) => (e) => set(e.target.value.replace(/[^0-9.]/g, ''))
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div className="mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="flex items-center gap-1 text-sm font-semibold text-muted"><ChevronLeft size={18} /> Back</button>
          {canDelete && <button type="button" onClick={remove} className="flex items-center gap-1 text-sm font-semibold text-red-700"><Trash2 size={16} /> Delete</button>}
        </div>
        {item.photo_url && <img src={item.photo_url} alt="" className="mt-3 max-h-64 w-full rounded-2xl border border-line object-contain" />}
        <label className="mt-3 mb-1 block text-sm font-semibold">Size / quantity / name</label>
        <input value={details} onChange={(e) => setDetails(e.target.value)} className={field} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">MRP ₹</label>
            <input inputMode="decimal" value={mrp} onChange={num(setMrp)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Shop price ₹</label>
            <input inputMode="decimal" value={price} onChange={num(setPrice)} placeholder="Later" className={field} />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button type="button" onClick={save} className={`${btnAccent} mt-4 h-12`}>Save</button>
      </div>
    </div>
  )
}
