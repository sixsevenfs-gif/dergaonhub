import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Check, ChevronDown, HandCoins, LogOut, QrCode, RefreshCw, ShoppingBasket } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import PartnerLogin from './PartnerLogin.jsx'
import PartnerOrderCard from './PartnerOrderCard.jsx'
import { stageOf } from './stage.js'
import { card } from '../../components/ui.js'
import { adminSignOut, getStore, partnerOrders, partnerReturn, partnerSession, riderDayMoney } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr, dayLabel, rupee } from '../../lib/format.js'
import UpiQr from './UpiQr.jsx'
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

// The day's money the rider gives back to the owner (update 044). Riders are paid a salary, so everything a
// customer pays belongs to the store: cash collected − paid at the shop − already given back.
function GiveBack({ money: m, date, store, onError }) {
  const [showQr, setShowQr] = useState(false)
  const [cashAsk, setCashAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const due = Math.round(Number(m.to_return) * 100) / 100
  const pay = async (method) => {
    setBusy(true)
    onError('')
    try {
      await partnerReturn(date, due, method)
      setShowQr(false)
      setCashAsk(false)
    } catch (err) {
      onError(err.message)
    }
    setBusy(false)
  }
  const line = (label, value) => <div className="flex justify-between gap-3 text-muted"><span>{label}</span><span className="shrink-0">{value}</span></div>
  const settled = due === 0 && (m.delivered > 0 || Number(m.returned) > 0)
  return (
    <section className={`${card} mt-3 p-4`}>
      <div className="flex items-center gap-3">
        <HandCoins size={22} className={due > 0 ? 'text-orange-600' : 'text-emerald-600'} />
        <span className="flex-1 font-semibold">{due < 0 ? 'Admin owes you' : settled ? 'All given back' : 'Give back to admin'}</span>
        <span className={`text-2xl font-black ${due > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{settled ? <Check size={24} /> : rupee(Math.abs(due))}</span>
      </div>
      <div className="mt-2 space-y-1 text-sm">
        {line(`Cash from customers today (${m.delivered} delivered)`, rupee(m.cash))}
        {line('Paid at the shop today', `− ${rupee(m.shop)}`)}
        {Number(m.returned) > 0 && line('Given back today', `− ${rupee(m.returned)}`)}
        {Number(m.earlier) !== 0 && line(Number(m.earlier) > 0 ? 'Still to give back from earlier days' : 'Admin owed you from earlier days', Number(m.earlier) > 0 ? `+ ${rupee(m.earlier)}` : `− ${rupee(-m.earlier)}`)}
      </div>
      <p className="mt-2 text-xs text-muted">
        {due < 0
          ? 'You paid the shop for orders the customer paid by UPI or QR (that money went to the store). Ask the admin for it.'
          : due === 0 && !settled
            ? 'Nothing to give back yet. When you deliver, the cash from customers minus what you paid at the shop shows here, with a button to pay it to the admin.'
            : 'Everything customers pay goes to the store, delivery and packaging charges too. Give back the rest every day.'}
      </p>
      {due > 0 && (
        <div className="mt-3 space-y-2">
          {store.upi_id && (
            <button type="button" disabled={busy} onClick={() => setShowQr(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[15px] font-semibold text-white disabled:opacity-50">
              <QrCode size={18} /> Pay {rupee(due)} to admin by UPI
            </button>
          )}
          {cashAsk ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => pay('cash')} className="h-11 flex-1 rounded-xl bg-orange-500 text-sm font-semibold text-ink disabled:opacity-50">Yes, gave {rupee(due)} cash</button>
              <button type="button" onClick={() => setCashAsk(false)} className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold">Go back</button>
            </div>
          ) : (
            <button type="button" onClick={() => setCashAsk(true)} className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-muted">
              <Banknote size={16} /> Gave cash to the admin instead
            </button>
          )}
        </div>
      )}
      {showQr && (
        <UpiQr
          order={{ total: due, upi_note: `Jholzo return ${m.name} ${date}` }} store={store}
          footnote={`Money back · ${m.name} · ${dayLabel(date)}`}
          tip={`Pay ${rupee(due)} from your UPI app, then tap “I paid”. The admin checks it in the bank.`}
          paidLabel={`I paid ${rupee(due)}`} apps
          onPaid={() => pay('upi')} onClose={() => setShowQr(false)}
        />
      )}
    </section>
  )
}

// The owner on the rider page: what each rider holds right now (details in Admin → Daily summary).
function RidersMoney({ rows }) {
  return (
    <section className={`${card} mt-3 p-4`}>
      <div className="flex items-center gap-3">
        <HandCoins size={22} className="text-brand" />
        <span className="flex-1 font-semibold">Money with riders</span>
        <Link to="/admin/summary" className="text-xs font-semibold text-muted underline">Details</Link>
      </div>
      {rows.length ? (
        <ul className="mt-2 divide-y divide-line/60 text-sm">
          {rows.map((r) => {
            const due = Number(r.to_return)
            return (
              <li key={r.rider_id} className="flex justify-between py-2">
                <span><b>{r.name}</b> <span className="text-muted">· {r.delivered} delivered</span></span>
                <span className={`font-semibold ${due > 0 ? 'text-orange-700' : due < 0 ? 'text-sky-700' : 'text-emerald-700'}`}>
                  {due > 0 ? `Gives you ${rupee(due)}` : due < 0 ? `You owe ${rupee(-due)}` : 'Settled ✓'}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No rider deliveries yet. Each rider's money to give back shows here.</p>
      )}
    </section>
  )
}

function PartnerRun({ session }) {
  const [date, setDate] = useState(dateStr())
  const { data: orders, error, reload } = useData(() => partnerOrders(date), [date])
  const { data: store } = useData(getStore)
  const { data: money, reload: reloadMoney } = useData(() => riderDayMoney(date), [date])
  const [showList, setShowList] = useState(false)
  const [moneyError, setMoneyError] = useState('')

  // New orders come in while the rider is out: check again every 30 seconds and on return to the page.
  useEffect(() => {
    const again = () => {
      reload()
      reloadMoney()
    }
    const t = setInterval(again, 30000)
    window.addEventListener('focus', again)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', again)
    }
  }, [reload, reloadMoney])

  const all = (orders ?? []).slice().sort((a, b) => ORDER[stageOf(a)] - ORDER[stageOf(b)])
  // A rider: only the orders assigned to them (updates 032, 033). The owner: every order.
  const rider = session.role === 'rider'
  const list = rider ? all.filter((o) => o.rider_id === session.userId || o.delivered_by === session.userId) : all
  const left = list.filter((o) => o.status === 'confirmed')
  const delivered = list.filter((o) => o.status === 'completed').length
  const cash = left.filter((o) => o.payment_method === 'cash').reduce((s, o) => s + o.total, 0)
  // Cash already taken from delivered orders (what the rider should hand over).
  const inHand = list.filter((o) => o.status === 'completed' && o.payment_method === 'cash').reduce((s, o) => s + (o.cash_collected || o.total), 0)

  // Everything still to buy for confirmed orders, added up, with what to pay the shop (update 043): the buy
  // price, or the MRP when there is none yet.
  const shopping = Object.values(
    left.flatMap((o) => o.items).reduce((all, i) => {
      const unit = i.buy_price ?? i.mrp
      const key = `${i.name_snapshot}|${unit ?? ''}`
      all[key] ??= { key, name: i.name_snapshot, quantity: 0, unit: unit == null ? null : Number(unit), atMrp: i.buy_price == null }
      all[key].quantity += i.quantity
      return all
    }, {}),
  ).sort((a, b) => a.name.localeCompare(b.name))
  const priced = shopping.some((s) => s.unit != null)
  const shopTotal = shopping.reduce((t, s) => t + (s.unit ?? 0) * s.quantity, 0)

  const today = dateStr()
  const days = [[today, 'Today'], [addDays(today, 1), 'Tomorrow']]

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-4 font-ui">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">Partner</span>
          {!DEMO_MODE && (
            <button type="button" aria-label="Log out" title={session.email} onClick={adminSignOut} className="flex h-11 w-10 items-center justify-center text-muted"><LogOut size={20} /></button>
          )}
        </div>
      </header>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex flex-1 rounded-full bg-mint p-1">
          {days.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`h-10 flex-1 rounded-full text-sm font-semibold transition-all ${
                date === d ? 'bg-brand text-white shadow-sm' : 'text-ink/70'
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
            <div className="text-xl font-semibold leading-none">{n}</div>
            <div className="mt-1 text-[11px] text-muted">{label}</div>
            {label === 'Cash to collect' && inHand > 0 && <div className="mt-0.5 text-[10px] text-emerald-700">{rupee(inHand)} collected</div>}
          </div>
        ))}
      </section>

      {/* Update 044 in: a rider always sees their money card (₹0 until a delivery); the owner sees every rider. */}
      {Array.isArray(money) && (rider ? (
        <GiveBack
          money={money.find((r) => r.rider_id === session.userId) ?? { name: 'Rider', delivered: 0, cash: 0, shop: 0, returned: 0, earlier: 0, to_return: 0 }}
          date={date} store={store ?? {}} onError={setMoneyError}
        />
      ) : (
        <RidersMoney rows={money} />
      ))}
      {moneyError && <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{moneyError}</p>}

      {shopping.length > 0 && (
        <section className={`${card} mt-3 overflow-hidden`}>
          <button type="button" onClick={() => setShowList(!showList)} className="flex w-full items-center gap-3 p-4 text-left">
            <ShoppingBasket size={20} className="text-brand" />
            <span className="flex-1 font-semibold">Shopping list · {shopping.length} items</span>
            {priced && <span className="font-semibold">{rupee(shopTotal)}</span>}
            <ChevronDown size={20} className={`text-muted transition-transform ${showList ? 'rotate-180' : ''}`} />
          </button>
          {showList && (
            <ul className="divide-y divide-line/60 border-t border-line px-4 text-sm">
              {shopping.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex-1">
                    {s.name}
                    {s.unit != null && (
                      <span className={`block text-xs font-semibold ${s.atMrp ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {s.atMrp ? 'MRP ' : 'Pay '}{rupee(s.unit)}{s.quantity > 1 ? ` × ${s.quantity} = ${rupee(s.unit * s.quantity)}` : ''}{s.atMrp ? ' · bargain, pay less' : ''}
                      </span>
                    )}
                  </span>
                  <b>×{s.quantity}</b>
                </li>
              ))}
              {priced && (
                <li className="flex justify-between py-3 text-base font-semibold"><span>Total at the shop</span><span>{rupee(shopTotal)}</span></li>
              )}
            </ul>
          )}
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error.message}</p>}

      <section className="mt-4">
        {rider && <h2 className="mb-2 text-sm font-semibold text-muted">My orders · {list.length}</h2>}
        <div className="space-y-3">
          {list.map((o) => (
            <PartnerOrderCard key={o.id} order={o} store={store ?? {}} isAdmin={session.role === 'admin'} userId={session.userId} auto={!!store?.whatsapp_auto} />
          ))}
          {orders && !list.length && (
            <p className={`${card} p-8 text-center text-muted`}>
              {rider ? 'No orders for you yet. The order desk assigns them to you, then they show up here.' : 'No orders for this day yet.'}
            </p>
          )}
        </div>
      </section>

      {session.role === 'admin' && (
        <Link to="/admin" className="mt-8 block text-center text-sm text-muted underline">Back to admin</Link>
      )}
    </main>
  )
}
