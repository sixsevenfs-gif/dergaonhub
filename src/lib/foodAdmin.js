// Jholzo Food for the admin (database updates 059–064): sales numbers, food orders, restaurants, payouts and
// the food bill settings. With the database it uses the owner's or executive's login (the database checks
// every step again); in demo mode (no keys) it shows sample data kept in this tab, so the pages can be tried.
import { supabase as sb } from './supabase.js'
import { addDays, dateStr } from './format.js'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}
// "relation does not exist" / "function not found": the update is not run yet.
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

export const FOOD_STATUS = {
  placed: ['New', 'bg-red-100 text-red-700'],
  confirmed: ['Preparing', 'bg-amber-100 text-amber-800'],
  picked: ['On the way', 'bg-sky-100 text-sky-800'],
  delivered: ['Delivered', 'bg-green-100 text-green-800'],
  cancelled: ['Cancelled', 'bg-neutral-200 text-neutral-600'],
}

export const FOOD_SETTING_DEFAULTS = { food_on: true, food_delivery_fee: 30, food_free_delivery_above: 199, food_platform_fee: 5, food_gst_percent: 5 }

/* ---------- demo data (this tab only) ---------- */

const demo = (() => {
  const now = Date.now()
  const ago = (min) => new Date(now - min * 60_000).toISOString()
  const restaurants = [
    { id: 'r1', name: 'Food delight', status: 'live', fssai_number: '20324120000166', fssai_expiry: '2030-05-19', cover_photo: '', area: 'DKD Road', address: 'Near DKD road', phone: '9876543210', whatsapp: '', pay_when: 'daily', upi_id: '', deal_type: 'markup', deal_value: 20, menu: 20, photos: 0 },
    { id: 'r2', name: 'S Mandal fast food', status: 'talking', fssai_number: '', fssai_expiry: null, cover_photo: '', area: 'Bazaar', address: '', phone: '9876500000', whatsapp: '', pay_when: 'weekly', upi_id: '', deal_type: 'markup', deal_value: 20, menu: 5, photos: 0 },
    { id: 'r3', name: 'Tusa', status: 'talking', fssai_number: '', fssai_expiry: null, cover_photo: '', area: '', address: '', phone: '', whatsapp: '', pay_when: '', upi_id: '', deal_type: '', deal_value: null, menu: 62, photos: 0 },
  ]
  const order = (n, min, status, items, extra = {}) => {
    const itemsTotal = items.reduce((s, i) => s + i.price * i.qty, 0)
    const menuTotal = items.reduce((s, i) => s + i.menu_price * i.qty, 0)
    const delivery = itemsTotal >= 199 ? 0 : 30
    const gst = Math.round(itemsTotal * 0.05)
    return {
      id: `fo${n}`, order_number: `JF-${1000 + n}`, created_at: ago(min), restaurant_id: 'r1', restaurant_name: 'Food delight',
      restaurant_address: 'Near DKD road', customer_name: ['Asha Devi', 'Rahul Das', 'Priya Gogoi', 'Bikash Saikia'][n % 4],
      customer_phone: `98765${String(43210 + n).padStart(5, '0')}`, address: 'Ward 3, near Dergaon Bazaar', area: 'Dergaon', lat: 26.70, lng: 93.97,
      note: n === 1 ? 'Less spicy please' : '', status, payment_method: n % 3 ? 'cash' : 'upi', items_total: itemsTotal, menu_total: menuTotal,
      packing_fee: 0, delivery_fee: delivery, platform_fee: 5, gst, total: itemsTotal + delivery + 5 + gst, rider_id: null, cancel_reason: '',
      confirmed_at: status !== 'placed' ? ago(min - 3) : null, picked_at: ['picked', 'delivered'].includes(status) ? ago(min - 15) : null,
      delivered_at: status === 'delivered' ? ago(min - 30) : null,
      food_order_items: items.map((i, k) => ({ id: `fo${n}i${k}`, line_total: i.price * i.qty, variant: '', diet: 'nonveg', ...i })),
      ...extra,
    }
  }
  const rice = { name: 'Chicken Fried Rice', qty: 2, price: 85, menu_price: 70 }
  const roll = { name: 'Chicken Roll', qty: 1, price: 110, menu_price: 90 }
  const chowmein = { name: 'Veg Chowmein', qty: 2, price: 60, menu_price: 50 }
  const chilli = { name: 'Chilli Chicken', qty: 1, price: 170, menu_price: 140 }
  const orders = [
    order(1, 4, 'placed', [rice, roll]),
    order(2, 25, 'confirmed', [chowmein, chilli]),
    order(3, 60, 'picked', [roll]),
    order(4, 180, 'delivered', [rice, chilli]),
    order(5, 60 * 26, 'delivered', [chowmein]),
    order(6, 60 * 50, 'delivered', [rice, rice].map((x) => ({ ...x, qty: 1 }))),
    order(7, 60 * 75, 'cancelled', [roll], { cancel_reason: 'Cancelled by customer' }),
  ]
  return { restaurants, orders, payouts: [], settings: { ...FOOD_SETTING_DEFAULTS } }
})()

