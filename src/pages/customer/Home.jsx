import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Clock, Search, ShoppingCart, Truck } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Footer from '../../components/Footer.jsx'
import Stepper from '../../components/Stepper.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { card, field } from '../../components/ui.js'
import { getStore, listCategories, listProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { fmtTime, matches, rupee, slotDate, slotText } from '../../lib/format.js'

// The whole customer site is one grocery store: search, categories, products, cart.
export default function Home() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('')
  const { data: store } = useData(getStore)
  const { data: products = [] } = useData(listProducts)
  const { data: categories = [] } = useData(listCategories)
  const { cart, count, qtyOf, setQty } = useCart()

  const usedCats = categories.filter((c) => products.some((p) => p.category_id === c.id))
  const shown = useMemo(
    () => products.filter((p) => (!cat || p.category_id === cat) && (!q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q))),
    [products, cat, q],
  )
  const cartTotal = Object.entries(cart.lines).reduce((s, [id, l]) => s + (products.find((p) => p.id === id)?.price ?? 0) * l.qty, 0)

  if (!store) return null

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <TopBar />

      <h1 className="mt-5 text-[34px] font-black leading-[1.05] tracking-tight">
        Dergaon ka sab kuch, <span className="text-accent">ek jagah.</span>
      </h1>

      {store.paused ? (
        <p className="mt-4 rounded-2xl bg-white/10 p-4 text-center">Store abhi band hai. Thodi der baad order karo.</p>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
          <Clock size={26} className="shrink-0 text-accent" />
          <span className="text-sm leading-snug">
            <span className="block font-bold text-accent">Order before {fmtTime(store.cutoff_time)}, delivery today {fmtTime(store.slot_start)}–{fmtTime(store.slot_end)}</span>
            Abhi order karo: {slotText(slotDate(store), store)}
          </span>
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted">
        <Truck size={14} /> Delivery {rupee(store.delivery_fee)} · Min. order {rupee(store.min_order)} · {store.delivery_area.join(', ')}
      </p>

      <div className="relative mt-4">
        <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search atta, chawal, sabun..." className={`${field} h-14 bg-card pl-12`} />
      </div>

      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[{ id: '', short: 'All' }, ...usedCats].map((c) => {
          const active = cat === c.id
          return (
            <button key={c.id || 'all'} type="button" onClick={() => setCat(c.id)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className={`flex h-14 w-14 items-center justify-center rounded-full ${active ? 'bg-accent text-ink' : 'border border-line bg-card'}`}>
                {c.id ? <CategoryIcon id={c.id} size={24} /> : <span className="text-sm font-bold">All</span>}
              </span>
              <span className={`text-center text-xs leading-tight ${active ? 'font-semibold text-accent' : 'text-muted'}`}>{c.short}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {shown.map((p) => {
          const qty = qtyOf(p.id)
          return (
            <div key={p.id} className={`${card} flex flex-col p-3 ${p.available ? '' : 'opacity-60'}`}>
              <div className={`flex h-28 items-center justify-center overflow-hidden rounded-xl ${p.photo_url ? 'bg-white' : 'bg-white/5'}`}>
                {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <CategoryIcon id={p.category_id} size={40} strokeWidth={1.5} className="text-muted" />}
              </div>
              <h3 className="mt-2 font-semibold leading-tight">{p.name}</h3>
              <p className="text-sm text-muted">{p.size}</p>
              <p className="mt-1 text-lg font-bold">{rupee(p.price)}</p>
              <div className="mt-auto pt-2">
                {!p.available ? (
                  <div className="flex h-11 items-center justify-center rounded-xl bg-white/10 text-sm text-muted">Out of stock</div>
                ) : qty > 0 ? (
                  <Stepper value={qty} onChange={(v) => setQty(p.id, v)} />
                ) : (
                  <button type="button" disabled={store.paused} onClick={() => setQty(p.id, 1)} className="h-11 w-full rounded-xl bg-accent font-bold text-ink disabled:opacity-40">
                    Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!shown.length && <p className="py-10 text-center text-muted">Koi product nahi mila. Dusra naam try karo.</p>}

      <Footer store={store} />

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 px-4 pb-4">
          <Link to="/cart" className="mx-auto flex h-14 max-w-md items-center justify-between rounded-2xl bg-accent px-5 text-ink shadow-lg">
            <span className="flex items-center gap-3 text-lg font-bold"><ShoppingCart size={22} /> {count} items · {rupee(cartTotal)}</span>
            <span className="flex items-center gap-1 font-bold">View cart <ArrowRight size={20} /></span>
          </Link>
        </div>
      )}
    </main>
  )
}
