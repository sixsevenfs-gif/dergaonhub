import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ClipboardList, Package, Search, ShieldCheck, SlidersHorizontal, UserCog, Users, WalletMinimal } from 'lucide-react'
import { lbtnOutline, lcard, lfieldBase } from '../../components/ui.js'
import { AREAS, ROLE_LABEL, activityList, describeActivity, groupActivity } from '../../lib/activity.js'
import { useAutoRefresh } from '../../lib/useAutoRefresh.js'
import { NeedsUpdate } from './food/FoodBits.jsx'

const PAGE = 100
const AREA_ICON = { orders: ClipboardList, catalog: Package, customers: Users, money: WalletMinimal, settings: SlidersHorizontal, team: UserCog }
const ROLE_TONE = {
  owner: 'bg-neutral-900 text-white', executive: 'bg-sky-100 text-sky-800', rider: 'bg-emerald-100 text-emerald-800', collector: 'bg-amber-100 text-amber-800',
}
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function dayTitle(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

// Owner: who in the team changed what, and when (database update 072). Newest first, live, 100 at a time.
export default function AdminActivity() {
  const [area, setArea] = useState('')
  const [actor, setActor] = useState('')
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [list, setList] = useState({ rows: [], names: {}, team: [], loading: true, error: '', more: false, missing: false })
  const filters = useRef({ area, actor, q })
  filters.current = { area, actor, q }

  // Typing in the search waits a moment before asking.
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 350)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    let live = true
    setList((l) => ({ ...l, loading: true, error: '' }))
    activityList({ area, actor, q }).then(
      (data) => {
        if (!live) return
        if (data === null) return setList((l) => ({ ...l, missing: true, loading: false }))
        setList({ rows: data.rows, names: data, team: data.team, loading: false, error: '', more: data.rows.length === PAGE, missing: false })
      },
      (err) => live && setList((l) => ({ ...l, loading: false, error: err.message })),
    )
    return () => { live = false }
  }, [area, actor, q])

  // Live: new lines come in on top every 30 seconds (what is already shown stays).
  useAutoRefresh(async () => {
    const asked = JSON.stringify(filters.current)
    const data = await activityList({ ...filters.current, limit: 50 }).catch(() => null)
    if (!data || asked !== JSON.stringify(filters.current)) return   // the filter changed while it loaded
    setList((l) => {
      const top = l.rows[0]?.id ?? 0
      const fresh = data.rows.filter((r) => r.id > top)
      return fresh.length ? { ...l, rows: [...fresh, ...l.rows], names: data, team: data.team } : l
    })
  }, 30_000)

  async function older() {
    const last = list.rows.at(-1)?.id
    if (!last) return
    setList((l) => ({ ...l, loading: true }))
    try {
      const data = await activityList({ area, actor, q, before: last })
      setList((l) => ({ ...l, rows: [...l.rows, ...(data?.rows ?? [])], loading: false, more: (data?.rows.length ?? 0) === PAGE }))
    } catch (err) {
      setList((l) => ({ ...l, loading: false, error: err.message }))
    }
  }

  if (list.missing) return <NeedsUpdate n="072" what="the activity log: who in your team changed what, and when" />

  const items = groupActivity(list.rows, list.names)
  let lastDay = ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Activity log</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Every change your team makes: orders, prices, menus, money, settings and the team itself, with who did it and when.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
          <ShieldCheck size={14} className="text-emerald-600" /> Only you can see this. Nobody can change or delete it, not even you.
        </p>
      </div>

      <div className="space-y-2">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="What to show">
          {AREAS.map(([key, label]) => (
            <button key={key || 'all'} type="button" role="tab" aria-selected={area === key} onClick={() => setArea(key)}
              className={`h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${area === key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Order number, product, customer…" aria-label="Search the log"
              className={`${lfieldBase} w-full pl-9`} />
          </label>
          <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Who" className={`${lfieldBase} sm:w-56`}>
            <option value="">Everyone</option>
            {list.team.map((t) => (
              <option key={t.id ?? 'x'} value={t.id ?? ''}>
                {t.role === 'owner' && t.name === 'Owner' ? 'Owner' : `${t.name} · ${ROLE_LABEL[t.role] ?? t.role}`} ({t.n})
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{list.error}</p>}

      <div className="space-y-2">
        {items.map((item) => {
          const head = item.group ? item.group[0] : item.row
          const title = dayTitle(head.at)
          const showDay = title !== lastDay
          lastDay = title
          return (
            <div key={head.id}>
              {showDay && <h2 className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-neutral-500">{title}</h2>}
              {item.group ? <GroupLine item={item} names={list.names} /> : <Line row={item.row} names={list.names} />}
            </div>
          )
        })}
        {!list.loading && !items.length && (
          <p className={`${lcard} p-5 text-center text-sm text-neutral-500`}>
            {q || area || actor ? 'Nothing matches. Try another filter.' : 'Nothing yet. Changes your team makes from now on show here.'}
          </p>
        )}
        {list.loading && <p className="p-3 text-center text-sm text-neutral-500">Loading…</p>}
        {list.more && !list.loading && (
          <button type="button" onClick={older} className={`${lbtnOutline} w-full`}>Show older</button>
        )}
      </div>
    </div>
  )
}

function Who({ row }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-500">
      <span className={`rounded px-1.5 py-px text-[11px] font-bold ${ROLE_TONE[row.actor_role] ?? 'bg-neutral-100 text-neutral-700'}`}>{ROLE_LABEL[row.actor_role] ?? row.actor_role}</span>
      {row.actor_role !== 'owner' && <span className="font-semibold text-neutral-700">{row.actor_name}</span>}
      <span>· {clock(row.at)}</span>
    </span>
  )
}

function AreaIcon({ area }) {
  const Icon = AREA_ICON[area] ?? SlidersHorizontal
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600" aria-hidden="true">
      <Icon size={17} />
    </span>
  )
}

function Line({ row, names }) {
  const { text, details, link } = describeActivity(row, names)
  const body = (
    <>
      <AreaIcon area={row.area} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-neutral-900">{text}</span>
        {details.length > 0 && (
          <span className="mt-1 block space-y-0.5">
            {details.map((d) => <span key={d} className="block break-words text-sm text-neutral-600">{d}</span>)}
          </span>
        )}
        <Who row={row} />
      </span>
      {link && <ChevronRight size={18} className="mt-2 shrink-0 text-neutral-400" />}
    </>
  )
  const cls = `${lcard} flex items-start gap-3 p-3`
  return link ? <Link to={link} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

// A whole menu typed in or a price list uploaded: one line, open it to see each one.
function GroupLine({ item, names }) {
  const [open, setOpen] = useState(false)
  const head = item.group[0]
  return (
    <div className={`${lcard} p-3`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <AreaIcon area={head.area} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-neutral-900">{item.text}</span>
          <Who row={head} />
        </span>
        <ChevronDown size={18} className={`mt-2 shrink-0 text-neutral-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-neutral-100 pl-12 pt-2">
          {item.group.map((r) => (
            <li key={r.id} className="text-sm text-neutral-700">{describeActivity(r, names).text} <span className="text-xs text-neutral-400">· {clock(r.at)}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}
