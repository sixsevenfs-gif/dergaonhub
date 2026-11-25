import { useState } from 'react'
import { BellRing, CircleOff, Lock, Save, TriangleAlert } from 'lucide-react'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { DEFAULT_UPDATE, appControl, appOverview, compareVersions, saveAppControl } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'
import { PhoneFrame, UpdatePreview } from './AppPreview.jsx'

const MODES = [
  ['off', 'No update', 'Nothing shows. Use it when the newest app is already out for everyone.', CircleOff],
  ['soft', 'Normal update', 'Phones below the new version are asked once: "Update available". They can say Later and keep using the app.', BellRing],
  ['force', 'Mandatory update', 'Phones below the new version see a full screen "Update Jholzo" and can\'t use the app until they update. The button opens the Play Store / App Store.', Lock],
]
const PLATFORMS = [['both', 'Both apps'], ['android', 'Only Android'], ['ios', 'Only iPhone']]
const VERSION = /^[0-9]+(\.[0-9]+){0,3}$/

// Owner: ask people to update, or make them, with one setting for both apps (update 066).
export default function AdminAppUpdates() {
  const { data, reload } = useData(appControl)
  const { data: ov } = useData(appOverview)
  const [msg, setMsg] = useState(null)
  if (data === null) return <NeedsUpdate n="066" what="the app update settings" />
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>
  // A new form after each save, filled from what the database kept; the message stays here.
  return <UpdateForm key={JSON.stringify(data)} saved={data} versions={ov?.versions ?? []} msg={msg} setMsg={setMsg} onSaved={reload} />
}

