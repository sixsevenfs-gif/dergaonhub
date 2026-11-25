import { useEffect, useState } from 'react'
import Toggle from '../../../components/Toggle.jsx'
import { lbtnDark, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { rupee } from '../../../lib/format.js'
import { foodSettings, saveFoodSettings } from '../../../lib/foodAdmin.js'
import { NeedsUpdate } from './FoodBits.jsx'

const FIELDS = [
  ['food_delivery_fee', 'Delivery fee (₹)', 'Charged when the dishes are below the free-delivery amount.'],
  ['food_free_delivery_above', 'Free delivery from (₹ of dishes)', 'Dishes worth this much or more get free delivery.'],
  ['food_platform_fee', 'Platform fee (₹ per order)', 'A small fixed fee on every food order. 0 for none.'],
  ['food_gst_percent', 'GST (%)', 'On dishes and packing. Ask your CA: food delivery apps collect 5%.'],
]

// Owner: Food on/off and the bill rules. The apps and the database use these on the next order.
export default function FoodSettings() {
  const { data: saved, error, reload } = useData(foodSettings)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (saved) setForm(saved) }, [saved])

  if (saved === null) return <NeedsUpdate n="064" what="the food bill settings" />
  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
  if (!form) return <p className="text-sm text-neutral-500">Loading…</p>

  const items = 150
  const delivery = items >= Number(form.food_free_delivery_above) ? 0 : Number(form.food_delivery_fee)
  const gst = Math.round((items * Number(form.food_gst_percent)) / 100)
  const total = items + delivery + Number(form.food_platform_fee) + gst

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await saveFoodSettings(form)
      setMsg('Saved. The next food order uses these.')
      reload()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Food settings</h1>
      <div className={`${lcard} flex items-center justify-between gap-3 p-4`}>
        <div>
          <p className="font-bold">Food ordering on</p>
          <p className="text-sm text-neutral-500">Off: the apps still show restaurants, but nobody can place a food order.</p>
        </div>
        <Toggle checked={!!form.food_on} onChange={(v) => setForm({ ...form, food_on: v })} label="Food ordering on" />
      </div>
      <div className={`${lcard} space-y-4 p-4`}>
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} className="block">
            <span className="text-sm font-semibold">{label}</span>
            <input className={`${lfield} mt-1`} inputMode="decimal" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/[^0-9.]/g, '') })} />
            <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
          </label>
        ))}
      </div>
      <div className={`${lcard} p-4 text-sm`}>
        <p className="font-bold">Example: dishes of {rupee(items)}</p>
        <p className="mt-1 text-neutral-600">
          Delivery {delivery ? rupee(delivery) : 'FREE'} · Platform {rupee(Number(form.food_platform_fee) || 0)} · GST {rupee(gst)} → customer pays <b>{rupee(total)}</b> (plus the restaurant's packing charge, if any).
        </p>
      </div>
      {msg && <p className={`rounded-xl p-3 text-sm ${msg.startsWith('Saved') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg}</p>}
      <button type="button" disabled={busy} onClick={save} className={`${lbtnDark} w-full`}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
