import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, BadgePercent, ChevronRight, FileText, ShoppingCart, Trash2, Truck, X } from 'lucide-react'
import Stepper from '../../components/Stepper.jsx'
import BottomNav from '../../components/BottomNav.jsx'
import { ProductTile } from '../../components/ProductCard.jsx'
import { btnAccent, card } from '../../components/ui.js'
import { useCartDetails } from '../../lib/useCartDetails.js'
import { deliveryQuote, deliveryRules, eveningFee, packagingFee } from '../../lib/delivery.js'
import { useSavedDelivery } from '../../lib/customerLocation.js'
import OutOfArea from '../../components/OutOfArea.jsx'
import { useCart } from '../../lib/cart-context.js'
import { itemsText, rupee, slotDate, slotText, slotWords } from '../../lib/format.js'
import { useData } from '../../lib/useData.js'
import { nextDeliveryDate } from '../../lib/store.js'

function CartHeader({ onClear }) {
  const navigate = useNavigate()
  return (
    <header className="flex h-14 items-center gap-3">
      <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="-ml-2 flex h-11 w-11 items-center justify-center text-ink">
        <ArrowLeft size={24} />
      </button>
      <h1 className="flex-1 text-xl font-semibold text-ink">My Cart</h1>
      {onClear && (
        <button type="button" aria-label="Empty cart" onClick={onClear} className="-mr-2 flex h-11 w-11 items-center justify-center text-muted">
          <Trash2 size={22} />
        </button>
      )}
    </header>
  )
}

