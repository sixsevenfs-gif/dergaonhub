import { useEffect, useState } from 'react'
import { LocateFixed, UserPlus } from 'lucide-react'
import Field from '../../components/Field.jsx'
import Toggle from '../../components/Toggle.jsx'
import LocationPicker from '../../components/LocationPicker.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminAddRider, adminListRiders, getStore, resetDemo, saveStore, setRiderActive } from '../../lib/store.js'
import { currentPosition, packagingFee } from '../../lib/delivery.js'
import { placeName } from '../../lib/customerLocation.js'
import { rupee } from '../../lib/format.js'
import { useData } from '../../lib/useData.js'
import { CONFIG, DEMO_MODE, LEGAL } from '../../config.js'

// Delivery partners: each rider logs in on /partner with their own email + password.
function Riders() {
  const { data: riders, error: loadError } = useData(adminListRiders)
  const [form, setForm] = useState({ email: '', name: '', phone: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const add = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await adminAddRider(form)
      setForm({ email: '', name: '', phone: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className={`${lcard} space-y-3 p-4`}>
      <div>
        <h2 className="font-bold">Delivery partners (riders)</h2>
        <p className="text-sm text-neutral-500">
          Riders open <b>{window.location.host}/partner</b>. They see the day's orders and send delivery messages, nothing else.
          {!DEMO_MODE && ' First create their login in Supabase → Authentication → Users → Add user (tick Auto confirm), then add the same email here.'}
        </p>
      </div>
      {loadError && <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Run supabase/migrations/003_partners.sql in the Supabase SQL Editor first.</p>}
      {riders?.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {riders.map((r) => (
            <li key={r.user_id} className={`flex items-center gap-3 px-3 py-2.5 ${r.active ? '' : 'opacity-50'}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-neutral-500">{r.email}{r.phone ? ` · ${r.phone}` : ''}</span>
              </span>
              <button type="button" onClick={() => setRiderActive(r.user_id, !r.active).catch((err) => setError(err.message))} className={`${lbtnOutline} min-h-9 text-sm`}>
                {r.active ? 'Remove access' : 'Give access'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <input type="email" required placeholder="Login email" value={form.email} onChange={set('email')} className={lfield} />
        <input required placeholder="Name" value={form.name} onChange={set('name')} className={lfield} />
        <input inputMode="numeric" placeholder="Phone" value={form.phone} onChange={set('phone')} className={lfield} />
        <button type="submit" className={lbtnDark}><UserPlus size={17} /> Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}

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
      setLocMsg('Location found. Check the pin and tap Save.')
    } catch (err) {
      setLocMsg(err.message)
    }
  }
  // Example fees with the rates typed so far (before saving).
  const rates = { ...v, per_km_fee: Number(v.per_km_fee) || 0, min_delivery_fee: Number(v.min_delivery_fee) || 0, max_delivery_km: Number(v.max_delivery_km) || 0 }
  const example = (km) => Math.max(rates.min_delivery_fee, Math.ceil(km) * rates.per_km_fee)
  // Place name of the delivery center pin.
  const [centerName, setCenterName] = useState('')
  useEffect(() => {
    let live = true
    placeName(v.location).then((n) => live && setCenterName(n))
    return () => {
      live = false
    }
  }, [v.location])
  const packs = { ...v, ...Object.fromEntries(['pack_fee_low', 'pack_fee_mid', 'pack_fee_high', 'pack_mid_from', 'pack_high_from'].map((k) => [k, Number(v[k]) || 0])) }
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
          <span className="text-sm">
            <b>Show "Powered by {LEGAL.COMPANY}"</b>
            <span className="block text-neutral-500">Under the logo, in the footer and on the PDF bill.</span>
            {v.show_powered_by === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/010_powered_by.sql first.</span>}
          </span>
          {(v.show_powered_by !== undefined || DEMO_MODE) && (
            <Toggle checked={v.show_powered_by !== false} onChange={(on) => setV({ ...v, show_powered_by: on })} label="Show Powered by" />
          )}
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Timing & delivery</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order cut-off" hint="Orders before this go today, later ones tomorrow"><input type="time" value={v.cutoff_time} onChange={set('cutoff_time')} className={lfield} /></Field>
          <div />
          <Field label="Delivery starts"><input type="time" value={v.slot_start} onChange={set('slot_start')} className={lfield} /></Field>
          <Field label="Delivery ends"><input type="time" value={v.slot_end} onChange={set('slot_end')} className={lfield} /></Field>
          <Field label="Minimum order (₹)"><input type="number" min="0" value={v.min_order} onChange={set('min_order')} className={lfield} /></Field>
          {v.daily_order_cap !== undefined || DEMO_MODE ? (
            <Field label="Orders per evening" hint="When full, new orders go to the next free day"><input type="number" min="1" value={v.daily_order_cap ?? 15} onChange={set('daily_order_cap')} className={lfield} /></Field>
          ) : <div />}
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
          <p className="mt-1 text-xs text-neutral-500">To add a new area, add it to AREAS in src/config.js.</p>
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Delivery center and delivery charge</h2>
        <p className="text-sm text-neutral-500">The delivery center is where distance is counted from (your home in Shantipur, Dergaon). Drag the pin or tap the map to move it, then Save.</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <b>Delivery center:</b> {centerName || 'Pinned on map'}
            <span className="block text-xs text-neutral-500">{v.location.lat.toFixed(5)}, {v.location.lng.toFixed(5)}</span>
          </span>
          <button type="button" onClick={fetchMyLocation} className={`${lbtnDark} min-h-9 text-sm`}><LocateFixed size={16} /> Use my current location</button>
        </div>
        {locMsg && <p className="text-xs text-neutral-600">{locMsg}</p>}
        <LocationPicker value={v.location} onChange={(location) => setV({ ...v, location })} start={v.location} className="h-64" />
        <div className="grid grid-cols-3 gap-3">
          <Field label="₹ per km"><input type="number" min="0" value={v.per_km_fee} onChange={set('per_km_fee')} className={lfield} /></Field>
          <Field label="Minimum ₹"><input type="number" min="0" value={v.min_delivery_fee} onChange={set('min_delivery_fee')} className={lfield} /></Field>
          <Field label="Max km" hint="Zone 1 = 4 · Zone 2 = 8 · Zone 3 = 12"><input type="number" min="1" value={v.max_delivery_km} onChange={set('max_delivery_km')} className={lfield} /></Field>
        </div>
        {v.small_order_below !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Small order: items below ₹" hint="Customers see 'Add ₹X more to save on delivery'"><input type="number" min="0" value={v.small_order_below} onChange={set('small_order_below')} className={lfield} /></Field>
            <Field label="Small order delivery ₹" hint="Or the distance charge, if higher. Not free."><input type="number" min="0" value={v.small_order_fee} onChange={set('small_order_fee')} className={lfield} /></Field>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-sm">
            <b>Free delivery (launch offer)</b>
            <span className="block text-neutral-600">No delivery charge on any order inside the area. Customers see the usual charge struck out and "FREE". Turn it off later and Save.</span>
            {v.free_delivery === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/005_free_delivery.sql first.</span>}
          </span>
          {(v.free_delivery !== undefined || DEMO_MODE) && (
            <Toggle checked={!!v.free_delivery} onChange={(on) => setV({ ...v, free_delivery: on })} label="Free delivery" />
          )}
        </div>
        <p className="rounded-xl bg-neutral-100 p-3 text-sm">
          Example: 0.1 km → {rupee(example(0.1))} · 1 km → {rupee(example(1))} · 3 km → {rupee(example(3))} · no delivery beyond {rates.max_delivery_km} km.
          <span className="block text-xs text-neutral-500">Road distance ≈ straight line × 1.3. Petrol ₹110/L, scooter ~40 km/L: a round trip costs about ₹5.5 per km.</span>
        </p>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Packaging charge (by order value)</h2>
        <p className="text-sm text-neutral-500">Added to every order, based on the items total. Customers see it as "Packaging charge".</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label={`Below ₹${packs.pack_mid_from}`}><input type="number" min="0" value={v.pack_fee_low} onChange={set('pack_fee_low')} className={lfield} /></Field>
          <Field label={`₹${packs.pack_mid_from} – ₹${packs.pack_high_from - 1}`}><input type="number" min="0" value={v.pack_fee_mid} onChange={set('pack_fee_mid')} className={lfield} /></Field>
          <Field label={`₹${packs.pack_high_from} and above`}><input type="number" min="0" value={v.pack_fee_high} onChange={set('pack_fee_high')} className={lfield} /></Field>
          <Field label="Middle slab starts at ₹"><input type="number" min="0" value={v.pack_mid_from} onChange={set('pack_mid_from')} className={lfield} /></Field>
          <Field label="Top slab starts at ₹"><input type="number" min="0" value={v.pack_high_from} onChange={set('pack_high_from')} className={lfield} /></Field>
        </div>
        <p className="rounded-xl bg-neutral-100 p-3 text-sm">
          Example: ₹300 order → {rupee(packagingFee(packs, 300))} · ₹650 → {rupee(packagingFee(packs, 650))} · ₹1200 → {rupee(packagingFee(packs, 1200))}
        </p>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Automatic WhatsApp messages</h2>
            <p className="text-sm text-neutral-500">
              When on, customers get "Order placed", "Rider on the way" and "Arriving soon" on WhatsApp without anyone tapping Send.
              Needs the WhatsApp Cloud API set up first (supabase/README.md). When off, the rider page opens WhatsApp with the message ready.
            </p>
          </div>
          {v.whatsapp_auto !== undefined && !DEMO_MODE && (
            <Toggle checked={!!v.whatsapp_auto} onChange={(on) => setV({ ...v, whatsapp_auto: on })} label="Automatic WhatsApp messages" />
          )}
        </div>
        {DEMO_MODE ? (
          <p className="rounded-xl bg-neutral-100 p-3 text-xs text-neutral-600">Demo mode cannot send messages by itself.</p>
        ) : v.whatsapp_auto === undefined && (
          <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Run supabase/migrations/003_partners.sql in the Supabase SQL Editor to use this.</p>
        )}
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
      <Riders />
      {DEMO_MODE && (
        <button type="button" onClick={() => window.confirm('Reset all demo data?') && resetDemo()} className={`${lbtnDanger} w-full`}>
          Reset demo data
        </button>
      )}
    </div>
  )
}
