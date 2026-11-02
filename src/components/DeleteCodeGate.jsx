import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { lbtnDark, lfield } from './ui.js'
import { friendlyDeleteError, unlockDelete } from '../lib/deleteCode.js'
import { DEMO_MODE } from '../config.js'

// Asks for the Delete orders code; onUnlocked() once the database says it is right.
export default function DeleteCodeGate({ onUnlocked, className = '' }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (await unlockDelete(value.trim())) onUnlocked()
      else setError('Wrong code.')
    } catch (err) {
      setError(friendlyDeleteError(err.message))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className={`flex flex-col items-center text-center ${className}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white"><LockKeyhole size={26} /></span>
      <h2 className="mt-3 text-lg font-bold">Enter the delete code</h2>
      <p className="mt-1 text-sm text-neutral-500">Only you know it. Deleted orders can't come back.</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder="••••"
        className={`${lfield} mt-4 max-w-48 text-center text-2xl tracking-[0.5em]`}
      />
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || value.length < 4} className={`${lbtnDark} mt-4 w-full max-w-48`}>
        {busy ? 'Checking…' : 'Open'}
      </button>
      {DEMO_MODE && <p className="mt-3 text-xs text-amber-700">Demo mode: any 4-digit code works.</p>}
    </form>
  )
}
