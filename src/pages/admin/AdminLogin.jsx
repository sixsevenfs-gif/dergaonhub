import { useState } from 'react'
import { LogIn } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import Field from '../../components/Field.jsx'
import { lbtnDark, lcard, lfield } from '../../components/ui.js'
import { adminSignIn } from '../../lib/store.js'

// Admin login (email + password created in Supabase → Authentication → Users).
export default function AdminLogin({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await adminSignIn(email, password)
      onDone()
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
    }
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-neutral-100 px-4 pt-10 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <Wordmark theme="light" />
        <form onSubmit={submit} className={`${lcard} mt-6 space-y-3 p-5`}>
          <h1 className="text-xl font-black">Admin login</h1>
          <Field label="Email"><input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={lfield} /></Field>
          <Field label="Password"><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={lfield} /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className={`${lbtnDark} h-12 w-full`}><LogIn size={18} /> {busy ? 'Logging in...' : 'Log in'}</button>
        </form>
      </div>
    </main>
  )
}
