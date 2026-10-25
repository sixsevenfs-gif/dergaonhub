// Real database data layer (Supabase). Same functions as store.demo.js; see supabase/schema.sql.
// Customers get an anonymous login per device; the admin logs in with email + password.
import { supabase as sb } from './supabase.js'
import { parseCSV } from './csv.js'
import { cleanPhone, dateStr, matches } from './format.js'
import { validPoint } from './delivery.js'

const CUSTOMER_KEY = 'dergaonhub-customer'
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const fail = (msg) => {
  throw new Error(msg)
}

// Supabase returns { data, error }; turn errors into normal exceptions with the database message.
function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}

const byName = (a, b) => a.name.localeCompare(b.name)
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0)
const now = () => new Date().toISOString()

/* ---------- login ---------- */

// Every visitor gets an anonymous login, so the orders they place belong to this device.
let ready = null
function session() {
  ready ??= (async () => {
    const { data } = await sb.auth.getSession()
    if (!data.session) check(await sb.auth.signInAnonymously())
  })().catch((err) => {
    ready = null
    throw err
  })
  return ready
}

// sb is null in demo mode (no keys); this file is then never used.
if (sb) sb.auth.onAuthStateChange(() => notify())

export async function adminSession() {
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return { email: '', isAdmin: false }
  const isAdmin = check(await sb.rpc('is_admin'))
  return { email: user.email, isAdmin: !!isAdmin }
}

export async function adminSignIn(email, password) {
  check(await sb.auth.signInWithPassword({ email: email.trim(), password }))
  const s = await adminSession()
  if (!s.isAdmin) {
    await sb.auth.signOut()
    ready = null
    fail('This login is not an admin.')
  }
  return s
}

export async function adminSignOut() {
  await sb.auth.signOut()
  ready = null
  notify()
}

export async function resetDemo() {
  fail('Reset is only for demo mode.')
}

/* ---------- store settings ---------- */

const hm = (t) => String(t ?? '').slice(0, 5)
const toStore = (r) => ({
  ...r,
  open_time: hm(r.open_time), close_time: hm(r.close_time), cutoff_time: hm(r.cutoff_time),
  slot_start: hm(r.slot_start), slot_end: hm(r.slot_end),
  max_delivery_km: Number(r.max_delivery_km),
  pack_mid_from: Number(r.pack_mid_from ?? 500), pack_high_from: Number(r.pack_high_from ?? 1000),
  pack_fee_low: Number(r.pack_fee_low ?? 0), pack_fee_mid: Number(r.pack_fee_mid ?? 0), pack_fee_high: Number(r.pack_fee_high ?? 0),
  location: { lat: r.lat, lng: r.lng },
})

export async function getStore() {
  return toStore(check(await sb.from('store_settings').select('*').eq('id', 1).single()))
}

export async function saveStore(data) {
  if (!data.name?.trim()) fail('Enter the store name.')
  if (cleanPhone(data.phone).length !== 10) fail('Enter a valid 10-digit phone number.')
  if (cleanPhone(data.whatsapp).length !== 10) fail('Enter a valid 10-digit WhatsApp number.')
  if (!data.delivery_area?.length) fail('Choose at least one delivery area.')
  if (!validPoint(data.location)) fail('Set the store location on the map.')
  if (!(Number(data.per_km_fee) >= 0) || !(Number(data.min_delivery_fee) >= 0)) fail('Enter valid delivery charges.')
  if (!(Number(data.max_delivery_km) > 0)) fail('Enter a valid max delivery distance.')
  const row = check(await sb.from('store_settings').update({
    name: data.name.trim(), phone: cleanPhone(data.phone), whatsapp: `91${cleanPhone(data.whatsapp)}`,
    open_time: data.open_time, close_time: data.close_time, cutoff_time: data.cutoff_time,
    slot_start: data.slot_start, slot_end: data.slot_end, min_order: Number(data.min_order) || 0,
    delivery_area: data.delivery_area, paused: !!data.paused, lat: data.location.lat, lng: data.location.lng,
    per_km_fee: Number(data.per_km_fee) || 0, min_delivery_fee: Number(data.min_delivery_fee) || 0,
    max_delivery_km: Number(data.max_delivery_km),
    pack_fee_low: Number(data.pack_fee_low) || 0, pack_fee_mid: Number(data.pack_fee_mid) || 0, pack_fee_high: Number(data.pack_fee_high) || 0,
    pack_mid_from: Number(data.pack_mid_from) || 0, pack_high_from: Number(data.pack_high_from) || 0,
    updated_at: now(),
  }).eq('id', 1).select().single())
  notify()
  return toStore(row)
}

