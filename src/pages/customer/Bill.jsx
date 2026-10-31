import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2 } from 'lucide-react'
import Wordmark, { JholzoText } from '../../components/Wordmark.jsx'
import { btnAccent, btnOutline } from '../../components/ui.js'
import { getOrder } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime, rupee } from '../../lib/format.js'

// The PDF code is big, so it loads only on this page (and starts loading right away).
const loadPdf = () => import('../../lib/billPdf.js')

// /bill/DG-1001: the bill from the WhatsApp message, with "Download PDF" and "Share".
export default function Bill() {
  const { orderNumber } = useParams()
  const { data } = useData(() => getOrder(orderNumber), [orderNumber])
  const [note, setNote] = useState('')
  useEffect(() => {
    loadPdf()
  }, [])

  if (data === undefined) return null
  if (!data) return <main className="mx-auto max-w-md px-4 pt-10 text-muted">Bill #{orderNumber} not found.</main>
  const { order, items } = data

  const download = async () => (await loadPdf()).downloadBill(data)
  const share = async () => {
    const shared = await (await loadPdf()).shareBill(data)
    if (!shared) {
      await download()
      setNote('Sharing is not available here, so the PDF was downloaded instead.')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to={`/track/${order.order_number}`} className="flex items-center gap-2 text-muted"><ArrowLeft size={20} /> Order</Link>
      </header>

      <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-white text-neutral-900">
        <div className="flex items-start justify-between bg-gradient-to-br from-[#2E7D46] to-brand-dark px-5 py-4 text-white">
          <div>
            <JholzoText onBrand className="text-[22px]" />
            <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-white/70">Bill / Receipt</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">#{order.order_number}</div>
            <div className="text-xs text-white/75">{fmtDateTime(order.completed_at ?? order.created_at)}</div>
          </div>
        </div>
        <div className="px-5 py-4">
          {order.customer_name && <div className="font-semibold">{order.customer_name}</div>}
          {order.address && <div className="text-sm text-neutral-500">{order.address}</div>}
          {order.ordered_by_phone && <div className="text-sm text-neutral-500">Ordered by {order.ordered_by_name}</div>}

          <div className="mt-4 border-t border-neutral-200 pt-3 text-sm">
            {items.map((i) => (
              <div key={i.id} className="flex py-1">
                <span className="flex-1">{i.name_snapshot}</span>
                <span className="w-10 text-neutral-500">×{i.quantity}</span>
                <span className="w-16 text-right">{rupee(i.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1 border-t border-neutral-200 pt-3 text-sm text-neutral-600">
            <div className="flex justify-between"><span>Items total</span><span>{rupee(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Delivery charge</span><span>{order.delivery_fee ? rupee(order.delivery_fee) : 'FREE'}</span></div>
            {Number(order.express_fee) > 0 && <div className="flex justify-between"><span>Express delivery</span><span>{rupee(order.express_fee)}</span></div>}
            {order.packaging_fee > 0 && <div className="flex justify-between"><span>Packaging charge</span><span>{rupee(order.packaging_fee)}</span></div>}
            {Number(order.wallet_used) > 0 && <div className="flex justify-between"><span>Jholzo Money</span><span>−{rupee(order.wallet_used)}</span></div>}
          </div>
          <div className="mt-3 flex justify-between rounded-xl bg-neutral-100 px-3 py-2.5 text-lg font-semibold">
            <span>Total</span><span>{rupee(order.total)}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            {order.status === 'completed'
              ? `Paid by ${order.payment_method === 'cash' ? 'cash' : 'UPI'}`
              : `To pay on delivery (${order.payment_method === 'cash' ? 'cash' : 'UPI'})`}
          </p>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={download} className={`${btnAccent} h-12 text-base`}><Download size={18} /> Download</button>
        <button type="button" onClick={share} className={`${btnOutline} h-12`}><Share2 size={18} /> Share</button>
      </div>
      {note && <p className="mt-2 text-center text-xs text-muted">{note}</p>}
      <p className="mt-4 text-center text-xs text-muted">
        Something wrong with an item? <Link to={`/report/${order.order_number}`} className="text-brand underline">Report a problem</Link>
      </p>
    </main>
  )
}
