import { useState } from 'react'
import { ChevronDown, Gift, PackageCheck, Search, Undo2, Users, WalletMinimal } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDark, lcard, lfield } from '../../components/ui.js'
import { adminGiftAdd, adminGiftCancel, adminWalletAdjust, adminWallets } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone, fmtDateTime, rupee, statusLabel } from '../../lib/format.js'
import { giftMessage, validTill } from '../../lib/wallet.js'
import { toWa, waLink } from '../../lib/whatsapp.js'
import { useRole } from '../../lib/role.js'

const KIND_STYLE = {
  referral_bonus: 'bg-green-100 text-green-800',
  welcome_bonus: 'bg-emerald-100 text-emerald-800',
  order_payment: 'bg-neutral-200 text-neutral-700',
  refund: 'bg-blue-100 text-blue-800',
  admin: 'bg-amber-100 text-amber-800',
}
const GIFT_STATUS = {
  active: ['Active', 'bg-green-100 text-green-800'],
  used: ['Used up', 'bg-neutral-200 text-neutral-700'],
  expired: ['Expired', 'bg-orange-100 text-orange-800'],
  cancelled: ['Taken back', 'bg-red-100 text-red-700'],
}
const ORDER_STATUS = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  placed: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
}

const signed = (n) => `${n >= 0 ? '+' : '−'}${rupee(Math.abs(n))}`
const pad = (n) => String(n).padStart(2, '0')
// <input type="datetime-local"> value for a moment, in this phone's time.
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
// End of the day, n days from today.
const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(23, 59, 0, 0)
  return localInput(d)
}
const VALID_FOR = [[0, 'Today'], [3, '3 days'], [7, '7 days'], [15, '15 days'], [30, '30 days']]
const MIN_PRESETS = [0, 199, 299, 499]
// Ready notes for the gift (the customer sees it in their wallet); "other" opens a box for any occasion.
const NOTE_PRESETS = [['', 'No note'], ["Children's Day special 🎈", "Children's Day special 🎈"], ['other', 'Others']]

// WhatsApp on a Mac turns emoji in a link's text into "�", so there the message is copied and the chat opens empty:
// the owner pastes it (Cmd+V) and the emoji stay right. Phones get the message filled in.
const isMacDesktop = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? '') && !(navigator.maxTouchPoints > 1)

