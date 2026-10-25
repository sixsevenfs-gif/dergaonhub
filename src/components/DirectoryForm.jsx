import { useState } from 'react'
import { CONFIG } from '../config.js'
import { submitDirectory } from '../lib/store.js'

const EMPTY = { name: '', category: CONFIG.DIRECTORY_CATEGORIES[0], area: CONFIG.AREAS[0], phone: '', whatsapp: '', hours: '' }

// Used on the public "list your business" page (dark) and in the admin panel (light).
export default function DirectoryForm({ asAdmin = false, fieldClass, buttonClass, labelClass, onDone }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await submitDirectory(form, { asAdmin })
      setForm(EMPTY)
      onDone?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const row = (label, input) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {input}
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-3">
      {row('Business name', <input required value={form.name} onChange={set('name')} className={fieldClass} />)}
      {row('Category', (
        <select value={form.category} onChange={set('category')} className={fieldClass}>
          {CONFIG.DIRECTORY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      ))}
      {row('Area', (
        <select value={form.area} onChange={set('area')} className={fieldClass}>
          {CONFIG.AREAS.map((a) => <option key={a}>{a}</option>)}
        </select>
      ))}
      {row('Phone', <input required inputMode="numeric" value={form.phone} onChange={set('phone')} placeholder="10 digit number" className={fieldClass} />)}
      {row('WhatsApp (optional)', <input inputMode="numeric" value={form.whatsapp} onChange={set('whatsapp')} placeholder="10 digit number" className={fieldClass} />)}
      {row('Hours (optional)', <input value={form.hours} onChange={set('hours')} placeholder="9 AM – 8 PM" className={fieldClass} />)}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" className={buttonClass}>{asAdmin ? 'Add listing' : 'Submit'}</button>
    </form>
  )
}
