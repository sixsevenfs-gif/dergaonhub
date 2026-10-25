import { NavLink, Outlet } from 'react-router-dom'
import Wordmark from '../../components/Wordmark.jsx'
import { adminStats } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { DEMO_MODE } from '../../config.js'

const NAV = [
  ['/admin', 'Home'],
  ['/admin/orders', 'Orders', 'newOrders'],
  ['/admin/delivery', 'Delivery sheet'],
  ['/admin/summary', 'Daily summary'],
  ['/admin/products', 'Products', 'outOfStock'],
  ['/admin/complaints', 'Complaints', 'openComplaints'],
  ['/admin/customers', 'Customers'],
  ['/admin/waitlist', 'Waitlist', 'waitlist'],
  ['/admin/settings', 'Settings'],
]

// Founder-only area. With the database, only the admin login can open it.
export default function AdminArea() {
  const { data: stats } = useData(adminStats)
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Wordmark theme="light" />
          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold uppercase text-white">Admin</span>
          {stats?.paused && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Store paused</span>}
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {NAV.map(([to, label, countKey]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) => `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
            >
              {label}
              {countKey && stats?.[countKey] > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-ink">{stats[countKey]}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      {DEMO_MODE && (
        <p className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 print:hidden">
          Demo mode: admin opens without a login for now. Once the database is connected, only your admin login will work.
        </p>
      )}
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
    </div>
  )
}
