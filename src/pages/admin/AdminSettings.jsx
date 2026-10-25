import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { lbtnDanger, lbtnDark, lcard, lfield } from '../../components/ui.js'
import { getStore, resetDemo, saveStore } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { CONFIG, DEMO_MODE } from '../../config.js'

function SettingsForm({ store }) {
  const [v, setV] = useState({ ...store, whatsapp: store.whatsapp.slice(-10) })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
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
          <Field label="Delivery fee (₹)"><input type="number" min="0" value={v.delivery_fee} onChange={set('delivery_fee')} className={lfield} /></Field>
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
