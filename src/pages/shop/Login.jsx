import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import { lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { currentUserEmail, signIn } from '../../lib/store.js'
import { DEMO_MODE } from '../../config.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  if (currentUserEmail()) return <Navigate to="/shop" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await signIn(email)
      navigate('/shop', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100 px-4 pt-6 text-neutral-900">
      <div className="mx-auto max-w-md">
        <span className="[&_a]:text-neutral-900"><Wordmark /></span>
        <h1 className="mt-10 text-3xl font-black leading-tight">Apni shop online lao</h1>
        <p className="mt-2 text-neutral-600">Free mein shuru karo. Dergaon ke customers aapse seedha order karenge.</p>

        <div className={`${lcard} mt-6 space-y-3 p-5`}>
          <button type="button" disabled className={`${lbtnOutline} w-full`} title="Supabase connect hone ke baad">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9" /></svg>
            Continue with Google
          </button>
          {DEMO_MODE && <p className="text-center text-xs text-neutral-500">Google login database connect hone ke baad chalega.</p>}

          <div className="flex items-center gap-3 text-xs text-neutral-400"><span className="h-px flex-1 bg-neutral-200" /> ya <span className="h-px flex-1 bg-neutral-200" /></div>

          <form onSubmit={submit} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={lfield} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className={`${lbtnDark} w-full`}><Mail size={18} /> Continue with email</button>
          </form>
        </div>

        {DEMO_MODE && (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-600">
            <b>Demo:</b> Sharma Grocery ka dashboard dekhne ke liye{' '}
            <button type="button" className="font-semibold underline" onClick={() => setEmail('sharma@demo.in')}>sharma@demo.in</button> use karo.
            Nayi email se nayi shop banegi.
          </div>
        )}
        <Link to="/" className="mt-6 block text-center text-sm text-neutral-500 underline">Customer site par jao</Link>
      </div>
    </main>
  )
}
