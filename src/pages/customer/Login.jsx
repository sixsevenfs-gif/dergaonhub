import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Phone, ShieldCheck, User } from 'lucide-react'
import { JholzoText } from '../../components/Wordmark.jsx'
import { currentCustomer, customerSignIn, getStore } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { cleanPhone, nameProblem, phoneProblem } from '../../lib/format.js'
import OtpSheet from '../../components/OtpSheet.jsx'

// Brick wall behind the lamp: thin mortar lines, drawn as a small repeating SVG.
const BRICKS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='56'%3E%3Cpath d='M0 1H64M0 29H64M1 1V29M33 29V57' fill='none' stroke='%23ffffff' stroke-opacity='.07' stroke-width='2'/%3E%3C/svg%3E")`
const input = 'h-12 w-full bg-transparent text-[15px] text-white placeholder:text-white/60 focus:outline-none'
const pill = 'flex items-center gap-3 rounded-full border border-white/35 px-5 transition focus-within:border-[#E3C27A]'

// Customer login: name + phone, and (when OTP is on) a one-time SMS code. The login is kept on this
// phone until the customer logs out; after a logout the same number gets a new SMS code.
// gate: shown in place of the cart and account pages for a new customer.
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
    if (!gate) navigate(next, { replace: true }) // in the gate the page simply appears
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const problem = nameProblem(name) || phoneProblem(phone)
      if (problem) throw new Error(problem)
      // Every login sends a fresh code, also for a number verified on this phone before a logout.
      if (store?.otp_required) return setOtpFor(cleanPhone(phone))
      await signIn(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!gate && me && (!store?.otp_required || me.verified)) return <Navigate to={next} replace />

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B1F13] font-ui text-white">
      {otpFor && (
        <OtpSheet
          phone={otpFor}
          onClose={() => setOtpFor(null)}
          onVerified={(skipped) => signIn(!skipped).catch((err) => { setOtpFor(null); setError(err.message) })}
        />
      )}

      {/* Wall, lamp and its warm light */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#163A24_0%,#0F2A19_55%,#0B1F13_100%)]" />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: BRICKS }} />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[680px] -translate-x-1/2 bg-[radial-gradient(ellipse_50%_55%_at_50%_12%,rgb(255_214_140/0.42),rgb(255_200_120/0.12)_55%,transparent_75%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
        <div className="h-14 w-32 bg-gradient-to-b from-[#1E4A2E] to-[#2E6242] [clip-path:polygon(18%_0,82%_0,100%_100%,0_100%)]" />
        <div className="mx-auto h-2 w-28 rounded-b-md bg-[#FFE3A3] shadow-[0_6px_28px_10px_rgb(255_214_140/0.55)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10">
        <header className="flex h-14 items-center justify-between">
          <Link to="/" className="-ml-1 flex items-center gap-1.5 text-sm text-white/75"><ArrowLeft size={18} /> Shop</Link>
        </header>

        <form onSubmit={submit} className="mt-[22vh] space-y-4 rounded-3xl border border-white/20 bg-white/10 px-6 pb-7 pt-8 shadow-[0_20px_60px_rgb(0_0_0/0.35)] backdrop-blur-md">
          <div className="text-center">
            <JholzoText onBrand className="text-[26px]" />
            <h1 className="mt-4 text-[28px] font-semibold leading-tight">{gate ? 'Create account' : 'Login'}</h1>
            <p className="mt-1.5 text-sm text-white/70">
              {gate ? 'Only once: your name and mobile number to see your cart and order.' : 'See your orders and report problems.'}
            </p>
          </div>

          <label className={pill}>
            <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" className={input} />
            <User size={18} className="shrink-0 text-white/80" />
          </label>
          <label className={pill}>
            <span className="text-[15px] text-white/70">+91</span>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel" placeholder="Mobile number" className={input} />
            <Phone size={18} className="shrink-0 text-white/80" />
          </label>

          {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100">{error}</p>}

          <button type="submit" className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-[#0F2A19] shadow-[0_8px_24px_rgb(0_0_0/0.25)] transition active:scale-[.99]">
            {store?.otp_required ? 'Send OTP' : gate ? 'Create account' : 'Login'}
          </button>
          {store?.otp_required && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-white/70">
              <ShieldCheck size={14} className="text-[#E3C27A]" /> We send a one-time code by SMS to verify your number.
            </p>
          )}
        </form>

        <p className="mt-auto pt-10 text-center text-[10px] uppercase tracking-[0.35em] text-white/35">Fresh groceries · Dergaon</p>
      </div>
    </main>
  )
}
