import { Navigation } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnOutline, lcard } from '../../components/ui.js'
import { adminListWaitlist, setWaitlistNotified } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime } from '../../lib/format.js'
import { mapsLink } from '../../lib/delivery.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

// People outside the delivery radius who tapped "Notify me". Grouped view helps decide the next area to open.
export default function AdminWaitlist() {
  const { data: list = [] } = useData(adminListWaitlist)
  const waiting = list.filter((w) => !w.notified)
  const byPlace = Object.entries(
    waiting.reduce((acc, w) => {
      const key = w.label || 'Unknown place'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  const message = (w) =>
    `Hello${w.name ? ` ${w.name}` : ''}! Jholzo now delivers to your area${w.label ? ` (${w.label})` : ''}. Order here: ${window.location.origin}`

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Waitlist</h1>
      <p className="text-sm text-neutral-600">
        People outside the delivery area who tapped "Notify me". When you start delivering there (Settings → Max km), tell them on WhatsApp.
      </p>

      {byPlace.length > 0 && (
        <section className={`${lcard} p-4`}>
          <h2 className="font-bold">Most requests from</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {byPlace.map(([place, n]) => (
              <span key={place} className="rounded-full bg-neutral-100 px-3 py-1 text-sm"><b>{n}</b> · {place}</span>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-2">
        {list.map((w) => (
          <div key={w.id} className={`${lcard} flex flex-wrap items-center gap-3 p-4 ${w.notified ? 'opacity-60' : ''}`}>
            <span className="min-w-40 flex-1">
              <span className="block font-semibold">{w.name || 'Customer'} · {w.phone}</span>
              <span className="text-sm text-neutral-500">{w.label || 'Place'} · {w.km} km · {fmtDateTime(w.created_at)}</span>
            </span>
            {w.location && (
              <a href={mapsLink(w.location)} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-9 px-3 text-sm`}><Navigation size={15} /> Map</a>
            )}
            <a href={waLink(toWa(w.phone), message(w))} target="_blank" rel="noreferrer" onClick={() => setWaitlistNotified(w.id, true)} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>
              <WhatsAppIcon size={15} /> {w.notified ? 'Tell again' : 'Tell them'}
            </a>
            {w.notified && (
              <button type="button" onClick={() => setWaitlistNotified(w.id, false)} className="text-xs text-neutral-500 underline">Undo</button>
            )}
          </div>
        ))}
        {!list.length && <p className={`${lcard} p-6 text-center text-neutral-500`}>Nobody on the waitlist yet.</p>}
      </div>
    </div>
  )
}