function WhatsAppButton({ customer, amount, expiresAt, label = 'Send on WhatsApp', small = false }) {
  const [copied, setCopied] = useState(false)
  const phone = cleanPhone(customer.phone)
  if (phone.length !== 10) return null
  const text = giftMessage(customer.name, amount, expiresAt)
  const open = async (e) => {
    if (!isMacDesktop) return // the link fills in the message
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 6000)
    } catch {
      // clipboard blocked: open with the text filled in after all
      window.open(waLink(toWa(phone), text), '_blank', 'noreferrer')
      return
    }
    window.open(waLink(toWa(phone)), '_blank', 'noreferrer')
  }
  return (
    <span className={`inline-flex flex-col gap-1 ${small ? '' : 'w-full'}`}>
      <a
        href={waLink(toWa(phone), text)}
        onClick={open}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] font-semibold text-white ${small ? 'h-8 px-2.5 text-xs' : 'min-h-11 w-full px-4 text-sm'}`}
      >
        <WhatsAppIcon size={small ? 15 : 18} /> {label}
      </a>
      {copied && <span className="text-[11px] font-semibold text-green-800">Message copied. In WhatsApp press Cmd + V, then send.</span>}
    </span>
  )
}

// Owner: give gift money with its own rules (update 051): amount, from which items total, until when.
function GiveMoney({ customer }) {
  const [amount, setAmount] = useState('')
  const [minOrder, setMinOrder] = useState('0')
  const [until, setUntil] = useState(() => daysFromNow(7))
  const [noteChoice, setNoteChoice] = useState('')
  const [note, setNote] = useState('') // the occasion typed under Others
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [given, setGiven] = useState(null)

  const value = Number(amount)
  const min = Math.max(0, Math.round(Number(minOrder) || 0))
  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (!(value > 0)) return setError('Enter how much Jholzo Money to give.')
    if (!until || !(new Date(until) > new Date())) return setError('Choose a date and time in the future.')
    if (noteChoice === 'other' && !note.trim()) return setError('Write the occasion name, or choose No note.')
    setBusy(true)
    try {
      await adminGiftAdd(customer.id, { amount: value, minOrder: min, expiresAt: new Date(until), note: noteChoice === 'other' ? note.trim() : noteChoice })
      setGiven({ amount: value, expiresAt: new Date(until).toISOString() })
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const chip = (on) => `h-8 rounded-full border px-3 text-xs font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`

  if (given) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="flex items-center gap-2 font-bold text-green-800"><Gift size={18} /> {rupee(given.amount)} added to {customer.name}</p>
        <p className="mt-1 text-sm text-green-900">Valid till {validTill(given.expiresAt)}. Tell them on WhatsApp (the message does not say the order amount).</p>
        <div className="mt-3 flex gap-2">
          <div className="flex-1"><WhatsAppButton customer={customer} amount={given.amount} expiresAt={given.expiresAt} /></div>
          <button type="button" onClick={() => setGiven(null)} className="min-h-11 rounded-xl border border-green-300 bg-white px-4 text-sm font-semibold text-green-800">Give more</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 font-bold"><Gift size={18} className="text-amber-700" /> Give Jholzo Money</p>
      <p className="mt-0.5 text-xs text-neutral-600">They can use all of it on one order, on the items only (delivery and packaging are still paid).</p>

      <label className="mt-3 block text-xs font-semibold text-neutral-600" htmlFor={`amt-${customer.id}`}>Amount</label>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-neutral-500">₹</span>
        <input id={`amt-${customer.id}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="50" className={`${lfield} pl-7 text-lg font-bold`} />
      </div>

      <label className="mt-3 block text-xs font-semibold text-neutral-600" htmlFor={`min-${customer.id}`}>Works on orders with items of</label>
      <div className="mt-1 flex items-center gap-2">
        <div className="relative w-28 shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-neutral-500">₹</span>
          <input id={`min-${customer.id}`} value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={`${lfield} pl-7 font-semibold`} />
        </div>
        <span className="text-sm text-neutral-600">or more</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MIN_PRESETS.map((m) => (
          <button key={m} type="button" onClick={() => setMinOrder(String(m))} className={chip(min === m)}>{m === 0 ? 'Any order' : `₹${m}+`}</button>
        ))}
      </div>

      <label className="mt-3 block text-xs font-semibold text-neutral-600" htmlFor={`until-${customer.id}`}>Valid till (then it is gone)</label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {VALID_FOR.map(([d, label]) => (
          <button key={d} type="button" onClick={() => setUntil(daysFromNow(d))} className={chip(until === daysFromNow(d))}>{label}</button>
        ))}
      </div>
      <input id={`until-${customer.id}`} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={`${lfield} mt-2`} />

      <p className="mt-3 text-xs font-semibold text-neutral-600">Occasion (the customer sees it)</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {NOTE_PRESETS.map(([v, label]) => (
          <button key={v} type="button" onClick={() => setNoteChoice(v)} className={chip(noteChoice === v)}>{label}</button>
        ))}
      </div>
      {noteChoice === 'other' && (
        <input id={`note-${customer.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Occasion name, e.g. Diwali special" autoFocus className={`${lfield} mt-2`} />
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={`${lbtnDark} mt-3 w-full`}>
        {busy ? 'Saving…' : value > 0 ? `Give ${rupee(value)}${min > 0 ? ` · on ₹${min}+` : ''}` : 'Give Jholzo Money'}
      </button>
    </form>
  )
}

function GiftRow({ gift: g, customer, isOwner }) {
  const [busy, setBusy] = useState(false)
  const [label, cls] = GIFT_STATUS[g.status] ?? GIFT_STATUS.active
  const takeBack = async () => {
    if (!window.confirm(`Take back ${rupee(g.left)} from ${customer.name}? It cannot be used after this.`)) return
    setBusy(true)
    try {
      await adminGiftCancel(g.id)
    } catch (err) {
      window.alert(err.message)
    }
    setBusy(false)
  }
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{rupee(g.amount)} gift</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
          </span>
          <span className="mt-0.5 block text-sm text-neutral-600">
            {g.min_order > 0 ? `On items of ₹${g.min_order}+` : 'On any order'} · {g.status === 'expired' ? 'expired' : 'valid till'} {validTill(g.expires_at)}
          </span>
          {g.note && <span className="block text-xs text-neutral-500">“{g.note}”</span>}
          {g.uses.length > 0 && <span className="block text-xs text-neutral-500">Used: {g.uses.map((u) => `${rupee(u.amount)} on #${u.order_number}`).join(', ')}</span>}
          <span className="block text-[11px] text-neutral-400">Given {fmtDateTime(g.created_at)}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-lg font-black ${g.status === 'active' ? 'text-green-700' : 'text-neutral-400'}`}>{rupee(g.left)}</span>
          <span className="block text-[11px] text-neutral-500">left</span>
        </span>
      </div>
      {g.status === 'active' && (
        <div className="mt-2 flex gap-2">
          <WhatsAppButton customer={customer} amount={g.left} expiresAt={g.expires_at} label="Remind on WhatsApp" small />
          {isOwner && (
            <button type="button" disabled={busy} onClick={takeBack} className="inline-flex h-8 items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-600 disabled:opacity-40">
              <Undo2 size={14} /> Take back
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// Everything the customer ordered: when, what, how much.
function Orders({ orders }) {
  const [all, setAll] = useState(false)
  if (!orders.length) return <p className="text-sm text-neutral-500">No orders yet.</p>
  const shown = all ? orders : orders.slice(0, 3)
  return (
    <>
      <ul className="space-y-2">
        {shown.map((o) => (
          <li key={o.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">#{o.order_number}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${ORDER_STATUS[o.status] ?? 'bg-neutral-100 text-neutral-700'}`}>{statusLabel(o.status)}</span>
              <span className="text-neutral-500">{fmtDateTime(o.created_at)}</span>
            </div>
            {o.for_name && <p className="mt-0.5 text-xs text-neutral-500">For {o.for_name}</p>}
            <ul className="mt-1.5 space-y-0.5 text-sm text-neutral-700">
              {o.items.map((i, n) => (
                <li key={n} className="flex justify-between gap-3"><span className="min-w-0">{i.name} × {i.qty}</span><span className="shrink-0">{rupee(i.total)}</span></li>
              ))}
            </ul>
            <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 border-t border-neutral-100 pt-1.5 text-sm">
              <span className="text-neutral-500">Items {rupee(o.subtotal)}{o.wallet_used > 0 && <> · Jholzo Money −{rupee(o.wallet_used)}</>}</span>
              <span className="font-bold">Paid {rupee(o.total)}{o.payment_method ? ` · ${o.payment_method === 'cash' ? 'Cash' : 'UPI'}` : ''}</span>
            </p>
          </li>
        ))}
      </ul>
      {orders.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-sm font-semibold text-neutral-700 underline underline-offset-4">
          {all ? 'Show fewer' : `Show all ${orders.length} orders`}
        </button>
      )}
    </>
  )
}

