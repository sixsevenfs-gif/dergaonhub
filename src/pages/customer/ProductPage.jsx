import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Banknote, Minus, PackageCheck, Plus, Share2, ShoppingCart, Truck } from 'lucide-react'
import FastImg from '../../components/FastImg.jsx'
import ProductCard from '../../components/ProductCard.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { categoryTint } from '../../lib/categoryLook.js'
import { useCart } from '../../lib/cart-context.js'
import { deliveryRules } from '../../lib/delivery.js'
import { fmtTime, itemsText, percentOff, rupee } from '../../lib/format.js'
import { aboutText, alsoLike, photosOf, similarTo, storageTip } from '../../lib/productInfo.js'
import { LEGAL } from '../../config.js'

// Big photos, swiped with a finger; dots show which one is on screen.
function Gallery({ p }) {
  const photos = photosOf(p)
  const [index, setIndex] = useState(0)
  const tint = categoryTint(p.category_id)
  return (
    <div className={`relative aspect-square w-full bg-mint-soft ${p.available ? '' : 'grayscale'}`}>
      {photos.length ? (
        <div
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((url, i) => (
            <FastImg key={url} src={url} width={800} alt={i ? '' : p.name} className="h-full w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
      ) : (
        <span className="flex h-full w-full items-center justify-center" style={{ background: `${tint}14`, color: tint }}>
          <CategoryIcon id={p.category_id} size={96} strokeWidth={1.2} />
        </span>
      )}
      {photos.length > 1 && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {photos.map((url, i) => (
            <span key={url} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand' : 'w-1.5 bg-ink/25'}`} />
          ))}
        </span>
      )}
      {!p.available && <span className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white">Out of stock</span>}
    </div>
  )
}

// A row of product cards that scrolls sideways.
function Shelf({ title, items, onOpen, qtyOf, setQty, disabled }) {
  if (!items.length) return null
  return (
    <section className="mt-7">
      <h2 className="px-4 text-[16px] font-semibold text-ink">{title}</h2>
      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((x) => (
          <div key={x.id} className="flex w-[150px] shrink-0">
            <ProductCard p={x} qty={qtyOf(x.id)} onQty={(v) => setQty(x.id, v)} disabled={disabled} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </section>
  )
}

const Fact = ({ icon: Icon, top, bottom }) => (
  <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-mint-soft px-2 py-3 text-center">
    <Icon size={18} className="text-brand" />
    <span className="text-[11px] font-semibold leading-tight text-ink">{top}</span>
    <span className="text-[10.5px] leading-tight text-muted">{bottom}</span>
  </div>
)

// One product, full screen over the home page (/?p=<id>): photos, price, what it is, and more items to add.
// The home page stays where it was underneath, so "back" returns to the same shelf.
export default function ProductPage({ p, products, categories, store, onOpen, onClose }) {
  const { cart, count, qtyOf, setQty } = useCart()
  const scroller = useRef(null)
  const [more, setMore] = useState(false)
  const [shared, setShared] = useState(false)
  const [past, setPast] = useState(false) // scrolled past the photo: the top bar turns white and shows the name

  // The page behind does not scroll while this one is open.
  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = before
    }
  }, [])
  // Opening another product from the shelves below starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    setMore(false)
    setPast(false)
  }, [p.id])

  const qty = qtyOf(p.id)
  const off = p.compare_price ? percentOff(p.compare_price, p.price) : 0
  const category = categories.find((c) => c.id === p.category_id)
  const rules = deliveryRules(store)
  const about = aboutText(p)
  const long = about.length > 220
  const storage = storageTip(p)
  const cartTotal = Object.entries(cart.lines).reduce((s, [id, l]) => s + (products.find((x) => x.id === id)?.price ?? 0) * l.qty, 0)
  const round = `flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink ${past ? '' : 'shadow-[0_2px_10px_rgb(0_0_0/0.14)]'}`

  const share = async () => {
    const url = `${window.location.origin}/product/${p.id}`
    try {
      if (navigator.share) await navigator.share({ title: `${p.name} (${p.size}) on Jholzo`, url })
      else {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 1800)
      }
    } catch {
      // closed the share sheet: nothing to do
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-white">
      <div className="pp-in mx-auto flex h-full max-w-md flex-col bg-white">
        <div
          ref={scroller}
          onScroll={(e) => setPast(e.currentTarget.scrollTop > e.currentTarget.clientWidth - 64)}
          className="relative flex-1 overflow-y-auto overscroll-contain pb-6"
        >
          <div className="sticky top-0 z-10 h-0">
            <div className={`flex h-16 items-center gap-2 px-3 ${past ? 'border-b border-line bg-white' : 'pointer-events-none'}`}>
              <button type="button" aria-label="Back" onClick={onClose} className={`pointer-events-auto ${round}`}><ArrowLeft size={20} /></button>
              <p className={`min-w-0 flex-1 truncate text-[14px] font-semibold text-ink ${past ? '' : 'invisible'}`}>{p.name}</p>
              <button type="button" aria-label="Share" onClick={share} className={`pointer-events-auto ${round}`}><Share2 size={18} /></button>
              <Link to="/cart" aria-label="Cart" className={`pointer-events-auto relative ${round}`}>
                <ShoppingCart size={18} />
                {count > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{count}</span>}
              </Link>
            </div>
          </div>
          {shared && <p className="pointer-events-none absolute inset-x-0 top-16 z-10 mx-auto w-fit rounded-full bg-ink/85 px-3 py-1.5 text-xs text-white">Link copied</p>}

          <Gallery p={p} />

          <div className="px-4 pt-4">
            {category && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{category.name}</p>}
            <h1 className="mt-1 text-[20px] font-semibold leading-snug text-ink">{p.name}</h1>
            <p className="mt-1 text-[13px] text-muted">{p.size}</p>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[26px] font-bold leading-none text-ink">{rupee(p.price)}</span>
              {off > 0 && (
                <>
                  <span className="text-[14px] text-muted line-through">{rupee(p.compare_price)}</span>
                  <span className="rounded-md bg-mint px-1.5 py-0.5 text-[12px] font-semibold text-brand-dark">{off}% off</span>
                </>
              )}
            </div>
            {off > 0 && <p className="mt-1.5 text-[12px] font-medium text-brand">You save {rupee(p.compare_price - p.price)} on this</p>}

            <div className="mt-4 flex gap-2">
              <Fact icon={Truck} top="Evening delivery" bottom={`${fmtTime(store.slot_start)} – ${fmtTime(store.slot_end)}`} />
              <Fact icon={PackageCheck} top="FREE delivery" bottom={`on ${rupee(rules.freeAbove)}+`} />
              <Fact icon={Banknote} top="Pay at your door" bottom="Cash or UPI" />
            </div>
          </div>

          <section className="mt-6 px-4">
            <h2 className="text-[16px] font-semibold text-ink">Product details</h2>
            <p className={`mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink/80 ${long && !more ? 'line-clamp-4' : ''}`}>{about}</p>
            {long && (
              <button type="button" onClick={() => setMore((v) => !v)} className="mt-1 text-[12.5px] font-semibold text-brand">{more ? 'Show less' : 'Read more'}</button>
            )}
            <dl className="mt-4 divide-y divide-line rounded-2xl border border-line text-[13px]">
              {[
                ['Quantity', p.size],
                ['Category', category?.name],
                [off > 0 ? 'MRP' : 'Price', `${rupee(off > 0 ? p.compare_price : p.price)} (incl. of all taxes)`],
                ['Storage', storage],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3.5 py-2.5">
                  <dt className="w-[86px] shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-6 px-4">
            <h2 className="text-[16px] font-semibold text-ink">Good to know</h2>
            <ul className="mt-2 space-y-2 text-[13px] leading-snug text-ink/80">
              <li className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />Check your items at the door. You can refuse a damaged or wrong item and you are not charged for it.</li>
              <li className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />A problem later? Report it within {LEGAL.COMPLAINT_HOURS} hours from My Orders.</li>
              <li className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />If the shop does not have this item, we take it off your order and you pay only for what you get.</li>
            </ul>
            <Link to="/policy/refund" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand">Refund &amp; cancellation policy <ArrowRight size={13} /></Link>
          </section>

          <Shelf title="Similar products" items={similarTo(p, products)} onOpen={onOpen} qtyOf={qtyOf} setQty={setQty} disabled={store.paused} />
          <Shelf title="You may also like" items={alsoLike(p, products)} onOpen={onOpen} qtyOf={qtyOf} setQty={setQty} disabled={store.paused} />
        </div>

        {/* Always in reach: add this item, or go to the cart once it is in. */}
        <div className="flex items-center gap-3 border-t border-line bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgb(26_31_27/0.06)]">
          {!p.available ? (
            <p className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-line text-sm font-semibold text-muted">Out of stock right now</p>
          ) : qty > 0 ? (
            <>
              <span className="flex h-12 w-[124px] shrink-0 items-center justify-between rounded-2xl bg-brand text-white">
                <button type="button" aria-label="Remove one" onClick={() => setQty(p.id, qty - 1)} className="flex h-12 w-11 items-center justify-center"><Minus size={18} strokeWidth={2.6} /></button>
                <span className="text-[15px] font-semibold">{qty}</span>
                <button type="button" aria-label="Add one" onClick={() => setQty(p.id, qty + 1)} className="flex h-12 w-11 items-center justify-center"><Plus size={18} strokeWidth={2.6} /></button>
              </span>
              <Link to="/cart" className="flex h-12 flex-1 items-center justify-between rounded-2xl border-[1.5px] border-brand px-4 text-brand">
                <span className="text-[13px] font-semibold">{itemsText(count)} · {rupee(cartTotal)}</span>
                <span className="flex items-center gap-1 text-[13px] font-semibold">View cart <ArrowRight size={16} /></span>
              </Link>
            </>
          ) : (
            <>
              <span className="min-w-0 leading-tight">
                <span className="block text-[18px] font-bold text-ink">{rupee(p.price)}</span>
                <span className="block truncate text-[11.5px] text-muted">{p.size}</span>
              </span>
              <button
                type="button"
                disabled={store.paused}
                onClick={() => setQty(p.id, 1)}
                className="ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-40"
              >
                <ShoppingCart size={18} /> {store.paused ? 'Store is closed' : 'Add to cart'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