const istDay = (iso) => dateStr(new Date(new Date(iso).getTime()))

function demoSales(from, to) {
  const o = demo.orders.filter((x) => istDay(x.created_at) >= from && istDay(x.created_at) <= to)
  const d = o.filter((x) => x.status === 'delivered')
  const sum = (list, f) => list.reduce((s, x) => s + Number(f(x) || 0), 0)
  const byDay = []
  for (let day = from; day <= to && byDay.length < 93; day = addDays(day, 1)) {
    const od = o.filter((x) => istDay(x.created_at) === day)
    const dd = od.filter((x) => x.status === 'delivered')
    byDay.push({ day, orders: od.length, delivered: dd.length, sales: sum(dd, (x) => x.total) })
  }
  const dishes = {}
  for (const x of d) for (const i of x.food_order_items) {
    const row = (dishes[i.name] ??= { name: i.name, qty: 0, sales: 0 })
    row.qty += i.qty
    row.sales += i.line_total
  }
  return {
    orders: o.length, delivered: d.length, cancelled: o.filter((x) => x.status === 'cancelled').length,
    open: o.filter((x) => ['placed', 'confirmed', 'picked'].includes(x.status)).length,
    sales: sum(d, (x) => x.total), items_total: sum(d, (x) => x.items_total), menu_total: sum(d, (x) => x.menu_total),
    markup: sum(d, (x) => x.items_total - x.menu_total), delivery_fees: sum(d, (x) => x.delivery_fee), platform_fees: sum(d, (x) => x.platform_fee),
    packing: sum(d, (x) => x.packing_fee), gst: sum(d, (x) => x.gst), cash: sum(d.filter((x) => x.payment_method === 'cash'), (x) => x.total),
    upi: sum(d.filter((x) => x.payment_method === 'upi'), (x) => x.total), customers: new Set(o.filter((x) => x.status !== 'cancelled').map((x) => x.customer_phone)).size,
    by_day: byDay,
    by_restaurant: d.length ? [{ id: 'r1', name: 'Food delight', orders: o.length, delivered: d.length, sales: sum(d, (x) => x.total), menu_total: sum(d, (x) => x.menu_total), markup: sum(d, (x) => x.items_total - x.menu_total) }] : [],
    top_dishes: Object.values(dishes).sort((a, b) => b.qty - a.qty).slice(0, 10),
  }
}

/* ---------- reads ---------- */