// Add money (goodwill for a complaint) or take it back (minus amount), always with a reason. This is the old kind
// of Jholzo Money: up to the per-order limit, no expiry.
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
      <p className="text-xs font-semibold text-neutral-600">Reward money without expiry (used up to the per-order limit). Take back with a minus, e.g. -20</p>
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

function Section({ title, children, right }) {
  return (
    <section className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">{title}</h3>
        {right}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

// Every customer with a delivered order: their Jholzo Money, gifts, orders, and where each rupee came from.
export default function AdminWallet() {
  const { data, error } = useData(adminWallets)
  const [q, setQ] = useState('')
  const [show, setShow] = useState('delivered')
  const [open, setOpen] = useState(null)
  const [history, setHistory] = useState(false)
  const { isOwner } = useRole() // giving or taking back money: the owner only

  if (data === undefined && !error) return null
  const customers = data?.customers ?? []
  const total = data?.total ?? { balance: 0, earned: 0, used: 0, gifts: 0 }
  const query = q.trim().toLowerCase()
  const digits = cleanPhone(q)
  const groups = {
    delivered: customers.filter((c) => c.delivered > 0),
    money: customers.filter((c) => c.balance > 0),
    all: customers,
  }
  const shown = groups[show].filter((c) =>
    !query || c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query) || (digits.length >= 4 && c.phone.includes(digits)),
  )
  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Jholzo Money</h1>
        <p className="text-sm text-neutral-600">Give Jholzo Money to customers who got a delivery, see everything they bought, and where every rupee came from.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="grid grid-cols-3 gap-2">
        {[
          ['Customers hold', total.balance, 'You give this as discount when they use it'],
          ['Gift money active', total.gifts, 'Gifts that have not expired yet'],
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
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setShow('delivered')} className={chip(show === 'delivered')}>Got a delivery ({groups.delivered.length})</button>
        <button type="button" onClick={() => setShow('money')} className={chip(show === 'money')}>Has money ({groups.money.length})</button>
        <button type="button" onClick={() => setShow('all')} className={chip(show === 'all')}>All ({groups.all.length})</button>
      </div>

      <ul className="space-y-2">
        {shown.map((c) => {
          const isOpen = open === c.id
          return (
            <li key={c.id} className={lcard}>
              <button type="button" onClick={() => { setOpen(isOpen ? null : c.id); setHistory(false) }} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-bold text-neutral-700">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-sm text-neutral-500">{c.phone}</span>
                  <span className="block text-xs text-neutral-500">
                    {c.delivered} delivered · {rupee(c.spent)}{c.last_order_at && <> · last {fmtDateTime(c.last_order_at)}</>}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block text-lg font-black ${c.balance > 0 ? 'text-green-700' : 'text-neutral-400'}`}>{rupee(c.balance)}</span>
                  {c.gift_left > 0 && <span className="block text-[11px] font-semibold text-amber-700">gift {rupee(c.gift_left)}</span>}
                </span>
                <ChevronDown size={18} className={`shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                    <span className="flex items-center gap-1"><WalletMinimal size={14} /> Balance {rupee(c.balance)}{c.gift_left > 0 && ` (gift ${rupee(c.gift_left)})`}</span>
                    <span className="flex items-center gap-1"><PackageCheck size={14} /> {c.delivered} delivered of {c.orders.length} orders</span>
                    {c.code && <span>Code <b>{c.code}</b></span>}
                    {c.invited_by && <span className="flex items-center gap-1"><Gift size={14} /> Invited by {c.invited_by}</span>}
                    <span className="flex items-center gap-1"><Users size={14} /> Invited {c.friends} friend{c.friends === 1 ? '' : 's'}</span>
                  </div>

                  {isOwner && <div className="mt-3"><GiveMoney customer={c} /></div>}

                  {c.gifts.length > 0 && (
                    <Section title={`Gifts (${c.gifts.length})`}>
                      <ul className="divide-y divide-neutral-100">
                        {c.gifts.map((g) => <GiftRow key={g.id} gift={g} customer={c} isOwner={isOwner} />)}
                      </ul>
                    </Section>
                  )}

                  <Section title={`Orders (${c.orders.length})`}>
                    <Orders orders={c.orders} />
                  </Section>

                  <Section
                    title={`Money history (${c.entries.length})`}
                    right={(c.entries.length > 0 || isOwner) && (
                      <button type="button" onClick={() => setHistory(!history)} className="text-xs font-semibold text-neutral-700 underline underline-offset-4">{history ? 'Hide' : 'Show'}</button>
                    )}
                  >
                    {c.entries.length === 0 ? (
                      <p className="text-sm text-neutral-500">No invite rewards or refunds yet.</p>
                    ) : history && (
                      <ul className="divide-y divide-neutral-100">
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
                    )}
                    {isOwner && history && <Adjust customer={c} />}
                  </Section>
                </div>
              )}
            </li>
          )
        })}
        {!shown.length && (
          <li className={`${lcard} p-6 text-center text-sm text-neutral-500`}>
            {query ? 'Nobody matches.' : show === 'delivered' ? 'No delivered orders yet. Customers show here after their first delivery.' : 'Nobody here yet.'}
          </li>
        )}
      </ul>
    </div>
  )
}
