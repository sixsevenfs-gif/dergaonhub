import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Printer, Repeat, ShoppingBasket } from 'lucide-react'
import DeliveredButton from '../../components/DeliveredButton.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { deliverySheet, reopenOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, dayLabel, rupee } from '../../lib/format.js'

// The evening run: first the shopping list (buy everything in one trip), then deliveries by area.
export default function DeliverySheet() {
  const [date, setDate] = useState(dateStr())
  const { data } = useData(() => deliverySheet(date), [date])
  if (!data) return null
  const all = data.groups.flatMap((g) => g.orders)
  const toCollect = all.filter((o) => o.payment_method === 'cash' && o.status !== 'completed').reduce((s, o) => s + o.total, 0)
  const unconfirmed = all.filter((o) => o.status === 'placed').length

  return (
    <div className="space-y-5">
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

      {unconfirmed > 0 && (
        <Link to="/admin/orders" className="block rounded-xl bg-orange-50 p-3 text-sm text-orange-800 print:hidden">
          {unconfirmed} order abhi confirm nahi hue. Pehle call karke confirm karo, phir saman kharido.
        </Link>
      )}

      {data.shopping.length > 0 && (
        <section className={`${lcard} p-4`}>
          <h2 className="flex items-center gap-2 font-bold"><ShoppingBasket size={20} /> Shopping list (ek baar mein sab kharido)</h2>
          <div className="mt-2 divide-y divide-neutral-100 text-sm">
            {data.shopping.map((s) => (
              <label key={s.name} className="flex items-center gap-3 py-2">
                <input type="checkbox" className="h-5 w-5 accent-neutral-900" />
                <span className="flex-1">{s.name}</span>
                <span className="font-bold">× {s.quantity}</span>
                <span className="w-16 text-right text-neutral-500">{rupee(s.cost)}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-right text-sm text-neutral-500">Site price se total: {rupee(data.shopping.reduce((t, s) => t + s.cost, 0))}</p>
        </section>
      )}

      {data.groups.map((g) => (
        <section key={g.area}>
          <h2 className="mb-2 font-bold">{g.area} ({g.orders.length})</h2>
          <div className="space-y-2">
            {g.orders.map((o) => {
              const done = o.status === 'completed'
              return (
                <div key={o.id} className={`${lcard} p-4 ${done ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{o.customer_name}</b> <StatusBadge status={o.status} />
                        <Link to={`/admin/orders/${o.id}`} className="text-sm text-neutral-500 underline">#{o.order_number}</Link>
                      </div>
                      <a href={`tel:${o.customer_phone}`} className="mt-0.5 flex items-center gap-1 text-sm font-semibold underline"><Phone size={14} /> {o.customer_phone}</a>
                      <p className="text-sm">{o.address}</p>
                      <p className="mt-1 text-sm text-neutral-600">{o.items.map((i) => `${i.name_snapshot} ×${i.quantity}`).join(', ')}</p>
                      {!o.allow_substitute && <p className="flex items-center gap-1 text-xs font-semibold text-orange-600"><Repeat size={12} /> Sirf yahi brand</p>}
                      {o.note && <p className="text-sm text-neutral-600">Note: {o.note}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black">{rupee(o.total)}</div>
                      <div className={`text-sm font-semibold ${o.payment_method === 'cash' ? 'text-orange-600' : 'text-blue-700'}`}>
                        {o.payment_method === 'cash' ? 'Collect cash' : 'UPI on delivery'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 print:hidden">
                    {o.status === 'confirmed' && <DeliveredButton order={o} items={o.items} className="w-full" />}
                    {done && <button type="button" onClick={() => reopenOrder(o.id)} className={`${lbtnOutline} w-full`}>Undo delivered</button>}
                    {o.status === 'placed' && <p className="text-xs text-orange-600">Pehle confirm karo.</p>}
                  </div>
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
