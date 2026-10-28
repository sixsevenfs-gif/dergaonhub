import { useEffect, useState } from 'react'
import { ArrowLeft, CircleCheck, LocateFixed, MapPin } from 'lucide-react'
import LocationPicker from './LocationPicker.jsx'
import OutOfArea from './OutOfArea.jsx'
import { btnAccent } from './ui.js'
import { currentPosition, deliveryQuote } from '../lib/delivery.js'
import { getSavedLocation, placeName, saveLocation } from '../lib/customerLocation.js'

// Full-screen location page: the pin stays in the middle and the customer moves the map under it.
// "Use current location" flies the map to the phone's position; from there the pin can be adjusted.
export default function LocationSheet({ store, onClose }) {
  const saved = getSavedLocation()
  const [point, setPoint] = useState(saved)
  const [here, setHere] = useState(null)
  const [focus, setFocus] = useState(0)
  const [label, setLabel] = useState(saved?.label ?? null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const locate = async () => {
    setBusy(true)
    setStatus('')
    try {
      const p = await currentPosition()
      setHere(p)
      setPoint({ lat: p.lat, lng: p.lng })
      setFocus((n) => n + 1)
    } catch (err) {
      setStatus(err.denied ? 'Location is turned off for this site. Allow it in your browser, or move the map to your home.' : 'Could not find your location. Move the map to put the pin on your home.')
    }
    setBusy(false)
  }

  // First time (nothing saved yet): go to the phone's location straight away.
  useEffect(() => {
    if (!saved) locate()
    // Runs once when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Name of the place under the pin (e.g. "Shantipur, Dergaon"). null while it is being looked up.
  useEffect(() => {
    if (!point) return
    let live = true
    setLabel(null)
    placeName(point).then((name) => live && setLabel(name))
    return () => {
      live = false
    }
  }, [point])

  const quote = deliveryQuote(store, point)
  const save = () => {
    saveLocation(point, label ?? '')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 sm:p-6" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-white sm:rounded-3xl sm:border sm:border-line" onClick={(e) => e.stopPropagation()}>
        <header className="flex h-14 shrink-0 items-center gap-1 px-2">
          <button type="button" aria-label="Back" onClick={onClose} className="flex h-11 w-11 items-center justify-center"><ArrowLeft size={22} /></button>
          <h2 className="text-lg font-semibold">Select delivery location</h2>
        </header>

        <div className="relative min-h-0 flex-1">
          <LocationPicker value={point} onChange={setPoint} start={store.location} home={store.location} here={here} focus={focus} fixedPin className="h-full [&_.leaflet-bottom]:mb-4" />

          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
            <p className="rounded-lg bg-ink/90 px-3 py-1.5 text-center text-xs leading-snug text-white shadow-lg">
              {point ? 'Move the map to place the pin on your door' : 'Move the map to place the pin on your home'}
            </p>
          </div>

          <button
            type="button"
            onClick={locate}
            disabled={busy}
            className="absolute bottom-8 left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-brand/70 bg-white px-4 text-sm font-semibold text-brand shadow-[0_6px_20px_rgb(0_0_0/0.35)] active:scale-[.98] disabled:opacity-80"
          >
            <LocateFixed size={17} className={busy ? 'animate-pulse' : ''} /> {busy ? 'Finding you...' : 'Use current location'}
          </button>
        </div>

        <div className="relative z-10 -mt-4 shrink-0 rounded-t-3xl border-t border-line bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          {status && <p className="mb-3 rounded-xl bg-orange-500/10 px-3 py-2 text-sm text-orange-700">{status}</p>}

          {point && quote.tooFar ? (
            <OutOfArea location={point} label={label ?? ''} km={quote.km} compact />
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Delivering to</p>
              <div className="mt-2 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><MapPin size={20} /></span>
                <div className="min-w-0 flex-1">
                  {!point ? (
                    <p className="pt-2 font-semibold text-muted">No location chosen yet</p>
                  ) : label === null ? (
                    <div className="space-y-2 pt-1.5">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-black/10" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-black/10" />
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-lg font-semibold leading-tight">{label || 'Pinned location'}</p>
                      <p className="mt-1 flex items-center gap-1 text-sm text-emerald-700"><CircleCheck size={15} /> We deliver here</p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <button type="button" disabled={!point} onClick={save} className={`${btnAccent} mt-4 h-13 text-base`}>
            Confirm location
          </button>
        </div>
      </div>
    </div>
  )
}
