import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminListComplaints, adminListOrders, reopenComplaint, resolveComplaint } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime } from '../../lib/format.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

function Complaint({ k, orderId }) {
  const [note, setNote] = useState(k.admin_note)
  return (
    <div className={`${lcard} space-y-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-bold">{k.type} <StatusBadge status={k.status} /></div>
          <div className="text-sm text-neutral-500">
            {orderId ? <Link to={`/admin/orders/${orderId}`} className="underline">#{k.order_number}</Link> : `#${k.order_number}`}
            {' · '}{k.customer_name} · {fmtDateTime(k.created_at)}
          </div>
        </div>
      </div>
      {k.message && <p className="rounded-xl bg-neutral-100 p-3 text-sm">{k.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${k.customer_phone}`} className={lbtnOutline}><Phone size={17} /> Call</a>
        <a href={waLink(toWa(k.customer_phone), `Hello ${k.customer_name}, this is Jholzo. We received your complaint about order #${k.order_number}.`)} target="_blank" rel="noreferrer" className={lbtnOutline}>
          <WhatsAppIcon size={17} /> WhatsApp
        </a>
      </div>
      {k.status === 'open' ? (
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reply to the customer, e.g. We will send a new pack tomorrow" className={lfield} />
          <button type="button" onClick={() => resolveComplaint(k.id, note)} className={`${lbtnDark} shrink-0`}>Resolve</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-neutral-600">{k.admin_note ? `Reply: ${k.admin_note}` : 'Resolved'}</span>
          <button type="button" onClick={() => reopenComplaint(k.id)} className={`${lbtnOutline} min-h-9 text-xs`}>Reopen</button>
        </div>
      )}
    </div>
  )
}

export default function AdminComplaints() {
  const [filter, setFilter] = useState('open')
  const { data: complaints = [] } = useData(() => adminListComplaints({ status: filter }), [filter])
  const { data: orders = [] } = useData(adminListOrders)
  const orderId = (num) => orders.find((o) => o.order_number === num)?.id

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Complaints</h1>
      <p className="text-sm text-neutral-500">Sent by customers with "Report a problem". Write a reply and tap Resolve; the customer sees it on their order page.</p>
      <div className="flex gap-2">
        {[['open', 'Open'], ['resolved', 'Resolved'], ['', 'All']].map(([key, label]) => (
          <button key={label} type="button" onClick={() => setFilter(key)} className={`h-9 rounded-full border px-3 text-sm font-semibold ${filter === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {complaints.map((k) => <Complaint key={k.id} k={k} orderId={orderId(k.order_number)} />)}
        {!complaints.length && <p className={`${lcard} p-6 text-center text-neutral-500`}>No complaints. Great!</p>}
      </div>
    </div>
  )
}
