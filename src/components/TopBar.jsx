import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, MapPin, ShoppingCart, UserRound, WalletMinimal } from 'lucide-react'
import Wordmark from './Wordmark.jsx'
import LocationSheet from './LocationSheet.jsx'
import { useCart } from '../lib/cart-context.js'
import { currentCustomer, getStore, myWallet } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { useSavedDelivery } from '../lib/customerLocation.js'
import { deliveryQuote } from '../lib/delivery.js'
import { rupee } from '../lib/format.js'

// Jholzo Money balance next to the account button (like BigBasket); opens the wallet page.
function WalletPill({ onBrand }) {
  const me = currentCustomer()
  const { data: wallet } = useData(() => (me ? myWallet(me.phone) : null), [me?.phone])
  if (!wallet) return null // not logged in, or the database has no wallet yet (update 017)
  return (
    <Link
      to="/wallet"
      aria-label="Jholzo Money"
      className={`mr-1 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold ${onBrand ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-mint text-brand'}`}
    >
      <WalletMinimal size={16} />
      {rupee(wallet.locked ? 0 : wallet.balance)}
    </Link>
  )
}

// Account and cart buttons. onBrand: white icons for the green home header.
export function HeaderIcons({ onBrand = false }) {
  const { count } = useCart()
  const tone = onBrand ? 'text-white' : 'text-ink'
  return (
    <div className="-mr-2 flex items-center">
      <WalletPill onBrand={onBrand} />
      <Link to="/account" aria-label="My account" className={`flex h-11 w-10 items-center justify-center ${tone}`}>
        <UserRound size={23} />
      </Link>
      <Link to="/cart" aria-label="Cart" className={`relative flex h-11 w-10 items-center justify-center ${tone}`}>
        <ShoppingCart size={23} />
        {count > 0 && (
          <span className={`absolute -right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${onBrand ? 'bg-white text-brand' : 'bg-brand text-white'}`}>
            {count}
          </span>
        )}
      </Link>
    </div>
  )
}

// "Deliver to Dergaon ⌄": opens the location sheet.
export function DeliverTo({ onBrand = false }) {
  const { data: store } = useData(getStore)
  const { location } = useSavedDelivery()
  const [open, setOpen] = useState(false)
  const quote = store && location ? deliveryQuote(store, location) : null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-2.5 text-left">
        <MapPin size={20} className={`shrink-0 ${onBrand ? 'text-white' : 'text-brand'}`} />
        <span className="min-w-0">
          <span className={`block text-[11px] leading-tight ${onBrand ? 'text-white/75' : 'text-muted'}`}>Deliver to</span>
          <span className={`flex items-center gap-1 text-sm font-semibold leading-tight ${onBrand ? 'text-white' : 'text-ink'}`}>
            <span className="truncate">{location ? location.label || 'Your location' : 'Set your location'}</span>
            <ChevronDown size={16} className="shrink-0" />
          </span>
          {quote?.tooFar && <span className={`block text-[11px] ${onBrand ? 'text-orange-200' : 'text-orange-600'}`}>Not available here yet</span>}
        </span>
      </button>
      {open && store && <LocationSheet store={store} onClose={() => setOpen(false)} />}
    </>
  )
}

// Header for the inner pages: logo, account and cart, then where we deliver to.
export default function TopBar() {
  return (
    <>
      <header className="flex h-14 items-center justify-between">
        <Wordmark />
        <HeaderIcons />
      </header>
      <div className="mt-2"><DeliverTo /></div>
    </>
  )
}
