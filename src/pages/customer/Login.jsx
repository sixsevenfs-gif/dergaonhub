import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import { btnAccent, card, field } from '../../components/ui.js'
import { currentCustomer, customerSignIn, getStore, phoneVerified } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone } from '../../lib/format.js'
import OtpSheet from '../../components/OtpSheet.jsx'

// My orders login: phone number, plus a one-time SMS code the first time on this phone (if OTP is on).
export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/account'
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')


  const [otpFor, setOtpFor] = useState(null)
  const { data: store } = useData(getStore)

  const signIn = async () => {
    await customerSignIn(phone)
    navigate(next, { replace: true })
  }

  // OTP once per new phone (when switched on in Admin → Settings).
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (cleanPhone(phone).length !== 10) throw new Error('Enter a valid 10-digit phone number.')
      if (store?.otp_required && !(await phoneVerified(phone))) {
        setOtpFor(cleanPhone(phone))
        return
      }
      await signIn()
    } catch (err) {
      setError(err.message)
    }
  }

  if (currentCustomer()) return <Navigate to={next} replace />

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      {otpFor && (
        <OtpSheet phone={otpFor} onClose={() => setOtpFor(null)} onVerified={() => signIn().catch((err) => { setOtpFor(null); setError(err.message) })} />
      )}
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
        <button type="submit" className={`${btnAccent} h-14`}>Continue</button>
        {store?.otp_required && <p className="text-center text-xs text-muted">We will send a one-time code by SMS the first time you use this number on this phone.</p>}
      </form>
    </main>
  )
}