function UpdateForm({ saved, versions, msg, setMsg, onSaved }) {
  const [v, setV] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const set = (patch) => {
    setV({ ...v, ...patch })
    setMsg(null)
  }
  const changed = JSON.stringify(v) !== JSON.stringify(saved)
  const validVersion = VERSION.test((v.update_version ?? '').trim())
  const applies = (x) => v.update_platforms === 'both' || v.update_platforms === x.platform
  const below = validVersion ? versions.filter((x) => applies(x) && x.version !== '?' && compareVersions(x.version, v.update_version) < 0) : []
  const reached = below.reduce((t, x) => t + x.phones, 0)
  const problem = v.update_mode !== 'off' && !validVersion ? 'Write the new version, like 1.2 or 1.2.1.' : ''

  async function save() {
    setConfirm(false)
    setBusy(true)
    setMsg(null)
    try {
      await saveAppControl({
        update_mode: v.update_mode, update_version: v.update_version, update_platforms: v.update_platforms,
        update_title: v.update_title, update_message: v.update_message, ios_store_url: v.ios_store_url, android_store_url: v.android_store_url,
      })
      setMsg({ ok: 'Saved. Phones see it the next time they open the app (or within 5 minutes).' })
      onSaved()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <AppHeader title="App update" text="Ask everyone to update to the new version, or make it a must. One setting for both apps; the button takes people straight to the Play Store or the App Store." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map(([k, title, text, Icon]) => {
              const on = v.update_mode === k
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set({ update_mode: k })}
                  className={`flex min-h-44 flex-col rounded-2xl border-2 p-4 text-left transition ${on ? (k === 'force' ? 'border-red-500 bg-red-50' : 'border-violet-600 bg-violet-50') : 'border-neutral-200 bg-white hover:border-violet-300'}`}>
                  <div className="flex items-start justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${on ? (k === 'force' ? 'bg-red-600 text-white' : 'bg-violet-700 text-white') : 'bg-neutral-100 text-neutral-600'}`}><Icon size={22} /></span>
                    {on && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${k === 'force' ? 'bg-red-600 text-white' : 'bg-violet-700 text-white'}`}>Selected</span>}
                  </div>
                  <p className="mt-3 font-black">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">{text}</p>
                </button>
              )
            })}
          </div>

          {v.update_mode !== 'off' && (
            <div className={`${lcard} space-y-4 p-4`}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-40 flex-1">
                  <span className="text-sm font-semibold">New version in the stores</span>
                  <input className={`${lfield} mt-1 text-lg font-bold`} inputMode="decimal" value={v.update_version} onChange={(e) => set({ update_version: e.target.value })} placeholder="1.2" />
                </label>
                <span className={`mb-2 rounded-full px-3 py-1 text-xs font-bold ${validVersion ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{validVersion ? 'Looks right' : 'Like 1.2 or 1.2.1'}</span>
              </div>
              <div>
                <span className="text-sm font-semibold">For</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PLATFORMS.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ update_platforms: k })}
                      className={`h-10 rounded-xl text-sm font-semibold ${v.update_platforms === k ? 'bg-violet-700 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">Choose one app when only that store has the new version yet (Apple's review takes a day or two).</p>
              </div>
              {validVersion && versions.length > 0 && (
                <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
                  <b>{reached}</b> {reached === 1 ? 'phone is' : 'phones are'} below {v.update_version}
                  {below.length > 0 && ` (${below.map((x) => `${x.platform === 'ios' ? 'iPhone' : 'Android'} ${x.version}: ${x.phones}`).join(', ')})`}.
                  {' '}{v.update_mode === 'force' ? 'They will have to update.' : 'They will be asked once.'}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold">Title (optional)</span>
                  <input className={`${lfield} mt-1`} maxLength={60} value={v.update_title} onChange={(e) => set({ update_title: e.target.value })} placeholder={v.update_mode === 'force' ? 'Update Jholzo' : 'Update available'} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-semibold">Message (optional)</span>
                  <textarea className={`${lfield} mt-1 h-20 py-2`} maxLength={200} value={v.update_message} onChange={(e) => set({ update_message: e.target.value })} placeholder={DEFAULT_UPDATE} />
                </label>
              </div>
            </div>
          )}

          <details className={`${lcard} p-4`}>
            <summary className="cursor-pointer text-sm font-semibold">Store links (filled in already)</summary>
            <div className="mt-3 grid gap-3">
              <label className="block"><span className="text-xs font-semibold text-neutral-600">Play Store (Android)</span>
                <input className={`${lfield} mt-1`} value={v.android_store_url} onChange={(e) => set({ android_store_url: e.target.value })} /></label>
              <label className="block"><span className="text-xs font-semibold text-neutral-600">App Store (iPhone)</span>
                <input className={`${lfield} mt-1`} value={v.ios_store_url} onChange={(e) => set({ ios_store_url: e.target.value })} /></label>
            </div>
          </details>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <TriangleAlert size={20} className="mt-0.5 shrink-0" />
            <p><b>Only after the new version is live in the store.</b> If people must update before the store has it, they can&apos;t use the app until it does. Phones with version 1.0 don&apos;t check yet; it works from iPhone 1.1 and Android 1.1.0.</p>
          </div>

          {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
          {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}
          {problem && <p className="text-sm text-amber-700">{problem}</p>}

          {confirm ? (
            <div className={`${lcard} space-y-3 border-red-300 p-4`}>
              <p className="font-bold">Make everyone below {v.update_version} update{v.update_platforms === 'both' ? '' : ` (${v.update_platforms === 'ios' ? 'iPhone' : 'Android'} only)`}?</p>
              <p className="text-sm text-neutral-600">{reached ? `${reached} phones` : 'These phones'} will see "Update Jholzo" and can&apos;t order until they update. Is {v.update_version} live in the {v.update_platforms === 'ios' ? 'App Store' : v.update_platforms === 'android' ? 'Play Store' : 'Play Store and the App Store'}?</p>
              <div className="flex gap-2">
                <button type="button" onClick={save} className={`${lbtn} bg-red-600 text-white`}><Lock size={16} /> Yes, make it a must</button>
                <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not yet</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy || !changed || !!problem} onClick={() => (v.update_mode === 'force' ? setConfirm(true) : save())}
              className={`${lbtn} w-full bg-violet-700 text-white`}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>
          )}
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          <PhoneFrame label={v.update_mode === 'off' ? 'Phones see nothing' : v.update_mode === 'force' ? 'Older phones see this' : 'Older phones are asked once'}>
            <UpdatePreview mode={v.update_mode} title={v.update_title} message={v.update_message} version={v.update_version} />
          </PhoneFrame>
        </aside>
      </div>
    </div>
  )
}
