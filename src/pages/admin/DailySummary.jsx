import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { lbtnDark, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { dailySummary, setDailyExpense } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, dayLabel, rupee } from '../../lib/format.js'

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? 'text-lg font-black' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-neutral-500'}>{label}</span>
      <span className={strong ? '' : 'font-semibold'}>{value}</span>
    </div>
  )
}

function ExpenseForm({ date, summary }) {
  const [amount, setAmount] = useState(summary.spent ? String(summary.spent) : '')
  const [note, setNote] = useState(summary.spentNote)
  const [msg, setMsg] = useState('')
  const save = async (e) => {
    e.preventDefault()
    try {
      await setDailyExpense(date, amount || 0, note)
      setMsg('Saved')
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <form onSubmit={save} className={`${lcard} space-y-3 p-4`}>
      <h2 className="font-bold">Aaj dukaan pe kitna kharch hua?</h2>
      <p className="text-sm text-neutral-500">Saare dukaan ke bill jod ke daalo. Petrol bhi jod sakte ho.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={lfield} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sharma + Nath store" className={lfield} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className={lbtnDark}>Save</button>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>
    </form>
  )
}

// Money for one day: collected from customers, spent at shops, and what is left.
export default function DailySummary() {
  const [date, setDate] = useState(dateStr())
  const { data: s } = useData(() => dailySummary(date), [date])
  if (!s) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Daily summary · {dayLabel(date)}</h1>
          <p className="text-sm text-neutral-600">Sirf delivered orders gine jaate hain.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${lfieldBase} w-40`} />
      </div>

      <section className={`${lcard} divide-y divide-neutral-100 px-4 py-2`}>
        <Row label="Orders (delivered / all)" value={`${s.delivered} / ${s.orders}`} />
        <Row label="Cancelled (no-show)" value={`${s.cancelled} (${s.noShows})`} />
        <Row label="Cash collected" value={rupee(s.cash)} />
        <Row label="UPI received" value={rupee(s.upi)} />
        <Row label="Delivery fees (inme shaamil)" value={rupee(s.fees)} />
        <Row label="Total aaya" value={rupee(s.collected)} strong />
        <Row label="Dukaan pe kharch" value={`− ${rupee(s.spent)}`} />
        <Row label={s.profit >= 0 ? 'Aaj ki kamai' : 'Aaj ka ghata'} value={rupee(s.profit)} strong />
      </section>

      <ExpenseForm key={date} date={date} summary={s} />
    </div>
  )
}
