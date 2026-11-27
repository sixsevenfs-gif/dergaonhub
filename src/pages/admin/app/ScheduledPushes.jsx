import { useState } from 'react'
import { AlarmClock, X } from 'lucide-react'
import { lcard } from '../../../components/ui.js'
import { MAX_SCHEDULED, cancelScheduled } from '../../../lib/appAdmin.js'
import { whenText } from '../../../lib/schedule.js'

/** Waiting notifications (update 078): when each goes, to whom, and Cancel. */
export default function ScheduledPushes({ list, timer, labels, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!list.length && timer === 'on') return null

  async function cancel(c) {
    if (!window.confirm(`Cancel "${c.title}"? It will not be sent.`)) return
    setBusy(c.id)
    setError('')
    try {
      await cancelScheduled(c.id)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  return (
    <div className={`${lcard} space-y-2 p-4`}>
      <h3 className="flex items-center gap-2 font-bold"><AlarmClock size={16} /> Scheduled ({list.length} of {MAX_SCHEDULED})</h3>
      {timer && timer !== 'on' && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          The timer that sends scheduled notifications is {timer === 'off' ? 'stopped' : 'not set up'}. Run database update 078 again in Supabase → SQL Editor
          {timer === 'missing' ? ' (first turn on pg_cron in Database → Extensions)' : ''}.
        </p>
      )}
      {!list.length && <p className="text-sm text-neutral-500">Nothing scheduled.</p>}
      <div className="divide-y divide-neutral-100">
        {list.map((c) => (
          <div key={c.id} className="flex items-start gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-violet-800">{whenText(c.send_at)}</p>
              <p className="truncate font-bold">{c.title}</p>
              <p className="line-clamp-2 text-neutral-600">{c.body}</p>
              <p className="text-xs text-neutral-500">{labels[c.audience] ?? c.audience}{c.image ? ' · with a picture' : ''}</p>
            </div>
            <button type="button" disabled={busy === c.id} onClick={() => cancel(c)} className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-red-200 px-2.5 text-xs font-semibold text-red-600 disabled:opacity-40">
              <X size={13} /> Cancel
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-neutral-500">They go out at their time even if this page and your phone are off.</p>
    </div>
  )
}
