import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ShoppingBasket, UtensilsCrossed, Wrench } from 'lucide-react'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { adminStats } from '../../../lib/store.js'
import { foodSettings } from '../../../lib/foodAdmin.js'
import { DEFAULT_PAUSE, appControl, saveAppControl } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'
import { AppHomePreview, MaintenancePreview, PhoneFrame } from './AppPreview.jsx'

// Owner: the whole app Live, or in Maintenance (both apps show "We'll be back soon" and nothing can be ordered).
// Pausing only grocery or only food orders stays in their own settings; this page shows where they stand.
export default function AdminAppStatus() {
  const { data, reload } = useData(appControl)
  const [msg, setMsg] = useState(null)
  if (data === null) return <NeedsUpdate n="066" what="the app status" />
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>
  // A new form after each save, filled from what the database kept; the message stays here.
  return <StatusForm key={JSON.stringify(data)} saved={data} msg={msg} setMsg={setMsg} onSaved={reload} />
}

function StatusForm({ saved, msg, setMsg, onSaved }) {
  const [v, setV] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { data: stats } = useData(adminStats)
  const { data: food } = useData(foodSettings)
  const set = (patch) => {
    setV({ ...v, ...patch })
    setMsg(null)
  }
  const changed = ['app_status', 'app_status_title', 'app_status_message'].some((k) => v[k] !== saved[k])
  const locking = v.app_status === 'maintenance' && saved.app_status !== 'maintenance'

  async function save() {
    setConfirm(false)
    setBusy(true)
    setMsg(null)
    try {
      await saveAppControl({ app_status: v.app_status, app_status_title: v.app_status_title, app_status_message: v.app_status_message })
      setMsg({ ok: v.app_status === 'maintenance' ? 'Maintenance is on. Both apps show it within a minute.' : 'The app is Live. Phones open normally again.' })
      onSaved()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <AppHeader title="App status" text="Keep the app open, or close it for a while with a friendly full screen message. Both apps follow this at once." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['live', 'Live', 'Everything works: customers shop, order and track as usual.', CheckCircle2, 'border-emerald-500 bg-emerald-50', 'bg-emerald-600'],
              ['maintenance', 'Maintenance', 'Both apps show a full screen "We\'ll be back soon". Nobody can order until you switch back to Live.', Wrench, 'border-amber-500 bg-amber-50', 'bg-amber-600'],
            ].map(([k, title, text, Icon, onCls, iconCls]) => {
              const on = v.app_status === k
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set({ app_status: k })}
                  className={`flex min-h-40 flex-col rounded-2xl border-2 p-4 text-left transition ${on ? onCls : 'border-neutral-200 bg-white hover:border-violet-300'}`}>
                  <div className="flex items-start justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${on ? iconCls : 'bg-neutral-300'}`}><Icon size={22} /></span>
                    {saved.app_status === k && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-neutral-700 shadow-sm">Now</span>}
                  </div>
                  <p className="mt-3 text-lg font-black">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">{text}</p>
                </button>
              )
            })}
          </div>

          {v.app_status === 'maintenance' && (
            <div className={`${lcard} space-y-3 p-4`}>
              <label className="block">
                <span className="text-sm font-semibold">Title (optional)</span>
                <input className={`${lfield} mt-1`} maxLength={60} value={v.app_status_title} onChange={(e) => set({ app_status_title: e.target.value })} placeholder="We'll be back soon" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Message (optional)</span>
                <textarea className={`${lfield} mt-1 h-20 py-2`} maxLength={200} value={v.app_status_message} onChange={(e) => set({ app_status_message: e.target.value })} placeholder={DEFAULT_PAUSE} />
              </label>
            </div>
          )}

          <div className={`${lcard} divide-y divide-neutral-100`}>
            <p className="p-4 text-sm font-bold">Ordering, one part at a time</p>
            <Link to="/admin/settings" className="flex items-center gap-3 p-4 hover:bg-neutral-50">
              <ShoppingBasket size={18} className="text-[#1F6B3A]" />
              <span className="flex-1 text-sm"><b>Grocery orders</b> · {stats?.paused ? <span className="font-semibold text-red-700">paused</span> : <span className="text-emerald-700">open</span>}</span>
              <span className="text-xs text-neutral-500">Settings</span><ArrowRight size={14} className="text-neutral-400" />
            </Link>
            <Link to="/admin/food/settings" className="flex items-center gap-3 p-4 hover:bg-neutral-50">
              <UtensilsCrossed size={18} className="text-red-600" />
              <span className="flex-1 text-sm"><b>Food orders</b> · {food?.food_on === false ? <span className="font-semibold text-red-700">paused</span> : <span className="text-emerald-700">open</span>}</span>
              <span className="text-xs text-neutral-500">Food settings</span><ArrowRight size={14} className="text-neutral-400" />
            </Link>
          </div>

          {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
          {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}

          {confirm ? (
            <div className={`${lcard} space-y-3 border-amber-400 p-4`}>
              <p className="font-bold">Close both apps for maintenance?</p>
              <p className="text-sm text-neutral-600">Every phone shows &quot;{v.app_status_title || 'We\'ll be back soon'}&quot; and nobody can shop or order until you switch back to Live here.</p>
              <div className="flex gap-2">
                <button type="button" onClick={save} className={`${lbtn} bg-amber-600 text-white`}><Wrench size={16} /> Yes, start maintenance</button>
                <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not now</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy || !changed} onClick={() => (locking ? setConfirm(true) : save())}
              className={`${lbtn} w-full bg-violet-700 text-white`}>{busy ? 'Saving…' : 'Save'}</button>
          )}
          <p className="text-xs text-neutral-500">Works from iPhone version 1.1 and Android 1.1.0. The website is not closed by this.</p>
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          <PhoneFrame label={v.app_status === 'maintenance' ? 'Every phone sees this' : 'Phones open normally'}>
            {v.app_status === 'maintenance' ? <MaintenancePreview title={v.app_status_title} message={v.app_status_message} /> : <AppHomePreview />}
          </PhoneFrame>
        </aside>
      </div>
    </div>
  )
}
