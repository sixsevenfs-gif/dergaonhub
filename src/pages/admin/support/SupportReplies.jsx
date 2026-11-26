import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { lbtn, lbtnDanger, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useRole } from '../../../lib/role.js'
import { deleteQuickReply, quickReplies, saveQuickReply } from '../../../lib/support.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import { SupportHeader } from './SupportBits.jsx'

const EMPTY = { id: null, title: '', body: '', sort: 0 }

// Ready-made answers for the reply box. {name} becomes the customer's first name, {order} the order number.
// The owner adds and changes them; the executive uses them.
export default function SupportReplies() {
  const { isOwner } = useRole()
  const { data: list, reload } = useData(quickReplies)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  if (list === null) return <NeedsUpdate n="069" what="quick replies for help requests" />

  async function run(fn) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      reload()
      return true
    } catch (err) {
      setMsg(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SupportHeader title="Quick replies" text="Answers you send often, one tap away in the reply box. {name} becomes the customer's first name and {order} the order number." />
      {msg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}

      {isOwner && !edit && (
        <button type="button" onClick={() => setEdit({ ...EMPTY, sort: (list?.length ?? 0) + 1 })} className={`${lbtn} bg-teal-700 text-white`}><Plus size={16} /> New quick reply</button>
      )}
      {edit && (
        <div className={`${lcard} space-y-3 p-4`}>
          <label className="block">
            <span className="text-sm font-semibold">Short name</span>
            <input className={`${lfield} mt-1`} maxLength={60} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Missing item on its way" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Reply</span>
            <textarea className={`${lfield} mt-1 h-28 py-2`} maxLength={1000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="Sorry, {name}! The missing item from {order} is on its way." />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={async () => { if (await run(() => saveQuickReply(edit))) setEdit(null) }} className={`${lbtn} bg-teal-700 text-white`}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEdit(null)} className={lbtnOutline}>Cancel</button>
          </div>
        </div>
      )}

      {list === undefined ? <p className="text-sm text-neutral-500">Loading…</p> : list.length === 0 ? (
        <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>No quick replies yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className={`${lcard} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{r.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{r.body}</p>
                </div>
                {isOwner && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Change" onClick={() => setEdit({ ...r })} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"><Pencil size={16} /></button>
                    <button type="button" aria-label="Delete" onClick={() => setConfirmDelete(r.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
              {confirmDelete === r.id && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm">
                  <span className="flex-1 text-red-800">Delete "{r.title}"?</span>
                  <button type="button" disabled={busy} onClick={() => run(() => deleteQuickReply(r.id)).then(() => setConfirmDelete(null))} className={`${lbtnDanger} h-9 px-3`}>Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className={`${lbtnOutline} h-9 px-3`}>Keep</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
