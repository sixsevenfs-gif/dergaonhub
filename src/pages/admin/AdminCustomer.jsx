import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, HandCoins, MapPin, MessageCircle, Phone, Smartphone, UtensilsCrossed, ShoppingBasket } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lbtnDanger, lbtnOutline, lcard } from '../../components/ui.js'
import { adminCustomer, resetNoShows, setCustomerBlocked } from '../../lib/store.js'
import { rupee, timeAgo } from '../../lib/format.js'
import { ENTRY_LABEL } from '../../lib/wallet.js'
import { STATUS as TICKET_STATUS, TOPICS } from '../../lib/support.js'
import { useData } from '../../lib/useData.js'
import { useRole } from '../../lib/role.js'
import { FoodStatus, NeedsUpdate } from './food/FoodBits.jsx'
import { adjustWallet } from './customerActions.js'

const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const dateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const PAY = { cash: 'Cash', upi: 'UPI on delivery', upi_now: 'UPI paid first', qr: 'UPI QR' }
const APP_NAME = { android: 'Android', ios: 'iPhone' }

function Tile({ Icon, label, value, note, tone = 'text-neutral-900' }) {
  return (
    <div className={`${lcard} p-3`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">{Icon && <Icon size={14} />} {label}</div>
      <div className={`mt-1 text-xl font-black ${tone}`}>{value}</div>
      {note && <div className="text-xs text-neutral-500">{note}</div>}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}{count != null && <span className="ml-1.5 text-sm font-semibold text-neutral-500">({count})</span>}</h2>
      {children}
    </section>
  )
}

