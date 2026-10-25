import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronRight, FileText, ShoppingCart, Trash2, Truck } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Stepper from '../../components/Stepper.jsx'
import { CategoryIcon } from '../../components/icons.jsx'
import { btnAccent, card } from '../../components/ui.js'
import { useCartDetails } from '../../lib/useCartDetails.js'
import { useCart } from '../../lib/cart-context.js'
import { rupee, slotDate, slotText } from '../../lib/format.js'

export default function Cart() {
  const navigate = useNavigate()
  const { setQty, setLineNote, setNote } = useCart()
  const { cart, shop, lines, subtotal, problems, ready } = useCartDetails()

  if (!ready) return null
  if (!lines.length || !shop) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 pt-4">
        <TopBar />
        <div className="mt-20 flex flex-col items-center text-center">
          <ShoppingCart size={56} className="text-muted" strokeWidth={1.5} />
          <h1 className="mt-4 text-2xl font-bold">Cart khaali hai</h1>
          <p className="mt-1 text-muted">Kisi shop se saman add karo.</p>
          <Link to="/" className={`${btnAccent} mt-6 max-w-60`}>Shops dekho</Link>
        </div>
      </main>
    )
  }

  const shortBy = shop.delivery_available ? shop.min_order - subtotal : 0
  const fee = shop.delivery_available ? shop.delivery_fee : 0

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">Your Cart</h1>
      <p className="text-muted">{shop.name} · {shop.area}</p>

      <div className="mt-4 space-y-3">
        {lines.map((l) => (
          <div key={l.id} className={`${card} p-3`}>
            <div className="flex gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5">
                <CategoryIcon id={l.product?.category_id} size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{l.product?.name ?? 'Item ab nahi hai'}</h3>
                    <p className="text-sm text-muted">{l.product?.size}</p>
                  </div>
                  <button type="button" aria-label="Hatao" onClick={() => setQty(shop.id, l.id, 0)} className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center text-muted">
                    <Trash2 size={20} />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-lg font-bold">{rupee((l.product?.price ?? 0) * l.qty)}</span>
                  <Stepper value={l.qty} onChange={(v) => setQty(shop.id, l.id, v)} className="w-32" />
                </div>
              </div>
            </div>
            {l.product && !l.product.available && <p className="mt-2 text-sm text-red-400">Ye item ab out of stock hai. Isse hatao.</p>}
            <input
              value={l.note}
              onChange={(e) => setLineNote(l.id, e.target.value)}
              placeholder="Note (optional), jaise: fresh wala dena"
              className="mt-3 h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
          </div>
        ))}
      </div>

      <label className={`${card} mt-3 flex gap-3 p-4`}>
        <FileText size={22} className="mt-0.5 shrink-0 text-muted" />
        <span className="flex-1">
          <span className="block text-sm">Order note (optional)</span>
          <textarea
            value={cart.note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Koi aur cheez add karna ho toh likho..."
            className="mt-1 w-full resize-none bg-transparent text-sm placeholder:text-muted/70 focus:outline-none"
          />
        </span>
      </label>

      {shortBy > 0 && (
        <Link to={`/s/${shop.id}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <AlertCircle size={28} className="shrink-0 text-accent" />
          <span className="flex-1">
            <span className="block font-bold text-accent">{rupee(shortBy)} aur add karo delivery ke liye</span>
            <span className="text-sm text-muted">Minimum order {rupee(shop.min_order)}. Pickup mein koi minimum nahi.</span>
          </span>
          <ChevronRight size={20} className="text-accent" />
        </Link>
      )}

      <div className={`${card} mt-3 flex items-center gap-3 p-4`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 text-accent"><Truck size={20} /></span>
        <span>
          <span className="block text-sm text-muted">{shop.delivery_available ? 'Delivery slot' : 'Pickup'}</span>
          <span>{shop.delivery_available ? slotText(slotDate(shop), shop) : 'Shop se khud le jao'}</span>
        </span>
      </div>

      <div className={`${card} mt-3 p-4`}>
        <div className="flex justify-between text-muted"><span>Subtotal ({lines.reduce((s, l) => s + l.qty, 0)} items)</span><span>{rupee(subtotal)}</span></div>
        {fee > 0 && <div className="mt-1 flex justify-between text-muted"><span>Delivery fee</span><span>{rupee(fee)}</span></div>}
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-bold"><span>Total</span><span>{rupee(subtotal + fee)}</span></div>
        <button type="button" disabled={problems.length > 0} onClick={() => navigate('/checkout')} className={`${btnAccent} mt-4 h-14`}>
          Checkout
        </button>
      </div>
    </main>
  )
}
