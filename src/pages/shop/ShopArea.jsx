import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ClipboardList, Package, Settings } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { currentUserEmail, getMyShop } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'

const NAV = [
  ['/shop', 'Orders', ClipboardList],
  ['/shop/products', 'Products', Package],
  ['/shop/settings', 'Settings', Settings],
]

// Light, calm layout for shop owners. Checks login and that the shop exists.
export default function ShopArea() {
  const { pathname } = useLocation()
  const email = currentUserEmail()
  const { data: shop, loading } = useData(getMyShop, [email])

  if (!email) return <Navigate to="/shop/login" replace />
  if (loading) return null
  const creating = pathname === '/shop/create'
  if (!shop && !creating) return <Navigate to="/shop/create" replace />

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <span className="flex items-baseline gap-2 [&_a]:text-neutral-900">
            <Wordmark className="text-xl" />
            <span className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-neutral-500 min-[420px]:inline">for shops</span>
          </span>
          {shop && (
            <NavLink to="/shop/status" className="flex items-center gap-2 text-sm">
              <span className="max-w-36 truncate font-semibold">{shop.name}</span>
              <StatusBadge status={shop.paused && shop.status === 'live' ? 'hidden' : shop.status} />
            </NavLink>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <Outlet context={{ shop }} />
      </div>

      {shop && !creating && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white">
          <div className="mx-auto grid h-16 max-w-md grid-cols-3">
            {NAV.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/shop'}
                className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`}
              >
                <Icon size={22} /> {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
