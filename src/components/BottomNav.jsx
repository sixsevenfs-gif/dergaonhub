import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, House, LayoutGrid, ShoppingCart, UserRound } from 'lucide-react'
import { useCart } from '../lib/cart-context.js'

const TABS = [
  ['/', House, 'Home'],
  ['/?all=1', LayoutGrid, 'Categories'],
  ['/cart', ShoppingCart, 'Cart'],
  ['/track', ClipboardList, 'Orders'],
  ['/account', UserRound, 'Profile'],
]

// Tab bar at the bottom of the home, cart, orders and profile pages.
export default function BottomNav() {
  const { pathname, search } = useLocation()
  const { count } = useCart()
  const here = pathname + (search.includes('all=1') ? '?all=1' : '')
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5">
        {TABS.map(([to, Icon, label]) => {
          const active = here === to || (to === '/track' && pathname.startsWith('/track'))
          return (
            <Link key={label} to={to} className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-brand' : 'text-muted'}`}>
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {to === '/cart' && count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{count}</span>
                )}
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
