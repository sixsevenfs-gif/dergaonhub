import { useState } from 'react'
import { BellRing, CircleOff, Info, Lock, Save, Smartphone, TriangleAlert } from 'lucide-react'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { DEFAULT_UPDATE, appControl, appOverview, compareVersions, newestSeen, saveAppControl } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'
import { PhoneFrame, UpdatePreview } from './AppPreview.jsx'

const MODES = [
  ['off', 'No update', 'Nothing shows, even when a newer version is in the store.', CircleOff],
  ['soft', 'Normal update', 'When the store has a newer version, older phones are asked once: "Update available". They can say Later and keep using the app.', BellRing],
  ['force', 'Mandatory update', 'When the store has a newer version, older phones see a full screen "Update Jholzo" and must update before they can use the app.', Lock],
]
const PLATFORMS = [['both', 'Both apps'], ['android', 'Only Android'], ['ios', 'Only iPhone']]
const APP = { android: 'Android', ios: 'iPhone' }

// Owner: ask people to update, or make them, for both apps or one (updates 066 and 068). No version is written
// here: each app asks its own store (Google Play, the App Store) whether a newer version is out.
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
  const fields = ['update_mode', 'update_platforms', 'update_title', 'update_message', 'ios_store_url', 'android_store_url']
  const changed = fields.some((k) => v[k] !== saved[k])
  const newest = newestSeen(versions)
  const reaches = (platform) => v.update_mode !== 'off' && ['both', platform].includes(v.update_platforms)
  const older = versions.filter((x) => newest[x.platform] && x.version !== '?' && compareVersions(x.version, newest[x.platform]) < 0)
  const olderCount = older.filter((x) => reaches(x.platform)).reduce((t, x) => t + x.phones, 0)
  const storeName = v.update_platforms === 'ios' ? 'App Store' : v.update_platforms === 'android' ? 'Play Store' : 'Play Store / App Store'

  async function save() {
    setConfirm(false)
    setBusy(true)
    setMsg(null)
    try {
      await saveAppControl(Object.fromEntries(fields.map((k) => [k, v[k]])))
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
      <AppHeader title="App update" text="Choose Normal or Mandatory, and for which app. Each app checks its own store when it opens: as soon as a newer Jholzo is out there, older phones are asked, or must update. You never write a version." />

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
              <div>
                <span className="text-sm font-semibold">For</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PLATFORMS.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ update_platforms: k })}
                      className={`h-10 rounded-xl text-sm font-semibold ${v.update_platforms === k ? 'bg-violet-700 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">The Android app checks Google Play, the iPhone app checks the App Store, each for its own newest version.</p>
              </div>
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

          <div className={`${lcard} p-4`}>
            <h3 className="flex items-center gap-2 font-bold"><Smartphone size={17} className="text-violet-600" /> Versions on phones now</h3>
            {versions.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No phones yet. They show here once people open the new apps.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {['android', 'ios'].map((p) => {
                  const list = versions.filter((x) => x.platform === p)
                  if (!list.length) return null
                  return (
                    <div key={p} className="rounded-2xl bg-neutral-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{APP[p]}</p>
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {list.map((x) => {
                          const isNewest = x.version === newest[p]
                          return (
                            <li key={x.version} className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{x.version}
                                {isNewest ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">newest</span>
                                  : reaches(p) && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{v.update_mode === 'force' ? 'must update' : 'asked'}</span>}
                              </span>
                              <span className="text-neutral-500">{x.phones} {x.phones === 1 ? 'phone' : 'phones'}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
            {olderCount > 0 && <p className="mt-3 text-sm text-violet-900"><b>{olderCount}</b> {olderCount === 1 ? 'phone is' : 'phones are'} on an older version and will be {v.update_mode === 'force' ? 'made' : 'asked'} to update.</p>}
          </div>

          <details className={`${lcard} p-4`}>
            <summary className="cursor-pointer text-sm font-semibold">Store links (filled in already)</summary>
            <div className="mt-3 grid gap-3">
              <label className="block"><span className="text-xs font-semibold text-neutral-600">Play Store (Android)</span>
                <input className={`${lfield} mt-1`} value={v.android_store_url} onChange={(e) => set({ android_store_url: e.target.value })} /></label>
              <label className="block"><span className="text-xs font-semibold text-neutral-600">App Store (iPhone)</span>
                <input className={`${lfield} mt-1`} value={v.ios_store_url} onChange={(e) => set({ ios_store_url: e.target.value })} /></label>
            </div>
          </details>

          <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <Info size={20} className="mt-0.5 shrink-0" />
            <p>It works from iPhone version 1.1 and Android 1.1.0 (older apps don&apos;t check). Google Play answers only for apps installed from the Play Store, not a test APK. Right after you publish a new version, the store can take a few hours before it says so.</p>
          </div>
          {v.update_mode === 'force' && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <TriangleAlert size={20} className="mt-0.5 shrink-0" />
              <p><b>Mandatory stays on for every new version</b> until you switch it back to Normal or No update: each time you publish one, older phones must update first.</p>
            </div>
          )}

          {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
          {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}

          {confirm ? (
            <div className={`${lcard} space-y-3 border-red-300 p-4`}>
              <p className="font-bold">Make older {v.update_platforms === 'both' ? 'phones' : `${APP[v.update_platforms]} phones`} update?</p>
              <p className="text-sm text-neutral-600">Whenever the {storeName} has a newer Jholzo, phones with an older one see &quot;Update Jholzo&quot; and can&apos;t order until they update.</p>
              <div className="flex gap-2">
                <button type="button" onClick={save} className={`${lbtn} bg-red-600 text-white`}><Lock size={16} /> Yes, make it a must</button>
                <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not yet</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy || !changed} onClick={() => (v.update_mode === 'force' && saved.update_mode !== 'force' ? setConfirm(true) : save())}
              className={`${lbtn} w-full bg-violet-700 text-white`}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>
          )}
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          <PhoneFrame label={v.update_mode === 'off' ? 'Phones see nothing' : v.update_mode === 'force' ? 'Older phones see this' : 'Older phones are asked once'}>
            <UpdatePreview mode={v.update_mode} title={v.update_title} message={v.update_message} />
          </PhoneFrame>
        </aside>
      </div>
    </div>
  )
}
