import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { lbtnDark, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { confirmRiderReturn, dailySummary, deleteRiderReturn, setDailyExpense } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, dayLabel, fmtClock, rupee } from '../../lib/format.js'
import { useRole } from '../../lib/role.js'

const money = (n) => (n < 0 ? `−${rupee(-n)}` : rupee(n))

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? 'text-lg font-black' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-neutral-500'}>{label}</span>
      <span className={strong ? '' : 'font-semibold'}>{value}</span>
    </div>
  )
}

// Each rider's money for the day (update 044): cash taken − paid at the shop − given back = still to give back.
function RiderMoney({ rows, returns }) {
  const [error, setError] = useState('')
  return (
    <section className={`${lcard} p-4`}>
      <h2 className="font-bold">Money with each rider</h2>
      <p className="text-xs text-neutral-500">What each rider still holds for you: cash from customers − paid at the shop − given back, with the balance from earlier days.</p>
      <div className="mt-1 divide-y divide-neutral-100">
        {rows.map((r) => {
          const due = Number(r.to_return)
          const paid = returns.filter((b) => b.rider_id === r.rider_id)
          return (
            <div key={r.rider_id} className="py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span><b>{r.name}</b> <span className="text-neutral-500">· {r.delivered} delivered</span></span>
                <span className={`font-black ${due > 0 ? 'text-orange-700' : due < 0 ? 'text-sky-700' : 'text-green-700'}`}>
                  {due > 0 ? `To give back ${rupee(due)}` : due < 0 ? `You owe ${rupee(-due)}` : 'Settled ✓'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                This day: cash {rupee(r.cash)} − shop {rupee(r.shop)}{Number(r.returned) > 0 ? ` − given back ${rupee(r.returned)}` : ''}
                {Number(r.earlier) !== 0 && ` · earlier days ${Number(r.earlier) > 0 ? '+' : '−'} ${rupee(Math.abs(r.earlier))}`}
              </p>
              {paid.map((b) => (
                <p key={b.id} className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                  <span className="flex-1">
                    {b.method === 'upi' ? 'UPI' : 'Cash'} {rupee(b.amount)}{b.order_id ? ' (one order)' : ''} · {fmtClock(b.created_at)}
                    {b.confirmed_at ? <b className="text-green-700"> · received ✓</b> : b.method === 'cash' ? <b className="text-orange-700"> · to hand over by 9 PM</b> : ' · check your bank'}
                  </span>
                  {!b.confirmed_at && 'confirmed_at' in b && (
                    <button type="button" onClick={() => confirmRiderReturn(b.id).catch((e) => setError(e.message))} className="rounded-lg bg-neutral-900 px-2 py-1 font-semibold text-white">Got it</button>
                  )}
                  <button type="button" onClick={() => deleteRiderReturn(b.id).catch((e) => setError(e.message))} className="font-semibold text-neutral-400 underline">Remove</button>
                </p>
              ))}
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
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
      <h2 className="font-bold">How much did you spend at the shops?</h2>
      <p className="text-sm text-neutral-500">Add up all shop bills. You can include petrol too.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={lfield} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sharma + Nath store" className={lfield} /></Field>
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
  const { isOwner } = useRole()
  if (!s) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Daily summary · {dayLabel(date)}</h1>
          <p className="text-sm text-neutral-600">Only delivered orders are counted.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${lfieldBase} w-40`} />
      </div>

      <section className={`${lcard} divide-y divide-neutral-100 px-4 py-2`}>
        <Row label="Orders (delivered / all)" value={`${s.delivered} / ${s.orders}`} />
        <Row label="Cancelled (no-show)" value={`${s.cancelled} (${s.noShows})`} />
        <Row label="Cash collected" value={rupee(s.cash)} />
        <Row label="UPI received" value={rupee(s.upi)} />
        <Row label="Delivery charges (included above)" value={rupee(s.fees)} />
        <Row label="Packaging charges (included above)" value={rupee(s.packaging ?? 0)} />
        <Row label="Total received" value={rupee(s.collected)} strong />
        {/* Shop spend and profit: the owner only (the executive sees the sales). */}
        {isOwner && <Row label="Spent at shops" value={`− ${rupee(s.spent)}`} />}
        {isOwner && <Row label={s.profit >= 0 ? 'Profit' : 'Loss'} value={rupee(s.profit)} strong />}
      </section>

      {/* Owner only (update 034): the same day estimated from buy prices, rider pay and bags. */}
      {isOwner && s.byCost && s.delivered > 0 && (
        <section className={`${lcard} divide-y divide-neutral-100 px-4 py-2`}>
          <div className="py-2">
            <h2 className="font-bold">Profit from buy prices <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Only you</span></h2>
            <p className="text-xs text-neutral-500">Estimate from the buy prices in Products and Settings → Costs per order. The box above uses what you really spent at the shops.</p>
          </div>
          <Row label="Items (selling − buy price)" value={money(s.byCost.itemsEarned)} />
          <Row label="Fees (delivery, packaging, express)" value={rupee(s.byCost.fees)} />
          {s.byCost.discount > 0 && <Row label="Jholzo Money used" value={`− ${rupee(s.byCost.discount)}`} />}
          <Row label="Riders + petrol" value={`− ${rupee(s.byCost.rider)}`} />
          <Row label="Bags / packing" value={`− ${rupee(s.byCost.packing)}`} />
          <Row label={s.byCost.profit >= 0 ? 'Profit' : 'Loss'} value={money(s.byCost.profit)} strong />
          <Row label="Per delivered order" value={money(s.byCost.profit / s.byCost.orders)} />
          {s.byCost.missing > 0 && (
            <p className="py-2 text-xs text-amber-800">{s.byCost.missing} item{s.byCost.missing === 1 ? '' : 's'} had no buy price, so their margin isn't counted. Add buy prices in Products.</p>
          )}
        </section>
      )}

      {/* Evening cash handover: each rider gives this much cash (QR and UPI payments are already in the bank). */}
      {isOwner && s.riderMoney?.length > 0 && <RiderMoney rows={s.riderMoney} returns={s.returns ?? []} />}
      {/* Before update 044: cash only. */}
      {isOwner && !s.riderMoney && s.byRider?.length > 0 && (
        <section className={`${lcard} p-4`}>
          <h2 className="font-bold">Cash with each rider</h2>
          <div className="mt-1 divide-y divide-neutral-100">
            {s.byRider.map((r) => (
              <div key={r.name} className="flex items-center justify-between py-2 text-sm">
                <span><b>{r.name}</b> <span className="text-neutral-500">· {r.delivered} delivered</span></span>
                <span className="font-bold">{rupee(r.cash)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shop spend changes the profit: the owner enters it. */}
      {isOwner && <ExpenseForm key={date} date={date} summary={s} />}
    </div>
  )
}
