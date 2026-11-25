import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { lbtnDark, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { appUpdateSettings, saveAppUpdateSettings } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'

const DEFAULT_MESSAGE = 'A new version of Jholzo is here with new features and fixes. Please update to keep using the app.'

// Owner: ask people to update the app, or make them. The apps check this on start and when opened again.
export default function AdminAppUpdates() {
  const { data, reload } = useData(appUpdateSettings)
  const [msg, setMsg] = useState(null)
  if (data === null) return <NeedsUpdate n="066" what="the app update settings" />
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>
  // A new form after each save, filled from what the database kept; the message stays here.
  return <UpdateForm key={JSON.stringify(data)} saved={data} msg={msg} setMsg={setMsg} onSaved={reload} />
}

function UpdateForm({ saved, msg, setMsg, onSaved }) {
  const [v, setV] = useState(saved)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => {
    setV({ ...v, [k]: e.target.value })
    setMsg(null)
  }
  const changed = JSON.stringify(v) !== JSON.stringify(saved)

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await saveAppUpdateSettings(v)
      setMsg({ ok: 'Saved. Phones see it the next time they open the app.' })
      onSaved()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  const iosMust = v.ios_min_version?.trim()
  const iosAsk = v.ios_latest_version?.trim()
  const andMust = Number(v.android_min_version_code) || 0
  const andAsk = Number(v.android_latest_version_code) || 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">App updates</h1>
        <p className="text-sm text-neutral-500">Ask people to update the Jholzo app, or make them update before they can order.</p>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">Change these only after the new version is live in the App Store / Play Store.</p>
        <p className="mt-1">If you make people update before the store has the new version, they can't use the app until it does.</p>
      </div>

      <div className={`${lcard} space-y-3 p-4`}>
        <h3 className="flex items-center gap-2 font-bold"><Smartphone size={18} /> iPhone</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Newest version</span>
            <input className={`${lfield} mt-1`} inputMode="decimal" value={v.ios_latest_version} onChange={set('ios_latest_version')} placeholder="e.g. 1.1" />
            <span className="text-xs text-neutral-500">Older ones are asked once; they can say Later.</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Must update below</span>
            <input className={`${lfield} mt-1`} inputMode="decimal" value={v.ios_min_version} onChange={set('ios_min_version')} placeholder="e.g. 1.1" />
            <span className="text-xs text-neutral-500">Older ones see a full screen &quot;Update Jholzo&quot; and can&apos;t skip it.</span>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">App Store link</span>
          <input className={`${lfield} mt-1`} value={v.ios_store_url} onChange={set('ios_store_url')} />
        </label>
        <p className="text-sm">{iosMust ? <>Versions below <b>{iosMust}</b> must update.</> : 'No version has to update.'} {iosAsk ? <>Below <b>{iosAsk}</b> are asked.</> : ''}</p>
      </div>

      <div className={`${lcard} space-y-3 p-4`}>
        <h3 className="flex items-center gap-2 font-bold"><Smartphone size={18} /> Android</h3>
        <p className="text-xs text-neutral-500">Android uses the version code, a whole number that goes up with every release (Play Console → App bundle explorer). The first release is 1.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Newest version code</span>
            <input className={`${lfield} mt-1`} inputMode="numeric" value={v.android_latest_version_code || ''} onChange={set('android_latest_version_code')} placeholder="e.g. 2" />
            <span className="text-xs text-neutral-500">Older ones are asked once; they can say Later.</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Must update below</span>
            <input className={`${lfield} mt-1`} inputMode="numeric" value={v.android_min_version_code || ''} onChange={set('android_min_version_code')} placeholder="e.g. 2" />
            <span className="text-xs text-neutral-500">Older ones see a full screen &quot;Update Jholzo&quot; and can&apos;t skip it.</span>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Play Store link</span>
          <input className={`${lfield} mt-1`} value={v.android_store_url} onChange={set('android_store_url')} />
        </label>
        <p className="text-sm">{andMust ? <>Version codes below <b>{andMust}</b> must update.</> : 'No version has to update.'} {andAsk ? <>Below <b>{andAsk}</b> are asked.</> : ''}</p>
      </div>

      <label className={`${lcard} block p-4`}>
        <span className="text-sm font-semibold">Message on the update screen (optional)</span>
        <textarea className={`${lfield} mt-1 h-20 py-2`} maxLength={200} value={v.update_message} onChange={set('update_message')} placeholder={DEFAULT_MESSAGE} />
        <span className="text-xs text-neutral-500">Empty: &quot;{DEFAULT_MESSAGE}&quot;</span>
      </label>

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg.ok}</p>}

      <button type="button" disabled={busy || !changed} onClick={save} className={`${lbtnDark} w-full`}>{busy ? 'Saving…' : 'Save'}</button>
      <p className="text-xs text-neutral-500">The apps check this from iPhone version 1.1 and the next Android version. iPhone 1.0 doesn&apos;t check.</p>
    </div>
  )
}