export async function setPaused(paused) {
  check(await sb.from('store_settings').update({ paused: !!paused, updated_at: now() }).eq('id', 1))
  notify()
}

/* ---------- products ---------- */

export async function listCategories() {
  return check(await sb.from('categories').select('*').order('sort'))
}

// Customers see active products (row-level security); admin passes includeHidden to see all.
export async function listProducts({ q = '', categoryId = '', includeHidden = false } = {}) {
  let query = sb.from('products').select('*')
  if (!includeHidden) query = query.eq('status', 'active')
  if (categoryId) query = query.eq('category_id', categoryId)
  const rows = check(await query)
  return rows.filter((p) => !q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q)).sort(byName)
}

export async function addProduct({ name, size, category_id, keywords, price }) {
  if (!name?.trim()) fail('Enter the product name.')
  if (!category_id) fail('Choose a category.')
  if (!(Number(price) > 0)) fail('Enter a valid price.')
  const row = check(await sb.from('products').insert({
    name: name.trim(), size: size?.trim() ?? '', category_id, keywords: keywords?.trim() ?? '', price: Number(price),
  }).select().single())
  notify()
  return row
}

export async function updateProduct(id, patch) {
  const change = { updated_at: now() }
  if ('price' in patch) {
    if (!(Number(patch.price) > 0)) fail('Enter a valid price.')
    change.price = Number(patch.price)
  }
  if ('available' in patch) change.available = !!patch.available
  if ('featured' in patch) change.featured = !!patch.featured
  if ('status' in patch) change.status = patch.status
  check(await sb.from('products').update(change).eq('id', id))
  notify()
}

// photoUrl is the shrunk photo as a data URL (from PhotoPicker), or '' to remove the photo.
export async function setProductPhoto(id, photoUrl) {
  let url = ''
  if (photoUrl) {
    const blob = await (await fetch(photoUrl)).blob()
    const path = `products/${id}-${Date.now()}.jpg`
    check(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }))
    url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl
  }
  check(await sb.from('products').update({ photo_url: url, updated_at: now() }).eq('id', id))
  notify()
}

// CSV columns: name,size,category,keywords,price (category can be its id or its name).
export async function importProductsCSV(text) {
  const rows = parseCSV(text)
  if (rows.length && rows[0][0].trim().toLowerCase() === 'name') rows.shift()
  const categories = await listCategories()
  const existing = await listProducts({ includeHidden: true })
  const seen = new Set(existing.map((p) => `${p.name.toLowerCase()}|${p.size}`))
  const add = []
  const skipped = []
  for (const [name = '', size = '', category = '', keywords = '', price = ''] of rows) {
    const cat = categories.find((c) => c.id === category.trim() || c.name.toLowerCase() === category.trim().toLowerCase())
    const key = `${name.trim().toLowerCase()}|${size.trim()}`
    if (!name.trim() || !cat || !(Number(price) > 0)) skipped.push(name || '(empty row)')
    else if (seen.has(key)) skipped.push(`${name} (already added)`)
    else {
      seen.add(key)
      add.push({ name: name.trim(), size: size.trim(), category_id: cat.id, keywords: keywords.trim(), price: Number(price) })
    }
  }
  if (add.length) check(await sb.from('products').insert(add))
  notify()
  return { added: add.length, skipped }
}

/* ---------- customer profile (kept on this phone) ---------- */

export function currentCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY))
  } catch {
    return null
  }
}

function saveProfile(session) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session))
  } catch {
    fail('Could not save your login in this browser.')
  }
  notify()
  return session
}