export default function Cart() {
  const navigate = useNavigate()
  const { setQty, setNote } = useCart()
  const { cart, store, lines, subtotal, savings, problems, ready } = useCartDetails()
  const { location } = useSavedDelivery()
  // Real delivery day: a full evening moves orders to the next free day.
  const { data: deliveryDay } = useData(nextDeliveryDate)

  if (!ready) return null
  if (!lines.length) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-2">
        <CartHeader />
        <div className="mt-20 flex flex-col items-center text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-mint text-brand"><ShoppingCart size={44} strokeWidth={1.6} /></span>
          <h2 className="mt-5 text-xl font-semibold">Your cart is empty</h2>
          <p className="mt-1 text-sm text-muted">Add items from the store.</p>
          <Link to="/" className={`${btnAccent} mt-6 max-w-60`}>Browse items</Link>
        </div>
        <BottomNav />
      </main>
    )
  }

  const shortBy = store.min_order - subtotal
  // Evening delivery charge by items total; nudge the customer to the next cheaper slab (or FREE).
  const dRules = deliveryRules(store)
  const delivery = eveningFee(store, subtotal)
  const addMore = subtotal < dRules.smallBelow ? dRules.smallBelow - subtotal : delivery > 0 ? dRules.freeAbove - subtotal : 0
  const nextFee = addMore > 0 ? eveningFee(store, subtotal + addMore) : delivery
  // Only to warn when the saved location is outside the delivery area; the charge is shown at checkout.
  const quote = deliveryQuote(store, location)
  const packaging = packagingFee(store, subtotal)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const clearCart = () => {
    if (window.confirm('Remove all items from your cart?')) lines.forEach((l) => setQty(l.id, 0))
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-2">
      <CartHeader onClear={clearCart} />

      <div className="mt-2">
        {lines.map((l) => (
          <div key={l.id} className="border-b border-line py-4 last:border-b-0">
            <div className="flex gap-4">
              {l.product ? <ProductTile p={l.product} className="h-[76px] w-[76px]" /> : <span className="h-[76px] w-[76px] shrink-0 rounded-2xl bg-mint-soft" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium leading-tight text-ink">{l.product?.name ?? 'Item no longer available'}</h3>
                    <p className="mt-1 text-[13px] text-muted">
                      {l.product?.size}
                      {l.product && <> • {rupee(l.product.price)}</>}
                    </p>
                  </div>
                  <button type="button" aria-label="Remove" onClick={() => setQty(l.id, 0)} className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center text-muted">
                    <X size={20} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Stepper value={l.qty} onChange={(v) => setQty(l.id, v)} />
                  <span className="text-right">
                    {l.product?.compare_price > l.product?.price && <span className="mr-1.5 text-xs text-muted line-through">{rupee(l.product.compare_price * l.qty)}</span>}
                    <span className="text-lg font-semibold text-ink">{rupee((l.product?.price ?? 0) * l.qty)}</span>
                  </span>
                </div>
              </div>
            </div>
            {l.product && !l.product.available && <p className="mt-2 text-sm text-red-600">This item is now out of stock. Please remove it.</p>}
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
            className="mt-1 w-full resize-none bg-transparent text-sm placeholder:text-muted focus:outline-none"
          />
        </span>
      </label>

      {shortBy > 0 && (
        <Link to="/" className="mt-3 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <AlertCircle size={26} className="shrink-0 text-orange-600" />
          <span className="flex-1">
            <span className="block font-semibold text-orange-700">Add {rupee(shortBy)} more</span>
            <span className="text-sm text-muted">Minimum order is {rupee(store.min_order)}.</span>
          </span>
          <ChevronRight size={20} className="text-orange-600" />
        </Link>
      )}

      {addMore > 0 && (
        <Link to="/" className="mt-3 flex items-center gap-3 rounded-2xl bg-mint p-4">
          <AlertCircle size={26} className="shrink-0 text-brand" />
          <span className="flex-1">
            <span className="block font-semibold text-brand">
              Add {rupee(addMore)} more {nextFee === 0 ? 'for FREE delivery' : `to pay ${rupee(nextFee)} delivery`}
            </span>
            <span className="text-sm text-muted">Evening delivery: {rupee(dRules.smallFee)} below {rupee(dRules.smallBelow)}, {store.free_delivery ? 'FREE' : rupee(dRules.midFee)} up to {rupee(dRules.freeAbove - 1)}, FREE from {rupee(dRules.freeAbove)}.</span>
          </span>
          <ChevronRight size={20} className="text-brand" />
        </Link>
      )}

      <div className={`${card} mt-3 flex items-center gap-3 p-4`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><Truck size={20} /></span>
        <span className="text-sm">
          <span className="block text-xs text-muted">Delivery slot</span>
          <span className="font-medium">{slotText(deliveryDay ?? slotDate(store), store)}</span>
          {deliveryDay && deliveryDay > slotDate(store) && <span className="block text-xs text-orange-700">We are facing heavy traffic today, so we will deliver your order {slotWords(deliveryDay, store)}.</span>}
        </span>
      </div>

      {quote?.tooFar && <div className="mt-3"><OutOfArea location={location} label={location.label} km={quote.km} /></div>}

      <div className="mt-5 space-y-1.5 px-1 text-sm text-muted">
        <div className="flex justify-between"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
        <div className="flex justify-between"><span>Packaging charge</span><span>{rupee(packaging)}</span></div>
        <div className="flex justify-between"><span>Delivery charge (evening)</span>{delivery === 0 ? <b className="font-semibold text-brand">FREE</b> : <span>{rupee(delivery)}</span>}</div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-mint px-5 py-4">
        <span className="font-medium text-ink">{itemsText(itemCount)}</span>
        <span className="text-xl font-semibold text-ink">{rupee(subtotal + packaging + delivery)}</span>
      </div>
      {savings > 0 && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-brand">
          <BadgePercent size={16} /> You save {rupee(savings)} on this order
        </p>
      )}
      {dRules.expressOn && <p className="mt-1 text-right text-xs text-muted">⚡ Need it sooner? Choose Express ({rupee(dRules.expressFee)}) at checkout</p>}

      <button type="button" disabled={problems.length > 0 || shortBy > 0 || store.paused || quote?.tooFar} onClick={() => navigate('/checkout')} className={`${btnAccent} mt-4 h-14 text-[17px]`}>
        Proceed to Checkout <ArrowRight size={20} />
      </button>
      <BottomNav />
    </main>
  )
}
