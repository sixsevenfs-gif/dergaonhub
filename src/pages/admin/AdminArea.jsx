import { useEffect, useLayoutEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, Bike, ClipboardList, Ellipsis, HandCoins, House, ListChecks, LogIn, LogOut, MessageSquareWarning, Package, ScanBarcode,
  Settings, ShoppingBasket, ShoppingCart, SlidersHorizontal, Smartphone, Store, Trash2, TrendingUp, Truck, Users, UtensilsCrossed, WalletMinimal, X,
} from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import AdminLogin from './AdminLogin.jsx'
import { adminSession, adminSignOut, adminStats, ordersCheck } from '../../lib/store.js'
import { foodNewCount } from '../../lib/foodAdmin.js'
import { useData } from '../../lib/useData.js'
import { useLiveCheck } from '../../lib/useLiveCheck.js'
import { RoleContext, useRole } from '../../lib/role.js'
import { DEMO_MODE } from '../../config.js'
import { APP_NAV } from './appNav.js'

// The dashboard has three parts, switched at the top: Grocery (the shop), Food (restaurants) and App
// (notifications, banners, app updates, settings). Each part has its own pages in the menu.
const SECTIONS = [
  ['grocery', 'Grocery', ShoppingBasket, '/admin'],
  ['food', 'Food', UtensilsCrossed, '/admin/food'],
  ['app', 'App', Smartphone, '/admin/app'],
]

const NAV = {
  grocery: [
    ['/admin', 'Home', null, House],
    ['/admin/orders', 'Orders', 'newOrders', ClipboardList],
    ['/admin/delivery', 'Delivery sheet', null, Truck],
    ['/admin/summary', 'Daily summary', null, BarChart3],
    ['/admin/products', 'Products', 'outOfStock', Package],
    ['/admin/top-items', 'Top items', null, TrendingUp],
    ['/admin/complaints', 'Complaints', 'openComplaints', MessageSquareWarning],
    ['/admin/customers', 'Customers', null, Users],
    ['/admin/carts', 'Carts', null, ShoppingCart],
    ['/admin/money', 'Jholzo Money', null, WalletMinimal],
    ['/admin/logins', 'Logins', null, LogIn],
    ['/admin/waitlist', 'Waitlist', 'waitlist', ListChecks],
    ['/admin/survey', 'Wholesale prices', null, ScanBarcode],
    ['/admin/delete-orders', 'Delete orders', null, Trash2],
  ],
  food: [
    ['/admin/food', 'Food home', null, UtensilsCrossed],
    ['/admin/food/orders', 'Food orders', 'newFood', ClipboardList],
    ['/admin/food/restaurants', 'Restaurants', null, Store],
    ['/admin/food/payouts', 'Payouts', null, HandCoins],
    ['/admin/food/settings', 'Food settings', null, SlidersHorizontal],
  ],
  app: [
    ...APP_NAV,
    ['/admin/settings', 'Settings', null, Settings],
  ],
}
// Phone: these sit in the bottom bar of each part, the rest open from "More".
const BOTTOM = {
  grocery: ['/admin', '/admin/orders', '/admin/delivery', '/admin/products'],
  food: ['/admin/food', '/admin/food/orders', '/admin/food/restaurants', '/admin/food/payouts'],
  app: NAV.app.slice(0, 4).map(([to]) => to),
}
// Settings hold the UPI and bank details, fees and the team; delete wipes orders; payouts and food fees are
// money; the App part sends to every customer. The owner only.
const OWNER_ONLY = ['/admin/settings', '/admin/delete-orders', '/admin/survey', '/admin/food/payouts', '/admin/food/settings', ...APP_NAV.map(([to]) => to)]

function sectionOf(pathname) {
  if (pathname.startsWith('/admin/food')) return 'food'
  if (pathname.startsWith('/admin/app') || pathname.startsWith('/admin/settings')) return 'app'
  return 'grocery'
}

// The owner's dashboard, and the executive's (order desk, update 032) without the owner-only pages and
// buttons. With the database only these logins open it (demo mode skips the login; try ?as=executive).
export default function AdminArea() {
  const { data: session, error, reload } = useData(adminSession)
  if (session === undefined && !error) return null
  if (!session?.role) return <AdminLogin onDone={reload} />
  return (
    <RoleContext.Provider value={session.role}>
      <AdminShell email={session.email} role={session.role} />
    </RoleContext.Provider>
  )
}

