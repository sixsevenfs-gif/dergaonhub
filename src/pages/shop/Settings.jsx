import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import ShopFields from './ShopFields.jsx'
import { shopDefaults } from './shopDefaults.js'
import Toggle from '../../components/Toggle.jsx'
import PhotoPicker from '../../components/PhotoPicker.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard } from '../../components/ui.js'
import { resetDemo, saveMyShop, setShopLogo, signOut } from '../../lib/store.js'
import { DEMO_MODE } from '../../config.js'

export default function Settings() {
  const { shop } = useOutletContext()
  const navigate = useNavigate()
  const [values, setValues] = useState(() => shopDefaults(shop))
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    setError('')
    try {
      await saveMyShop(values)
      setMsg('Saved!')
    } catch (err) {
      setError(err.message)
    }
  }

  const togglePause = async (paused) => {
    setValues({ ...values, paused })
    await saveMyShop({ ...values, paused })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Settings</h1>

      <section className={`${lcard} flex items-center gap-4 p-4`}>
        <PhotoPicker photoUrl={shop.logo_url} onSave={setShopLogo} label="logo" className="h-20 w-20" />
        <span>
          <span className="block font-bold">Shop logo</span>
          <span className="text-sm text-neutral-500">Logo ya shop ki photo. Customers ko shop list mein dikhegi.</span>
        </span>
      </section>

      <section className={`${lcard} flex items-center justify-between gap-3 p-4`}>
        <span>
          <span className="block font-bold">Pause shop</span>
          <span className="text-sm text-neutral-500">Chhutti ya bheed ho toh orders band karo. Shop dikhegi par order nahi hoga.</span>
        </span>
        <Toggle checked={!!values.paused} onChange={togglePause} label="Pause shop" />
      </section>

      <form onSubmit={save} className="space-y-4">
        <section className={`${lcard} p-4`}>
          <h2 className="mb-3 font-bold">Shop info</h2>
          <ShopFields values={values} onChange={setValues} part="basic" />
        </section>
        <section className={`${lcard} p-4`}>
          <h2 className="mb-3 font-bold">Hours & delivery</h2>
          <ShopFields values={values} onChange={setValues} part="delivery" />
        </section>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
        <button type="submit" className={`${lbtnDark} h-12 w-full`}>Save changes</button>
      </form>

      <button type="button" onClick={async () => { await signOut(); navigate('/shop/login') }} className={`${lbtnOutline} w-full`}>
        <LogOut size={18} /> Logout
      </button>
      {DEMO_MODE && (
        <button type="button" onClick={() => window.confirm('Saara demo data reset karna hai?') && resetDemo()} className={`${lbtnDanger} w-full`}>
          Reset demo data
        </button>
      )}
    </div>
  )
}
