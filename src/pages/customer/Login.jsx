import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Phone, ShieldCheck, User } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Wordmark from '../../components/Wordmark.jsx'
import { btnAccent, card, field } from '../../components/ui.js'
import { currentCustomer, customerSignIn, getStore, phoneVerified } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone } from '../../lib/format.js'
import OtpSheet from '../../components/OtpSheet.jsx'

// Customer login: name + phone, and (when OTP is on) a one-time SMS code. The login is kept on this
// phone, so it is asked only once. gate: shown in place of the shop when login is required.
export default function Login({ gate = false }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/account'
  const me = currentCustomer()
  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [error, setError] = useState('')
  const [otpFor, setOtpFor] = useState(null)
  const { data: store } = useData(getStore)

  const signIn = async (verified) => {
    await customerSignIn(phone, name, verified)
    if (!gate) navigate(next, { replace: true }) // in the gate the shop simply appears
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (cleanPhone(phone).length !== 10) throw new Error('Enter a valid 10-digit phone number.')
      if (store?.otp_required) {
        // Verified on this phone before: no new SMS.
        if (await phoneVerified(phone)) return await signIn(true)
        setOtpFor(cleanPhone(phone))
        return
      }
      await signIn(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!gate && me && (!store?.otp_required || me.verified)) return <Navigate to={next} replace />

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4 font-ui">
      {otpFor && (
        <OtpSheet
          phone={otpFor}
          onClose={() => setOtpFor(null)}
          onVerified={() => signIn(true).catch((err) => { setOtpFor(null); setError(err.message) })}
        />
      )}
      {gate ? <header className="flex h-12 items-center"><Wordmark /></header> : <TopBar />}

      {gate ? (
        <>
          <h1 className="mt-10 text-[28px] font-semibold leading-tight">Welcome to <span className="text-brand">Jholzo</span></h1>
          <p className="mt-2 text-muted">Log in once with your phone number to start shopping. You stay logged in on this phone.</p>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-2xl font-semibold">Login</h1>
          <p className="mt-1 text-muted">Enter your phone number to see your orders and report problems.</p>
        </>
      )}

      <form onSubmit={submit} className={`${card} mt-6 space-y-3 p-4`}>
        <label className="flex items-center gap-3 rounded-xl border border-line px-3 focus-within:border-brand">
          <User size={20} className="text-muted" />
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" className={`${field} border-0 bg-transparent px-0 focus:border-0`} />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-line px-3 focus-within:border-brand">
          <Phone size={20} className="text-muted" />
          <span className="text-muted">+91</span>
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel" placeholder="10 digit mobile number" className={`${field} border-0 bg-transparent px-0 focus:border-0`} />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className={`${btnAccent} h-14`}>{store?.otp_required ? 'Send OTP' : 'Continue'}</button>
        {store?.otp_required && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <ShieldCheck size={14} className="text-brand" /> We send a one-time code by SMS. Only once on this phone.
          </p>
        )}
      </form>
    </main>
  )
}