// An owner-only page opened by the executive (old link, typed address).
export function OwnerOnly({ children }) {
  const { isOwner } = useRole()
  if (isOwner) return children
  return <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-neutral-600">Only the owner can open this page.</p>
}

function AdminShell({ email, role }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: stats, refresh: refreshStats } = useData(adminStats)
  // The badges (new orders, open complaints) follow new orders without a page reload.
  useLiveCheck(ordersCheck, refreshStats, { fullEvery: 60_000 })
  const { data: newFood, reload: reloadFood } = useData(foodNewCount)
  // New food orders show on the Food switch from any page; checked every 20 seconds while the tab is open.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reloadFood() }, 20_000)
    return () => clearInterval(t)
  }, [reloadFood])
  const counts = { ...stats, newFood: newFood ?? 0 }
  const allowed = ([to]) => role === 'owner' || !OWNER_ONLY.includes(to)
  const sections = SECTIONS.filter(([key]) => NAV[key].some(allowed))
  const section = sectionOf(pathname)
  const nav = NAV[section].filter(allowed)
  const sectionCount = { grocery: (counts.newOrders ?? 0) + (counts.openComplaints ?? 0), food: counts.newFood, app: 0 }

  return (
    <div className="min-h-screen bg-neutral-100 font-ui text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Wordmark theme="light" />
          <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold uppercase text-white">{role === 'executive' ? 'Executive' : 'Admin'}</span>
          {stats?.paused && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Store paused</span>}
          {role === 'owner' && (
            <Link to="/partner" className="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-neutral-700">
              <Bike size={16} /> <span className="hidden sm:inline">Rider page</span>
            </Link>
          )}
          {!DEMO_MODE && (
            <button type="button" onClick={adminSignOut} title={email} className={`${role === 'owner' ? '' : 'ml-auto'} hidden h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-neutral-600 sm:flex`}>
              <LogOut size={16} /> Log out
            </button>
          )}
        </div>
        {sections.length > 1 && (
          <div className="mx-auto max-w-3xl px-4 pb-2">
            <div className="flex rounded-2xl bg-neutral-100 p-1" role="tablist" aria-label="Dashboard part">
              {sections.map(([key, label, Icon, home]) => {
                const active = key === section
                const n = sectionCount[key]
                return (
                  <button key={key} type="button" role="tab" aria-selected={active} onClick={() => navigate(home === '/admin/app' ? NAV.app.filter(allowed)[0][0] : home)}
                    className={`relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition ${active ? (key === 'food' ? 'bg-red-600 text-white shadow' : 'bg-neutral-900 text-white shadow') : 'text-neutral-600'}`}>
                    <Icon size={16} /> {label}
                    {!active && n > 0 && <span className={`rounded-full px-1.5 text-xs font-bold ${key === 'food' ? 'bg-red-600 text-white' : 'bg-accent text-ink'}`}>{n}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <nav className="mx-auto hidden max-w-3xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:flex">
          {nav.map(([to, label, countKey]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin' || to === '/admin/food' || to === '/admin/app'}
              className={({ isActive }) => `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
            >
              {label}
              {countKey && counts?.[countKey] > 0 && (
                <span className={`rounded-full px-1.5 text-xs font-bold ${countKey === 'newFood' ? 'bg-red-600 text-white' : 'bg-accent text-ink'}`}>{counts[countKey]}</span>
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
      {/* The App Control Center is wider: its pages show a phone next to the settings. */}
      <main className={`mx-auto ${section === 'app' && pathname !== '/admin/settings' ? 'max-w-6xl' : 'max-w-3xl'} px-4 pb-28 pt-4 sm:pb-16`}>
        <BackButton home={SECTIONS.find(([key]) => key === section)[3]} />
        <Outlet />
      </main>
      <PhoneNav nav={nav} bottomPaths={BOTTOM[section]} stats={counts} email={email} />
    </div>
  )
}

// The admin pages of this tab's history, by their place in it (React Router numbers each entry), so Back
// returns to the page you came from, also after a refresh or the phone's own back and forward.
const TRAIL_KEY = 'jholzo-admin-trail'
function readTrail() {
  try {
    const trail = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]')
    return Array.isArray(trail) ? trail : []
  } catch {
    return []
  }
}
function saveTrail(trail) {
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail))
  } catch {
    // private mode: Back still works on this page
  }
}
const placeInHistory = () => window.history.state?.idx ?? 0

// "Back" at the top of every admin page: the page you were on before (like the phone's back), or this
// part's home when there is no admin page before it in the tab.
function BackButton({ home }) {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const [trail, setTrail] = useState(readTrail)
  const at = placeInHistory()
  // Before the page is drawn, so the button doesn't jump in a moment later.
  useLayoutEffect(() => {
    const here = { key: location.key, path: location.pathname + location.search }
    setTrail((old) => {
      const known = old[at]?.key === here.key && old[at]?.path === here.path
      if (known) return old // a refresh, or back or forward to a page already in the trail
      // A new page drops the pages after it (as the browser does); a replaced one keeps them; a page the
      // trail doesn't know (opened fresh) starts it again.
      const next = type === 'PUSH' ? old.slice(0, at) : type === 'REPLACE' ? [...old] : []
      next[at] = here
      next.fill(null, 0, Math.max(0, at - 50)) // the browser keeps only the last 50 pages too
      saveTrail(next)
      return next
    })
  }, [at, location.key, location.pathname, location.search, type])
  const canGoBack = at > 0 && trail[at]?.key === location.key && Boolean(trail[at - 1])
  if (!canGoBack && location.pathname === home) return null
  return (
    <button type="button" onClick={() => (canGoBack ? navigate(-1) : navigate(home))}
      className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm active:scale-95 print:hidden">
      <ArrowLeft size={16} /> Back
    </button>
  )
}

const Badge = ({ n, red }) => (n > 0 ? <span className={`absolute -right-2 -top-1 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4 ${red ? 'bg-red-600 text-white' : 'bg-accent text-ink'}`}>{n}</span> : null)

const SHORT = { 'Delivery sheet': 'Delivery', 'Food home': 'Home', 'Food orders': 'Orders', 'Food settings': 'Settings' }

// Phone menu: a bottom bar like an app, with the other pages of this part in a "More" sheet.
function PhoneNav({ nav, bottomPaths, stats, email }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // Any page change closes the sheet.
  useEffect(() => setOpen(false), [pathname])
  const bottom = nav.filter(([to]) => bottomPaths.includes(to))
  const more = nav.filter(([to]) => !bottomPaths.includes(to))
  const moreActive = more.some(([to]) => (to === '/admin/app' ? pathname === to : pathname.startsWith(to)))
  const moreCount = more.reduce((n, [, , key]) => n + (key ? stats?.[key] ?? 0 : 0), 0)
  const item = 'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold'
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
        {bottom.map(([to, label, key, Icon]) => (
          <NavLink key={to} to={to} end={to === '/admin' || to === '/admin/food' || to === '/admin/app'} onClick={() => setOpen(false)} className={({ isActive }) => `${item} ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>
            {({ isActive }) => (
              <>
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-accent' : ''}`}>
                  <Icon size={20} />
                  <Badge n={key ? stats?.[key] : 0} red={key === 'newFood'} />
                </span>
                {SHORT[label] ?? label}
              </>
            )}
          </NavLink>
        ))}
        {(more.length > 0 || !DEMO_MODE) && (
          <button type="button" onClick={() => setOpen(!open)} className={`${item} ${moreActive || open ? 'text-neutral-900' : 'text-neutral-500'}`}>
            <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? 'bg-accent' : ''}`}>
              {open ? <X size={20} /> : <Ellipsis size={20} />}
              <Badge n={moreCount} />
            </span>
            More
          </button>
        )}
      </nav>

      {open && (
        <div className="fixed inset-0 z-10 sm:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] rounded-t-3xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {more.map(([to, label, key, Icon]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `relative flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-xs font-semibold ${isActive ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                  <span className="relative"><Icon size={22} /><Badge n={key ? stats?.[key] : 0} red={key === 'newFood'} /></span>
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
