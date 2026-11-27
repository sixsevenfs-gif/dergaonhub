import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, Search } from 'lucide-react'
import { lbtnDanger, lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { adminCustomers, resetNoShows, setCustomerBlocked } from '../../lib/store.js'
import { dateStr, rupee, timeAgo } from '../../lib/format.js'
import { downloadCSV } from '../../lib/report.js'
import { useData } from '../../lib/useData.js'
import { CONFIG } from '../../config.js'
import OfferSender from './OfferSender.jsx'
import { useRole } from '../../lib/role.js'
import { adjustWallet } from './customerActions.js'

const FILTERS = [['all', 'All'], ['noshow', 'No-shows'], ['blocked', 'Blocked'], ['money', 'Has Jholzo Money']]
const APP_NAME = { android: 'Android', ios: 'iPhone' }
const STEP = 60

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

// The owner's customer sheet: everyone, with what they ordered and their money (opens in Excel / Google Sheets).
function customersCSV(list) {
  const head = ['Name', 'Phone', 'Joined', 'Grocery orders', 'Delivered', 'Grocery spent', 'Food orders', 'Food spent', 'Jholzo Money',
    'No-shows', 'Blocked', 'Invite code', 'Invited by', 'App', 'Last order']
  const rows = list.map((c) => [
    c.name, c.phone, c.created_at ? dateStr(new Date(c.created_at)) : '', c.orders ?? 0, c.completed ?? 0, c.spent ?? '', c.food_orders ?? '', c.food_spent ?? '',
    c.wallet ?? 0, c.no_show_count ?? 0, c.blocked ? 'Yes' : '', c.referral_code ?? '', c.referred_by_name ?? '', APP_NAME[c.app] ?? '',
    c.last_order_at ? dateStr(new Date(c.last_order_at)) : '',
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export default function AdminCustomers() {
  const [filter, setFilter] = useState('all')
  const [text, setText] = useState('')
  const [shownUpTo, setShownUpTo] = useState(STEP)
  const { data: customers = [], error } = useData(adminCustomers)
  // Jholzo Money changes, resetting no-shows (cash on delivery again) and the sheet stay with the owner.
  const { isOwner } = useRole()

  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const digits = text.replace(/\D/g, '')
  const matches = customers.filter((c) => {
    if (filter === 'noshow' && !(c.no_show_count > 0)) return false
    if (filter === 'blocked' && !c.blocked) return false
    if (filter === 'money' && !(Number(c.wallet) > 0)) return false
    if (!words.length) return true
    const hay = `${c.name} ${c.referral_code ?? ''}`.toLowerCase()
    return (digits.length >= 3 && String(c.phone).includes(digits)) || words.every((w) => hay.includes(w))
  })
  const shown = matches.slice(0, shownUpTo)
  const count = (key) => customers.filter((c) => (key === 'noshow' ? c.no_show_count > 0 : key === 'blocked' ? c.blocked : key === 'money' ? Number(c.wallet) > 0 : true)).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Customers</h1>
          <p className="text-sm text-neutral-600">Tap a customer to see everything: orders, money, help requests and their phones.</p>
        </div>
        {isOwner && (
          <button type="button" disabled={!customers.length} onClick={() => downloadCSV(`jholzo-customers-${dateStr()}.csv`, customersCSV(matches))}
            className={`${lbtnOutline} min-h-10 shrink-0 text-sm`} title="Download the list shown (Excel / Google Sheets)">
            <Download size={15} /> CSV
          </button>
        )}
      </div>
      <OfferSender />
      <p className="text-sm text-neutral-600">
        After {CONFIG.NO_SHOW_LIMIT} no-shows a number can't pay cash on delivery. Blocking a number stops all its orders.
      </p>
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={text} onChange={(e) => { setText(e.target.value); setShownUpTo(STEP) }} placeholder="Name, phone number or invite code"
          aria-label="Find a customer" inputMode="search" className={`${lfieldBase} w-full pl-9`} />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => { setFilter(key); setShownUpTo(STEP) }} aria-pressed={filter === key}
            className={`h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${filter === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
            {label} ({count(key)})
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      <div className={`${lcard} divide-y divide-neutral-100`}>
        {shown.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Link to={`/admin/customers/${c.id}`} className="flex min-w-48 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {c.name || 'No name'}
                  {c.blocked && <span className="ml-1.5 rounded bg-red-100 px-1.5 text-xs font-bold text-red-700">Blocked</span>}
                  {c.app && <span className="ml-1.5 rounded bg-neutral-100 px-1.5 text-xs font-semibold text-neutral-600">{APP_NAME[c.app] ?? c.app}</span>}
                </span>
                <span className="block text-sm text-neutral-500">
                  {c.phone} · {c.orders} {c.orders === 1 ? 'order' : 'orders'}{c.completed ? `, ${c.completed} delivered` : ''}
                  {c.food_orders > 0 && ` · ${c.food_orders} food`}
                </span>
                {(c.last_order_at || c.referral_code || c.referred_by_name) && (
                  <span className="block text-xs text-neutral-500">
                    {[c.last_order_at && `Last order ${timeAgo(c.last_order_at)}`, c.referral_code && `Code ${c.referral_code}`, c.referred_by_name && `Invited by ${c.referred_by_name}`].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <ChevronRight size={18} className="shrink-0 text-neutral-400" />
            </Link>
            {isOwner ? (
              <button type="button" onClick={() => adjustWallet(c)} className={`${lbtnOutline} min-h-9 text-sm`} title="Jholzo Money: add or take back">
                {rupee(c.wallet ?? 0)}
              </button>
            ) : (
              <span className="text-sm text-neutral-500" title="Jholzo Money">{rupee(c.wallet ?? 0)}</span>
            )}
            {c.no_show_count > 0 && <span className="text-sm font-bold text-orange-600">{c.no_show_count} no-show</span>}
            {isOwner && c.no_show_count > 0 && <button type="button" onClick={() => resetNoShows(c.id)} className={`${lbtnOutline} min-h-9 text-sm`}>Reset</button>}
            <button type="button" onClick={() => setCustomerBlocked(c.id, !c.blocked)} className={`${c.blocked ? lbtnOutline : lbtnDanger} min-h-9 text-sm`}>
              {c.blocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        ))}
        {!shown.length && (
          <p className="p-4 text-neutral-500">
            {words.length ? 'No customer matches.' : filter === 'noshow' ? 'No no-shows. Great!' : filter === 'blocked' ? 'Nobody is blocked.' : 'No customers yet.'}
          </p>
        )}
      </div>
      {matches.length > shown.length && (
        <button type="button" onClick={() => setShownUpTo((n) => n + STEP)} className={`${lbtnOutline} w-full`}>
          Show more ({matches.length - shown.length} left)
        </button>
      )}
    </div>
  )
}
