import { useState } from 'react'
import { BellRing, Check, MapPinOff } from 'lucide-react'
import { field } from './ui.js'
import { currentCustomer, joinWaitlist } from '../lib/store.js'
import { getSavedDetails } from '../lib/customerLocation.js'

// Shown when the customer's pin is outside the delivery radius.
// "Notify me" adds them to the admin Waitlist so they can be told when delivery starts there.
export default function OutOfArea({ location, label, km, compact = false }) {
  const saved = getSavedDetails()
  const me = currentCustomer()
  const [phone, setPhone] = useState(me?.phone || saved.phone || '')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const notify = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await joinWaitlist({ phone, name: me?.name || saved.name || '', location, label, km })
      setDone(true)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="font-ui rounded-xl border border-orange-400/30 bg-orange-500/[0.07] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-200">
        <MapPinOff size={15} className="shrink-0" /> Not delivering here yet{km ? ` · ${km} km away` : ''}
      </p>
      {!compact && <p className="mt-0.5 text-xs text-orange-100/70">Leave your number and we'll WhatsApp you when we start delivering here.</p>}
      {done ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent"><Check size={15} /> Thanks! We will let you know.</p>
      ) : (
        <form onSubmit={notify} className="mt-2 flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="10 digit number" className={`${field} h-9 rounded-lg px-3 text-sm`} />
          <button type="submit" className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-bold text-ink">
            <BellRing size={14} /> Notify me
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}
