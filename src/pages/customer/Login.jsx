import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import { btnAccent, card, field } from '../../components/ui.js'
import { currentCustomer, customerSignIn } from '../../lib/store.js'
import { DEMO_MODE } from '../../config.js'

// Demo: phone number only. With the database this becomes phone + OTP.
export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/account'
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  if (currentCustomer()) return <Navigate to={next} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await customerSignIn(phone)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-8 text-3xl font-black">Login</h1>
      <p className="mt-1 text-muted">Enter your phone number to see your orders and report problems.</p>

      <form onSubmit={submit} className={`${card} mt-5 space-y-3 p-4`}>
        <label className="flex items-center gap-3 rounded-xl border border-line px-3 focus-within:border-accent">
          <Phone size={20} className="text-muted" />
          <span className="text-muted">+91</span>
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel" placeholder="10 digit mobile number" className={`${field} border-0 px-0 focus:border-0`} />
        </label>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" className={`${btnAccent} h-14`}>{DEMO_MODE ? 'Continue' : 'Send OTP'}</button>
        {DEMO_MODE && <p className="text-center text-xs text-muted">Demo mode: no OTP yet. Login will use an OTP once the database is connected.</p>}
      </form>
    </main>
  )
}
