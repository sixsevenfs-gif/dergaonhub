import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { btnAccent, field } from '../../components/ui.js'
import { partnerSignIn } from '../../lib/store.js'

// Rider login: email + password made by the admin (Supabase → Authentication → Users,
// then Admin → Settings → Delivery partners). The admin login works here too.
export default function PartnerLogin({ onDone, denied }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(denied ? 'This login is not a delivery partner.' : '')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await partnerSignIn(email, password)
      onDone()
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto min-h-screen max-w-sm px-4 pt-8 font-ui">
      <Wordmark />
      <form onSubmit={submit} className="mt-10 space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
          <ShieldCheck size={14} /> Delivery partners
        </span>
        <h1 className="text-2xl font-semibold leading-tight">Log in to start your run</h1>
        <p className="pb-2 text-sm text-muted">Only riders added by Jholzo can open this page.</p>
        <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        <input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnAccent} h-12`}><LogIn size={18} /> {busy ? 'Logging in...' : 'Log in'}</button>
      </form>
    </main>
  )
}
