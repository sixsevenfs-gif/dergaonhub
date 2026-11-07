import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { Check } from 'lucide-react'
import { upiApps, upiLink } from '../../lib/upi.js'
import { rupee } from '../../lib/format.js'

// Full-screen UPI QR the rider shows at the door: the exact order total and order number are filled in,
// so ₹82.80 arrives as ₹82.80 (no rounding like with cash), straight to the store's UPI ID from Settings.
// The rider also uses it to give the day's money back to the owner: then `order` is { total, upi_note } and the
// texts below say so, and `apps` adds a button per UPI app: the rider pays from this same phone, which can't scan
// its own screen.
export default function UpiQr({ order, store, onPaid, onClose, footnote, tip, paidLabel = 'Customer paid', apps }) {
  const [qr, setQr] = useState('')
  const link = upiLink(order, store)
  const amount = rupee(order.total)

  useEffect(() => {
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0B0B0B', light: '#FFFFFF' } }).then((url) => live && setQr(url))
    return () => {
      live = false
    }
  }, [link])

  return createPortal(
    <div role="dialog" aria-label={`Pay ${amount} by UPI`} className="fixed inset-0 z-[1200] flex flex-col items-center justify-center overflow-y-auto bg-black/85 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center text-neutral-900">
        <p className="text-sm font-semibold text-neutral-500">Scan and pay {store.upi_name || store.name || 'Jholzo'}</p>
        <p className="mt-1 text-5xl font-black tracking-tight">{amount}</p>
        <div className="mx-auto mt-4 aspect-square w-full max-w-[260px]">
          {qr ? <img src={qr} alt={`UPI QR code for ${amount}`} className="h-full w-full" /> : <div className="h-full w-full animate-pulse rounded-xl bg-neutral-100" />}
        </div>
        {apps ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {upiApps(order, store).map((a) => (
              <a key={a.id} href={a.href} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 text-sm font-semibold">
                {a.icon && <img src={a.icon} alt="" className="h-6 w-6 rounded-md" />} {a.name}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-3">
            {['phonepe', 'gpay', 'paytm'].map((id) => <img key={id} src={`/upi/${id}.png`} alt="" className="h-7 w-7 rounded-md" />)}
          </div>
        )}
        <p className="mt-2 text-sm text-neutral-600">{apps ? 'Tap your UPI app · the amount is already filled in' : 'Any UPI app · the amount is already filled in'}</p>
        <p className="mt-1 text-xs text-neutral-500">{footnote ?? `Order #${order.order_number}`} · {store.upi_id}</p>
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {tip ?? `Before you leave, check the customer's phone shows ${amount} paid.`}
        </p>
      </div>
      <div className="mt-3 grid w-full max-w-sm grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-white/40 font-semibold text-white">Close</button>
        <button type="button" onClick={onPaid} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1FAF54] font-semibold text-white">
          <Check size={18} /> {paidLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
