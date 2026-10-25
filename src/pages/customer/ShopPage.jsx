import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Clock, MapPin, Phone, Search, ShoppingCart, Store, Truck } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Stepper from '../../components/Stepper.jsx'
import { CategoryIcon, WhatsAppIcon } from '../../components/icons.jsx'
import { card, field } from '../../components/ui.js'
import { getShop, listCategories, listShopProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { fmtTime, isOpenNow, matches, rupee, slotDate, slotText } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

export default function ShopPage() {
  const { shopId } = useParams()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('')
  const { data: shop, loading } = useData(() => getShop(shopId), [shopId])
  const { data: products = [] } = useData(() => listShopProducts(shopId, { publicOnly: true }), [shopId])
  const { data: categories = [] } = useData(listCategories)
  const { cart, count, qtyOf, setQty } = useCart()

  const usedCats = categories.filter((c) => products.some((p) => p.category_id === c.id))
  const shown = useMemo(
    () => products.filter((p) => (!cat || p.category_id === cat) && (!q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q))),
    [products, cat, q],
  )

  if (loading) return null
  if (!shop || shop.status !== 'live') {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 pt-4">
        <TopBar />
        <p className="mt-16 text-center text-muted">Ye shop abhi available nahi hai.</p>
        <Link to="/" className="mt-4 block text-center text-accent underline">Home par jao</Link>
      </main>
    )
  }

  const open = isOpenNow(shop)
  const cartHere = cart.shopId === shop.id
  const cartTotal = cartHere
    ? Object.entries(cart.lines).reduce((s, [id, l]) => s + (products.find((p) => p.id === id)?.price ?? 0) * l.qty, 0)
    : 0

  const change = (p, qty) => {
    if (cart.shopId && cart.shopId !== shop.id && count > 0 && qty > 0) {
      if (!window.confirm('Cart mein dusri shop ka saman hai. Use hata ke yahan se add karein?')) return
    }
    setQty(shop.id, p.id, qty)
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <TopBar />

      <section className={`${card} mt-3 p-4`}>
        <div className="flex gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5">
            {shop.logo_url ? <img src={shop.logo_url} alt="" className="h-full w-full object-cover" /> : <Store size={30} />}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{shop.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {shop.area}, Dergaon</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${open ? 'bg-green-600/20 text-green-400' : 'bg-white/10 text-muted'}`}>
                {shop.paused ? 'Paused' : open ? 'Open' : 'Closed'}
              </span>
              {fmtTime(shop.open_time)} – {fmtTime(shop.close_time)}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${shop.phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line font-semibold">
            <Phone size={18} /> Call
          </a>
          <a href={waLink(shop.whatsapp)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-ink">
            <WhatsAppIcon size={18} /> WhatsApp
          </a>
        </div>
        <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr] divide-x divide-line border-t border-line pt-3 text-sm">
          {[
            [Clock, 'Delivery slot', slotText(slotDate(shop), shop)],
            [ShoppingCart, 'Min. order', shop.delivery_available ? rupee(shop.min_order) : '—'],
            [Truck, 'Delivery fee', shop.delivery_available ? rupee(shop.delivery_fee) : 'Pickup only'],
          ].map(([Icon, label, value]) => (
            <div key={label} className="px-2 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1 text-xs text-muted"><Icon size={14} /> {label}</div>
              <div className="mt-0.5 leading-tight">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {shop.paused && <p className="mt-3 rounded-xl bg-white/10 p-3 text-center text-sm">Shop abhi paused hai. Order baad mein karo.</p>}

      <div className="relative mt-4">
        <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for products..." className={`${field} bg-card pl-12`} />
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
          const qty = cartHere ? qtyOf(p.id) : 0
          return (
            <div key={p.id} className={`${card} flex flex-col p-3 ${p.available ? '' : 'opacity-60'}`}>
              <div className={`flex h-28 items-center justify-center overflow-hidden rounded-xl ${p.photo_url ? 'bg-white p-1' : 'bg-white/5'}`}>
                {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <CategoryIcon id={p.category_id} size={40} strokeWidth={1.5} className="text-muted" />}
              </div>
              <h3 className="mt-2 font-semibold leading-tight">{p.name}</h3>
              <p className="text-sm text-muted">{p.size}</p>
              <p className="mt-1 text-lg font-bold">{rupee(p.price)}</p>
              <div className="mt-auto pt-2">
                {!p.available ? (
                  <div className="flex h-11 items-center justify-center rounded-xl bg-white/10 text-sm text-muted">Out of stock</div>
                ) : qty > 0 ? (
                  <Stepper value={qty} onChange={(v) => change(p, v)} />
                ) : (
                  <button type="button" disabled={shop.paused} onClick={() => change(p, 1)} className="h-11 w-full rounded-xl bg-accent font-bold text-ink disabled:opacity-40">
                    Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!shown.length && <p className="py-10 text-center text-muted">Koi product nahi mila.</p>}

      {cartHere && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 px-4 pb-4">
          <Link to="/cart" className="mx-auto flex h-14 max-w-md items-center justify-between rounded-2xl bg-accent px-5 text-ink">
            <span className="flex items-center gap-3 text-lg font-bold"><ShoppingCart size={22} /> {count} items · {rupee(cartTotal)}</span>
            <span className="flex items-center gap-1 font-bold">View cart <ArrowRight size={20} /></span>
          </Link>
        </div>
      )}
    </main>
  )
}