export async function customerSignIn(phone, name = '') {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  await session()
  return saveProfile({ phone: ph, name: name.trim() || currentCustomer()?.name || '' })
}

export async function updateMyName(name) {
  const me = currentCustomer() ?? fail('Please log in first.')
  if (!name.trim()) fail('Enter your name.')
  return saveProfile({ ...me, name: name.trim() })
}

export async function customerSignOut() {
  try {
    localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    // nothing to clear
  }
  notify()
}

/* ---------- orders (customer) ---------- */

const toOrder = (o) => ({
  ...o,
  location: o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null,
  distance_km: o.distance_km == null ? null : Number(o.distance_km),
})

// Price, fee, limits and delivery day are all decided by place_order() in the database.
export async function placeOrder({ lines, name, phone, address, area, location, note, payment_method, allow_substitute }) {
  await session()
  const orderNumber = check(await sb.rpc('place_order', {
    p_lines: lines.map((l) => ({ product_id: l.productId, qty: l.qty, note: l.note || '' })),
    p_name: name, p_phone: cleanPhone(phone), p_address: address, p_area: area,
    p_lat: location?.lat ?? null, p_lng: location?.lng ?? null,
    p_note: note ?? '', p_payment: payment_method, p_allow_substitute: !!allow_substitute,
  }))
  notify()
  return { order_number: orderNumber, customer_phone: cleanPhone(phone), customer_name: name.trim() }
}

export async function getOrder(orderNumber) {
  await session()
  const res = check(await sb.rpc('get_order', { p_order_number: String(orderNumber) }))
  if (!res) return null
  return { order: toOrder(res.order), items: res.items, complaints: res.complaints, mine: res.mine, store: await getStore() }
}

// Orders placed from this phone (row-level security only returns those).
export async function ordersByPhone(phone) {
  await session()
  const rows = check(await sb.from('orders').select('*, order_items(*)').eq('customer_phone', cleanPhone(phone)).order('created_at', { ascending: false }))
  return rows.map(({ order_items, ...o }) => ({ ...toOrder(o), items: order_items, item_count: sum(order_items, (i) => i.quantity) }))
}

/* ---------- waitlist ---------- */

export async function joinWaitlist({ phone, name, location, label, km }) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  check(await sb.from('waitlist').insert({ phone: ph, name: name?.trim() ?? '', lat: location?.lat, lng: location?.lng, label: label ?? '', km }))
  notify()
}

export async function adminListWaitlist() {
  const rows = check(await sb.from('waitlist').select('*').order('notified').order('km'))
  return rows.map((w) => ({ ...w, km: Number(w.km), location: w.lat != null ? { lat: w.lat, lng: w.lng } : null }))
}

export async function setWaitlistNotified(id, notified) {
  check(await sb.from('waitlist').update({ notified }).eq('id', id))
  notify()
}

/* ---------- complaints ---------- */

export async function submitComplaint({ orderNumber, type, message }) {
  if (!type) fail('Choose the type of problem.')
  const found = await getOrder(orderNumber)
  if (!found) fail('Order not found.')
  if (!found.mine) fail('This order was not placed from this phone.')
  check(await sb.from('complaints').insert({
    order_id: found.order.id, order_number: found.order.order_number,
    customer_name: found.order.customer_name, customer_phone: found.order.customer_phone,
    type, message: message?.trim() ?? '',
  }))
  notify()
}

export async function myComplaints() {
  if (!currentCustomer()) return []
  await session()
  return check(await sb.from('complaints').select('*').order('created_at', { ascending: false }))
}

export async function adminListComplaints({ status = '' } = {}) {
  let query = sb.from('complaints').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const rows = check(await query)
  return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1))
}

export async function resolveComplaint(id, note) {
  check(await sb.from('complaints').update({ status: 'resolved', admin_note: note?.trim() ?? '', resolved_at: now() }).eq('id', id))
  notify()
}

export async function reopenComplaint(id) {
  check(await sb.from('complaints').update({ status: 'open', resolved_at: null }).eq('id', id))
  notify()
}

/* ---------- admin: orders ---------- */

