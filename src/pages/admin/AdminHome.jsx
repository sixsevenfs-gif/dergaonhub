import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import Toggle from '../../components/Toggle.jsx'
import { lcard } from '../../components/ui.js'
import { adminListComplaints, adminListOrders, adminStats, getStore, setPaused } from '../../lib/store.js'
import PaymentCheck from './PaymentCheck.jsx'
import DayReport from './DayReport.jsx'
import { useData } from '../../lib/useData.js'
import { fmtClock, itemsText, rupee, timeAgo } from '../../lib/format.js'

function Stat({ label, value, to, hot }) {
  return (
    <Link to={to} className={`${lcard} block p-4 ${hot ? 'border-2 border-neutral-900 shadow-[0_0_0_3px_#E8FF3A]' : ''}`}>
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </Link>
  )
}

export default function AdminHome() {
  const { data: stats } = useData(adminStats)
  const { data: newOrders = [] } = useData(() => adminListOrders({ status: 'placed' }))
  const { data: complaints = [] } = useData(() => adminListComplaints({ status: 'open' }))
  const { data: allOrders = [] } = useData(() => adminListOrders())
  const { data: store } = useData(getStore)
  // "Pay now by UPI" orders waiting for you to check the bank app.
  // Just marked paid stays here until you close it, so you can send the WhatsApp confirmation.
  const [justPaid, setJustPaid] = useState([])
  const toCheck = allOrders.filter(
    (o) => o.payment_method === 'upi_now' && o.status !== 'cancelled' && (['awaiting', 'verifying', 'failed'].includes(o.payment_status) || justPaid.includes(o.id)),
  )
  if (!stats) return null

  return (
    <div className="space-y-5">
      <section className={`${lcard} flex items-center justify-between gap-3 p-4`}>
        <span>
          <span className="block font-bold">{stats.paused ? 'Store is paused' : 'Store is open'}</span>
          <span className="text-sm text-neutral-500">Pause for rain, holidays or rush days. Customers can't order while paused.</span>
        </span>
        <Toggle checked={!stats.paused} onChange={(open) => setPaused(!open)} label="Store open" />
      </section>

      {(stats.otpOff || (stats.otpLeft != null && stats.otpLeft <= stats.otpAlertAt)) && (
        <Link to="/admin/settings" className={`${lcard} flex items-center justify-between gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800`}>
          <span>
            {stats.otpOff
              ? <><b>OTP is off</b>: SMS could not be sent, customers are ordering without OTP. Recharge Message Central, then turn OTP on.</>
              : <><b>Only {stats.otpLeft} OTPs left.</b> Recharge Message Central, then update the count in Settings.</>}
          </span>
          <ChevronRight size={18} className="shrink-0" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New orders" value={stats.newOrders} to="/admin/orders" hot={stats.newOrders > 0} />
        <Stat label="Today's deliveries" value={stats.todayOrders} to="/admin/delivery" />
        <Stat label="Today's value" value={rupee(stats.todayValue)} to="/admin/summary" />
        <Stat label="Open complaints" value={stats.openComplaints} to="/admin/complaints" hot={stats.openComplaints > 0} />
      </div>

      {toCheck.length > 0 && (
        <section>
          <h2 className="text-lg font-bold">Payments to check ({toCheck.length})</h2>
          <p className="text-sm text-neutral-500">Open your bank or UPI app, find the amount, then tap. Customers see "verifying" until you do (we tell them under 10 minutes).</p>
          <div className="mt-2 space-y-2">
            {toCheck.map((o) => (
              <div key={o.id} className={`${lcard} space-y-2 p-4`}>
                <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-2 font-bold">
                  #{o.order_number} <span className="font-normal text-neutral-500">{o.customer_name} · {fmtClock(o.created_at)}</span>
                </Link>
                <PaymentCheck order={o} store={store} onPaid={(id) => setJustPaid((list) => [...list, id])} />
                {justPaid.includes(o.id) && (
                  <button type="button" onClick={() => setJustPaid((list) => list.filter((x) => x !== o.id))} className="text-xs font-semibold text-neutral-500 underline">
                    Done, hide this
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold">New orders: call and confirm</h2>
        <div className="mt-2 space-y-2">
          {newOrders.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className={`${lcard} flex items-center gap-3 p-4`}>
              <span className="flex-1">
                <span className="flex items-center gap-2 font-bold">#{o.order_number} <StatusBadge status={o.status} /></span>
                <span className="text-sm text-neutral-500">{o.customer_name} · {itemsText(o.item_count)} · {fmtClock(o.created_at)}</span>
              </span>
              <span className="font-bold">{rupee(o.total)}</span>
              <ChevronRight size={18} className="text-neutral-400" />
            </Link>
          ))}
          {!newOrders.length && <p className={`${lcard} p-4 text-neutral-500`}>No new orders.</p>}
        </div>
      </section>

      <DayReport />

      {complaints.length > 0 && (
        <section>
          <h2 className="text-lg font-bold">Open complaints</h2>
          <div className="mt-2 space-y-2">
            {complaints.slice(0, 3).map((k) => (
              <Link key={k.id} to="/admin/complaints" className={`${lcard} block p-4`}>
                <span className="block font-semibold">#{k.order_number} · {k.type}</span>
                <span className="text-sm text-neutral-500">{k.customer_name} · {timeAgo(k.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.outOfStock > 0 && (
        <Link to="/admin/products" className={`${lcard} flex items-center justify-between p-4 text-sm`}>
          <span><b>{stats.outOfStock}</b> products are out of stock</span>
          <ChevronRight size={18} />
        </Link>
      )}
    </div>
  )
}
