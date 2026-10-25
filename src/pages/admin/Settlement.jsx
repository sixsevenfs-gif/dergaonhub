import { useState } from 'react'
import { Check } from 'lucide-react'
import { lbtnDark, lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { setSettled, settlementSummary } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, dayLabel, rupee } from '../../lib/format.js'

// Nightly hand-over: cash the founder collected, minus delivery fees he keeps, goes to each shop.
export default function Settlement() {
  const [date, setDate] = useState(dateStr())
  const { data: rows = [] } = useData(() => settlementSummary(date), [date])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Settlement · {dayLabel(date)}</h1>
          <p className="text-sm text-neutral-600">Sirf completed orders gine jaate hain.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${lfieldBase} w-40`} />
      </div>

      {rows.map((r) => (
        <section key={r.shop_id} className={`${lcard} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{r.shop_name}</h2>
            {r.settled && <span className="flex items-center gap-1 text-sm font-semibold text-green-700"><Check size={16} /> Settled</span>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <dt className="text-neutral-500">Orders (completed / all)</dt><dd className="text-right font-semibold sm:col-span-2 sm:text-left">{r.completed} / {r.orders}</dd>
            <dt className="text-neutral-500">Total order value</dt><dd className="text-right font-semibold sm:col-span-2 sm:text-left">{rupee(r.value)}</dd>
            <dt className="text-neutral-500">Cash collected by you</dt><dd className="text-right font-semibold sm:col-span-2 sm:text-left">{rupee(r.cash)}</dd>
            <dt className="text-neutral-500">UPI paid to shop</dt><dd className="text-right font-semibold sm:col-span-2 sm:text-left">{rupee(r.upi)}</dd>
            <dt className="text-neutral-500">Delivery fees (yours)</dt><dd className="text-right font-semibold sm:col-span-2 sm:text-left">{rupee(r.fees)}</dd>
          </dl>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-100 p-3">
            <span className="text-sm text-neutral-600">Amount to hand to shop</span>
            <span className="text-2xl font-black">{rupee(r.hand_to_shop)}</span>
          </div>
          <button type="button" onClick={() => setSettled(date, r.shop_id, !r.settled)} className={`${r.settled ? lbtnOutline : lbtnDark} mt-3 w-full`}>
            {r.settled ? 'Undo settled' : 'Mark settled'}
          </button>
        </section>
      ))}
      {!rows.length && <p className={`${lcard} p-6 text-center text-neutral-500`}>Is din koi order nahi.</p>}
    </div>
  )
}
