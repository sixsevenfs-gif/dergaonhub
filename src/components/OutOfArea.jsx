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
    <div className="rounded-2xl border border-orange-400/40 bg-orange-500/10 p-4">
      <p className="flex items-center gap-2 font-bold text-orange-200">
        <MapPinOff size={20} className="shrink-0" /> We are currently not available at your location
      </p>
      <p className="mt-1 text-sm text-orange-100/80">
        We will be available soon! {label ? `${label} ` : 'Your location '}({km} km) is outside our delivery area for now.
        {!compact && ' Leave your number and we will tell you on WhatsApp as soon as we start delivering here.'}
      </p>
      {done ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-accent"><Check size={18} /> Thank you! We will inform you soon.</p>
      ) : (
        <form onSubmit={notify} className="mt-3 flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="10 digit number" className={`${field} h-11`} />
          <button type="submit" className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-ink">
            <BellRing size={16} /> Notify me
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}
