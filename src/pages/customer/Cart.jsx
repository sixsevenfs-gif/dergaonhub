import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronRight, FileText, ShoppingCart, Trash2, Truck } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Stepper from '../../components/Stepper.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import { btnAccent, card } from '../../components/ui.js'
import { useCartDetails } from '../../lib/useCartDetails.js'
import { deliveryQuote, packagingFee } from '../../lib/delivery.js'
import { useSavedDelivery } from '../../lib/customerLocation.js'
import OutOfArea from '../../components/OutOfArea.jsx'
import { useCart } from '../../lib/cart-context.js'
import { itemsText, rupee, slotDate, slotText } from '../../lib/format.js'

export default function Cart() {
  const navigate = useNavigate()
  const { setQty, setLineNote, setNote } = useCart()
  const { cart, store, lines, subtotal, problems, ready } = useCartDetails()
  const { location } = useSavedDelivery()

  if (!ready) return null
  if (!lines.length) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 pt-4">
        <TopBar />
        <div className="mt-20 flex flex-col items-center text-center">
          <ShoppingCart size={56} className="text-muted" strokeWidth={1.5} />
          <h1 className="mt-4 text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-1 text-muted">Add items from the store.</p>
          <Link to="/" className={`${btnAccent} mt-6 max-w-60`}>Browse items</Link>
        </div>
      </main>
    )
  }

  const shortBy = store.min_order - subtotal
  // Below ₹149 the delivery charge is higher; nudge the customer to add a little more.
  const smallBy = (Number(store.small_order_below) || 0) - subtotal
  // Only to warn when the saved location is outside the delivery area; the charge is shown at checkout.
  const quote = deliveryQuote(store, location)
  const packaging = packagingFee(store, subtotal)

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">Your Cart</h1>
      <p className="text-muted">{store.name}</p>

      <div className="mt-4 space-y-3">
        {lines.map((l) => (
          <div key={l.id} className={`${card} p-3`}>
            <div className="flex gap-3">
              <ProductThumb product={l.product} className="bg-white/5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{l.product?.name ?? 'Item no longer available'}</h3>
                    <p className="text-sm text-muted">{l.product?.size}</p>
                  </div>
                  <button type="button" aria-label="Remove" onClick={() => setQty(l.id, 0)} className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center text-muted">
                    <Trash2 size={20} />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-lg font-bold">{rupee((l.product?.price ?? 0) * l.qty)}</span>
                  <Stepper value={l.qty} onChange={(v) => setQty(l.id, v)} className="w-32" />
                </div>
              </div>
            </div>
            {l.product && !l.product.available && <p className="mt-2 text-sm text-red-400">This item is now out of stock. Please remove it.</p>}
            <input
              value={l.note}
              onChange={(e) => setLineNote(l.id, e.target.value)}
              placeholder="Note (optional), e.g. please pick a fresh one"
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
            placeholder="Anything else you need? Write it here..."
            className="mt-1 w-full resize-none bg-transparent text-sm placeholder:text-muted/70 focus:outline-none"
          />
        </span>
      </label>

      {shortBy > 0 && (
        <Link to="/" className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <AlertCircle size={28} className="shrink-0 text-accent" />
          <span className="flex-1">
            <span className="block font-bold text-accent">Add {rupee(shortBy)} more</span>
            <span className="text-sm text-muted">Minimum order is {rupee(store.min_order)}.</span>
          </span>
          <ChevronRight size={20} className="text-accent" />
        </Link>
      )}

      {smallBy > 0 && (
        <Link to="/" className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
          <AlertCircle size={28} className="shrink-0 text-emerald-300" />
          <span className="flex-1">
            <span className="block font-bold text-emerald-300">Add {rupee(smallBy)} more to save on delivery</span>
            <span className="text-sm text-muted">Orders below {rupee(store.small_order_below)} have a {rupee(store.small_order_fee)} delivery charge.</span>
          </span>
          <ChevronRight size={20} className="text-emerald-300" />
        </Link>
      )}

      <div className={`${card} mt-3 flex items-center gap-3 p-4`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 text-accent"><Truck size={20} /></span>
        <span>
          <span className="block text-sm text-muted">Delivery slot</span>
          <span>{slotText(slotDate(store), store)}</span>
        </span>
      </div>

      {quote?.tooFar && <div className="mt-3"><OutOfArea location={location} label={location.label} km={quote.km} /></div>}

      <div className={`${card} mt-3 p-4`}>
        <div className="flex justify-between text-muted"><span>Subtotal ({itemsText(lines.reduce((s, l) => s + l.qty, 0))})</span><span>{rupee(subtotal)}</span></div>
        <div className="mt-1 flex justify-between text-muted"><span>Delivery charge</span>{store.free_delivery && smallBy <= 0 ? <b className="font-ui text-emerald-400">FREE</b> : <span>At checkout</span>}</div>
        <div className="mt-1 flex justify-between text-muted"><span>Packaging charge</span><span>{rupee(packaging)}</span></div>
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-xl font-bold"><span>Total</span><span>{rupee(subtotal + packaging)}</span></div>
        {!(store.free_delivery && smallBy <= 0) && <p className="mt-1 text-right text-xs text-muted">+ delivery charge, shown at checkout by distance</p>}
        <button type="button" disabled={problems.length > 0 || shortBy > 0 || store.paused || quote?.tooFar} onClick={() => navigate('/checkout')} className={`${btnAccent} mt-4 h-14`}>
          Checkout
        </button>
      </div>
    </main>
  )
}
