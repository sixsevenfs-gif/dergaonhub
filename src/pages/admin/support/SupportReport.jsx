import { useState } from 'react'
import { lcard } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { addDays, dateStr, rupee } from '../../../lib/format.js'
import { KIND_LABEL, TOPICS, supportReport } from '../../../lib/support.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import { SupportHeader } from './SupportBits.jsx'

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]
const minutes = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`)

// Owner: how support is going: how many requests, how fast you answer and resolve, what customers rate you,
// what goes wrong most, and which restaurant gets the most complaints.
export default function SupportReport() {
  const [range, setRange] = useState('30')
  const to = dateStr()
  const from = addDays(to, -(Number(range) - 1))
  const { data: r, error } = useData(() => supportReport(from, to), [from, to])
  if (r === null) return <NeedsUpdate n="069" what="the support report" />

  return (
    <div className="space-y-4">
      <SupportHeader title="Support report" text="How fast you answer, how customers rate the help, and what goes wrong most." />
      <div className="flex gap-2">
        {RANGES.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setRange(k)} className={`h-9 rounded-full px-3 text-sm font-semibold ${range === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`}>{label}</button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {!r ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="New requests" value={r.new} note={`${r.resolved} resolved`} />
            <Metric label="First answer" value={minutes(r.first_reply_min)} note="on average" />
            <Metric label="Resolved in" value={r.resolve_hours == null ? '—' : `${r.resolve_hours} h`} note={r.resolved ? `${Math.round((r.within_24h / r.resolved) * 100)}% within a day` : 'on average'} />
            <Metric label="Rating" value={r.rating_avg == null ? '—' : `${r.rating_avg} ★`} note={`${r.ratings} rating${r.ratings === 1 ? '' : 's'}`} />
            <Metric label="Need a reply now" value={r.open_now} note={`${r.pending_now} waiting for customers`} />
            <Metric label="Refunds" value={rupee(r.refunds)} note="given in this time" />
            {Object.entries(r.by_kind ?? {}).map(([k, n]) => <Metric key={k} label={KIND_LABEL[k] ?? k} value={n} note="requests" />)}
          </div>

          <Bars title="What went wrong" rows={(r.by_topic ?? []).map((x) => ({ key: `${x.kind}-${x.topic}`, label: `${TOPICS[x.topic] ?? x.topic}`, sub: KIND_LABEL[x.kind], n: x.n }))} empty="No requests in this time." />
          <Bars title="Food: requests by restaurant" rows={(r.by_restaurant ?? []).map((x) => ({ key: x.name, label: x.name, sub: Number(x.refunds) > 0 ? `${rupee(x.refunds)} refunded` : '', n: x.n }))} empty="No food requests in this time." />
          <Days days={r.by_day ?? []} from={from} to={to} />
        </>
      )}
    </div>
  )
}

function Metric({ label, value, note }) {
  return (
    <div className={`${lcard} p-4`}>
      <p className="text-xs font-semibold text-neutral-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-neutral-500">{note}</p>
    </div>
  )
}

function Bars({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map((x) => x.n))
  return (
    <div className={`${lcard} p-4`}>
      <h3 className="font-bold">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-neutral-500">{empty}</p> : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((x) => (
            <li key={x.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{x.label} {x.sub && <span className="font-normal text-neutral-500">· {x.sub}</span>}</span>
                <span className="text-neutral-600">{x.n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-teal-600" style={{ width: `${(x.n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Requests per day: one thin bar per day, the number on hover.
function Days({ days, from, to }) {
  const byDay = Object.fromEntries(days.map((d) => [d.day, d.n]))
  const list = []
  for (let d = from; d <= to; d = addDays(d, 1)) list.push([d, byDay[d] ?? 0])
  const max = Math.max(1, ...list.map(([, n]) => n))
  return (
    <div className={`${lcard} p-4`}>
      <h3 className="font-bold">Requests per day</h3>
      <div className="mt-3 flex h-28 items-end gap-[2px]">
        {list.map(([d, n]) => (
          <div key={d} title={`${d}: ${n}`} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[4px] bg-teal-600" style={{ height: n ? `${Math.max(6, (n / max) * 100)}%` : '2px', opacity: n ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500"><span>{from}</span><span>{to}</span></div>
    </div>
  )
}
