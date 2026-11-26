import { useState } from 'react'
import { Pencil, Plus, ShoppingBag, TicketPercent, Trash2 } from 'lucide-react'
import Toggle from '../../../components/Toggle.jsx'
import { lbtn, lbtnDanger, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useRole } from '../../../lib/role.js'
import { fmtDateTime, rupee } from '../../../lib/format.js'
import { foodRestaurants } from '../../../lib/foodAdmin.js'
import { EMPTY_COUPON, couponNudge, couponOff, couponRule, couponState, couponTitle, deleteCoupon, listCoupons, nudgeText, saveCoupon, setCouponActive } from '../../../lib/foodCoupons.js'
import { PhoneFrame } from '../app/AppPreview.jsx'
import { NeedsUpdate } from './FoodBits.jsx'

// "2026-12-01T18:30:00Z" ↔ the datetime-local box (local time).
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
const fromLocal = (v) => (v ? new Date(v).toISOString() : null)

// Food coupons (update 070). The owner makes and changes them, with a preview of the cart bar and the coupon as
// customers see them; the executive sees the list. Jholzo pays the discount; restaurants get their menu total.
export default function FoodCoupons() {
  const { isOwner } = useRole()
  const { data: list, error, reload } = useData(listCoupons)
  const { data: places } = useData(foodRestaurants)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [ask, setAsk] = useState(null)
  if (list === null) return <NeedsUpdate n="070" what="food coupons" />

  async function run(name, fn, ok) {
    setBusy(name)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg({ ok })
      reload()
      return true
    } catch (err) {
      setMsg({ error: err.message })
      return false
    } finally {
      setBusy('')
    }
  }
  const placeName = (id) => places?.find((p) => p.id === id)?.name ?? 'one restaurant'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><TicketPercent className="text-red-600" /> Coupons</h1>
          <p className="text-sm text-neutral-500">For food orders only (Jholzo Money stays for grocery). Customers see "Add ₹54 more to get ₹50 off" in the cart; the discount comes off your markup, restaurants get their full menu total.</p>
        </div>
        {isOwner && !edit && (
          <button type="button" onClick={() => { setMsg(null); setEdit({ ...EMPTY_COUPON }) }} className={`${lbtn} bg-red-600 text-white`}><Plus size={16} /> New coupon</button>
        )}
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}

      {edit && (
        <Editor value={edit} onChange={setEdit} places={places ?? []} busy={busy === 'save'} others={list ?? []}
          onCancel={() => setEdit(null)}
          onSave={() => run('save', () => saveCoupon(edit), edit.id ? 'Saved. The apps show it within a minute.' : 'Coupon made. The apps show it within a minute.').then((ok) => ok && setEdit(null))} />
      )}

      {list === undefined ? <p className="text-sm text-neutral-500">Loading…</p> : list.length === 0 ? (
        <div className={`${lcard} p-8 text-center`}>
          <p className="text-3xl">🎟️</p>
          <p className="mt-2 font-bold">No coupons yet</p>
          <p className="text-sm text-neutral-500">Make one: for example ₹50 off above ₹249, or 20% off the first food order.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => {
            const [state, tone] = couponState(c)
            return (
              <li key={c.id} className={`${lcard} p-4`}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><TicketPercent size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black">{couponTitle(c)}</span>
                      <span className="rounded-md border border-dashed border-red-300 bg-red-50 px-2 py-0.5 font-mono text-xs font-bold text-red-700">{c.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{state}</span>
                      {!c.show_in_app && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">Code only</span>}
                    </div>
                    <p className="text-sm text-neutral-600">{couponRule(c)}{c.restaurant_id ? ` · only ${c.restaurant_name || placeName(c.restaurant_id)}` : ''}</p>
                    <p className="text-xs text-neutral-500">
                      {c.uses_per_customer ? `${c.uses_per_customer}× per customer` : 'No limit per customer'}{c.total_uses ? ` · ${c.total_uses} in all` : ''}
                      {c.starts_at ? ` · from ${fmtDateTime(c.starts_at)}` : ''}{c.ends_at ? ` · till ${fmtDateTime(c.ends_at)}` : ''}
                    </p>
                    <p className="mt-1 text-sm"><b>{c.uses ?? 0}</b> {c.uses === 1 ? 'order' : 'orders'} · <b>{rupee(c.discount_total ?? 0)}</b> given on delivered orders</p>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <Toggle checked={c.active} label={`Coupon ${c.code} on`} onChange={(on) => run(`t${c.id}`, () => setCouponActive(c.id, on))} />
                      <button type="button" aria-label="Change" onClick={() => { setMsg(null); setEdit({ ...c }) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"><Pencil size={16} /></button>
                      <button type="button" aria-label="Delete" onClick={() => setAsk(c.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
                {ask === c.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-red-50 p-3 text-sm">
                    <span className="flex-1 text-red-800">Delete {c.code}? Past orders keep their discount. To pause it, switch it off instead.</span>
                    <button type="button" disabled={!!busy} onClick={() => run(`d${c.id}`, () => deleteCoupon(c.id), 'Deleted.').then(() => setAsk(null))} className={`${lbtnDanger} h-9 px-3`}>Delete</button>
                    <button type="button" onClick={() => setAsk(null)} className={`${lbtnOutline} h-9 px-3`}>Keep</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Editor({ value: c, onChange, places, busy, others, onSave, onCancel }) {
  const set = (patch) => onChange({ ...c, ...patch })
  const num = (v) => (v === '' ? '' : Number(v))
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className={`${lcard} space-y-4 p-4`}>
        <h3 className="font-bold">{c.id ? `Change ${c.code}` : 'New coupon'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-sm font-semibold">Code</span>
            <input className={`${lfield} mt-1 font-mono uppercase`} maxLength={15} value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="FOOD50" /></label>
          <div><span className="text-sm font-semibold">Discount</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[['flat', '₹ off'], ['percent', '% off']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ kind: k, value: k === 'flat' ? 50 : 20, max_off: k === 'flat' ? null : 80 })}
                  className={`h-11 rounded-xl text-sm font-bold ${c.kind === k ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
              ))}
            </div>
          </div>
          <label className="block"><span className="text-sm font-semibold">{c.kind === 'flat' ? 'Rupees off' : 'Percent off'}</span>
            <input className={`${lfield} mt-1`} inputMode="numeric" value={c.value} onChange={(e) => set({ value: num(e.target.value.replace(/[^\d.]/g, '')) })} /></label>
          {c.kind === 'percent' ? (
            <label className="block"><span className="text-sm font-semibold">At most (₹)</span>
              <input className={`${lfield} mt-1`} inputMode="numeric" value={c.max_off ?? ''} onChange={(e) => set({ max_off: num(e.target.value.replace(/\D/g, '')) || null })} placeholder="No cap" /></label>
          ) : <div />}
          <label className="block"><span className="text-sm font-semibold">Minimum order (dishes, ₹)</span>
            <input className={`${lfield} mt-1`} inputMode="numeric" value={c.min_order} onChange={(e) => set({ min_order: num(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
          <label className="block"><span className="text-sm font-semibold">Restaurant</span>
            <select className={`${lfield} mt-1`} value={c.restaurant_id ?? ''} onChange={(e) => set({ restaurant_id: e.target.value || null })}>
              <option value="">Every restaurant</option>
              {places.filter((p) => p.status === 'live' || p.id === c.restaurant_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-semibold">Title (optional)</span>
            <input className={`${lfield} mt-1`} maxLength={40} value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={couponTitle({ ...c, title: '' })} /></label>
          <label className="block"><span className="text-sm font-semibold">Small line (optional)</span>
            <input className={`${lfield} mt-1`} maxLength={80} value={c.note} onChange={(e) => set({ note: e.target.value })} placeholder="Weekend special" /></label>
          <label className="block"><span className="text-sm font-semibold">Uses per customer</span>
            <select className={`${lfield} mt-1`} value={c.uses_per_customer} onChange={(e) => set({ uses_per_customer: Number(e.target.value) })}>
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n === 1 ? 'Once' : `${n} times`}</option>)}
              <option value={0}>No limit</option>
            </select></label>
          <label className="block"><span className="text-sm font-semibold">Total orders (optional)</span>
            <input className={`${lfield} mt-1`} inputMode="numeric" value={c.total_uses ?? ''} onChange={(e) => set({ total_uses: num(e.target.value.replace(/\D/g, '')) || null })} placeholder="No limit" /></label>
          <label className="block"><span className="text-sm font-semibold">Starts (optional)</span>
            <input type="datetime-local" className={`${lfield} mt-1`} value={toLocal(c.starts_at)} onChange={(e) => set({ starts_at: fromLocal(e.target.value) })} /></label>
          <label className="block"><span className="text-sm font-semibold">Ends (optional)</span>
            <input type="datetime-local" className={`${lfield} mt-1`} value={toLocal(c.ends_at)} onChange={(e) => set({ ends_at: fromLocal(e.target.value) })} /></label>
        </div>
        <div className="space-y-2">
          {[['first_order_only', 'Only on the first food order', 'For new customers: their first food order with Jholzo.'],
            ['show_in_app', 'Show in the app', 'Off: works only for people who type the code (for WhatsApp offers, influencers…).'],
            ['active', 'On', 'Off pauses it at once.']].map(([k, label, text]) => (
            <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
              <div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-neutral-500">{text}</p></div>
              <Toggle checked={Boolean(c[k])} label={label} onChange={(on) => set({ [k]: on })} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onSave} className={`${lbtn} bg-red-600 text-white`}>{busy ? 'Saving…' : c.id ? 'Save' : 'Make coupon'}</button>
          <button type="button" onClick={onCancel} className={lbtnOutline}>Cancel</button>
        </div>
      </div>
      <aside className="lg:sticky lg:top-36 lg:self-start">
        <CouponPreview coupon={c} others={others.filter((o) => o.id !== c.id && o.active && o.show_in_app)} />
      </aside>
    </div>
  )
}

// The cart bar and the coupon at checkout, as the apps draw them, for a cart total you slide.
function CouponPreview({ coupon, others }) {
  const min = Number(coupon.min_order) || 0
  const [items, setItems] = useState(Math.max(0, min - 54))
  const draft = { ...coupon, value: Number(coupon.value) || 0, min_order: min, code: coupon.code || 'CODE' }
  const n = couponNudge(coupon.show_in_app ? [draft, ...others] : others, items)
  const text = nudgeText(n)
  const off = couponOff(draft, items)
  return (
    <div className="space-y-3">
      <PhoneFrame label="Customers see">
        <div className="flex h-full flex-col bg-neutral-50">
          <div className="bg-white px-3 pb-2 pt-3">
            <p className="text-[13px] font-black">Food delight</p>
            <p className="text-[9px] text-neutral-500">North Indian · Chinese · 25 min</p>
          </div>
          <div className="flex-1 space-y-2 overflow-hidden p-2.5">
            {['Chicken Fried Rice', 'Chilli Chicken', 'Veg Chowmein', 'Chicken Roll'].map((d, i) => (
              <div key={d} className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
                <span className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-100 to-red-100" />
                <span className="flex-1"><span className="block text-[10px] font-bold">{d}</span><span className="text-[9px] text-neutral-500">₹{[120, 170, 70, 110][i]}</span></span>
                <span className="rounded-md border border-red-300 px-1.5 text-[9px] font-bold text-red-600">ADD</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 p-2.5">
            {text && (
              <div className="overflow-hidden rounded-xl bg-red-50 ring-1 ring-red-100">
                <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-red-800"><TicketPercent size={12} className="text-red-600" /> {text}</p>
                {n.next && <div className="h-1 bg-red-100"><div className="h-1 bg-red-500" style={{ width: `${Math.min(100, n.next.progress * 100)}%` }} /></div>}
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-red-600 px-3 py-2 text-white">
              <span className="text-[10px] font-bold"><ShoppingBag size={11} className="mr-1 inline" />2 items · ₹{items}</span>
              <span className="text-[10px] font-black">View cart ›</span>
            </div>
          </div>
        </div>
      </PhoneFrame>
      <label className="block rounded-2xl bg-white p-3 text-sm ring-1 ring-neutral-200">
        <span className="font-semibold">Cart in the preview: ₹{items}</span>
        <input type="range" min={0} max={Math.max(600, min * 2)} step={1} value={items} onChange={(e) => setItems(Number(e.target.value))} className="mt-2 w-full accent-red-600" />
      </label>
      <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">At checkout · coupons</p>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-red-300 p-3">
          <TicketPercent className="shrink-0 text-red-600" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">{couponTitle(draft)}</p>
            <p className="text-xs text-neutral-500">{draft.code} · {couponRule(draft)}</p>
          </div>
          {off > 0 ? <span className="text-xs font-black text-green-700">−₹{off}</span>
            : <span className="text-[11px] font-bold text-neutral-500">Add ₹{Math.max(0, min - items)} more</span>}
        </div>
      </div>
    </div>
  )
}
