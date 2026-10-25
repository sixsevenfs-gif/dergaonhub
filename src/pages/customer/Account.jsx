import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, LogOut, Package } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import { btnAccent, btnOutline, card, cx } from '../../components/ui.js'
import { currentCustomer, customerSignOut, myComplaints, ordersByPhone } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dayLabel, fmtDateTime, rupee, statusLabel } from '../../lib/format.js'

const STATUS_STYLE = {
  placed: 'bg-accent text-ink', confirmed: 'bg-blue-500/20 text-blue-200',
  completed: 'bg-green-500/20 text-green-300', cancelled: 'bg-white/10 text-muted',
}

// "My orders": order history and complaints for the logged-in phone number.
export default function Account() {
  const me = currentCustomer()
  const { data: orders = [] } = useData(() => (me ? ordersByPhone(me.phone) : []), [me?.phone])
  const { data: complaints = [] } = useData(myComplaints, [me?.phone])

  if (!me) return <Navigate to="/login?next=/account" replace />

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">Mere orders</h1>
      <p className="text-muted">{me.name ? `${me.name} · ` : ''}+91 {me.phone}</p>

      <div className="mt-4 space-y-3">
        {orders.map((o) => (
          <Link key={o.id} to={`/track/${o.order_number}`} className={`${card} flex items-center gap-3 p-4`}>
            <Package size={24} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-bold">
                #{o.order_number}
                <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', STATUS_STYLE[o.status])}>{statusLabel(o.status)}</span>
              </span>
              <span className="block text-sm text-muted">{fmtDateTime(o.created_at)} · {o.item_count} items</span>
              <span className="block text-sm text-muted">Delivery {dayLabel(o.delivery_date)}</span>
            </span>
            <span className="font-bold">{rupee(o.total)}</span>
            <ChevronRight size={18} className="text-muted" />
          </Link>
        ))}
        {!orders.length && (
          <div className="py-10 text-center">
            <p className="text-muted">Abhi koi order nahi.</p>
            <Link to="/" className={`${btnAccent} mx-auto mt-4 max-w-60`}>Shopping shuru karo</Link>
          </div>
        )}
      </div>

      {complaints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold">Meri complaints</h2>
          <div className="mt-2 space-y-2">
            {complaints.map((k) => (
              <Link key={k.id} to={`/track/${k.order_number}`} className={`${card} block p-3 text-sm`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">#{k.order_number} · {k.type}</span>
                  <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', k.status === 'open' ? 'bg-orange-500/20 text-orange-300' : 'bg-green-500/20 text-green-300')}>
                    {k.status === 'open' ? 'Dekh rahe hain' : 'Solved'}
                  </span>
                </div>
                {k.admin_note && <p className="mt-1 text-accent">Reply: {k.admin_note}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <button type="button" onClick={customerSignOut} className={`${btnOutline} mt-8 w-full`}><LogOut size={18} /> Logout</button>
    </main>
  )
}
