import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, House, LayoutGrid, Leaf, MapPin, Search, ShoppingCart, Smartphone, Truck } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Footer from '../../components/Footer.jsx'
import HeroSlider from '../../components/HeroSlider.jsx'
import Stepper from '../../components/Stepper.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { card, field } from '../../components/ui.js'
import { getStore, listCategories, listProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { matches, rupee } from '../../lib/format.js'

function ProductCard({ p, qty, onQty, disabled }) {
  return (
    <div className={`${card} flex flex-col overflow-hidden ${p.available ? '' : 'opacity-60'}`}>
      <div className="flex aspect-[1.56] items-center justify-center bg-[#151514]">
        {p.photo_url ? (
          <img src={p.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <CategoryIcon id={p.category_id} size={36} strokeWidth={1.5} className="text-muted" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-tight">{p.name}</h3>
        <p className="mt-0.5 text-xs text-muted">{p.size}</p>
        <p className="mt-1 text-lg font-bold">{rupee(p.price)}</p>
        <div className="mt-auto pt-2">
          {!p.available ? (
            <div className="flex h-10 items-center justify-center rounded-xl bg-white/10 text-sm text-muted">Out of stock</div>
          ) : qty > 0 ? (
            <Stepper value={qty} onChange={onQty} />
          ) : (
            <button type="button" disabled={disabled} onClick={() => onQty(1)} className="h-10 w-full rounded-xl bg-accent text-base font-bold text-ink disabled:opacity-40">
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PROMISES = [
  [Leaf, 'Locally stocked', 'Fresh & trusted'],
  [Smartphone, 'Easy ordering', 'In just a few taps'],
  [House, 'Home delivery', 'Right to your door'],
]

// The whole customer site is one grocery store: banner, search, categories, products, cart.
export default function Home() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('')
  const [showAll, setShowAll] = useState(false)
  const productsRef = useRef(null)
  const { data: store } = useData(getStore)
  const { data: products = [] } = useData(listProducts)
  const { data: categories = [] } = useData(listCategories)
  const { cart, count, qtyOf, setQty } = useCart()

  const usedCats = categories.filter((c) => products.some((p) => p.category_id === c.id))
  const searching = q.trim() !== ''
  const browsing = showAll || cat || searching
  // Popular items follow the category order (atta, rice, daal, oil...), like the shelf in a shop.
  const catOrder = (p) => categories.findIndex((c) => c.id === p.category_id)
  const popular = products.filter((p) => p.featured).sort((a, b) => catOrder(a) - catOrder(b))
  const shown = useMemo(
    // While searching, every category is searched; otherwise the chosen category is shown.
    () => products.filter((p) => (q.trim() ? matches(`${p.name} ${p.size} ${p.keywords}`, q) : !cat || p.category_id === cat)),
    [products, cat, q],
  )
  // Home shows 6 popular items (3 on the left, 3 on the right); starred ones first, then others to fill.
  const POPULAR_COUNT = 6
  const filler = products.filter((p) => !p.featured && p.available)
  const list = browsing ? shown : [...popular, ...filler].slice(0, POPULAR_COUNT)
  const title = q.trim() ? 'Search results' : cat ? categories.find((c) => c.id === cat)?.name : browsing ? 'All products' : 'Popular essentials'
  const cartTotal = Object.entries(cart.lines).reduce((s, [id, l]) => s + (products.find((p) => p.id === id)?.price ?? 0) * l.qty, 0)

  const browseAll = () => {
    setShowAll(true)
    productsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const backToPopular = () => {
    setShowAll(false)
    setCat('')
    setQ('')
  }

  if (!store) return null

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <TopBar />
      <div className="relative mt-3">
        <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setCat('') // search always looks in every category
          }}
          placeholder="Search groceries, staples, household..."
          className={`${field} h-14 bg-transparent pl-12`}
        />
      </div>

      {!searching && (
        <>
          <h1 className="mt-5 text-[32px] font-black leading-[1.05] tracking-tight">
            Everything Dergaon needs, <span className="text-accent">in one place.</span>
          </h1>

          <HeroSlider onShop={browseAll} />

          {store.paused ? (
            <p className="mt-3 rounded-2xl bg-white/10 p-4 text-center">Store abhi band hai. Thodi der baad order karo.</p>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent/5 px-4 py-3">
              <Truck size={28} className="shrink-0 text-accent" strokeWidth={1.75} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">Same-day delivery on eligible orders</span>
                <span className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                  <MapPin size={14} className="shrink-0 text-accent" /> {store.delivery_area.join(' • ')}
                </span>
              </span>
            </div>
          )}
        </>
      )}

      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[{ id: '', short: 'All' }, ...usedCats].map((c) => {
          const active = cat === c.id
          return (
            <button key={c.id || 'all'} type="button" onClick={() => {
                setCat(c.id)
                setQ('')
              }} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className={`flex h-14 w-14 items-center justify-center rounded-full ${active ? 'bg-accent text-ink' : 'border border-line'}`}>
                {c.id ? <CategoryIcon id={c.id} size={24} /> : <LayoutGrid size={24} />}
              </span>
              <span className={`text-center text-xs leading-tight ${active ? 'font-semibold text-accent' : 'text-white/85'}`}>{c.short}</span>
            </button>
          )
        })}
      </div>

      <div ref={productsRef} className="mt-6 flex scroll-mt-4 items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        {browsing ? (
          <button type="button" onClick={backToPopular} className="flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft size={16} /> Popular</button>
        ) : (
          <button type="button" onClick={browseAll} className="flex items-center gap-1 text-sm font-semibold text-accent">View all <ArrowRight size={16} /></button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {list.map((p) => (
          <ProductCard key={p.id} p={p} qty={qtyOf(p.id)} onQty={(v) => setQty(p.id, v)} disabled={store.paused} />
        ))}
      </div>
      {!list.length && <p className="py-10 text-center text-muted">Koi product nahi mila. Dusra naam try karo.</p>}

      {!browsing && (
        <button type="button" onClick={browseAll} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line font-semibold">
          Saare {products.length} products dekho <ArrowRight size={18} />
        </button>
      )}

      <section className={`${card} mt-5 grid grid-cols-3 divide-x divide-line py-3`}>
        {PROMISES.map(([Icon, title2, note]) => (
          <div key={title2} className="flex flex-col items-center gap-1 px-1 text-center">
            <Icon size={22} className="text-accent" strokeWidth={1.75} />
            <span className="text-xs font-semibold leading-tight">{title2}</span>
            <span className="text-[11px] leading-tight text-muted">{note}</span>
          </div>
        ))}
      </section>

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
