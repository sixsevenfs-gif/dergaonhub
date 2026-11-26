import { useState } from 'react'
import { Apple, CalendarClock, Download, FlaskConical, LogIn, Search, Smartphone, Trash2, UserCheck, Users } from 'lucide-react'
import Toggle from '../../../components/Toggle.jsx'
import { lbtnDanger, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import { fmtDateTime, timeAgo } from '../../../lib/format.js'
import { SHOWS, appUsers, deleteInstalls, deviceName, listInstalls, markInstalls, setCountFrom, setTelegramNewUsers } from '../../../lib/appUsers.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'

// datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
const localInput = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// Owner: the apps' own users (update 069), apart from the website: downloads, logins, customers, versions and
// every phone. Test phones can be marked (not counted) or deleted; counting can start from any moment.
export default function AdminAppUsers() {
  const [show, setShow] = useState('counted')
  const [search, setSearch] = useState('')
  const { data: s, error, reload, refresh } = useData(appUsers)
  const countFrom = s?.count_from ?? null
  const { data: list, reload: reloadList, refresh: refreshList } = useData(() => listInstalls({ show, search, countFrom }), [show, search, countFrom])
  useAutoRefresh(() => {
    refresh()
    refreshList()
  }, 30_000)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [ask, setAsk] = useState(null) // which delete is waiting for "Yes"
  const [pick, setPick] = useState('')
  if (s === null || list === null) return <NeedsUpdate n="069" what="the people using your apps" />
  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
  if (!s) return <p className="text-sm text-neutral-500">Loading…</p>

  async function run(name, fn, ok) {
    setBusy(name)
    setMsg(null)
    try {
      const n = await fn()
      setAsk(null)
      if (ok) setMsg({ ok: typeof ok === 'function' ? ok(n) : ok })
      reload()
      reloadList()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy('')
    }
  }
  const removed = (n) => `Deleted ${n} ${n === 1 ? 'phone' : 'phones'}.`

  return (
    <div className="space-y-4">
      <AppHeader title="App users" text="Downloads and logins from the Android and iPhone apps only. The website is counted apart (Grocery → Logins), so the numbers never mix." />

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric Icon={Download} tone="bg-violet-100 text-violet-700" label="Downloads" value={s.installs} note={`Android ${s.android} · iPhone ${s.ios}`} />
        <Metric Icon={LogIn} tone="bg-emerald-100 text-emerald-700" label="Logged in now" value={s.logged_in} note={s.installs ? `${Math.round((s.logged_in / s.installs) * 100)}% of downloads` : '—'} />
        <Metric Icon={Users} tone="bg-sky-100 text-sky-700" label="Customers" value={s.customers} note="different numbers that logged in" />
        <Metric Icon={Smartphone} tone="bg-amber-100 text-amber-700" label="New today" value={s.today} note={`${s.new_7d} this week`} />
        <Metric Icon={UserCheck} tone="bg-teal-100 text-teal-700" label="Opened today" value={s.active_today} note={`${s.active_7d} in the last 7 days`} />
        <Metric Icon={LogIn} tone="bg-rose-100 text-rose-700" label="Logins today" value={s.logins_today} note="from the apps" />
      </div>

      <Chart days={s.by_day ?? []} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${lcard} space-y-3 p-4`}>
          <h3 className="flex items-center gap-2 font-bold"><CalendarClock size={17} className="text-violet-600" /> Counting starts</h3>
          <p className="text-sm text-neutral-600">{countFrom ? <>Counting phones that first opened the app from <b>{fmtDateTime(countFrom)}</b>.</> : <>Counting <b>every</b> phone since the first one.</>} Use this on launch day, so your test phones before it don't count.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => run('from', () => setCountFrom(new Date().toISOString()), 'Counting starts now.')} className={`${lbtnOutline} h-10 text-sm`}>Start from now</button>
            <input type="datetime-local" className={`${lfield} h-10 w-auto text-sm`} value={pick || localInput(countFrom)} onChange={(e) => setPick(e.target.value)} />
            <button type="button" disabled={!!busy || !pick} onClick={() => run('from', () => setCountFrom(new Date(pick).toISOString()), 'Saved.').then(() => setPick(''))} className={`${lbtnOutline} h-10 text-sm`}>Set</button>
            {countFrom && <button type="button" disabled={!!busy} onClick={() => run('from', () => setCountFrom(null), 'Counting every phone again.')} className={`${lbtnOutline} h-10 text-sm`}>Count all</button>}
          </div>
          {s.before > 0 && (
            <Danger asking={ask === 'before'} onAsk={() => setAsk('before')} onNo={() => setAsk(null)} busy={busy === 'before'}
              onYes={() => run('before', () => deleteInstalls({ what: 'before' }), removed)}
              label={`${s.before} ${s.before === 1 ? 'phone is' : 'phones are'} from before counting started`} question="Delete them and their logins? This can't be undone." />
          )}
        </div>

        <div className={`${lcard} space-y-3 p-4`}>
          <h3 className="flex items-center gap-2 font-bold"><FlaskConical size={17} className="text-violet-600" /> Test phones</h3>
          <p className="text-sm text-neutral-600">Mark your own and your friends' phones as <b>Test</b> in the list below: they stop counting at once. Test builds from Xcode and Android Studio never count. Delete them whenever you like.</p>
          <Danger asking={ask === 'test'} onAsk={() => setAsk('test')} onNo={() => setAsk(null)} busy={busy === 'test'} disabled={!s.test}
            onYes={() => run('test', () => deleteInstalls({ what: 'test' }), removed)} label={`Marked test: ${s.test}`} question="Delete every phone marked Test, with its logins?" />
          <Danger asking={ask === 'dev'} onAsk={() => setAsk('dev')} onNo={() => setAsk(null)} busy={busy === 'dev'} disabled={!s.dev}
            onYes={() => run('dev', () => deleteInstalls({ what: 'dev' }), removed)} label={`Test builds: ${s.dev}`} question="Delete every test build?" />
          <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
            <div>
              <p className="text-sm font-semibold">Telegram me each new app customer</p>
              <p className="text-xs text-neutral-500">A message when a number logs in to the app for the first time.</p>
            </div>
            <Toggle checked={!!s.tg_app_users} label="Telegram for new app customers" onChange={(on) => run('tg', () => setTelegramNewUsers(on))} />
          </div>
        </div>
      </div>

      {(s.versions ?? []).length > 0 && (
        <div className={`${lcard} p-4`}>
          <h3 className="font-bold">Versions in use</h3>
          <p className="text-xs text-neutral-500">Phones that opened the app in the last 30 days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.versions.map((v) => <span key={`${v.platform}-${v.version}`} className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">{v.platform === 'ios' ? 'iPhone' : 'Android'} {v.version} · {v.n}</span>)}
          </div>
        </div>
      )}

      <div className={`${lcard} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-bold">Phones</h3>
          <label className="relative w-full sm:w-60">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input className={`${lfield} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Number, name or phone model" />
          </label>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {SHOWS.filter(([k]) => k !== 'before' || countFrom).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setShow(k)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold ${show === k ? 'bg-violet-700 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{label}</button>
          ))}
        </div>
        {list === undefined ? <p className="mt-3 text-sm text-neutral-500">Loading…</p> : list.length === 0 ? (
          <p className="mt-4 text-center text-sm text-neutral-500">No phones here yet. They show up when people open the new app.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {list.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${i.platform === 'ios' ? 'bg-neutral-900 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {i.platform === 'ios' ? <Apple size={18} /> : <Smartphone size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {i.phone ? <>{i.name || 'No name'} · {i.phone}</> : <span className="text-neutral-500">Not logged in yet</span>}
                      {i.phone && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${i.logged_in ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{i.logged_in ? 'logged in' : 'logged out'}</span>}
                      {i.is_test && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Test</span>}
                      {i.env === 'dev' && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Test build</span>}
                    </p>
                    <p className="text-sm text-neutral-600">{deviceName(i.device_model)} · {i.platform === 'ios' ? 'iOS' : 'Android'} {i.os_version} · app {i.app_version || '?'}</p>
                    <p className="text-xs text-neutral-500">Downloaded {fmtDateTime(i.first_seen_at)} · last open {timeAgo(i.last_seen_at)} · {i.opens} {i.opens === 1 ? 'open' : 'opens'} · {i.logins} {i.logins === 1 ? 'login' : 'logins'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button type="button" disabled={!!busy} onClick={() => run(`mark${i.id}`, () => markInstalls([i.id], !i.is_test))} className={`${lbtnOutline} h-8 px-2.5 text-xs`}>{i.is_test ? 'Count it' : 'Test'}</button>
                    <button type="button" aria-label="Delete" disabled={!!busy} onClick={() => setAsk(`row${i.id}`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                </div>
                {ask === `row${i.id}` && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-sm">
                    <span className="flex-1 text-red-800">Delete this phone and its logins?</span>
                    <button type="button" disabled={!!busy} onClick={() => run(`row${i.id}`, () => deleteInstalls({ ids: [i.id] }), removed)} className={`${lbtnDanger} h-8 px-3`}>Delete</button>
                    <button type="button" onClick={() => setAsk(null)} className={`${lbtnOutline} h-8 px-3`}>Keep</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({ Icon, tone, label, value, note }) {
  return (
    <div className={`${lcard} p-4`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={20} /></span>
      <p className="mt-3 text-xs font-semibold text-neutral-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-neutral-500">{note}</p>
    </div>
  )
}

function Danger({ label, question, asking, onAsk, onYes, onNo, busy, disabled }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {!asking && <button type="button" disabled={disabled} onClick={onAsk} className={`${lbtnDanger} h-8 px-3 text-xs disabled:opacity-40`}><Trash2 size={14} /> Delete</button>}
      </div>
      {asking && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="flex-1 text-red-800">{question}</span>
          <button type="button" disabled={busy} onClick={onYes} className={`${lbtnDanger} h-8 px-3 text-xs`}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
          <button type="button" onClick={onNo} className={`${lbtnOutline} h-8 px-3 text-xs`}>Keep</button>
        </div>
      )}
    </div>
  )
}

// Last 30 days: downloads and new customers per day, side by side; the numbers on hover.
function Chart({ days }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.installs, d.customers]))
  const total = days.reduce((t, d) => t + d.installs, 0)
  const people = days.reduce((t, d) => t + d.customers, 0)
  return (
    <div className={`${lcard} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Last 30 days</h3>
        <div className="flex gap-3 text-xs text-neutral-600">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600" /> Downloads ({total})</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> New customers ({people})</span>
        </div>
      </div>
      <div className="mt-3 flex h-32 items-end gap-[3px]">
        {days.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.installs} downloads, ${d.customers} new customers`} className="flex h-full flex-1 items-end gap-[1px]">
            <div className="w-1/2 rounded-t-[3px] bg-violet-600" style={{ height: d.installs ? `${Math.max(5, (d.installs / max) * 100)}%` : '2px', opacity: d.installs ? 1 : 0.2 }} />
            <div className="w-1/2 rounded-t-[3px] bg-emerald-600" style={{ height: d.customers ? `${Math.max(5, (d.customers / max) * 100)}%` : '2px', opacity: d.customers ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500"><span>{days[0]?.day}</span><span>{days.at(-1)?.day}</span></div>
    </div>
  )
}
