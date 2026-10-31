import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, LayoutGrid, Search, ShoppingCart, Truck } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { DeliverTo, HeaderIcons } from '../../components/TopBar.jsx'
import Footer from '../../components/Footer.jsx'
import BottomNav from '../../components/BottomNav.jsx'
import HeroSlider from '../../components/HeroSlider.jsx'
import OutOfArea from '../../components/OutOfArea.jsx'
import { useSavedDelivery } from '../../lib/customerLocation.js'
import { deliveryQuote, deliveryRules, expressTimeText } from '../../lib/delivery.js'
import ProductCard, { ProductTile } from '../../components/ProductCard.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { CATEGORY_ART, categoryTint } from '../../lib/categoryLook.js'
import CategoryBar from '../../components/CategoryBar.jsx'
import { getStore, listCategories, listProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { fmtTime, itemsText, matches, percentOff, rupee } from '../../lib/format.js'

// Round category tiles: 7 and "More" until opened, like the mockup grid.
const GRID_COUNT = 7

function CategoryGrid({ categories, onPick }) {
  const [open, setOpen] = useState(false)
  const shown = open || categories.length <= GRID_COUNT + 1 ? categories : categories.slice(0, GRID_COUNT)
  const tile = 'flex flex-col items-center gap-2 text-center'
  const circle = 'flex h-[62px] w-[62px] items-center justify-center rounded-full'
  return (
    <section className="mt-6 grid grid-cols-4 gap-x-2 gap-y-5">
      {shown.map((c) => {
        const tint = categoryTint(c.id)
        return (
          <button key={c.id} type="button" onClick={() => onPick(c.id)} className={tile}>
            <span className={circle} style={{ background: `${tint}1A`, color: tint }}>
              {CATEGORY_ART[c.id]
                ? <img src={CATEGORY_ART[c.id]} alt="" loading="lazy" className="h-[70px] w-[70px] max-w-none object-contain" />
                : <CategoryIcon id={c.id} size={28} strokeWidth={1.7} />}
            </span>
            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">{c.name}</span>
          </button>
        )
      })}
      {shown.length < categories.length && (
        <button type="button" onClick={() => setOpen(true)} className={tile}>
          <span className={`${circle} bg-mint text-brand`}><LayoutGrid size={26} strokeWidth={1.8} /></span>
          <span className="text-[11px] font-medium leading-tight text-ink">More</span>
        </button>
      )}
    </section>
  )
}

// "Best Deals For You": categories that have items on offer, with the biggest discount in each.
function BestDeals({ products, categories, onPick, onSeeAll }) {
  const deals = categories
    .map((c) => {
      const onOffer = products.filter((p) => p.category_id === c.id && p.available && p.compare_price > p.price)
      if (!onOffer.length) return null
      const best = Math.max(...onOffer.map((p) => percentOff(p.compare_price, p.price)))
      return { c, best, sample: onOffer[0] }
    })
    .filter(Boolean)
    .sort((a, b) => b.best - a.best)
  if (!deals.length) return null
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">Best Deals For You</h2>
        <button type="button" onClick={onSeeAll} className="flex items-center gap-1 text-xs font-medium text-brand">See All <ArrowRight size={14} /></button>
      </div>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {deals.map(({ c, best, sample }) => (
          <button key={c.id} type="button" onClick={() => onPick(c.id)} className="flex h-[84px] w-[46%] min-w-[170px] shrink-0 items-center gap-2 overflow-hidden rounded-2xl bg-mint pr-3 text-left">
            <ProductTile p={sample} className="h-full w-[72px] rounded-none rounded-l-2xl" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-ink">{c.name}</span>
              <span className="mt-1 block text-[11px] text-muted">Up to {best}% OFF</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// The whole customer site is one grocery store: green header with search, banner, categories,
// deals, products, cart.
export default function Home() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('')
  const [showAll, setShowAll] = useState(false)
  const productsRef = useRef(null)
  const { data: store } = useData(getStore)
  const { data: products = [] } = useData(listProducts)
  const { data: categories = [] } = useData(listCategories)
  const { cart, count, qtyOf, setQty } = useCart()
  const { location } = useSavedDelivery()
  // "Categories" in the bottom tab bar opens /?all=1
  const allParam = params.get('all') === '1'

  const usedCats = categories.filter((c) => products.some((p) => p.category_id === c.id))
  const searching = q.trim() !== ''
  const browsing = showAll || allParam || cat || searching
  // Popular items in the admin's chosen order (featured_rank, update 021); unranked ones after,
  // in category order (atta, rice, daal, oil...), like the shelf in a shop.
  const catOrder = (p) => categories.findIndex((c) => c.id === p.category_id)
  const rank = (p) => p.featured_rank ?? Infinity
  const popular = products.filter((p) => p.featured).sort((a, b) => rank(a) - rank(b) || catOrder(a) - catOrder(b))
  const shown = useMemo(
    // While searching, every category is searched; otherwise the chosen category is shown.
    () => products.filter((p) => (q.trim() ? matches(`${p.name} ${p.size} ${p.keywords}`, q) : !cat || p.category_id === cat)),
    [products, cat, q],
  )
  // Home shows 8 popular items (4 rows of 2); starred ones first, then others to fill.
  const POPULAR_COUNT = 8
  const filler = products.filter((p) => !p.featured && p.available)
  const list = browsing ? shown : [...popular, ...filler].slice(0, POPULAR_COUNT)
  const title = q.trim() ? 'Search results' : cat ? categories.find((c) => c.id === cat)?.name : browsing ? 'All products' : 'Popular essentials'
  const cartTotal = Object.entries(cart.lines).reduce((s, [id, l]) => s + (products.find((p) => p.id === id)?.price ?? 0) * l.qty, 0)

  const toProducts = () => setTimeout(() => productsRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
  useEffect(() => {
    if (allParam) toProducts()
  }, [allParam])

  // Tapping the JHOLZO logo always brings back the normal home page, at the top.
  const fromLogo = useLocation().state?.fromLogo
  useEffect(() => {
    if (!fromLogo) return
    setShowAll(false)
    setCat('')
    setQ('')
    window.scrollTo({ top: 0 })
  }, [fromLogo])

  const browseAll = () => {
    setShowAll(true)
    toProducts()
  }
  const pickCategory = (id) => {
    setCat(id)
    setQ('')
    toProducts()
  }
  const backToPopular = () => {
    setShowAll(false)
    setCat('')
    setQ('')
    if (allParam) setParams({})
  }

  if (!store) return null
  const quote = deliveryQuote(store, location)

  return (
    <main className={`mx-auto min-h-screen max-w-md px-4 ${count > 0 ? 'pb-40' : 'pb-24'}`}>
      {/* Page title for Google and screen readers; the logo is the visible heading. */}
      <h1 className="sr-only">Jholzo: online grocery delivery in Dergaon</h1>
      <header className="-mx-4 rounded-b-[28px] bg-gradient-to-br from-[#2E7D46] to-brand-dark px-4 pb-5 pt-3">
        <div className="flex h-14 items-center justify-between">
          <Wordmark onBrand />
          <HeaderIcons onBrand />
        </div>
        <div className="mt-2"><DeliverTo onBrand /></div>
        <div className="relative mt-4">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setCat('') // search always looks in every category
            }}
            placeholder="Search for groceries, staples, household..."
            className="h-12 w-full rounded-2xl bg-white pl-12 pr-4 text-sm text-ink shadow-[0_6px_18px_rgb(0_0_0/0.12)] placeholder:text-muted focus:outline-none"
          />
        </div>
      </header>

      {quote?.tooFar && (
        <div className="mt-4"><OutOfArea location={location} label={location.label} km={quote.km} /></div>
      )}

      {!browsing && (
        <>
          <HeroSlider onShop={browseAll} />

          {store.paused ? (
            <p className="mt-3 rounded-2xl bg-orange-50 p-4 text-center text-sm font-medium text-orange-700">The store is closed right now. Please order a little later.</p>
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-mint-soft px-3 py-2 text-[12px] text-muted">
              <Truck size={16} className="shrink-0 text-brand" />
              <span>
                <b className="font-semibold text-brand">FREE delivery</b> on {rupee(deliveryRules(store).freeAbove)}+ · {fmtTime(store.slot_start)}–{fmtTime(store.slot_end)}
                {deliveryRules(store).expressOn && <> · <b className="font-semibold text-[#B7791F]">⚡ Express in {expressTimeText(deliveryRules(store).expressMinutes)}</b></>}
              </span>
            </p>
          )}

          <CategoryGrid categories={usedCats} onPick={pickCategory} />
          <BestDeals products={products} categories={usedCats} onPick={pickCategory} onSeeAll={browseAll} />
        </>
      )}

      {browsing && (
        <CategoryBar
          categories={usedCats}
          value={cat}
          onChange={(id) => {
            setCat(id)
            setQ('')
          }}
        />
      )}

      <div ref={productsRef} className="mt-7 flex scroll-mt-4 items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {browsing ? (
          <button type="button" onClick={backToPopular} className="flex items-center gap-1 text-xs font-medium text-brand"><ArrowLeft size={14} /> Home</button>
        ) : (
          <button type="button" onClick={browseAll} className="flex items-center gap-1 text-xs font-medium text-brand">See All <ArrowRight size={14} /></button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {list.map((p) => (
          <ProductCard key={p.id} p={p} qty={qtyOf(p.id)} onQty={(v) => setQty(p.id, v)} disabled={store.paused} />
        ))}
      </div>
      {!list.length && <p className="py-10 text-center text-muted">No products found. Try another name.</p>}

      {!browsing && (
        <button type="button" onClick={browseAll} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line text-sm font-semibold text-brand">
          See all {products.length} products <ArrowRight size={16} />
        </button>
      )}

      <Footer store={store} />

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-3">
          <Link to="/cart" className="mx-auto flex h-14 max-w-md items-center justify-between rounded-2xl bg-brand px-5 text-white shadow-[0_8px_24px_rgb(31_107_58/0.35)]">
            <span className="flex items-center gap-3 font-semibold"><ShoppingCart size={20} /> {itemsText(count)} · {rupee(cartTotal)}</span>
            <span className="flex items-center gap-1 text-sm font-semibold">View cart <ArrowRight size={18} /></span>
          </Link>
        </div>
      )}

      <BottomNav />
    </main>
  )
}