// "This number has 1 earlier no-show" hints for a list of orders.
async function hintsFor(orders) {
  const phones = [...new Set(orders.map((o) => o.customer_phone))]
  if (!phones.length) return () => ({ completed: 0, no_show_count: 0, blocked: false })
  const customers = check(await sb.from('customers').select('id, phone, no_show_count, blocked').in('phone', phones))
  const done = check(await sb.from('orders').select('customer_id').eq('status', 'completed').in('customer_id', customers.map((c) => c.id)))
  return (phone) => {
    const c = customers.find((x) => x.phone === phone)
    if (!c) return { completed: 0, no_show_count: 0, blocked: false }
    return { completed: done.filter((d) => d.customer_id === c.id).length, no_show_count: c.no_show_count, blocked: c.blocked }
  }
}

const expireOld = async () => check(await sb.rpc('expire_old_orders'))

export async function adminListOrders({ status = '', date = '' } = {}) {
  await expireOld()
  let query = sb.from('orders').select('*, order_items(quantity)').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  if (date) query = query.eq('delivery_date', date)
  const rows = check(await query)
  const hint = await hintsFor(rows)
  return rows.map(({ order_items, ...o }) => ({ ...toOrder(o), item_count: sum(order_items, (i) => i.quantity), hint: hint(o.customer_phone) }))
}

export async function getOrderById(orderId) {
  await expireOld()
  const o = check(await sb.from('orders').select('*').eq('id', orderId).maybeSingle())
  if (!o) return null
  const [items, complaints, store, hint] = await Promise.all([
    sb.from('order_items').select('*').eq('order_id', orderId).then(check),
    sb.from('complaints').select('*').eq('order_id', orderId).then(check),
    getStore(),
    hintsFor([o]),
  ])
  return { order: toOrder(o), items, store, complaints, hint: hint(o.customer_phone) }
}

async function updateOrder(id, change, onlyFrom, message) {
  let query = sb.from('orders').update(change).eq('id', id)
  if (onlyFrom) query = query.in('status', onlyFrom)
  const rows = check(await query.select('id'))
  if (!rows.length) fail(message)
  notify()
}

export const confirmOrder = (id) =>
  updateOrder(id, { status: 'confirmed', confirmed_at: now() }, ['placed'], 'Only new orders can be confirmed.')

// Delivered and paid.
export async function completeOrder(id, cashCollected) {
  const o = check(await sb.from('orders').select('payment_method, total').eq('id', id).single())
  const cash = o.payment_method === 'cash' ? Number(cashCollected ?? o.total) || 0 : 0
  await updateOrder(id, { status: 'completed', completed_at: now(), cash_collected: cash }, ['placed', 'confirmed'], 'A cancelled order cannot be delivered.')
}

export const reopenOrder = (id) =>
  updateOrder(id, { status: 'confirmed', completed_at: null, cash_collected: 0 }, ['completed'], 'Only delivered orders can be undone.')

export async function cancelOrder(id, reason) {
  if (!reason) fail('Choose a reason for cancelling.')
  check(await sb.rpc('cancel_order', { p_order_id: id, p_reason: reason }))
  notify()
}

// An item was not found at the shop: remove it and recalculate the total.
export async function removeOrderItem(orderId, itemId) {
  const o = check(await sb.from('orders').select('status, delivery_fee, packaging_fee').eq('id', orderId).single())
  if (o.status !== 'placed' && o.status !== 'confirmed') fail('This order can no longer be changed.')
  const items = check(await sb.from('order_items').select('id, line_total').eq('order_id', orderId))
  const remaining = items.filter((i) => i.id !== itemId)
  if (!remaining.length) fail('You cannot remove the last item. Cancel the order instead.')
  check(await sb.from('order_items').delete().eq('id', itemId))
  const subtotal = sum(remaining, (i) => i.line_total)
  check(await sb.from('orders').update({ subtotal, total: subtotal + o.delivery_fee + (o.packaging_fee ?? 0) }).eq('id', orderId))
  notify()
}

/* ---------- admin: day tools ---------- */

const count = async (query) => {
  const { count: n, error } = await query
  if (error) throw new Error(error.message)
  return n ?? 0
}

