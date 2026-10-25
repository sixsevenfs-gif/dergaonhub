import { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import ShopFields from './ShopFields.jsx'
import { shopDefaults } from './shopDefaults.js'
import { lbtnDark, lbtnOutline, lcard } from '../../components/ui.js'
import { saveMyShop } from '../../lib/store.js'
import { cleanPhone } from '../../lib/format.js'

const STEPS = ['Shop details', 'Hours & delivery', 'Add products']

export default function CreateShop() {
  const { shop } = useOutletContext()
  const [step, setStep] = useState(0)
  const [values, setValues] = useState(() => shopDefaults())
  const [error, setError] = useState('')

  // Once saved, a new (draft) shop continues to step 3: adding products.
  if (shop) return <Navigate to={shop.status === 'draft' ? '/shop/products/add?onboarding=1' : '/shop'} replace />

  const next = (e) => {
    e.preventDefault()
    setError('')
    if (cleanPhone(values.phone).length !== 10 || cleanPhone(values.whatsapp).length !== 10) {
      setError('Phone aur WhatsApp dono 10 digit ke hone chahiye.')
      return
    }
    setStep(1)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (values.delivery_available && !values.delivery_area.length) {
      setError('Kam se kam ek delivery area chuno.')
      return
    }
    try {
      await saveMyShop(values)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black">Create your shop</h1>
      <ol className="mt-3 flex gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
            <span className={`mt-1 block text-xs ${i === step ? 'font-semibold' : 'text-neutral-500'}`}>{i + 1}. {s}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={step === 0 ? next : save} className={`${lcard} mt-4 space-y-4 p-4`}>
        <ShopFields values={values} onChange={setValues} part={step === 0 ? 'basic' : 'delivery'} />
        <p className="text-xs text-neutral-500">Shop logo baad mein Settings mein add kar sakte ho.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {step === 1 && <button type="button" onClick={() => setStep(0)} className={lbtnOutline}>Back</button>}
          <button type="submit" className={`${lbtnDark} flex-1`}>{step === 0 ? 'Next' : 'Save & add products'}</button>
        </div>
      </form>
    </div>
  )
}
