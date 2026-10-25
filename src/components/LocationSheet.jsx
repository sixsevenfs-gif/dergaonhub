import { useEffect, useState } from 'react'
import { Check, LocateFixed, MapPin, X } from 'lucide-react'
import LocationPicker from './LocationPicker.jsx'
import OutOfArea from './OutOfArea.jsx'
import { btnAccent } from './ui.js'
import { currentPosition, deliveryQuote } from '../lib/delivery.js'
import { getSavedLocation, placeName, saveLocation } from '../lib/customerLocation.js'
import { rupee } from '../lib/format.js'

// Bottom sheet: finds the phone's location as soon as it opens, shows it on the map,
// lets the customer move the pin, and saves it for checkout.
export default function LocationSheet({ store, onClose }) {
  const saved = getSavedLocation()
  const [point, setPoint] = useState(saved)
  const [label, setLabel] = useState(saved?.label ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const locate = async () => {
    setBusy(true)
    setStatus('Aapki location dhundh rahe hain...')
    try {
      setPoint(await currentPosition())
      setStatus('')
    } catch (err) {
      setStatus(err.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    locate()
    // Runs once when the sheet opens.
  }, [])

  // Name of the place under the pin (e.g. "Shantipur, Dergaon").
  useEffect(() => {
    if (!point) return
    let live = true
    setLabel('')
    placeName(point).then((name) => live && setLabel(name))
    return () => {
      live = false
    }
  }, [point])

  const quote = deliveryQuote(store, point)
  const save = () => {
    saveLocation(point, label)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-black/70" onClick={onClose}>
      <div className="mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-card p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Delivery location</h2>
          <button type="button" aria-label="Band karo" onClick={onClose} className="-mr-2 flex h-10 w-10 items-center justify-center text-muted"><X size={22} /></button>
        </div>

        <button type="button" onClick={locate} disabled={busy} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/60 font-semibold text-accent disabled:opacity-50">
          <LocateFixed size={18} /> {busy ? 'Dhundh rahe hain...' : 'Meri current location'}
        </button>

        <div className="mt-3">
          <LocationPicker value={point} onChange={(p) => { setPoint(p); setStatus('') }} start={store.location} home={store.location} className="h-64" />
        </div>
        <p className="mt-2 text-xs text-muted">{status || 'Pin ko khiska ke ya map pe tap karke apna ghar chuno.'}</p>

        {point && (quote.tooFar ? (
          <div className="mt-3"><OutOfArea location={point} label={label} km={quote.km} /></div>
        ) : (
          <div className="mt-3 rounded-xl bg-white/5 p-3">
            <p className="flex items-center gap-2 font-semibold"><MapPin size={17} className="text-accent" /> {label || 'Chuni hui jagah'}</p>
            <p className="mt-1 text-sm text-muted">{quote.km} km door · Delivery fee <b className="text-accent">{rupee(quote.fee)}</b></p>
          </div>
        ))}

        <button type="button" disabled={!point} onClick={save} className={`${btnAccent} mt-4 h-12 text-base`}>
          <Check size={18} /> Ye location save karo
        </button>
      </div>
    </div>
  )
}
