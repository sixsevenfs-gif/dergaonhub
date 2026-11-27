import { useEffect, useState } from 'react'
import { ExternalLink, Hourglass } from 'lucide-react'
import Toggle from '../../../components/Toggle.jsx'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { LAUNCH_DEFAULTS, comingSoon, launchLeft, saveComingSoon } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'

// Admin → App → App status (update 076): the "Coming soon" page. While it is on, both apps show only this page:
// the logo, "Coming soon", the owner's lines, "Launching on 01 Dec" and the hours left, and "Shop on Website".

const pad = (n) => String(n).padStart(2, '0')
// <input type="datetime-local"> works in the phone's own time (India): back and forth from the saved time.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export default function ComingSoonCard() {
  const { data, reload } = useData(comingSoon)
  if (data === null) return <NeedsUpdate n="076" what="the Coming soon page" />
  if (!data) return null
  return <Form key={JSON.stringify(data)} saved={data} onSaved={reload} />
}

function Form({ saved, onSaved }) {
  const [v, setV] = useState({ ...LAUNCH_DEFAULTS, ...saved })
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState(null)
  const keys = Object.keys(LAUNCH_DEFAULTS)
  const changed = keys.some((k) => (v[k] ?? '') !== (saved[k] ?? ''))
  const turningOn = v.launch_on && !saved.launch_on
  const set = (patch) => {
    setV({ ...v, ...patch })
    setMsg(null)
  }

  async function save() {
    setConfirm(false)
    setBusy(true)
    setMsg(null)
    try {
      await saveComingSoon(v)
      setMsg({ ok: v.launch_on ? 'The Coming soon page is on. Both apps show it within a minute.' : 'The Coming soon page is off. The apps open normally.' })
      onSaved()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${lcard} space-y-3 p-4 ${v.launch_on ? 'border-2 border-emerald-600' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${v.launch_on ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800'}`}><Hourglass size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Coming soon page</p>
          <p className="text-xs leading-5 text-neutral-600">
            Before the launch: both apps show only this page, with the hours left and a button to shop on the website.
            Switch it off on launch day and the apps open normally.
          </p>
        </div>
        <Toggle checked={!!v.launch_on} onChange={(on) => set({ launch_on: on })} label="Coming soon page" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Launch date and time</span>
          <input type="datetime-local" className={`${lfield} mt-1`} value={toLocalInput(v.launch_at)} onChange={(e) => set({ launch_at: fromLocalInput(e.target.value) })} />
          <span className="mt-1 block text-xs text-neutral-500">The hours count down to this.</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Line above the hours</span>
          <input className={`${lfield} mt-1`} maxLength={60} value={v.launch_label} onChange={(e) => set({ launch_label: e.target.value })} placeholder={LAUNCH_DEFAULTS.launch_label} />
          <span className="mt-1 block text-xs text-neutral-500">For example: Launching on 01 Dec</span>
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-semibold">Line under "Coming soon"</span>
        <input className={`${lfield} mt-1`} maxLength={160} value={v.launch_message} onChange={(e) => set({ launch_message: e.target.value })} placeholder={LAUNCH_DEFAULTS.launch_message} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Line above the date</span>
        <input className={`${lfield} mt-1`} maxLength={160} value={v.launch_note} onChange={(e) => set({ launch_note: e.target.value })} placeholder={LAUNCH_DEFAULTS.launch_note} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">"Shop on Website" opens</span>
        <input className={`${lfield} mt-1`} value={v.launch_site} onChange={(e) => set({ launch_site: e.target.value })} placeholder="https://jholzo.com" />
      </label>

      <details className="rounded-2xl bg-neutral-50 p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Customers see</summary>
        <div className="mx-auto mt-3 max-w-[300px] overflow-hidden rounded-[28px] border-4 border-neutral-900 shadow-lg">
          <ComingSoonPreview v={v} />
        </div>
      </details>

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}
      {confirm ? (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold">Show only the Coming soon page in both apps?</p>
          <p className="text-xs text-amber-900">Nobody can shop in the apps until you switch it off. Don't switch it on while Apple or Google is reviewing an app version.</p>
          <div className="flex gap-2">
            <button type="button" onClick={save} className={`${lbtn} bg-emerald-700 text-white`}>Yes, show it</button>
            <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not now</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || !changed} onClick={() => (turningOn ? setConfirm(true) : save())} className={`${lbtn} w-full bg-emerald-700 text-white`}>
          {busy ? 'Saving…' : turningOn ? 'Show the Coming soon page' : v.launch_on ? 'Save' : saved.launch_on ? 'Switch it off: open the apps' : 'Save'}
        </button>
      )}
      <p className="text-xs text-neutral-500">Works from iPhone version 1.1 and Android 1.1.0.</p>
    </div>
  )
}

/** The page as the apps draw it (same pictures, same words). */
export function ComingSoonPreview({ v }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const left = v.launch_at ? launchLeft(v.launch_at) : null
  return (
    <div className="flex flex-col items-center bg-[#FEF7EE] px-4 pb-5 pt-6 text-center text-[#5B3A29]">
      <img src="/coming-soon/logo.png" alt="Jholzo" className="w-32" />
      <img src="/coming-soon/title.png" alt="Coming soon" className="mt-1 w-56" />
      <p className="mt-2 text-[13px] leading-5">{v.launch_message || LAUNCH_DEFAULTS.launch_message}</p>
      <img src="/coming-soon/art.png" alt="" className="mt-2 w-full" />
      <p className="mt-2 text-[12px] leading-5">{v.launch_note || LAUNCH_DEFAULTS.launch_note}</p>
      <p className="mt-2 flex w-full items-center gap-2 text-[12px] italic text-emerald-800">
        <span className="h-px flex-1 bg-emerald-700/60" />{v.launch_label || LAUNCH_DEFAULTS.launch_label}<span className="h-px flex-1 bg-emerald-700/60" />
      </p>
      <div className="mt-2 grid w-full grid-cols-3 gap-2">
        {[['Hours', left?.h], ['Minutes', left?.m], ['Seconds', left?.s]].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-emerald-800/20 bg-white/50 py-1.5">
            <p className="text-lg font-black text-emerald-800">{n == null ? '--' : pad(n)}</p>
            <p className="text-[10px]">{label}</p>
          </div>
        ))}
      </div>
      <span className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-emerald-800 text-[13px] font-bold text-white">
        Shop on Website <ExternalLink size={14} />
      </span>
    </div>
  )
}
