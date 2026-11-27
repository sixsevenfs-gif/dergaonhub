import { useState } from 'react'
import { Gift, Users } from 'lucide-react'
import { lbtnDark, lcard, lfield } from '../../../components/ui.js'
import { adminCustomerCount, adminGiftAddAll } from '../../../lib/store.js'
import { useData } from '../../../lib/useData.js'
import { rupee } from '../../../lib/format.js'
import { moneyPush, validTill } from '../../../lib/wallet.js'
import { MIN_PRESETS, NOTE_PRESETS, VALID_FOR, chip, daysFromNow } from './form.js'
import NotifyMoney from './NotifyMoney.jsx'

// Owner: the same gift money to every customer at once (update 077), then, only if the owner presses it, one
// notification to all customers in the app.
export default function GiveAll() {
  const { data: count } = useData(adminCustomerCount)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [minOrder, setMinOrder] = useState('0')
  const [until, setUntil] = useState(() => daysFromNow(7))
  const [noteChoice, setNoteChoice] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [given, setGiven] = useState(null)

  const value = Number(amount)
  const min = Math.max(0, Math.round(Number(minOrder) || 0))
  const n = Number(count ?? 0)

  function check(e) {
    e.preventDefault()
    setError('')
    if (count === null) return setError('Run database update 077 first (Supabase → SQL Editor).')
    if (!(value > 0)) return setError('Enter how much Jholzo Money each customer gets.')
    if (value > 1000) return setError('At most ₹1,000 each.')
    if (!until || !(new Date(until) > new Date())) return setError('Choose a date and time in the future.')
    if (noteChoice === 'other' && !note.trim()) return setError('Write the occasion name, or choose No note.')
    setConfirm(true)
  }

  async function give() {
    setConfirm(false)
    setBusy(true)
    try {
      const expiresAt = new Date(until).toISOString()
      const res = await adminGiftAddAll({ amount: value, minOrder: min, expiresAt, note: noteChoice === 'other' ? note.trim() : noteChoice })
      setGiven({ ...res, amount: value, minOrder: min, expiresAt })
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (given) {
    return (
      <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="flex items-center gap-2 font-bold text-green-800"><Gift size={18} /> {rupee(given.amount)} added to {given.customers} customers</p>
        <p className="text-sm text-green-900">{rupee(given.total)} in all, valid till {validTill(given.expiresAt)}. One line is in the Activity log.</p>
        <NotifyMoney everyone note={moneyPush(given.amount, { expiresAt: given.expiresAt, minOrder: given.minOrder })} />
        <button type="button" onClick={() => { setGiven(null); setOpen(false) }} className="text-sm font-semibold text-green-800 underline underline-offset-4">Done</button>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${lcard} flex w-full items-center gap-3 p-4 text-left`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Users size={21} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Give to all customers</span>
          <span className="block text-xs text-neutral-600">The same Jholzo Money to every customer at once{count != null ? ` (${n} customers)` : ''}, then tell them in the app.</span>
        </span>
      </button>
    )
  }

  return (
    <form onSubmit={check} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 font-bold"><Users size={18} className="text-amber-700" /> Give to all customers</p>
      <p className="mt-0.5 text-xs text-neutral-600">Every customer{count != null ? ` (${n})` : ''} gets this gift. Blocked numbers are left out. Each can use it on the items of one order.</p>

      <label className="mt-3 block text-xs font-semibold text-neutral-600" htmlFor="all-amt">Amount for each customer</label>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-neutral-500">₹</span>
        <input id="all-amt" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="20" className={`${lfield} pl-7 text-lg font-bold`} />
      </div>
      {value > 0 && count != null && <p className="mt-1 text-xs font-semibold text-amber-800">{rupee(value)} × {n} = {rupee(value * n)} at most, if everyone uses it.</p>}

      <p className="mt-3 text-xs font-semibold text-neutral-600">Works on orders with items of</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {MIN_PRESETS.map((m) => <button key={m} type="button" onClick={() => setMinOrder(String(m))} className={chip(min === m)}>{m === 0 ? 'Any order' : `₹${m}+`}</button>)}
      </div>

      <label className="mt-3 block text-xs font-semibold text-neutral-600" htmlFor="all-until">Valid till (then it is gone)</label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {VALID_FOR.map(([d, label]) => <button key={d} type="button" onClick={() => setUntil(daysFromNow(d))} className={chip(until === daysFromNow(d))}>{label}</button>)}
      </div>
      <input id="all-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={`${lfield} mt-2`} />

      <p className="mt-3 text-xs font-semibold text-neutral-600">Occasion (customers see it)</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {NOTE_PRESETS.map(([v, label]) => <button key={v} type="button" onClick={() => setNoteChoice(v)} className={chip(noteChoice === v)}>{label}</button>)}
      </div>
      {noteChoice === 'other' && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Occasion name, e.g. Diwali special" className={`${lfield} mt-2`} />}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {confirm ? (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-300 bg-white p-3">
          <p className="text-sm font-bold">Give {rupee(value)} to all {n} customers?</p>
          <p className="text-xs text-neutral-600">{min > 0 ? `On items of ₹${min}+` : 'On any order'}, till {validTill(new Date(until).toISOString())}. You can take a gift back from a customer later, one by one.</p>
          <div className="flex gap-2">
            <button type="button" onClick={give} className={`${lbtnDark} flex-1`}>Yes, give it</button>
            <button type="button" onClick={() => setConfirm(false)} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold">Not now</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={busy} className={`${lbtnDark} flex-1`}>{busy ? 'Giving…' : value > 0 ? `Give ${rupee(value)} to everyone` : 'Give to everyone'}</button>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold">Close</button>
        </div>
      )}
    </form>
  )
}
