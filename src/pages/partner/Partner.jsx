import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, LogOut, RefreshCw, ShoppingBasket } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import PartnerLogin from './PartnerLogin.jsx'
import PartnerOrderCard from './PartnerOrderCard.jsx'
import { stageOf } from './stage.js'
import { card } from '../../components/ui.js'
import { adminSignOut, getStore, partnerOrders, partnerSession } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, rupee } from '../../lib/format.js'
import { DEMO_MODE } from '../../config.js'

// Delivery partner (rider) page: one day's orders, a shopping list for the trip,
// and per order: tick items, "On the way", "Arriving soon", "Delivered + bill".
// Only riders and the admin can open it; the database checks this again for every action.
export default function Partner() {
  const { data: session, error, reload } = useData(partnerSession)
  if (session === undefined && !error) return null
  if (!session?.role) return <PartnerLogin onDone={reload} denied={!!session?.email} />
  return <PartnerRun session={session} />
}

const ORDER = { arriving: 0, on_the_way: 1, ready: 2, new: 3, done: 4 }

function PartnerRun({ session }) {
  const [date, setDate] = useState(dateStr())
  const { data: orders, error, reload } = useData(() => partnerOrders(date), [date])
  const { data: store } = useData(getStore)
  const [showList, setShowList] = useState(false)

  // New orders come in while the rider is out: check again every 30 seconds and on return to the page.
  useEffect(() => {
    const t = setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', reload)
    }
  }, [reload])

  const list = (orders ?? []).slice().sort((a, b) => ORDER[stageOf(a)] - ORDER[stageOf(b)])
  const left = list.filter((o) => o.status === 'confirmed')
  const delivered = list.filter((o) => o.status === 'completed').length
  const cash = left.filter((o) => o.payment_method === 'cash').reduce((s, o) => s + o.total, 0)
  // Cash already taken from delivered orders (what the rider should hand over).
  const inHand = list.filter((o) => o.status === 'completed' && o.payment_method === 'cash').reduce((s, o) => s + (o.cash_collected || o.total), 0)

  // Everything still to buy for confirmed orders, added up.
  const shopping = Object.values(
    left.flatMap((o) => o.items).reduce((all, i) => {
      all[i.name_snapshot] ??= { name: i.name_snapshot, quantity: 0 }
      all[i.name_snapshot].quantity += i.quantity
      return all
    }, {}),
  ).sort((a, b) => a.name.localeCompare(b.name))

  const today = dateStr()
  const days = [[today, 'Today'], [addDays(today, 1), 'Tomorrow']]

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-4 font-ui">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-ink">Partner</span>
          {!DEMO_MODE && (
            <button type="button" aria-label="Log out" title={session.email} onClick={adminSignOut} className="flex h-11 w-10 items-center justify-center text-muted"><LogOut size={20} /></button>
          )}
        </div>
      </header>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex flex-1 rounded-full border border-white/10 bg-white/[0.05] p-1 shadow-[inset_0_2px_6px_rgb(0_0_0/0.45)]">
          {days.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`h-10 flex-1 rounded-full text-sm font-bold transition-all ${
                date === d ? 'border border-white/25 bg-gradient-to-b from-white/20 to-white/5 text-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_4px_12px_rgb(0_0_0/0.4)]' : 'text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Refresh" onClick={reload} className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted active:rotate-180 active:transition-transform"><RefreshCw size={18} /></button>
      </div>

      <section className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[[left.length, 'To deliver'], [delivered, 'Delivered'], cash > 0 ? [rupee(cash), 'Cash to collect'] : [rupee(inHand), 'Cash collected']].map(([n, label]) => (
          <div key={label} className={`${card} px-2 py-3`}>
            <div className="text-xl font-black leading-none">{n}</div>
            <div className="mt-1 text-[11px] text-muted">{label}</div>
            {label === 'Cash to collect' && inHand > 0 && <div className="mt-0.5 text-[10px] text-emerald-300">{rupee(inHand)} collected</div>}
          </div>
        ))}
      </section>

      {shopping.length > 0 && (
        <section className={`${card} mt-3 overflow-hidden`}>
          <button type="button" onClick={() => setShowList(!showList)} className="flex w-full items-center gap-3 p-4 text-left">
            <ShoppingBasket size={20} className="text-accent" />
            <span className="flex-1 font-bold">Shopping list · {shopping.length} items</span>
            <ChevronDown size={20} className={`text-muted transition-transform ${showList ? 'rotate-180' : ''}`} />
          </button>
          {showList && (
            <ul className="divide-y divide-line/60 border-t border-line px-4 text-sm">
              {shopping.map((s) => (
                <li key={s.name} className="flex justify-between py-2.5"><span>{s.name}</span><b>×{s.quantity}</b></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error.message}</p>}

      <div className="mt-4 space-y-3">
        {list.map((o) => (
          <PartnerOrderCard key={o.id} order={o} store={store ?? {}} isAdmin={session.role === 'admin'} auto={!!store?.whatsapp_auto} />
        ))}
        {orders && !list.length && <p className={`${card} p-8 text-center text-muted`}>No orders for this day yet.</p>}
      </div>

      {session.role === 'admin' && (
        <Link to="/admin" className="mt-8 block text-center text-sm text-muted underline">Back to admin</Link>
      )}
    </main>
  )
}
