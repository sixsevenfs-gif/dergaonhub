import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BadgeCheck, Check, Clipboard, Clock3, Copy, Smartphone, Timer, XCircle } from 'lucide-react'
import { card } from './ui.js'
import { cancelMyOrder, expireUnpaid, submitUpiRef } from '../lib/store.js'
import { rupee } from '../lib/format.js'
import { upiApps, upiLink } from '../lib/upi.js'

// Soft colour behind each app tile (the app's own colour, very light).
const TILE = {
  phonepe: 'from-[#5F259F]/[0.10] to-[#5F259F]/[0.03] border-[#5F259F]/20',
  gpay: 'from-[#1A73E8]/[0.09] to-[#34A853]/[0.04] border-[#1A73E8]/20',
  paytm: 'from-[#00BAF2]/[0.12] to-[#00BAF2]/[0.03] border-[#00BAF2]/25',
  other: 'from-brand/[0.10] to-brand/[0.03] border-brand/20',
}

const Title = ({ children }) => (
  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="h-2 w-2 rounded-full bg-brand" /> {children}</h2>
)

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1600)
    } catch {
      // clipboard blocked: the text is on screen to type
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={label} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold text-brand shadow-sm ring-1 ring-line">
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Copied' : 'Copy'}
    </button>
  )
}