export async function adminStats() {
  await expireOld()
  const today = dateStr()
  const [newOrders, todays, openComplaints, outOfStock, waitlist, store] = await Promise.all([
    count(sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'placed')),
    sb.from('orders').select('total').eq('delivery_date', today).neq('status', 'cancelled').then(check),
    count(sb.from('complaints').select('id', { count: 'exact', head: true }).eq('status', 'open')),
    count(sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('available', false)),
    count(sb.from('waitlist').select('id', { count: 'exact', head: true }).eq('notified', false)),
    getStore(),
  ])
  return { newOrders, todayOrders: todays.length, todayValue: sum(todays, (o) => o.total), openComplaints, outOfStock, waitlist, paused: store.paused }
}

// The evening run: orders for one day grouped by area, plus one shopping list for the trip.
export async function deliverySheet(date) {
  await expireOld()
  const rows = check(await sb.from('orders').select('*, order_items(*)').eq('delivery_date', date).neq('status', 'cancelled').order('created_at'))
  const orders = rows.map(({ order_items, ...o }) => ({ ...toOrder(o), items: order_items }))
  const shopping = {}
  for (const o of orders.filter((x) => x.status === 'confirmed')) {
    for (const i of o.items) {
      shopping[i.name_snapshot] ??= { name: i.name_snapshot, quantity: 0, cost: 0 }
      shopping[i.name_snapshot].quantity += i.quantity
      shopping[i.name_snapshot].cost += i.line_total
    }
  }
  const areas = [...new Set(orders.map((o) => o.area))].sort()
  return {
    count: orders.length,
    cap: 15,
    groups: areas.map((area) => ({ area, orders: orders.filter((o) => o.area === area) })),
    shopping: Object.values(shopping).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// Money for one day: what customers paid, what was spent at the shops, what is left.
export async function dailySummary(date) {
  const [day, expense] = await Promise.all([
    sb.from('orders').select('status, payment_method, total, cash_collected, delivery_fee, packaging_fee, cancel_reason').eq('delivery_date', date).then(check),
    sb.from('daily_expenses').select('*').eq('date', date).maybeSingle().then(check),
  ])
  const done = day.filter((o) => o.status === 'completed')
  const cash = sum(done.filter((o) => o.payment_method === 'cash'), (o) => o.cash_collected)
  const upi = sum(done.filter((o) => o.payment_method === 'upi'), (o) => o.total)
  const spent = expense?.amount ?? 0
  return {
    orders: day.length, delivered: done.length,
    cancelled: day.filter((o) => o.status === 'cancelled').length,
    noShows: day.filter((o) => o.cancel_reason === 'No-show').length,
    value: sum(done, (o) => o.total), cash, upi, collected: cash + upi,
    fees: sum(done, (o) => o.delivery_fee), packaging: sum(done, (o) => o.packaging_fee ?? 0), spent, spentNote: expense?.note ?? '', profit: cash + upi - spent,
  }
}

export async function setDailyExpense(date, amount, note = '') {
  const value = Number(amount)
  if (!(value >= 0)) fail('Enter a valid amount.')
  check(await sb.from('daily_expenses').upsert({ date, amount: value, note: note.trim() }))
  notify()
}

/* ---------- admin: customers ---------- */

export async function adminListCustomers() {
  const [customers, orders] = await Promise.all([
    sb.from('customers').select('*').then(check),
    sb.from('orders').select('customer_id, status').then(check),
  ])
  return customers
    .map((c) => ({
      ...c,
      orders: orders.filter((o) => o.customer_id === c.id).length,
      completed: orders.filter((o) => o.customer_id === c.id && o.status === 'completed').length,
    }))
    .sort((a, b) => b.no_show_count - a.no_show_count || a.name.localeCompare(b.name))
}

export async function setCustomerBlocked(id, blocked) {
  check(await sb.from('customers').update({ blocked }).eq('id', id))
  notify()
}

export async function resetNoShows(id) {
  check(await sb.from('customers').update({ no_show_count: 0 }).eq('id', id))
  notify()
}
