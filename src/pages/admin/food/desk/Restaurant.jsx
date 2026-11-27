import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { store } from './store.js'
import { STATUSES, checklist } from './meta.js'
import { fresh, go } from './nav.js'
import { SaveBadge, Spinner, StatusChip, Text, TopBar, useToast } from './ui.jsx'
import DetailsTab from './DetailsTab.jsx'
import MenuTab from './MenuTab.jsx'
import PapersTab from './PapersTab.jsx'

const INT = ['prep_minutes', 'delivery_minutes']
const DEC = ['cost_for_two', 'min_order', 'packing_fee', 'deal_value', 'lat', 'lng']

// Form values → database values (empty number = not filled).
function toDb(patch) {
  const out = {}
  for (const [k, v] of Object.entries(patch)) {
    if (INT.includes(k) || DEC.includes(k)) {
      const n = v === '' || v == null ? null : Number(v)
      out[k] = n == null || Number.isNaN(n) ? null : INT.includes(k) ? Math.round(n) : n
    } else if (k === 'fssai_expiry') out[k] = v || null
    else out[k] = v
  }
  return out
}

const isEmpty = (r) =>
  !r.name && !r.owner_name && !r.phone && !r.whatsapp && !r.address && !r.area && !r.maps_link && r.lat == null &&
  !(r.cuisines || []).length && !r.notes && !r.cover_photo && !r.fssai_number && r.status === 'talking'

export default function Restaurant({ id, tab }) {
  const toast = useToast()
  const [r, setR] = useState(null)
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState('')
  const pending = useRef({})
  const timer = useRef(null)

  useEffect(() => {
    let live = true
    Promise.all([store.getRestaurant(id), store.listItems(id), store.listFiles(id)])
      .then(([row, its, fs]) => {
        if (!live) return
        if (!row) setMissing(true)
        setR(row)
        setItems(its)
        setFiles(fs)
      })
      .catch((e) => toast(e))
    return () => {
      live = false
    }
  }, [id, toast])

  // Changes save by themselves a moment after typing stops.
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    if (!Object.keys(patch).length) return
    pending.current = {}
    setSaveState('saving')
    try {
      await store.updateRestaurant(id, toDb(patch))
      if (!Object.keys(pending.current).length) setSaveState('saved')
    } catch (e) {
      pending.current = { ...patch, ...pending.current }
      setSaveState('error')
      toast(e)
    }
  }, [id, toast])

  const patch = useCallback((key, value) => {
    setR((cur) => ({ ...cur, [key]: value }))
    pending.current[key] = value
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }, [flush])

  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      flush()
    }
  }, [flush])

  // Leaving the page any way (← button, phone back gesture): save, and drop a just-added restaurant
  // that was left completely empty.
  // (Runs when the page closes; if the address still shows this restaurant, it is not really leaving.)
  const latest = useRef({})
  latest.current = { r, items, files, flush }
  useEffect(() => () => {
    if (location.pathname.startsWith(`/admin/food/restaurants/${id}`)) return
    const { r: cur, items: its, files: fs, flush: save } = latest.current
    ;(async () => {
      await save()
      if (fresh.has(id) && cur && isEmpty(cur) && !its.length && !fs.length) {
        fresh.delete(id)
        await store.deleteRestaurant(id).catch(() => {})
        window.dispatchEvent(new Event('desk:changed'))
      }
    })()
  }, [id])


  if (missing)
    return (
      <div className="p-8 text-center">
        <p className="text-muted">This restaurant is not there any more.</p>
        <button onClick={() => go('/')} className="mt-4 font-semibold text-fd-red">Back to the list</button>
      </div>
    )
  if (!r) return <Spinner />

  const list = checklist(r, { itemCount: items.length, fileKinds: [...new Set(files.map((f) => f.kind))] })
  const done = list.filter((x) => x.done).length
  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'menu', label: `Menu · ${items.length}` },
    { id: 'papers', label: `Papers · ${files.length}` },
  ]
  const ctx = { r, patch, items, setItems, files, setFiles, toast, flush }

  return (
    <div className="pb-6">
      <TopBar
        title={
          <div className="min-w-0">
            <p className={`truncate text-[15.5px] font-semibold leading-tight ${r.name ? '' : 'text-muted'}`}>{r.name || 'New restaurant'}</p>
            <div className="mt-0.5"><StatusChip status={r.status} /></div>
          </div>
        }
        right={<SaveBadge state={saveState} onRetry={flush} />}
      >
        <nav className="mx-auto flex max-w-2xl gap-1 px-3 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => go(`r/${id}${t.id === 'details' ? '' : `/${t.id}`}`)}
              className={`press flex-1 rounded-xl py-2 text-[13.5px] font-semibold ${tab === t.id ? 'bg-fd-red text-white' : 'bg-white border border-line text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </TopBar>

      <main className="mx-auto max-w-2xl space-y-3 pt-3">
        {tab === 'details' && (
          <>
            <div className="card p-4">
              <p className="mb-2 text-[13px] font-medium text-ink/80">Where are we with them?</p>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => patch('status', s.id)}
                    className={`press shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold ${r.status === s.id ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {r.status === 'dropped' && (
                <div className="mt-3">
                  <Text value={r.drop_reason} onChange={(v) => patch('drop_reason', v)} placeholder="Why not? (e.g. no staff to handle orders)" />
                </div>
              )}
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-fd-veg transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
                </div>
                <span className="text-[13px] font-semibold">{done} of {list.length} done</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {list.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => x.tab !== 'details' && go(`r/${id}/${x.tab}`)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${x.done ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}
                  >
                    {x.done && <Check size={12} strokeWidth={3} />} {x.label}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[12px] text-muted">Nothing here is required. Grey ones are still to ask; fill them whenever you get them.</p>
            </div>
            <DetailsTab {...ctx} autoFocus={fresh.has(id) && !r.name} onDeleted={() => go('/')} />
          </>
        )}
        {tab === 'menu' && <MenuTab {...ctx} />}
        {tab === 'papers' && <PapersTab {...ctx} />}
      </main>
    </div>
  )
}
