import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Phone, Plus, Search } from 'lucide-react'
import { lbtnDark, lcard, lfield } from '../../../components/ui.js'
import { fssaiDaysLeft } from '../../../lib/foodAdmin.js'
import DeskShell from './desk/DeskShell.jsx'
import { STATUSES } from './desk/meta.js'
import { fresh, go, pathFor } from './desk/nav.js'
import { store } from './desk/store.js'
import { StatusChip, Switch, useToast } from './desk/ui.jsx'

// Admin → Food → Restaurants: every restaurant, switch it on or off in the app, and open one to change anything
// (the same editor as the Food Desk).
export default function FoodRestaurants() {
  return (
    <DeskShell>
      <List />
    </DeskShell>
  )
}

const inApp = (r) => r.status === 'live' && !!r.fssai_number?.trim()

function List() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => store.listRestaurants().then(setRows).catch((e) => { setRows([]); toast(e) }), [toast])
  useEffect(() => {
    load()
  }, [load])

  async function add() {
    setBusy('add')
    try {
      const r = await store.createRestaurant({ status: 'talking' })
      fresh.add(r.id)
      go(`r/${r.id}`)
    } catch (e) {
      toast(e)
      setBusy('')
    }
  }

  // On: Live (needs the FSSAI number). Off: Paused, it leaves the app at once; its menu and photos stay.
  async function flip(r) {
    const on = !inApp(r)
    if (on && !r.fssai_number?.trim()) return toast(new Error('Add the FSSAI number first (open the restaurant → Papers).'))
    setBusy(r.id)
    try {
      await store.updateRestaurant(r.id, { status: on ? 'live' : 'paused' })
      setRows((all) => all.map((x) => (x.id === r.id ? { ...x, status: on ? 'live' : 'paused' } : x)))
      toast(on ? `${r.name || 'Restaurant'} is in the app now.` : `${r.name || 'Restaurant'} is off. Customers can't order from it.`)
    } catch (e) {
      toast(e)
    }
    setBusy('')
  }

  const list = (rows ?? [])
    .filter((r) => filter === 'all' ? r.status !== 'dropped' : filter === 'app' ? inApp(r) : r.status === filter)
    .filter((r) => {
      const s = q.trim().toLowerCase()
      return !s || `${r.name} ${r.area} ${r.owner_name} ${r.phone} ${(r.cuisines || []).join(' ')}`.toLowerCase().includes(s)
    })
  const count = (f) => (rows ?? []).filter((r) => (f === 'app' ? inApp(r) : r.status === f)).length
  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Restaurants</h1>
          <p className="text-sm text-neutral-500">
            Switch a restaurant on or off in the app here. Open one to change its timings, deal and markup, location,
            photos and menu (switch dishes on or off). Changes save by themselves.
          </p>
        </div>
        <button type="button" onClick={add} disabled={busy === 'add'} className={`${lbtnDark} shrink-0 px-3 text-sm`}>
          <Plus size={16} /> {busy === 'add' ? 'Adding…' : 'Add'}
        </button>
      </div>

      <label className="relative block">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, area, owner or phone" className={`${lfield} pl-10`} />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
        <button type="button" onClick={() => setFilter('app')} className={chip(filter === 'app')}>In the app ({count('app')})</button>
        {STATUSES.filter((s) => s.id !== 'live').map((s) => (
          <button key={s.id} type="button" onClick={() => setFilter(s.id)} className={chip(filter === s.id)}>{s.label} ({count(s.id)})</button>
        ))}
      </div>

      {rows === null && <p className="text-sm text-neutral-500">Loading…</p>}
      {rows && list.length === 0 && (
        <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>{rows.length ? 'No restaurants match.' : 'No restaurants yet. Press Add.'}</p>
      )}
      <div className="space-y-3">
        {list.map((r) => {
          const left = fssaiDaysLeft(r.fssai_expiry)
          const on = inApp(r)
          const cover = r.cover_photos?.[0] || r.cover_photo
          const missing = [
            !r.fssai_number?.trim() && 'FSSAI number',
            !cover && 'cover photo',
            !r.itemCount && 'menu',
            !r.deal_type && 'deal',
            !(r.opens_at && r.closes_at) && 'timings',
          ].filter(Boolean)
          const phone = r.phone || r.whatsapp
          return (
            <div key={r.id} className={`${lcard} overflow-hidden ${r.status === 'dropped' ? 'opacity-60' : ''}`}>
              <Link to={pathFor(`r/${r.id}`)} className="flex gap-3 p-4">
                {cover
                  ? <img src={store.photoUrl(cover)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-400">No photo</span>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">{r.name?.trim() || 'No name yet'}</span>
                    <StatusChip status={r.status} />
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {[r.area, r.opens_at && r.closes_at ? `${r.opens_at.slice(0, 5)}–${r.closes_at.slice(0, 5)}` : '', r.closed_on ? `off ${r.closed_on}` : ''].filter(Boolean).join(' · ') || 'No timings yet'}
                  </span>
                  <span className="mt-1 block text-sm">
                    {r.itemCount} dishes{r.offCount ? ` (${r.offCount} off)` : ''} · {r.photoCount ?? 0} photos
                    {r.deal_type && <> · {r.deal_type === 'markup' ? 'Markup' : r.deal_type === 'commission' ? 'Commission' : 'Monthly'} {r.deal_value != null ? `${Number(r.deal_value)}${r.deal_type === 'monthly' ? ' ₹' : '%'}` : ''}</>}
                  </span>
                  <span className="block text-xs">
                    FSSAI: {r.fssai_number?.trim() || <span className="text-red-600">missing</span>}
                    {left !== null && <span className={left <= 30 ? ' font-semibold text-red-600' : ' text-neutral-500'}> · {left < 0 ? 'ended' : `${left} days left`}</span>}
                  </span>
                  {missing.length > 0 && r.status !== 'dropped' && <span className="block text-xs text-amber-700">Missing: {missing.join(', ')}</span>}
                </span>
                <ChevronRight size={18} className="mt-1 shrink-0 text-neutral-400" />
              </Link>
              {r.status !== 'dropped' && (
                <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5">
                  <button type="button" disabled={busy === r.id} onClick={() => flip(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50">
                    <Switch checked={on} />
                    <span className={`text-sm font-semibold ${on ? 'text-green-700' : 'text-neutral-500'}`}>{on ? 'In the app: customers can order' : 'Off: not in the app'}</span>
                  </button>
                  {phone && <a href={`tel:+91${phone}`} className="flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-sm font-semibold"><Phone size={14} /> Call</a>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