/** Numbers for a date range (India dates "YYYY-MM-DD"). Null before update 064. */
export async function foodSales(from, to) {
  if (!sb) return demoSales(from, to)
  const { data, error } = await sb.rpc('admin_food_sales', { p_from: from, p_to: to })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** Food orders placed in the last `days` days, newest first, with their dishes. */
export async function foodOrders(days = 7) {
  if (!sb) return structuredClone(demo.orders)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await sb.from('food_orders').select('*, food_order_items(*)').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(500)
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function foodOrder(id) {
  if (!sb) return structuredClone(demo.orders.find((o) => o.id === id) ?? null)
  return check(await sb.from('food_orders').select('*, food_order_items(*)').eq('id', id).maybeSingle())
}

/** New food orders waiting for the desk (the nav badge). 0 before update 064. */
export async function foodNewCount() {
  if (!sb) return demo.orders.filter((o) => o.status === 'placed').length
  const { count, error } = await sb.from('food_orders').select('id', { count: 'exact', head: true }).eq('status', 'placed')
  return error ? 0 : count ?? 0
}

/** Every restaurant in the Food Desk with menu and photo counts (owner and executive). */
export async function foodRestaurants() {
  if (!sb) return structuredClone(demo.restaurants)
  const rows = check(await sb.from('food_restaurants')
    .select('id, name, status, fssai_number, fssai_expiry, cover_photo, area, address, phone, whatsapp, pay_when, deal_type, deal_value, opens_at, closes_at, closed_on, updated_at, food_menu_items(id, photo, available)')
    .order('updated_at', { ascending: false }))
  return rows.map(({ food_menu_items: items = [], ...r }) => ({
    ...r, menu: items.length, photos: items.filter((i) => i.photo).length, off: items.filter((i) => !i.available).length,
  }))
}

/** Owner: what each restaurant is owed. Null before update 064. */
export async function foodPayouts() {
  if (!sb) {
    return demo.restaurants.filter((r) => r.status !== 'dropped').map((r) => {
      const earned = demo.orders.filter((o) => o.restaurant_id === r.id && o.status === 'delivered').reduce((s, o) => s + o.menu_total, 0)
      const paid = demo.payouts.filter((p) => p.restaurant_id === r.id).reduce((s, p) => s + p.amount, 0)
      return { id: r.id, name: r.name, pay_when: r.pay_when, upi_id: r.upi_id, phone: r.phone, delivered_orders: demo.orders.filter((o) => o.restaurant_id === r.id && o.status === 'delivered').length, earned, paid, owed: earned - paid, last_paid: demo.payouts.filter((p) => p.restaurant_id === r.id).at(-1)?.created_at ?? null }
    })
  }
  const { data, error } = await sb.rpc('admin_food_payouts')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function foodPayoutHistory(restaurantId) {
  if (!sb) return demo.payouts.filter((p) => p.restaurant_id === restaurantId).slice().reverse()
  return check(await sb.from('food_payouts').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(30))
}

/** The food bill settings (store_settings). Null before update 064. */
export async function foodSettings() {
  if (!sb) return { ...demo.settings }
  const { data, error } = await sb.from('store_settings').select(Object.keys(FOOD_SETTING_DEFAULTS).join(',')).eq('id', 1).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/* ---------- actions (the database checks who may do them) ---------- */

export async function setFoodStatus(id, status, reason = '') {
  if (!sb) {
    const o = demo.orders.find((x) => x.id === id)
    if (!o) throw new Error('Order not found.')
    if (status === 'cancelled' && !reason.trim()) throw new Error('Write why it is cancelled.')
    o.status = status
    const now = new Date().toISOString()
    if (status === 'confirmed') o.confirmed_at ??= now
    if (status === 'picked') o.picked_at = now
    if (status === 'delivered') o.delivered_at = now
    if (status === 'cancelled') o.cancel_reason = reason.trim()
    return
  }
  check(await sb.rpc('desk_food_status', { p_order_id: id, p_status: status, p_reason: reason }))
}

export async function assignFoodRider(id, riderId) {
  if (!sb) {
    const o = demo.orders.find((x) => x.id === id)
    if (o) o.rider_id = riderId || null
    return
  }
  check(await sb.rpc('desk_food_assign', { p_order_id: id, p_rider: riderId || null }))
}

export async function recordFoodPayout(restaurantId, amount, note = '') {
  const n = Math.round(Number(amount) * 100) / 100
  if (!(n > 0)) throw new Error('Enter the amount paid.')
  if (!sb) {
    demo.payouts.push({ id: `p${demo.payouts.length + 1}`, restaurant_id: restaurantId, amount: n, note, created_at: new Date().toISOString() })
    return
  }
  check(await sb.from('food_payouts').insert({ restaurant_id: restaurantId, amount: n, note: note.trim() }))
}

export async function saveFoodSettings(values) {
  const row = {
    food_on: !!values.food_on,
    food_delivery_fee: Math.max(0, Math.round(Number(values.food_delivery_fee) || 0)),
    food_free_delivery_above: Math.max(0, Math.round(Number(values.food_free_delivery_above) || 0)),
    food_platform_fee: Math.max(0, Math.round(Number(values.food_platform_fee) || 0)),
    food_gst_percent: Math.min(28, Math.max(0, Math.round((Number(values.food_gst_percent) || 0) * 100) / 100)),
  }
  if (!sb) {
    Object.assign(demo.settings, row)
    return
  }
  check(await sb.from('store_settings').update(row).eq('id', 1))
}

/* ---------- helpers for the pages ---------- */

export const foodItemsText = (o) => (o.food_order_items ?? []).map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} ×${i.qty}`).join(', ')

/** Days until the FSSAI licence ends (negative: ended), or null when no date is saved. */
export function fssaiDaysLeft(expiry) {
  if (!expiry) return null
  return Math.round((new Date(`${expiry}T00:00:00`) - new Date(`${dateStr()}T00:00:00`)) / 86_400_000)
}

/** "4:05 pm" today, "Yesterday 4:05 pm", or "21 Nov, 4:05 pm". */
export function whenText(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return time
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`
}

/** "12 min ago" for fresh orders. */
export function agoText(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h ${min % 60} min ago` : whenText(iso)
}

/* ---------- rider page (/partner) ---------- */

/** Food orders for this rider to pick up and deliver now (their own and confirmed ones nobody took). */
export async function partnerFoodOrders() {
  if (!sb) {
    return demo.orders.filter((o) => o.status === 'confirmed' || o.status === 'picked').map((o) => ({
      id: o.id, no: o.order_number, status: o.status, restaurant: o.restaurant_name, pickup_address: o.restaurant_address,
      pickup_phone: '9876543210', pickup_map: '', pickup_lat: null, pickup_lng: null, name: o.customer_name, phone: o.customer_phone,
      address: o.address, area: o.area, lat: o.lat, lng: o.lng, note: o.note, payment: o.payment_method, total: o.total,
      menu_total: o.menu_total, mine: !!o.rider_id, items: o.food_order_items.map((i) => ({ name: i.name, variant: i.variant, qty: i.qty })),
    }))
  }
  const { data, error } = await sb.rpc('partner_food_orders')
  if (error) {
    if (missing(error)) return []
    throw new Error(error.message)
  }
  return data ?? []
}

/** Rider: "picked" (from the restaurant) or "delivered". An order nobody took becomes theirs. */
export async function partnerFoodStatus(id, status) {
  if (!sb) {
    const o = demo.orders.find((x) => x.id === id)
    if (o) Object.assign(o, { status, rider_id: o.rider_id ?? 'me', [`${status}_at`]: new Date().toISOString() })
    return
  }
  check(await sb.rpc('partner_food_status', { p_order_id: id, p_status: status }))
}
