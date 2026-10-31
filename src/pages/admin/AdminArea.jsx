import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Bike, ClipboardList, Ellipsis, House, ListChecks, LogOut, MessageSquareWarning, Package, Settings, TrendingUp, Truck, Users, X } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import AdminLogin from './AdminLogin.jsx'
import { adminSession, adminSignOut, adminStats } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { DEMO_MODE } from '../../config.js'

const NAV = [
  ['/admin', 'Home', null, House],
  ['/admin/orders', 'Orders', 'newOrders', ClipboardList],
  ['/admin/delivery', 'Delivery sheet', null, Truck],
  ['/admin/summary', 'Daily summary', null, BarChart3],
  ['/admin/products', 'Products', 'outOfStock', Package],
  ['/admin/top-items', 'Top items', null, TrendingUp],
  ['/admin/complaints', 'Complaints', 'openComplaints', MessageSquareWarning],
  ['/admin/customers', 'Customers', null, Users],
  ['/admin/waitlist', 'Waitlist', 'waitlist', ListChecks],
  ['/admin/settings', 'Settings', null, Settings],
]
// Phone: these four sit in the bottom bar, the rest open from "More".
const BOTTOM = ['/admin', '/admin/orders', '/admin/delivery', '/admin/products']

// Founder-only area. With the database, only the admin login can open it (demo mode skips the login).
export default function AdminArea() {
  const { data: session, error, reload } = useData(adminSession)
  if (session === undefined && !error) return null
  if (!session?.isAdmin) return <AdminLogin onDone={reload} />
  return <AdminShell email={session.email} />
}

function AdminShell({ email }) {
  const { data: stats } = useData(adminStats)
  return (
    <div className="min-h-screen bg-neutral-100 font-ui text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Wordmark theme="light" />
          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold uppercase text-white">Admin</span>
          {stats?.paused && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Store paused</span>}
          <Link to="/partner" className="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-neutral-700">
            <Bike size={16} /> Rider page
          </Link>
          {!DEMO_MODE && (
            <button type="button" onClick={adminSignOut} title={email} className="hidden h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-neutral-600 sm:flex">
              <LogOut size={16} /> Log out
            </button>
          )}
        </div>
        <nav className="mx-auto hidden max-w-3xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:flex">
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
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4 sm:pb-16">
        <Outlet />
      </main>
      <PhoneNav stats={stats} email={email} />
    </div>
  )
}

const Badge = ({ n }) => (n > 0 ? <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-ink">{n}</span> : null)

// Phone menu: a bottom bar like an app, with the other pages in a "More" sheet.
function PhoneNav({ stats, email }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // Any page change closes the sheet.
  useEffect(() => setOpen(false), [pathname])
  const bottom = NAV.filter(([to]) => BOTTOM.includes(to))
  const more = NAV.filter(([to]) => !BOTTOM.includes(to))
  const moreActive = more.some(([to]) => pathname.startsWith(to))
  const moreCount = more.reduce((n, [, , key]) => n + (key ? stats?.[key] ?? 0 : 0), 0)
  const item = 'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold'
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
        {bottom.map(([to, label, key, Icon]) => (
          <NavLink key={to} to={to} end={to === '/admin'} onClick={() => setOpen(false)} className={({ isActive }) => `${item} ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>
            {({ isActive }) => (
              <>
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-accent' : ''}`}>
                  <Icon size={20} />
                  <Badge n={key ? stats?.[key] : 0} />
                </span>
                {label === 'Delivery sheet' ? 'Delivery' : label}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setOpen(!open)} className={`${item} ${moreActive || open ? 'text-neutral-900' : 'text-neutral-500'}`}>
          <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? 'bg-accent' : ''}`}>
            {open ? <X size={20} /> : <Ellipsis size={20} />}
            <Badge n={moreCount} />
          </span>
          More
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-10 sm:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] rounded-t-3xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {more.map(([to, label, key, Icon]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `relative flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-xs font-semibold ${isActive ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                  <span className="relative"><Icon size={22} /><Badge n={key ? stats?.[key] : 0} /></span>
                  {label}
                </NavLink>
              ))}
              {!DEMO_MODE && (
                <button type="button" onClick={adminSignOut} title={email} className="flex flex-col items-center gap-1.5 rounded-2xl bg-neutral-100 p-3 text-xs font-semibold text-red-600">
                  <LogOut size={22} /> Log out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
