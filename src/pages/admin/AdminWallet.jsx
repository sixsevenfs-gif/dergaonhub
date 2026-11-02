import { useState } from 'react'
import { ChevronDown, Gift, Search, Users } from 'lucide-react'
import { lbtnDark, lcard, lfield } from '../../components/ui.js'
import { adminWalletAdjust, adminWallets } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone, fmtDateTime, rupee } from '../../lib/format.js'

const KIND_STYLE = {
  referral_bonus: 'bg-green-100 text-green-800',
  welcome_bonus: 'bg-emerald-100 text-emerald-800',
  order_payment: 'bg-neutral-200 text-neutral-700',
  refund: 'bg-blue-100 text-blue-800',
  admin: 'bg-amber-100 text-amber-800',
}

const signed = (n) => `${n >= 0 ? '+' : '−'}${rupee(Math.abs(n))}`

// Add money (goodwill for a complaint) or take it back (minus amount), always with a reason.
function Adjust({ customer }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminWalletAdjust(customer.id, Number(amount), note)
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form onSubmit={save} className="mt-3 rounded-xl bg-neutral-50 p-3">
      <p className="text-xs font-semibold text-neutral-600">Add money, or take it back with a minus (e.g. 50 or -20)</p>
      <div className="mt-2 flex gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="₹" className={`${lfield} w-24`} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (the customer sees it)" className={`${lfield} min-w-0 flex-1`} />
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !Number(amount) || !note.trim()} className={`${lbtnDark} mt-2 min-h-9 w-full text-sm`}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

// Every customer's Jholzo Money: balance, and where each rupee came from or went.
export default function AdminWallet() {
  const { data, error } = useData(adminWallets)
  const [q, setQ] = useState('')
  const [onlyMoney, setOnlyMoney] = useState(true)
  const [open, setOpen] = useState(null)

  if (data === undefined && !error) return null
  const customers = data?.customers ?? []
  const total = data?.total ?? { balance: 0, earned: 0, used: 0 }
  const query = q.trim().toLowerCase()
  const digits = cleanPhone(q)
  const shown = customers.filter((c) =>
    (!onlyMoney || c.balance > 0) &&
    (!query || c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query) || (digits.length >= 4 && c.phone.includes(digits))),
  )
  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Jholzo Money</h1>
        <p className="text-sm text-neutral-600">Who has how much, and where it came from: invite rewards, welcome rewards, refunds, money you added, and what they used on orders.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="grid grid-cols-3 gap-2">
        {[
          ['Customers hold', total.balance, 'You give this as discount when they use it'],
          ['Given so far', total.earned, 'Rewards, refunds and money added'],
          ['Used on orders', total.used, 'Already taken off their bills'],
        ].map(([label, value, hint]) => (
          <div key={label} className={`${lcard} p-3`}>
            <p className="text-xs font-semibold text-neutral-500">{label}</p>
            <p className="mt-0.5 text-xl font-black">{rupee(value)}</p>
            <p className="mt-0.5 hidden text-[11px] leading-tight text-neutral-500 sm:block">{hint}</p>
          </div>
        ))}
      </div>

      <label className="relative block">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or invite code" className={`${lfield} pl-10`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOnlyMoney(true)} className={chip(onlyMoney)}>Has money ({customers.filter((c) => c.balance > 0).length})</button>
        <button type="button" onClick={() => setOnlyMoney(false)} className={chip(!onlyMoney)}>All with history ({customers.length})</button>
      </div>

      <ul className="space-y-2">
        {shown.map((c) => {
          const isOpen = open === c.id
          return (
            <li key={c.id} className={lcard}>
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-bold text-neutral-700">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-sm text-neutral-500">{c.phone}{c.code && <> · Code <b>{c.code}</b></>}</span>
                </span>
                <span className="text-right">
                  <span className={`block text-lg font-black ${c.balance > 0 ? 'text-green-700' : 'text-neutral-500'}`}>{rupee(c.balance)}</span>
                  <span className="block text-[11px] text-neutral-500">got {rupee(c.earned)} · used {rupee(c.used)}</span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                    {c.invited_by && <span className="flex items-center gap-1"><Gift size={14} /> Invited by {c.invited_by}</span>}
                    <span className="flex items-center gap-1"><Users size={14} /> Invited {c.friends} friend{c.friends === 1 ? '' : 's'}</span>
                  </div>
                  <ul className="mt-3 divide-y divide-neutral-100">
                    {c.entries.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[e.kind] ?? 'bg-neutral-100 text-neutral-700'}`}>{e.label}</span>
                          <span className="mt-0.5 block text-sm">{e.from}</span>
                          <span className="block text-xs text-neutral-500">{fmtDateTime(e.created_at)}</span>
                        </span>
                        <span className={`shrink-0 font-bold ${e.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>{signed(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <Adjust customer={c} />
                </div>
              )}
            </li>
          )
        })}
        {!shown.length && (
          <li className={`${lcard} p-6 text-center text-sm text-neutral-500`}>
            {customers.length ? 'Nobody matches.' : 'No Jholzo Money given yet. It starts with invite rewards after friends’ first delivered orders.'}
          </li>
        )}
      </ul>
    </div>
  )
}
