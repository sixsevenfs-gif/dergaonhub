import { useState } from 'react'
import { BellRing, CheckCircle2, CloudRain, Phone, Smartphone, UserRound } from 'lucide-react'
import Toggle from '../../../components/Toggle.jsx'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import {
  DEFAULT_RAIN, LINKS, RAIN_PLACES, maintenanceVisits, notifyMaintenanceVisitors, rainNotice, saveRain,
} from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import LinkPicker from './LinkPicker.jsx'

// Two parts of App status (update 071): the heavy rain notice, and the people who opened the app while it was in
// maintenance, with a notification for just them once it is back.

/* ---------- heavy rain ---------- */

export function RainCard() {
  const { data, reload } = useData(rainNotice)
  if (data === null) return <NeedsUpdate n="071" what="the heavy rain notice" />
  if (!data) return null
  // A new form after each save, filled from what the database kept.
  return <RainForm key={JSON.stringify(data)} saved={data} onSaved={reload} />
}

function RainForm({ saved, onSaved }) {
  const [v, setV] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const changed = ['rain_on', 'rain_message', 'rain_place'].some((k) => v[k] !== saved[k])
  const set = (patch) => {
    setV({ ...v, ...patch })
    setMsg(null)
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await saveRain(v)
      setMsg({ ok: v.rain_on ? 'The rain notice is on. The apps show it within a few minutes.' : 'The rain notice is off.' })
      onSaved()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${lcard} space-y-3 p-4`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${v.rain_on ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'}`}><CloudRain size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Heavy rain notice</p>
          <p className="text-xs leading-5 text-neutral-600">Tell customers that orders may take longer because of the rain. It shows on the app&apos;s home and at checkout, and on the website for Grocery.</p>
        </div>
        <Toggle checked={!!v.rain_on} onChange={(on) => set({ rain_on: on })} label="Heavy rain notice" />
      </div>

      {v.rain_on && (
        <>
          <div className="flex flex-wrap gap-2">
            {RAIN_PLACES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={v.rain_place === k} onClick={() => set({ rain_place: k })}
                className={`h-9 rounded-full border px-3 text-sm font-semibold ${v.rain_place === k ? 'border-sky-600 bg-sky-600 text-white' : 'border-neutral-300 bg-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm font-semibold">Message (optional)</span>
            <textarea className={`${lfield} mt-1 h-20 py-2`} maxLength={200} value={v.rain_message} onChange={(e) => set({ rain_message: e.target.value })} placeholder={DEFAULT_RAIN} />
          </label>
          {/* What customers see, drawn like the card in the apps. */}
          <div className="rounded-2xl bg-gradient-to-r from-sky-100 to-indigo-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-800">Customers see</p>
            <div className="mt-2 flex items-start gap-2.5 rounded-xl bg-white/80 p-3 shadow-sm">
              <CloudRain size={20} className="mt-0.5 shrink-0 text-sky-700" />
              <div>
                <p className="text-sm font-bold text-neutral-900">Heavy rain in Dergaon</p>
                <p className="text-xs leading-5 text-neutral-600">{v.rain_message.trim() || DEFAULT_RAIN}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}
      <button type="button" disabled={busy || !changed} onClick={save} className={`${lbtn} w-full bg-sky-700 text-white`}>
        {busy ? 'Saving…' : v.rain_on ? (saved.rain_on ? 'Save the rain notice' : 'Show the rain notice') : saved.rain_on ? 'Turn the rain notice off' : 'Save'}
      </button>
    </div>
  )
}

/* ---------- who opened the app during maintenance ---------- */

const when = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const clock = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

export function MaintenanceVisitors() {
  const [win, setWin] = useState(null)
  const { data, refresh, reload } = useData(() => maintenanceVisits(win), [win])
  // While the app is in maintenance the list grows: look again every 20 seconds.
  useAutoRefresh(() => data?.status === 'maintenance' && refresh(), 20000)
  if (data === null) return <NeedsUpdate n="071" what="who opened the app during maintenance" />
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>

  const visitors = data.visitors ?? []
  const w = (data.windows ?? []).find((x) => x.id === data.window)
  if (!w) {
    return (
      <div className={`${lcard} flex items-start gap-3 p-4`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><UserRound size={20} /></span>
        <div>
          <p className="font-bold">Opened during maintenance</p>
          <p className="text-xs leading-5 text-neutral-600">When the app is in maintenance, every phone that opens it is listed here (with the customer&apos;s name and number when they are logged in). Afterwards you can send just them a notification that Jholzo is back.</p>
        </div>
      </div>
    )
  }
  const reachable = visitors.filter((x) => x.reachable).length
  const known = visitors.filter((x) => x.phone).length
  return (
    <div className={`${lcard} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><UserRound size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Opened during maintenance</p>
          <p className="text-xs text-neutral-600">
            {w.ended_at ? `${when(w.started_at)} – ${clock(w.ended_at)}` : <>Now, since {when(w.started_at)} <span className="font-semibold text-amber-700">· updating</span></>}
          </p>
        </div>
        {data.windows.length > 1 && (
          <select value={data.window} onChange={(e) => setWin(Number(e.target.value))} className={`${lfield} h-10 w-auto py-0 text-sm`} aria-label="Which maintenance">
            {data.windows.map((x) => (
              <option key={x.id} value={x.id}>{x.ended_at ? `${when(x.started_at)} · ${x.visitors} phones` : `Now · ${x.visitors} phones`}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat n={visitors.length} label="phones opened it" />
        <Stat n={known} label="logged-in customers" />
        <Stat n={reachable} label="can get a notification" />
      </div>

      {visitors.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {visitors.map((x) => (
            <li key={x.install_id} className="flex items-center gap-3 p-3 text-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"><Smartphone size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {x.name || (x.phone ? 'Customer' : 'Guest (not logged in)')}
                  {x.phone && <a href={`tel:+91${x.phone}`} className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700"><Phone size={12} />{x.phone}</a>}
                  {(x.is_test || x.env === 'dev') && <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold">Test</span>}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {x.platform === 'ios' ? 'iPhone' : 'Android'}{x.device_model ? ` · ${x.device_model}` : ''} · {clock(x.first_at)}{x.opens > 1 ? ` · opened ${x.opens} times` : ''}
                </p>
              </div>
              {x.reachable
                ? <BellRing size={16} className="shrink-0 text-emerald-600" aria-label="Can get a notification" />
                : <span className="shrink-0 text-[10px] font-semibold text-neutral-400">no notifications</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Nobody has opened the app during this maintenance{w.ended_at ? '.' : ' yet.'}</p>
      )}

      {visitors.length > 0 && <NotifyVisitors key={w.id} window={w} reachable={reachable} live={data.status !== 'maintenance' || !!w.ended_at} onSent={reload} />}
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-2">
      <p className="text-xl font-black">{n}</p>
      <p className="text-[11px] leading-4 text-neutral-500">{label}</p>
    </div>
  )
}

function NotifyVisitors({ window, reachable, live, onSent }) {
  const [title, setTitle] = useState("We're back! 🎉")
  const [body, setBody] = useState('Jholzo is open again. Order now and enjoy today\'s offers.')
  const [link, setLink] = useState(LINKS.grocery())
  const [linkOk, setLinkOk] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function send() {
    setConfirm(false)
    setBusy(true)
    setMsg(null)
    try {
      const r = await notifyMaintenanceVisitors(window.id, { title, body, link })
      setMsg({ ok: `Sent to ${r?.sent ?? 0} of ${r?.targeted ?? 0} phones${r?.failed ? ` (${r.failed} could not be reached)` : ''}.` })
      onSent()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
      <p className="text-sm font-bold">Tell them Jholzo is back</p>
      {!live && <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800">The app is still in maintenance. Switch it back to Live above first, then send this.</p>}
      {window.notified_at && <p className="flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 size={14} /> Already sent on {when(window.notified_at)}. You can send another one.</p>}
      <label className="block">
        <span className="text-xs font-semibold">Title</span>
        <input className={`${lfield} mt-1`} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold">Message</span>
        <textarea className={`${lfield} mt-1 h-20 py-2`} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div>
        <span className="text-xs font-semibold">Opens</span>
        <LinkPicker value={link} onChange={(l, complete) => { setLink(l); setLinkOk(complete) }} allowNone />
      </div>
      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}
      {confirm ? (
        <div className="space-y-2 rounded-xl border border-violet-300 bg-white p-3">
          <p className="text-sm font-bold">Send &quot;{title.trim()}&quot; to {reachable} phone{reachable === 1 ? '' : 's'} now?</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} className={`${lbtn} bg-violet-700 text-white`}><BellRing size={16} /> Yes, send</button>
            <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not now</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || !title.trim() || !body.trim() || !linkOk || reachable === 0 || !live}
          onClick={() => setConfirm(true)} className={`${lbtn} w-full bg-violet-700 text-white`}>
          <BellRing size={16} /> {busy ? 'Sending…' : reachable ? `Send to ${reachable} phone${reachable === 1 ? '' : 's'}` : 'Nobody here can get notifications'}
        </button>
      )}
      <p className="text-[11px] text-neutral-500">Only phones that allowed Jholzo notifications get it. It also shows in Notifications.</p>
    </div>
  )
}
