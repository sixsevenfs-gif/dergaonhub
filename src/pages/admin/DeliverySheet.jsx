import { useState } from 'react'
import { Phone, Printer } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { completeOrder, deliverySheet, reopenOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, dayLabel, rupee } from '../../lib/format.js'

// Founder's evening delivery run: all delivery orders for one day, grouped by area.
export default function DeliverySheet() {
  const [date, setDate] = useState(dateStr())
  const { data } = useData(() => deliverySheet(date), [date])
  if (!data) return null
  const all = data.groups.flatMap((g) => g.orders)
  const toCollect = all.filter((o) => o.payment_method === 'cash' && o.status !== 'completed').reduce((s, o) => s + o.total, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Delivery sheet · {dayLabel(date)}</h1>
          <p className="text-neutral-600">
            {data.count} / {data.cap} orders · {all.filter((o) => o.status === 'completed').length} delivered · Cash to collect {rupee(toCollect)}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${lfieldBase} w-40`} />
          <button type="button" onClick={() => window.print()} className={lbtnOutline}><Printer size={17} /> Print</button>
        </div>
      </div>

      {data.groups.map((g) => (
        <section key={g.area}>
          <h2 className="mb-2 font-bold">{g.area} ({g.orders.length})</h2>
          <div className="space-y-2">
            {g.orders.map((o) => {
              const done = o.status === 'completed'
              return (
                <div key={o.id} className={`${lcard} p-4 ${done ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-neutral-300">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={(e) => (e.target.checked ? completeOrder(o.id) : reopenOrder(o.id))}
                        className="h-6 w-6 accent-neutral-900"
                        aria-label="Delivered"
                      />
                    </label>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{o.customer_name}</b> <StatusBadge status={o.status} />
                        <span className="text-sm text-neutral-500">#{o.order_number} · {o.shop_name}</span>
                      </div>
                      <a href={`tel:${o.customer_phone}`} className="mt-0.5 flex items-center gap-1 text-sm font-semibold underline"><Phone size={14} /> {o.customer_phone}</a>
                      <p className="text-sm">{o.address}</p>
                      <p className="mt-1 text-sm text-neutral-600">{o.items.map((i) => `${i.name_snapshot} ×${i.quantity}`).join(', ')}</p>
                      {o.note && <p className="text-sm text-neutral-600">Note: {o.note}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black">{rupee(o.total)}</div>
                      <div className={`text-sm font-semibold ${o.payment_method === 'cash' ? 'text-orange-600' : 'text-blue-700'}`}>
                        {o.payment_method === 'cash' ? 'Collect cash' : 'UPI to shop'}
                      </div>
                    </div>
                  </div>
                  {o.status === 'placed' && <p className="mt-2 text-xs text-orange-600">Shop ne abhi confirm nahi kiya.</p>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
      {!data.count && <p className={`${lcard} p-6 text-center text-neutral-500`}>Is din koi delivery nahi.</p>}
    </div>
  )
}
