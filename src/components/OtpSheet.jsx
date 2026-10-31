import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { btnAccent } from './ui.js'
import { sendOtp, verifyOtp } from '../lib/store.js'
import { DEMO_MODE } from '../config.js'

// Verify a phone number once on this phone: sends a 4-digit SMS code as soon as it opens,
// then onVerified() runs. Asked only the first time a number is used on a phone.
export default function OtpSheet({ phone, onVerified, onClose }) {
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const input = useRef(null)

  const send = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await sendOtp(phone)
      // The SMS service is down: OTP has switched itself off (the founder got a Telegram alert), go on without it.
      if (res?.skip) return onVerified(true)
      setSent(true)
      setWait(res?.timeout || 60)
      input.current?.focus()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    send()
    // Sends once when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Resend in 45s" countdown.
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const check = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyOtp(phone, code)
      onVerified()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end bg-black/70 font-ui sm:items-center" onClick={onClose}>
      <form onSubmit={check} onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-md space-y-4 rounded-t-3xl border border-line bg-card p-5 pb-8 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand"><ShieldCheck size={22} /></span>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 flex h-10 w-10 items-center justify-center text-muted"><X size={22} /></button>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Verify your number</h2>
          <p className="mt-1 text-sm text-muted">
            {sent ? `We sent a 4-digit code by SMS to +91 ${phone}.` : busy ? `Sending a code to +91 ${phone}...` : `We will send a code to +91 ${phone}.`} We ask again only after you log out.
          </p>
        </div>
        <input
          ref={input}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="• • • •"
          className="h-14 w-full rounded-xl border border-line bg-white text-center text-2xl font-semibold tracking-[0.5em] text-ink placeholder:text-muted/50 focus:border-brand focus:outline-none"
        />
        {DEMO_MODE && <p className="text-center text-xs text-muted">Demo mode: the code is 1234.</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || code.length < 4} className={`${btnAccent} h-13 text-base`}>
          {busy && sent ? 'Checking...' : 'Verify'}
        </button>
        <p className="text-center text-sm text-muted">
          Didn't get it?{' '}
          {wait > 0 ? (
            <span>Resend in {wait}s</span>
          ) : (
            <button type="button" onClick={send} disabled={busy} className="font-semibold text-brand underline">Resend code</button>
          )}
        </p>
      </form>
    </div>
  )
}
