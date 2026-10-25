import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, ShoppingCart, UserRound } from 'lucide-react'
import Wordmark from './Wordmark.jsx'
import LocationSheet from './LocationSheet.jsx'
import { useCart } from '../lib/cart-context.js'
import { getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { useSavedDelivery } from '../lib/customerLocation.js'
import { deliveryQuote } from '../lib/delivery.js'
import { rupee } from '../lib/format.js'

// Customer header: logo, then location, account and cart. Below it, where we deliver to.
export default function TopBar() {
  const { count } = useCart()
  const { data: store } = useData(getStore)
  const { location } = useSavedDelivery()
  const [open, setOpen] = useState(false)
  const quote = store && location ? deliveryQuote(store, location) : null

  return (
    <>
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <div className="-mr-2 flex items-center">
          <button type="button" aria-label="Delivery location" onClick={() => setOpen(true)} className="relative flex h-11 w-10 items-center justify-center">
            <MapPin size={24} className={location ? 'text-accent' : ''} />
            {!location && <span className="absolute right-1.5 top-2 h-2.5 w-2.5 rounded-full border-2 border-ink bg-red-500" />}
          </button>
          <Link to="/account" aria-label="My account" className="flex h-11 w-10 items-center justify-center">
            <UserRound size={24} />
          </Link>
          <Link to="/cart" aria-label="Cart" className="relative flex h-11 w-10 items-center justify-center">
            <ShoppingCart size={24} />
            {count > 0 && (
              <span className="absolute -right-0.5 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-ink">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex w-full items-center gap-1.5 text-left text-xs text-muted">
        <MapPin size={13} className="shrink-0 text-accent" />
        {location ? (
          <span className="truncate">
            Deliver to <b className="text-white">{location.label || 'aapki location'}</b>
            {quote && (quote.tooFar ? <span className="text-orange-300"> · not available yet</span> : ` · ${quote.km} km · fee ${rupee(quote.fee)}`)}
          </span>
        ) : (
          <span>Delivery location set karo · <span className="text-accent underline">Set karo</span></span>
        )}
      </button>

      {open && store && <LocationSheet store={store} onClose={() => setOpen(false)} />}
    </>
  )
}
