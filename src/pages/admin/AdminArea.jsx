import { NavLink, Outlet } from 'react-router-dom'
import Wordmark from '../../components/Wordmark.jsx'
import { DEMO_MODE } from '../../config.js'

const NAV = [
  ['/admin', 'Home'],
  ['/admin/shops', 'Shops'],
  ['/admin/delivery', 'Delivery sheet'],
  ['/admin/settlement', 'Settlement'],
  ['/admin/orders', 'Orders'],
  ['/admin/customers', 'Customers'],
  ['/admin/library', 'Library'],
  ['/admin/directory', 'Directory'],
]

// Founder-only area. With Supabase, only the admin login can open it.
export default function AdminArea() {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Wordmark />
          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold uppercase text-white">Admin</span>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) => `flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold ${isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {DEMO_MODE && (
        <p className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 print:hidden">
          Demo mode: admin abhi bina login ke khulta hai. Database connect hone ke baad sirf aapka admin login chalega.
        </p>
      )}
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
    </div>
  )
}
