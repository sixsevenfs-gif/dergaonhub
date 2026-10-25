import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { btnAccent, card, cx } from '../../components/ui.js'
import { currentCustomer, getOrder, submitComplaint } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { CONFIG } from '../../config.js'

// Customer reports a problem with an order; it shows up in Admin → Complaints.
export default function Report() {
  const { orderNumber } = useParams()
  const me = currentCustomer()
  const { data } = useData(() => getOrder(orderNumber), [orderNumber])
  const [type, setType] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  if (!me) return <Navigate to={`/login?next=/report/${orderNumber}`} replace />
  if (data === undefined) return null

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await submitComplaint({ orderNumber, type, message })
      setSent(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const notMine = data && data.order.customer_phone !== me.phone

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to={`/track/${orderNumber}`} className="flex items-center gap-2 text-muted"><ArrowLeft size={20} /> Back</Link>
      </header>
      <h1 className="mt-5 text-3xl font-black">Report a problem</h1>
      <p className="text-muted">Order #{orderNumber}</p>

      {!data || notMine ? (
        <p className={`${card} mt-4 p-4 text-muted`}>
          {data ? `Ye order +91 ${me.phone} ka nahi hai. Jis number se order kiya tha, usse login karo.` : 'Order nahi mila.'}
        </p>
      ) : sent ? (
        <section className={`${card} mt-4 p-6 text-center`}>
          <Check size={44} className="mx-auto text-accent" />
          <p className="mt-3 text-lg font-bold">Complaint mil gayi!</p>
          <p className="text-muted">Hum jaldi dekh ke aapse baat karenge.</p>
          <Link to={`/track/${orderNumber}`} className={`${btnAccent} mt-5`}>Order dekho</Link>
        </section>
      ) : (
        <form onSubmit={submit} className={`${card} mt-4 space-y-4 p-4`}>
          <div>
            <span className="mb-2 block text-sm text-muted">Kya problem hai?</span>
            <div className="flex flex-wrap gap-2">
              {CONFIG.COMPLAINT_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={cx('h-10 rounded-full border px-3 text-sm font-semibold', type === t ? 'border-accent bg-accent text-ink' : 'border-line text-muted')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Thoda detail mein batao</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Jaise: chai ka packet nahi mila" className="w-full rounded-xl border border-line bg-ink p-3 text-white placeholder:text-muted/60 focus:border-accent focus:outline-none" />
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={!type} className={`${btnAccent} h-14`}>Send complaint</button>
        </form>
      )}
    </main>
  )
}
