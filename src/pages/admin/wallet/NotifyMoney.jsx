import { useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import { LINKS, sendPush } from '../../../lib/appAdmin.js'

/**
 * "Tell them in the app" after Jholzo Money is added (update 077). Nothing is sent until the owner presses it.
 * One customer: phones = [their number]. Everyone: audience 'customers' (all logged-in customers).
 * The words can be changed before sending; the notification opens Jholzo Money (on the Grocery side).
 */
export default function NotifyMoney({ note, phones = [], everyone = false }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try {
      const r = await sendPush({ title, body, link: LINKS.wallet(), audience: everyone ? 'customers' : 'phones', phones: everyone ? [] : phones })
      setResult(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const sent = Number(result.sent ?? 0)
    return sent > 0 ? (
      <p className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-semibold text-green-800">
        <Check size={17} /> Notification sent to {sent} phone{sent === 1 ? '' : 's'}.
      </p>
    ) : (
      <p className="rounded-xl bg-white p-3 text-sm text-amber-800">
        {everyone ? 'No customer has the app with a login yet.' : 'They don\'t have the app (or are not logged in), so nothing was sent. Tell them on WhatsApp.'}
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-green-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold"><BellRing size={16} className="text-green-700" /> Tell {everyone ? 'all customers' : 'them'} in the app</p>
      <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-label="Notification title" className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-semibold" />
      <textarea value={body} maxLength={300} rows={2} onChange={(e) => setBody(e.target.value)} aria-label="Notification message" className="w-full resize-none rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={send}
        className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-green-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
        <BellRing size={15} /> {busy ? 'Sending…' : everyone ? 'Send to all customers' : 'Send notification'}
      </button>
    </div>
  )
}
