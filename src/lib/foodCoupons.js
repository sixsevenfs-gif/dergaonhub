// Jholzo Food coupons (database update 070): the owner makes them in Admin → Food → Coupons; customers see the
// bar "Add ₹54 more to get ₹50 off" in the cart and pick one at checkout. place_food_order() checks the coupon
// and works out the discount itself. The rules here are the same as the apps', so the preview shows what
// customers see. In demo mode (no keys) the coupons live in this tab.
import { supabase as sb } from './supabase.js'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

export const EMPTY_COUPON = {
  id: null, code: '', title: '', note: '', kind: 'flat', value: 50, max_off: null, min_order: 249, restaurant_id: null,
  first_order_only: false, uses_per_customer: 1, total_uses: null, show_in_app: true, active: true, starts_at: null, ends_at: null, sort: 0,
}

/* ---------- the rules (same as the apps) ---------- */

/** Rupees off these dishes (0 below the minimum). */
export function couponOff(c, items) {
  if (!c || items < c.min_order) return 0
  if (c.kind === 'flat') return Math.min(Math.floor(c.value), items)
  return Math.min(Math.floor((items * c.value) / 100), c.max_off ?? items, items)
}

/** "₹50 off" / "20% off up to ₹80" (or the owner's own title). */
export function couponTitle(c) {
  if (c.title?.trim()) return c.title.trim()
  return c.kind === 'flat' ? `₹${Math.floor(c.value)} off` : `${c.value}% off${c.max_off ? ` up to ₹${c.max_off}` : ''}`
}

/** The small line: when it works. */
export function couponRule(c) {
  const parts = [c.min_order > 0 ? `On orders above ₹${c.min_order}` : 'On any order']
  if (c.first_order_only) parts.push('first food order')
  if (c.note?.trim()) parts.push(c.note.trim())
  return parts.join(' · ')
}

/** The cart bar: the best coupon this cart already gets, and the next one to unlock (if it gives more). */
export function couponNudge(coupons, items) {
  const usable = (coupons ?? []).filter((c) => !c.used_up)
  let applied = null
  for (const c of usable) {
    const off = couponOff(c, items)
    if (off > 0 && (!applied || off > applied.off)) applied = { coupon: c, off }
  }
  const next = usable
    .filter((c) => c.min_order > items && couponOff(c, c.min_order) > (applied?.off ?? 0))
    .sort((a, b) => a.min_order - b.min_order)[0]
  return {
    applied,
    next: next ? { coupon: next, more: next.min_order - items, off: couponOff(next, next.min_order), progress: items / next.min_order } : null,
  }
}

/** The words on the bar, exactly as the apps show them. */
export function nudgeText(n) {
  if (n.next) return `Add ₹${n.next.more} more to get ${couponTitle(n.next.coupon)}`
  if (n.applied) return `Yay! ${couponTitle(n.applied.coupon)} unlocked · ${n.applied.coupon.code}`
  return ''
}

/** Live, scheduled, ended, off or used up. */
export function couponState(c, now = Date.now()) {
  if (!c.active) return ['Off', 'bg-neutral-200 text-neutral-600']
  if (c.starts_at && new Date(c.starts_at) > now) return ['Scheduled', 'bg-sky-100 text-sky-800']
  if (c.ends_at && new Date(c.ends_at) <= now) return ['Ended', 'bg-neutral-200 text-neutral-600']
  if (c.total_uses && (c.uses ?? 0) >= c.total_uses) return ['Used up', 'bg-amber-100 text-amber-800']
  return ['Live', 'bg-green-100 text-green-800']
}

/* ---------- demo ---------- */

const demo = {
  coupons: [
    { ...EMPTY_COUPON, id: 'c1', code: 'FOOD50', title: '', kind: 'flat', value: 50, min_order: 249, uses: 12, discount_total: 600, created_at: new Date().toISOString() },
    { ...EMPTY_COUPON, id: 'c2', code: 'NEW20', kind: 'percent', value: 20, max_off: 80, min_order: 0, first_order_only: true, uses: 31, discount_total: 1850, created_at: new Date().toISOString() },
  ],
}

/* ---------- reads and saves ---------- */

/** Every coupon with uses and money given (owner and executive). Null before update 070. */
export async function listCoupons() {
  if (!sb) return structuredClone(demo.coupons)
  const { data, error } = await sb.rpc('desk_food_coupons')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function saveCoupon(c) {
  const row = {
    code: String(c.code ?? '').trim().toUpperCase(), title: String(c.title ?? '').trim().slice(0, 40), note: String(c.note ?? '').trim().slice(0, 80),
    kind: c.kind === 'percent' ? 'percent' : 'flat', value: Number(c.value), max_off: c.kind === 'percent' && Number(c.max_off) > 0 ? Math.floor(Number(c.max_off)) : null,
    min_order: Math.max(0, Math.floor(Number(c.min_order) || 0)), restaurant_id: c.restaurant_id || null, first_order_only: Boolean(c.first_order_only),
    uses_per_customer: Math.max(0, Math.floor(Number(c.uses_per_customer) || 0)), total_uses: Number(c.total_uses) > 0 ? Math.floor(Number(c.total_uses)) : null,
    show_in_app: Boolean(c.show_in_app), active: Boolean(c.active), starts_at: c.starts_at || null, ends_at: c.ends_at || null, sort: Math.floor(Number(c.sort) || 0),
  }
  if (!/^[A-Z0-9]{3,15}$/.test(row.code)) throw new Error('A code is 3 to 15 capital letters or numbers, like FOOD50.')
  if (!(row.value > 0)) throw new Error('Enter how much off.')
  if (row.kind === 'percent' && row.value > 90) throw new Error('A % coupon can be at most 90% off.')
  if (row.kind === 'flat' && row.min_order > 0 && row.value >= row.min_order) throw new Error('The ₹ off should be less than the minimum order.')
  if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) throw new Error('The end must be after the start.')
  if (!sb) {
    const old = demo.coupons.find((x) => x.id === c.id)
    if (demo.coupons.some((x) => x.code === row.code && x.id !== c.id)) throw new Error('This code is already used by another coupon.')
    if (old) Object.assign(old, row)
    else demo.coupons.unshift({ ...row, id: `c${Date.now()}`, uses: 0, discount_total: 0, created_at: new Date().toISOString() })
    return
  }
  const { error } = c.id ? await sb.from('food_coupons').update(row).eq('id', c.id) : await sb.from('food_coupons').insert(row)
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('This code is already used by another coupon.')
    throw new Error(error.message)
  }
}

export async function setCouponActive(id, active) {
  if (!sb) {
    const c = demo.coupons.find((x) => x.id === id)
    if (c) c.active = active
    return
  }
  check(await sb.from('food_coupons').update({ active }).eq('id', id))
}

export async function deleteCoupon(id) {
  if (!sb) {
    demo.coupons = demo.coupons.filter((x) => x.id !== id)
    return
  }
  check(await sb.from('food_coupons').delete().eq('id', id))
}