// "Pay now by UPI" on the order page. There is no gateway: the customer pays to the store's UPI ID
// (PhonePe, Google Pay, Paytm, any UPI app or the QR code), then types the UPI reference number (UTR);
// the admin checks it in the bank app and marks it paid.
// sticky: Cancel and Submit stay at the bottom of the screen (order page; the track page has its own menu there).
export default function PayNow({ order, store, sticky = false }) {
  const [qr, setQr] = useState('')
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const status = order.payment_status
  const link = store?.upi_id ? upiLink(order, store) : ''

  useEffect(() => {
    if (!link || status === 'paid' || status === 'verifying') return
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0B0B0B', light: '#FFFFFF' } }).then((url) => live && setQr(url))
    return () => {
      live = false
    }
  }, [link, status])

  // Pay-by timer (update 023): upi_pay_minutes from placing the order. At zero the order is cancelled.
  const minutes = store?.upi_pay_minutes
  const timed = !!minutes && order.payment_method === 'upi_now' && status === 'awaiting' && order.status === 'placed'
  const deadline = timed ? new Date(order.created_at).getTime() + minutes * 60000 : 0
  const [now, setNow] = useState(() => Date.now())
  const expired = useRef(false)
  useEffect(() => {
    if (!timed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timed])
  const left = timed ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
  useEffect(() => {
    if (left !== 0 || expired.current) return
    expired.current = true
    expireUnpaid().catch(() => {})
  }, [left])

  // Cancelled by the timer: someone who paid late can still give the UTR and get the order back.
  const late = order.status === 'cancelled' && order.cancel_reason === 'Not paid in time'
  if (order.payment_method !== 'upi_now' || (order.status === 'cancelled' && !late)) return null

  if (status === 'paid') {
    return (
      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <BadgeCheck size={28} className="shrink-0 text-emerald-700" />
        <span>
          <span className="block font-semibold text-emerald-700">Payment confirmed ✓</span>
          <span className="text-sm text-muted">We received {rupee(order.total)}. Your order is confirmed.</span>
        </span>
      </section>
    )
  }

  if (status === 'verifying') {
    return (
      <section className="mt-4 rounded-2xl border border-sky-400/40 bg-sky-500/10 p-4">
        <p className="flex items-center gap-2 font-semibold text-sky-700"><Clock3 size={20} /> Checking your payment</p>
        <p className="mt-1 text-sm text-sky-700/80">
          We are matching it with our bank. This usually takes under 10 minutes. We will send your order confirmation on
          WhatsApp as soon as it is confirmed.
        </p>
        <p className="mt-2 text-xs text-muted">UPI Ref No.: {order.upi_ref}</p>
      </section>
    )
  }

  const digits = ref.replace(/\D/g, '')
  const ready = digits.length >= 6
  const send = async (e) => {
    e?.preventDefault()
    if (!ready) return
    setError('')
    setBusy(true)
    try {
      await submitUpiRef(order.order_number, digits)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const found = text.match(/\d{12}/)?.[0] ?? text.replace(/\D/g, '').slice(0, 12)
      if (found) setRef(found)
    } catch {
      setError('Could not paste here. Please type the number.')
    }
  }
  const cancel = async () => {
    if (!window.confirm(`Cancel order #${order.order_number}? Do this only if you have not paid.`)) return
    try {
      await cancelMyOrder(order.order_number)
    } catch (err) {
      setError(err.message)
    }
  }

  const utrBox = (
    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-brand/30 bg-white p-1.5 pl-4 shadow-[0_0_0_4px_rgb(31_107_58/0.06)]">
      <input value={ref} onChange={(e) => setRef(e.target.value)} inputMode="numeric" maxLength={22} placeholder="Type 12 digits here" className="h-10 min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted focus:outline-none" />
      <button type="button" onClick={paste} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white">
        <Clipboard size={15} /> Paste
      </button>
    </div>
  )

  if (late) {
    return (
      <form id="utr-form" onSubmit={send} className={`${card} mt-5 p-4`}>
        <h2 className="font-semibold">Already paid?</h2>
        <p className="mt-1 text-sm text-muted">Enter the 12-digit UPI Ref No. (UTR) from your UPI app. Your order comes back and we check the payment.</p>
        {utrBox}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !ready} className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-brand font-semibold text-white disabled:bg-black/10 disabled:text-muted">
          {busy ? 'Sending…' : 'Bring my order back'}
        </button>
      </form>
    )
  }

  const submitBtn = (
    <button type="submit" form="utr-form" disabled={busy || !ready} className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-brand px-4 text-[15px] font-semibold text-white shadow-[0_6px_16px_rgb(31_107_58/0.25)] disabled:bg-black/10 disabled:text-muted disabled:shadow-none">
      {busy ? 'Sending…' : ready ? 'Submit payment' : 'Submit (enter UTR)'}
    </button>
  )
  const cancelBtn = (
    <button type="button" onClick={cancel} className="h-12 shrink-0 rounded-2xl border border-line bg-white px-5 font-semibold text-ink">Cancel</button>
  )

  return (
    <>
      <section className="mt-4 space-y-4">
        <div className={`${card} flex items-center gap-3 p-3`}>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-muted">Amount to pay · #{order.order_number}</span>
            <span className="flex items-center gap-2">
              <span className="text-[24px] font-bold leading-tight text-brand-dark">{rupee(order.total)}</span>
              <CopyButton text={Number(order.total).toFixed(2)} label="Copy amount" />
            </span>
          </span>
          {left !== null && (
            <span className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center ${left <= 180 ? 'bg-red-500/10 text-red-600' : 'bg-mint text-brand-dark'}`}>
              <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide"><Timer size={12} /> Pay within</span>
              <span className="block text-lg font-bold tabular-nums">
                {left > 0 ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Time over'}
              </span>
            </span>
          )}
        </div>
        {left !== null && (
          <p className="-mt-2 px-1 text-[11px] text-muted">Not paid in {minutes} minutes? The order is cancelled by itself. Paid late? Enter the UTR and it comes back.</p>
        )}

        {status === 'failed' && (
          <p className="flex gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">
            <XCircle size={18} className="mt-0.5 shrink-0" /> We could not find your payment. Please pay again below, or call us.
          </p>
        )}

        <div>
          <Title>Choose an app to pay</Title>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {upiApps(order, store).map((app) => (
              <a
                key={app.id}
                href={app.href}
                className={`relative flex h-12 items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br ${TILE[app.id]} active:scale-[.98]`}
              >
                                <span className="relative flex items-center gap-2">
                  {app.icon ? (
                    <img src={app.icon} alt="" className="h-7 w-7 rounded-full bg-white object-contain p-0.5 shadow-sm" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow-sm"><Smartphone size={14} /></span>
                  )}
                  <span className="text-sm font-semibold text-ink">{app.id === 'other' ? 'Other app' : app.name}</span>
                </span>
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted">Tap an app: amount and order number fill in by themselves.</p>
        </div>

        {qr && (
          <div>
            <Title>Or scan the QR code to pay</Title>
            <div className={`${card} mt-2.5 p-3 text-center`}>
              <img src={qr} alt="UPI QR code" className="mx-auto w-36 rounded-xl border border-line p-1.5" />
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-left text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">UPI ID · {store.upi_name || store.name}</span>
                  <span className="block truncate font-semibold">{store.upi_id}</span>
                </span>
                <CopyButton text={store.upi_id} label="Copy UPI ID" />
              </div>
              <ol className="mt-3 space-y-1 text-left text-xs text-muted">
                <li>1. Scan this QR with the UPI app on another phone.</li>
                <li>2. On this phone, use the app buttons above. A screenshot scanned from the gallery may have a lower limit.</li>
              </ol>
            </div>
          </div>
        )}

        <form id="utr-form" onSubmit={send}>
          <Title>Enter or paste the UTR</Title>
          <p className="mt-1 text-xs text-orange-700">After paying, your UPI app shows a 12-digit UPI Ref No. (UTR). Without it we cannot find your payment.</p>
          {utrBox}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          {!sticky && <div className="mt-3 flex gap-2">{submitBtn}</div>}
        </form>

        <div className="rounded-2xl bg-mint-soft p-4 text-[13px] text-ink/80">
          <Title>Please note</Title>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pay exactly <b>{rupee(order.total)}</b>, only once.</li>
            <li>We check it with our bank and confirm on WhatsApp, usually within 10 minutes.</li>
            <li>Money gone but not sure it worked? Do not pay again. Call us{store.phone ? ` on ${store.phone}` : ''}.</li>
          </ul>
        </div>
      </section>

      {sticky && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">{cancelBtn}{submitBtn}</div>
        </div>
      )}
    </>
  )
}