// One customer, everything in one place (database update 072): orders (grocery and food), money, help requests,
// addresses and the phones the app is on. Owner and executive; money changes and no-show resets stay with the owner.
export default function AdminCustomer() {
  const { customerId } = useParams()
  const { data: p, error } = useData(() => adminCustomer(customerId), [customerId])
  const { isOwner } = useRole()
  const [allOrders, setAllOrders] = useState(false)

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error.message}</p>
  if (p === undefined) return <p className="p-4 text-center text-sm text-neutral-500">Loading…</p>
  if (p === null) return <NeedsUpdate n="072" what="one customer's whole picture: orders, money, help requests and phones" />
  if (p.notFound) return <p className={`${lcard} p-6 text-center text-neutral-600`}>This customer is not here any more.</p>

  const c = p.customer
  const g = p.grocery ?? {}
  const f = p.food ?? {}
  const wallet = (Number(p.wallet?.general) || 0) + (Number(p.wallet?.gifts) || 0)
  const orders = [
    ...p.orders.map((o) => ({ ...o, kind: 'grocery' })),
    ...p.food_orders.map((o) => ({ ...o, kind: 'food' })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const owed = p.orders.filter((o) => Number(o.refund_due) > 0)
  const shownOrders = allOrders ? orders : orders.slice(0, 12)
  const phone = String(c.phone ?? '')

  return (
    <div className="space-y-5">
      <section className={`${lcard} space-y-3 p-4`}>
        <div>
          <h1 className="text-2xl font-black">{c.name || 'No name'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">{phone}</span>
            {c.blocked && <span className="rounded bg-red-100 px-1.5 text-xs font-bold text-red-700">Blocked</span>}
            {p.phones.slice(0, 2).map((ph) => (
              <span key={`${ph.platform}${ph.device_model}`} className="rounded bg-neutral-100 px-1.5 text-xs font-semibold text-neutral-600">{APP_NAME[ph.platform] ?? ph.platform} app</span>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {[`Customer since ${date(c.created_at)}`, c.referral_code && `Invite code ${c.referral_code}`, c.referred_by_name && `Invited by ${c.referred_by_name}`,
              c.invited > 0 && `Invited ${c.invited} ${c.invited === 1 ? 'friend' : 'friends'}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:+91${phone}`} className={`${lbtnOutline} min-h-10 text-sm`}><Phone size={15} /> Call</a>
          <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-10 text-sm`}><MessageCircle size={15} /> WhatsApp</a>
          {isOwner && (
            <button type="button" onClick={() => adjustWallet({ ...c, wallet })} className={`${lbtnOutline} min-h-10 text-sm`}>
              <HandCoins size={15} /> Jholzo Money
            </button>
          )}
          {isOwner && c.no_show_count > 0 && (
            <button type="button" onClick={() => resetNoShows(c.id)} className={`${lbtnOutline} min-h-10 text-sm`}>Reset no-shows</button>
          )}
          <button type="button" onClick={() => setCustomerBlocked(c.id, !c.blocked)} className={`${c.blocked ? lbtnOutline : lbtnDanger} min-h-10 text-sm`}>
            {c.blocked ? 'Unblock' : 'Block'}
          </button>
        </div>
      </section>

      {owed.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>Money to give back:</b> {owed.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className="ml-1 font-semibold underline">#{o.order_number} {rupee(o.refund_due)}</Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile Icon={ShoppingBasket} label="Grocery" value={`${g.orders ?? 0} orders`} note={`${g.completed ?? 0} delivered · ${rupee(g.spent ?? 0)}`} />
        <Tile Icon={UtensilsCrossed} label="Food" value={`${f.orders ?? 0} orders`} note={`${f.delivered ?? 0} delivered · ${rupee(f.spent ?? 0)}`} />
        <Tile Icon={HandCoins} label="Jholzo Money" value={rupee(wallet)} note={Number(p.wallet?.gifts) > 0 ? `${rupee(p.wallet.gifts)} of it is gift money` : 'Balance now'} />
        <Tile label="No-shows" value={c.no_show_count ?? 0} tone={c.no_show_count ? 'text-orange-600' : 'text-neutral-900'}
          note={`${c.cancel_count ?? 0} cancelled by them${g.cancelled ? ` · ${g.cancelled} cancelled in all` : ''}`} />
      </div>

      <Section title="Orders" count={orders.length}>
        <div className={`${lcard} divide-y divide-neutral-100`}>
          {shownOrders.map((o) => (
            <Link key={`${o.kind}${o.id}`} to={o.kind === 'food' ? `/admin/food/orders/${o.id}` : `/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <span className={`rounded px-1.5 text-[11px] font-bold ${o.kind === 'food' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>{o.kind === 'food' ? 'Food' : 'Grocery'}</span>
                  #{o.order_number}
                  {o.kind === 'food' ? <FoodStatus status={o.status} /> : <StatusBadge status={o.status} />}
                  {o.for_someone && <span className="rounded bg-neutral-100 px-1.5 text-[11px] font-semibold text-neutral-600">for someone else</span>}
                </span>
                <span className="block text-sm text-neutral-500">
                  {dateTime(o.created_at)} · {o.kind === 'food' ? o.restaurant_name : `${o.items} ${o.items === 1 ? 'item' : 'items'}`} · {PAY[o.payment_method] ?? o.payment_method}
                  {Number(o.refund_due) > 0 && <span className="font-semibold text-red-700"> · give back {rupee(o.refund_due)}</span>}
                </span>
              </span>
              <span className="font-bold">{rupee(o.total)}</span>
              <ChevronRight size={18} className="shrink-0 text-neutral-400" />
            </Link>
          ))}
          {!orders.length && <p className="p-4 text-sm text-neutral-500">No orders yet.</p>}
        </div>
        {orders.length > shownOrders.length && (
          <button type="button" onClick={() => setAllOrders(true)} className={`${lbtnOutline} w-full`}>Show all {orders.length} orders</button>
        )}
      </Section>

      {(p.tickets.length > 0 || p.complaints.length > 0) && (
        <Section title="Help requests and complaints" count={p.tickets.length + p.complaints.length}>
          <div className={`${lcard} divide-y divide-neutral-100`}>
            {p.tickets.map((t) => {
              const [label, cls] = TICKET_STATUS[t.status] ?? [t.status, 'bg-neutral-100 text-neutral-600']
              return (
                <Link key={t.id} to={`/admin/support/${t.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {t.ticket_number} <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                    </span>
                    <span className="block text-sm text-neutral-500">
                      {TOPICS[t.topic] ?? t.topic}{t.order_number && ` · #${t.order_number}`} · {timeAgo(t.created_at)}
                      {Number(t.refund_amount) > 0 && ` · refund ${rupee(t.refund_amount)}`}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-neutral-400" />
                </Link>
              )
            })}
            {p.complaints.map((k) => (
              <Link key={k.id} to="/admin/complaints" className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-semibold">Website complaint · #{k.order_number} <StatusBadge status={k.status} /></span>
                  <span className="block truncate text-sm text-neutral-500">{k.type} · {timeAgo(k.created_at)}{k.message && ` · ${k.message}`}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-neutral-400" />
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Jholzo Money" count={p.wallet.entries.length || null}>
        <div className={`${lcard} divide-y divide-neutral-100`}>
          {p.wallet.entries.map((e, i) => (
            <div key={e.id ?? i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{ENTRY_LABEL[e.kind] ?? e.kind}{e.order_number && ` · #${e.order_number}`}</span>
                <span className="block text-xs text-neutral-500">{dateTime(e.created_at)}{e.note && ` · ${e.note}`}</span>
              </span>
              <span className={`font-bold ${Number(e.amount) < 0 ? 'text-neutral-700' : 'text-green-700'}`}>{Number(e.amount) > 0 ? '+' : ''}{rupee(e.amount)}</span>
            </div>
          ))}
          {!p.wallet.entries.length && <p className="p-4 text-sm text-neutral-500">No Jholzo Money yet.</p>}
        </div>
      </Section>

      {p.addresses.length > 0 && (
        <Section title="Addresses">
          <div className={`${lcard} divide-y divide-neutral-100`}>
            {p.addresses.map((a) => (
              <div key={`${a.address}${a.area}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <MapPin size={16} className="mt-0.5 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1">
                  <span className="block">{a.address}{a.area && `, ${a.area}`}</span>
                  <span className="text-xs text-neutral-500">{a.times} {a.times === 1 ? 'order' : 'orders'} · last {timeAgo(a.last_at)}</span>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Phones with the app" count={p.phones.length}>
        <div className={`${lcard} divide-y divide-neutral-100`}>
          {p.phones.map((ph, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <Smartphone size={16} className="mt-0.5 shrink-0 text-neutral-400" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{ph.device_model || (APP_NAME[ph.platform] ?? ph.platform)}</span>
                <span className="text-xs text-neutral-500">
                  {APP_NAME[ph.platform] ?? ph.platform} app {ph.app_version}{ph.os_version && ` · ${ph.platform === 'ios' ? 'iOS' : 'Android'} ${ph.os_version}`}
                  {' · '}{ph.logged_in ? 'logged in' : 'logged out'} · last opened {timeAgo(ph.last_seen_at)} · opened {ph.opens} {ph.opens === 1 ? 'time' : 'times'}
                </span>
              </span>
            </div>
          ))}
          {!p.phones.length && <p className="p-4 text-sm text-neutral-500">Not on the app (or orders on the website).</p>}
        </div>
      </Section>

      {p.signup && (
        <p className="text-xs text-neutral-500">
          First login {date(p.signup.first_at)} · last login {timeAgo(p.signup.last_at)} · {p.signup.logins} {p.signup.logins === 1 ? 'login' : 'logins'}
          {p.signup.verified ? ' · phone checked by OTP' : ''}
        </p>
      )}
    </div>
  )
}
