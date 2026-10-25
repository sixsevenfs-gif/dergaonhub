import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import Field from '../../components/Field.jsx'
import LocationPicker from '../../components/LocationPicker.jsx'
import { lbtnDanger, lbtnDark, lcard, lfield } from '../../components/ui.js'
import { getStore, resetDemo, saveStore } from '../../lib/store.js'
import { currentPosition } from '../../lib/delivery.js'
import { rupee } from '../../lib/format.js'
import { useData } from '../../lib/useData.js'
import { CONFIG, DEMO_MODE } from '../../config.js'

function SettingsForm({ store }) {
  const [v, setV] = useState({ ...store, whatsapp: store.whatsapp.slice(-10) })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [locMsg, setLocMsg] = useState('')
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const fetchMyLocation = async () => {
    setLocMsg('')
    try {
      setV({ ...v, location: await currentPosition() })
      setLocMsg('Location mil gayi. Pin check karke Save dabao.')
    } catch (err) {
      setLocMsg(err.message)
    }
  }
  // Example fees with the rates typed so far (before saving).
  const rates = { ...v, per_km_fee: Number(v.per_km_fee) || 0, min_delivery_fee: Number(v.min_delivery_fee) || 0, max_delivery_km: Number(v.max_delivery_km) || 0 }
  const example = (km) => Math.max(rates.min_delivery_fee, Math.ceil(km) * rates.per_km_fee)
  const toggleArea = (a) => setV({ ...v, delivery_area: v.delivery_area.includes(a) ? v.delivery_area.filter((x) => x !== a) : [...v.delivery_area, a] })

  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    setError('')
    try {
      await saveStore(v)
      setMsg('Saved!')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Store</h2>
        <Field label="Store name"><input required value={v.name} onChange={set('name')} className={lfield} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (customers call)"><input required inputMode="numeric" value={v.phone} onChange={set('phone')} className={lfield} /></Field>
          <Field label="WhatsApp"><input required inputMode="numeric" value={v.whatsapp} onChange={set('whatsapp')} className={lfield} /></Field>
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Timing & delivery</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order cut-off" hint="Iske pehle ke order aaj, baad ke kal"><input type="time" value={v.cutoff_time} onChange={set('cutoff_time')} className={lfield} /></Field>
          <div />
          <Field label="Delivery starts"><input type="time" value={v.slot_start} onChange={set('slot_start')} className={lfield} /></Field>
          <Field label="Delivery ends"><input type="time" value={v.slot_end} onChange={set('slot_end')} className={lfield} /></Field>
          <Field label="Minimum order (₹)"><input type="number" min="0" value={v.min_order} onChange={set('min_order')} className={lfield} /></Field>
          <div />
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700">Delivery areas</span>
          <div className="flex flex-wrap gap-2">
            {CONFIG.AREAS.map((a) => {
              const on = v.delivery_area.includes(a)
              return (
                <button key={a} type="button" onClick={() => toggleArea(a)} className={`h-10 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
                  {a}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Naya area chahiye toh src/config.js mein AREAS mein jodo.</p>
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Delivery charge (doori ke hisaab se)</h2>
        <p className="text-sm text-neutral-500">Map pe apne ghar (Shantipur, Dergaon) pe pin lagao. Customer ki doori yahin se naapi jaati hai.</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-500">{v.location.lat.toFixed(5)}, {v.location.lng.toFixed(5)}</span>
          <button type="button" onClick={fetchMyLocation} className={`${lbtnDark} min-h-9 text-sm`}><LocateFixed size={16} /> Meri current location</button>
        </div>
        {locMsg && <p className="text-xs text-neutral-600">{locMsg}</p>}
        <LocationPicker value={v.location} onChange={(location) => setV({ ...v, location })} start={v.location} className="h-64" />
        <div className="grid grid-cols-3 gap-3">
          <Field label="₹ per km"><input type="number" min="0" value={v.per_km_fee} onChange={set('per_km_fee')} className={lfield} /></Field>
          <Field label="Minimum ₹"><input type="number" min="0" value={v.min_delivery_fee} onChange={set('min_delivery_fee')} className={lfield} /></Field>
          <Field label="Max km"><input type="number" min="1" value={v.max_delivery_km} onChange={set('max_delivery_km')} className={lfield} /></Field>
        </div>
        <p className="rounded-xl bg-neutral-100 p-3 text-sm">
          Example: 1 km → {rupee(example(1))} · 3 km → {rupee(example(3))} · 5 km → {rupee(example(5))} · {rates.max_delivery_km} km ke baad delivery nahi.
          <span className="block text-xs text-neutral-500">Road doori = seedhi doori × 1.3 (andaza). Petrol ₹110/L, scooty ~40 km/L: aana-jaana ≈ ₹5.5 per km.</span>
        </p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
      <button type="submit" className={`${lbtnDark} h-12 w-full`}>Save changes</button>
    </form>
  )
}

export default function AdminSettings() {
  const { data: store } = useData(getStore)
  if (!store) return null
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Settings</h1>
      <SettingsForm store={store} />
      {DEMO_MODE && (
        <button type="button" onClick={() => window.confirm('Saara demo data reset karna hai?') && resetDemo()} className={`${lbtnDanger} w-full`}>
          Reset demo data
        </button>
      )}
    </div>
  )
}
