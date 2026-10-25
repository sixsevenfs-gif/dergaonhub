import Field from '../../components/Field.jsx'
import Toggle from '../../components/Toggle.jsx'
import { lfield } from '../../components/ui.js'
import { CONFIG } from '../../config.js'

// part = "basic" (name, contact) or "delivery" (hours and delivery rules).
export default function ShopFields({ values, onChange, part }) {
  const set = (k) => (e) => onChange({ ...values, [k]: e.target.value })
  const flag = (k) => (v) => onChange({ ...values, [k]: v })
  const toggleArea = (a) =>
    onChange({ ...values, delivery_area: values.delivery_area.includes(a) ? values.delivery_area.filter((x) => x !== a) : [...values.delivery_area, a] })

  if (part === 'basic') {
    return (
      <div className="space-y-3">
        <Field label="Shop name"><input required value={values.name} onChange={set('name')} placeholder="Sharma Grocery Store" className={lfield} /></Field>
        <Field label="Category" hint="Abhi sirf grocery shops order le sakti hain. Baaki business Directory mein free list karo.">
          <select value={values.category} onChange={set('category')} className={lfield}>
            {CONFIG.SHOP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Area">
          <select value={values.area} onChange={set('area')} className={lfield}>
            {CONFIG.AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Address"><input required value={values.address} onChange={set('address')} placeholder="Main Road, near..." className={lfield} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input required inputMode="numeric" value={values.phone} onChange={set('phone')} placeholder="10 digits" className={lfield} /></Field>
          <Field label="WhatsApp"><input required inputMode="numeric" value={values.whatsapp} onChange={set('whatsapp')} placeholder="10 digits" className={lfield} /></Field>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens at"><input type="time" value={values.open_time} onChange={set('open_time')} className={lfield} /></Field>
        <Field label="Closes at"><input type="time" value={values.close_time} onChange={set('close_time')} className={lfield} /></Field>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <span><span className="block font-semibold">Pickup</span><span className="text-sm text-neutral-500">Customer shop se le jaye</span></span>
        <Toggle checked={values.pickup_available} onChange={flag('pickup_available')} label="Pickup" />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <span><span className="block font-semibold">Delivery</span><span className="text-sm text-neutral-500">Shaam ke slot mein ghar tak</span></span>
        <Toggle checked={values.delivery_available} onChange={flag('delivery_available')} label="Delivery" />
      </div>
      {values.delivery_available && (
        <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum order (₹)"><input type="number" min="0" value={values.min_order} onChange={set('min_order')} className={lfield} /></Field>
            <Field label="Delivery fee (₹)"><input type="number" min="0" value={values.delivery_fee} onChange={set('delivery_fee')} className={lfield} /></Field>
          </div>
          <Field label="Order cut-off time" hint="Iske pehle ke orders aaj deliver honge, baad ke kal.">
            <input type="time" value={values.cutoff_time} onChange={set('cutoff_time')} className={lfield} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slot starts"><input type="time" value={values.slot_start} onChange={set('slot_start')} className={lfield} /></Field>
            <Field label="Slot ends"><input type="time" value={values.slot_end} onChange={set('slot_end')} className={lfield} /></Field>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-700">Delivery areas</span>
            <div className="flex flex-wrap gap-2">
              {CONFIG.AREAS.map((a) => {
                const on = values.delivery_area.includes(a)
                return (
                  <button key={a} type="button" onClick={() => toggleArea(a)} className={`h-10 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
