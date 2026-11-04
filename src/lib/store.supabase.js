// Real database data layer (Supabase). Same functions as store.demo.js; see supabase/schema.sql.
// Customers get an anonymous login per device; the admin logs in with email + password.
import { supabase as sb } from './supabase.js'
import { parseCSV } from './csv.js'
import { cleanPhone, dateStr, matches, slotDate } from './format.js'
import { packagingFee, validPoint } from './delivery.js'
import { walletReport } from './walletReport.js'
import { cartRows } from './carts.js'
import { COST_DEFAULTS, dayProfit } from './profit.js'

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

// role: 'owner', 'executive' (order desk, update 032) or '' (not allowed on the dashboard).
export async function adminSession() {
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return { email: '', isAdmin: false, role: '' }
  const isAdmin = !!check(await sb.rpc('is_admin'))
  // Before update 032 is_executive() doesn't exist: nobody is an executive yet.
  const isExecutive = !isAdmin && !!(await sb.rpc('is_executive')).data
  return { email: user.email, isAdmin, role: isAdmin ? 'owner' : isExecutive ? 'executive' : '' }
}

export async function adminSignIn(email, password) {
  check(await sb.auth.signInWithPassword({ email: email.trim(), password }))
  const s = await adminSession()
  if (!s.role) {
    await sb.auth.signOut()
    ready = null
    fail('This login is not on the Jholzo team.')
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
  ...(r.express_from === undefined ? {} : { express_from: hm(r.express_from), express_until: hm(r.express_until) }), // after 027
  max_delivery_km: Number(r.max_delivery_km),
  pack_mid_from: Number(r.pack_mid_from ?? 500), pack_high_from: Number(r.pack_high_from ?? 1000),
  pack_fee_low: Number(r.pack_fee_low ?? 0), pack_fee_mid: Number(r.pack_fee_mid ?? 0), pack_fee_high: Number(r.pack_fee_high ?? 0),
  location: { lat: r.lat, lng: r.lng },
})

// Many parts of a page ask for the same data at once (logo, header, page): they share one request.
const inFlight = new Map()
function shared(key, load) {
  if (!inFlight.has(key)) inFlight.set(key, load().finally(() => setTimeout(() => inFlight.delete(key), 0)))
  return inFlight.get(key)
}

export function getStore() {
  return shared('store', async () => toStore(check(await sb.from('store_settings').select('*').eq('id', 1).single())))
}

// "name@bank" style UPI ID, or '' to switch "Pay now" off.
function upiId(v) {
  const id = String(v ?? '').trim()
  if (id && !/^[\w.-]{2,}@[a-zA-Z][\w.-]*$/.test(id)) fail('Enter a valid UPI ID, like yourname@okaxis.')
  return id
}

const wholeRupees = (v) => Math.max(0, Math.round(Number(v) || 0))

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
    // Only after update 003 (supabase/migrations/003_partners.sql) has added the column.
    ...(data.whatsapp_auto === undefined ? {} : { whatsapp_auto: !!data.whatsapp_auto }),
    ...(data.free_delivery === undefined ? {} : { free_delivery: !!data.free_delivery }), // after update 005
    ...(data.show_powered_by === undefined ? {} : { show_powered_by: !!data.show_powered_by }), // after 010
    ...(data.otp_required === undefined ? {} : { otp_required: !!data.otp_required }), // after 016
    ...(data.otp_credits_left === undefined ? {} : {
      otp_credits_left: data.otp_credits_left === '' || data.otp_credits_left == null ? null : Math.max(0, wholeRupees(data.otp_credits_left)),
      otp_alert_at: Math.max(1, wholeRupees(data.otp_alert_at) || 50),
      ...(data.otp_required ? { otp_auto_off: false, otp_failures: 0 } : {}),
    }), // after 024
    ...(data.referral_on === undefined ? {} : {
      referral_on: !!data.referral_on, referrer_reward: wholeRupees(data.referrer_reward), friend_reward: wholeRupees(data.friend_reward),
      referral_min_order: wholeRupees(data.referral_min_order), wallet_max_per_order: wholeRupees(data.wallet_max_per_order),
    }), // after 017
    ...(data.mid_order_fee === undefined ? {} : {
      mid_order_fee: wholeRupees(data.mid_order_fee), free_delivery_above: wholeRupees(data.free_delivery_above),
      express_on: !!data.express_on, express_fee: wholeRupees(data.express_fee),
      express_minutes: Math.min(240, Math.max(15, wholeRupees(data.express_minutes) || 60)),
    }), // after 018
    ...(data.upi_id === undefined ? {} : { upi_id: upiId(data.upi_id), upi_name: (data.upi_name ?? '').trim(), cod_limit: Math.max(0, Number(data.cod_limit) || 0) }), // after 015
    ...(data.express_from === undefined ? {} : { express_from: data.express_from || '10:00', express_until: data.express_until || '16:00' }), // after 027
    ...(data.upi_pay_minutes === undefined ? {} : { upi_pay_minutes: Math.min(120, Math.max(5, wholeRupees(data.upi_pay_minutes) || 15)) }), // after 023
    ...(data.small_order_below === undefined ? {} : { small_order_below: Number(data.small_order_below) || 0, small_order_fee: Number(data.small_order_fee) || 0 }), // after 007
    ...(data.riders_confirm === undefined ? {} : { riders_confirm: !!data.riders_confirm }), // after 032
    ...(data.upi_on === undefined ? {} : { upi_on: !!data.upi_on }), // after 035
    updated_at: now(),
  }).eq('id', 1).select().single())
  notify()
  return toStore(row)
}

export async function setPaused(paused) {
  check(await sb.from('store_settings').update({ paused: !!paused, updated_at: now() }).eq('id', 1))
  notify()
}

// A photo from PhotoPicker (a data: URL) as a file to upload. Decoded here rather than with fetch(),
// which the site's Content-Security-Policy (public/_headers) blocks for data: URLs.
function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(',')
  const type = head.match(/^data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

/* ---------- products ---------- */

export function listCategories() {
  return shared('categories', async () => check(await sb.from('categories').select('*').order('sort')))
}

// Customers see active products (row-level security); admin passes includeHidden to see all.
export function listProducts(opts = {}) {
  return shared(`products:${JSON.stringify(opts)}`, () => loadProducts(opts))
}

async function loadProducts({ q = '', categoryId = '', includeHidden = false } = {}) {
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
  // Discount: compare_price is the price before it (null removes the discount).
  if ('compare_price' in patch) {
    const before = patch.compare_price == null ? null : Number(patch.compare_price)
    const newPrice = Number('price' in patch ? patch.price : NaN)
    if (before != null && !(before > 0)) fail('Enter a valid price before discount.')
    if (before != null && 'price' in patch && !(newPrice < before)) fail('The discount price must be lower than the original price.')
    change.compare_price = before
  }
  if ('available' in patch) change.available = !!patch.available
  if ('featured' in patch) change.featured = !!patch.featured
  if ('status' in patch) change.status = patch.status
  check(await sb.from('products').update(change).eq('id', id))
  notify()
}

// Removes the product for good. Old orders keep the item name and price (order_items.product_id becomes null).
export async function deleteProduct(id) {
  check(await sb.from('products').delete().eq('id', id))
  notify()
}

// photoUrl is the shrunk photo as a data URL (from PhotoPicker), or '' to remove the photo.
export async function setProductPhoto(id, photoUrl) {
  let url = ''
  if (photoUrl) {
    const blob = dataUrlToBlob(photoUrl)
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

// verified: the number passed the OTP on this phone (kept while the same number stays logged in).
export async function customerSignIn(phone, name = '', verified = false) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  await session()
  const me = currentCustomer()
  const profile = saveProfile({ phone: ph, name: name.trim() || me?.name || '', verified: verified || (me?.phone === ph && !!me?.verified) })
  await recordLogin(profile)
  return profile
}

// Admin → Logins (update 025): each number once. Never blocks the login; before 025 it does nothing.
async function recordLogin(profile) {
  const { error } = await sb.rpc('record_login', { p_phone: profile.phone, p_name: profile.name })
  if (error) return
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ ...profile, recorded: true }))
  } catch {
    // saved again on the next visit
  }
}

// Customers who logged in before update 025 (or whose save failed) are saved on their next visit.
export async function recordVisit() {
  const me = currentCustomer()
  if (!me?.phone || me.recorded) return
  await session()
  await recordLogin(me)
}

// Everyone who logged in, newest first, with how many orders (not cancelled) each number has placed.
export async function adminSignups() {
  const [rows, orders] = await Promise.all([
    sb.from('signups').select('*').order('first_at', { ascending: false }).then(check),
    sb.from('orders').select('customer_phone, ordered_by_phone').neq('status', 'cancelled').then(check),
  ])
  const count = {}
  for (const o of orders) for (const ph of new Set([o.customer_phone, o.ordered_by_phone].filter(Boolean))) count[ph] = (count[ph] ?? 0) + 1
  return rows.map((r) => ({ ...r, orders: count[r.phone] ?? 0 }))
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
  // Amounts with paise come from the database as numbers or strings.
  total: Number(o.total ?? 0), packaging_fee: Number(o.packaging_fee ?? 0), cash_collected: Number(o.cash_collected ?? 0),
  wallet_used: Number(o.wallet_used ?? 0), express_fee: Number(o.express_fee ?? 0), delivery_type: o.delivery_type ?? 'evening',
})

// Price, fee, limits and delivery day are all decided by place_order() in the database.
// orderer: { name, phone } when ordering for someone else (name/phone/address are then the receiver's).
// use_wallet: pay part with Jholzo Money; ref_code: an invite code on the first order (update 017).
// express: delivered within the hour for the Express charge (update 018).
export async function placeOrder({ lines, name, phone, address, area, location, note, payment_method, allow_substitute, orderer, use_wallet, ref_code, express }) {
  await session()
  const orderNumber = check(await sb.rpc('place_order', {
    p_lines: lines.map((l) => ({ product_id: l.productId, qty: l.qty, note: l.note || '' })),
    p_name: name, p_phone: cleanPhone(phone), p_address: address, p_area: area,
    p_lat: location?.lat ?? null, p_lng: location?.lng ?? null,
    p_note: note ?? '', p_payment: payment_method, p_allow_substitute: !!allow_substitute,
    // Only sent when used, so ordering for yourself works even before update 004 is run.
    ...(orderer ? { p_orderer_name: orderer.name.trim(), p_orderer_phone: cleanPhone(orderer.phone) } : {}),
    ...(use_wallet ? { p_use_wallet: true } : {}),
    ...(ref_code?.trim() ? { p_ref_code: ref_code.trim() } : {}),
    ...(express ? { p_express: true } : {}),
  }))
  notify()
  return { order_number: orderNumber, customer_phone: cleanPhone(phone), customer_name: name.trim() }
}

// UPI orders not paid within upi_pay_minutes become "Not paid in time" (update 023; before it this does nothing).
export async function expireUnpaid() {
  await session()
  await sb.rpc('expire_unpaid_orders')
  notify()
}

export async function getOrder(orderNumber) {
  await session()
  await sb.rpc('expire_unpaid_orders') // an error before update 023 is ignored
  const res = check(await sb.rpc('get_order', { p_order_number: String(orderNumber) }))
  if (!res) return null
  return { order: toOrder(res.order), items: res.items, complaints: res.complaints, mine: res.mine, store: await getStore() }
}

// Orders placed from this phone (row-level security only returns those), for this number
// or ordered by this number for someone else.
export async function ordersByPhone(phone) {
  await session()
  const ph = cleanPhone(phone)
  const base = () => sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
  let res = await base().or(`customer_phone.eq.${ph},ordered_by_phone.eq.${ph}`)
  if (res.error) res = await base().eq('customer_phone', ph) // before update 004 there is no ordered_by_phone
  const rows = check(res)
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

// Product photo (and category, for the icon when there is none) of each order item: an item keeps only
// product_id. The admin and riders see what to pick. Not required: if it can't be read, items show without it.
async function withPhotos(items) {
  const ids = [...new Set(items.map((i) => i.product_id).filter(Boolean))]
  if (!ids.length) return items
  const { data } = await sb.from('products').select('id, photo_url, category_id').in('id', ids)
  const byId = new Map((data ?? []).map((p) => [p.id, p]))
  return items.map((i) => ({ ...i, product: byId.get(i.product_id) ?? null }))
}

export async function getOrderById(orderId) {
  await expireOld()
  const o = check(await sb.from('orders').select('*').eq('id', orderId).maybeSingle())
  if (!o) return null
  const [items, complaints, store, hint, costs, rules] = await Promise.all([
    sb.from('order_items').select('*').eq('order_id', orderId).then(check).then(withPhotos),
    sb.from('complaints').select('*').eq('order_id', orderId).then(check),
    getStore(),
    hintsFor([o]),
    listProductCosts(),
    getCostRules(),
  ])
  const itemCosts = await orderItemCosts(items.map((i) => i.id))
  return { order: toOrder(o), items: items.map((i) => ({ ...i, cost: itemCosts[i.id] ?? null })), store, complaints, hint: hint(o.customer_phone), costs, rules }
}

async function updateOrder(id, change, onlyFrom, message) {
  let query = sb.from('orders').update(change).eq('id', id)
  if (onlyFrom) query = query.in('status', onlyFrom)
  const rows = check(await query.select('id'))
  if (!rows.length) fail(message)
  notify()
}

// Order desk actions (update 032), for the owner and the executive. Before 032 the function is missing;
// the owner's change then goes in directly, as it did before.
const missingFunction = (error) => error?.code === 'PGRST202'

async function deskCall(fn, args, before032) {
  const res = await sb.rpc(fn, args)
  if (before032 && missingFunction(res.error)) return before032()
  check(res)
  notify()
}

export const confirmOrder = (id) =>
  deskCall('desk_confirm_order', { p_order_id: id }, () =>
    updateOrder(id, { status: 'confirmed', confirmed_at: now() }, ['placed'], 'Only new orders can be confirmed.'))

// Give an open order to a rider, or take it back (riderId null).
export const assignRider = (orderId, riderId) => deskCall('desk_assign_rider', { p_order_id: orderId, p_rider: riderId || null })

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

// Admin → Delete orders (update 029): test / demo orders out of the database for good, so they count
// nowhere. Items, complaints, messages, Jholzo Money entries and customers with no other orders go too.
// The rider's delivery photos are removed afterwards (an order is deleted even if a photo can't be).
export async function adminDeleteOrders(ids, code) {
  if (!ids?.length) fail('Choose at least one order.')
  const rows = check(await sb.from('orders').select('delivery_photo').in('id', ids))
  const photos = rows.map((r) => r.delivery_photo).filter(Boolean)
  const res = check(await sb.rpc('admin_delete_orders', { p_ids: ids, p_code: String(code ?? '') }))
  if (photos.length) await sb.storage.from('deliveries').remove(photos).catch(() => {})
  notify()
  return { orders: res?.orders ?? 0, customers: res?.customers ?? 0 }
}

// The secret code that opens Admin → Delete orders, checked by the database (update 030).
export async function adminCheckDeleteCode(code) {
  return check(await sb.rpc('admin_check_delete_code', { p_code: String(code ?? '') })) === true
}

// Admin → Jholzo Money: balance and history of every customer who has any.
export async function adminWallets() {
  const [customers, entries] = await Promise.all([
    sb.from('customers').select('id, name, phone, referral_code, referred_by').then(check),
    // Before update 017 there is no wallet: nothing to show.
    sb.from('wallet_entries').select('*').order('created_at', { ascending: false }).then((res) => res.data ?? []),
  ])
  const ids = [...new Set(entries.map((e) => e.order_id).filter(Boolean))]
  const orders = ids.length
    ? check(await sb.from('orders').select('id, order_number, customer_id, orderer_id').in('id', ids))
    : []
  return walletReport(customers, entries, orders)
}

// An item was not found at the shop: remove it and recalculate the total (in the database after 032).
export const removeOrderItem = (orderId, itemId) =>
  deskCall('desk_remove_item', { p_order_id: orderId, p_item_id: itemId }, () => removeOrderItemDirect(orderId, itemId))

async function removeOrderItemDirect(orderId, itemId) {
  const o = check(await sb.from('orders').select('*').eq('id', orderId).single())
  if (o.status !== 'placed' && o.status !== 'confirmed') fail('This order can no longer be changed.')
  const items = check(await sb.from('order_items').select('id, line_total').eq('order_id', orderId))
  const remaining = items.filter((i) => i.id !== itemId)
  if (!remaining.length) fail('You cannot remove the last item. Cancel the order instead.')
  check(await sb.from('order_items').delete().eq('id', itemId))
  const subtotal = sum(remaining, (i) => i.line_total)
  // Packaging follows the new items total; the delivery charge stays as quoted to the customer.
  const packaging = packagingFee(await getStore(), subtotal)
  // Jholzo Money used on the order stays used.
  const total = Math.max(0, subtotal + o.delivery_fee + Number(o.express_fee ?? 0) + packaging - Number(o.wallet_used ?? 0))
  check(await sb.from('orders').update({ subtotal, packaging_fee: packaging, total }).eq('id', orderId))
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
    count(sb.from('orders').select('id', { count: 'exact', head: true }).in('status', ['placed', 'confirmed']).eq('dispatch', '')),
    sb.from('orders').select('total').eq('delivery_date', today).neq('status', 'cancelled').then(check),
    count(sb.from('complaints').select('id', { count: 'exact', head: true }).eq('status', 'open')),
    count(sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('available', false)),
    count(sb.from('waitlist').select('id', { count: 'exact', head: true }).eq('notified', false)),
    getStore(),
  ])
  return {
    newOrders, todayOrders: todays.length, todayValue: sum(todays, (o) => o.total), openComplaints, outOfStock, waitlist, paused: store.paused,
    otpOff: !!store.otp_auto_off && !store.otp_required, otpLeft: store.otp_credits_left, otpAlertAt: store.otp_alert_at ?? 50, // after 024
  }
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
    cap: (await getPrivateSettings()).daily_order_cap,
    groups: areas.map((area) => ({ area, orders: orders.filter((o) => o.area === area) })),
    shopping: Object.values(shopping).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// Money for one day: what customers paid, what was spent at the shops, what is left.
export async function dailySummary(date) {
  const [day, expense, team] = await Promise.all([
    sb.from('orders').select('*').eq('delivery_date', date).then(check),
    sb.from('daily_expenses').select('*').eq('date', date).maybeSingle().then(check),
    listTeam(),
  ])
  const done = day.filter((o) => o.status === 'completed')
  const cash = sum(done.filter((o) => o.payment_method === 'cash'), (o) => o.cash_collected)
  const upi = sum(done.filter((o) => o.payment_method !== 'cash'), (o) => Number(o.total))
  const spent = expense?.amount ?? 0
  return {
    orders: day.length, delivered: done.length,
    cancelled: day.filter((o) => o.status === 'cancelled').length,
    noShows: day.filter((o) => o.cancel_reason === 'No-show').length,
    value: sum(done, (o) => o.total), cash, upi, collected: cash + upi,
    fees: sum(done, (o) => o.delivery_fee), packaging: sum(done, (o) => o.packaging_fee ?? 0), spent, spentNote: expense?.note ?? '', profit: cash + upi - spent,
    byRider: cashByRider(done, team),
    byCost: await profitOf(done.map(toOrder)),
  }
}

// The day's profit from buy prices (update 034). Only the owner can read buy prices; others get no costs.
async function profitOf(orders) {
  if (!orders.length) return dayProfit([], [], {}, COST_DEFAULTS)
  const [items, costs, rules] = await Promise.all([
    sb.from('order_items').select('id, order_id, product_id, name_snapshot, quantity, line_total').in('order_id', orders.map((o) => o.id)).then(check),
    listProductCosts(),
    getCostRules(),
  ])
  const itemCosts = await orderItemCosts(items.map((i) => i.id))
  return dayProfit(orders, items.map((i) => ({ ...i, cost: itemCosts[i.id] ?? null })), costs, rules)
}

// Evening cash handover: what each rider (or the owner) delivered and how much cash they hold.
function cashByRider(done, team) {
  const rows = {}
  for (const o of done) {
    const who = o.delivered_by ?? ''
    rows[who] ??= { name: team.find((t) => t.user_id === who)?.name || 'Owner', delivered: 0, cash: 0 }
    rows[who].delivered += 1
    if (o.payment_method === 'cash') rows[who].cash += Number(o.cash_collected) || 0
  }
  return Object.values(rows).sort((a, b) => b.cash - a.cash)
}

// Every order (with its items) and shop spend for delivery days from..to, for the sales report and sheet.
export async function salesReport(from, to) {
  await expireOld()
  const [rows, expenses] = await Promise.all([
    sb.from('orders').select('*, order_items(*)').gte('delivery_date', from).lte('delivery_date', to).order('created_at').then(check),
    sb.from('daily_expenses').select('*').gte('date', from).lte('date', to).then(check),
  ])
  return { orders: rows.map(({ order_items, ...o }) => ({ ...toOrder(o), items: order_items })), expenses }
}

export async function setDailyExpense(date, amount, note = '') {
  const value = Number(amount)
  if (!(value >= 0)) fail('Enter a valid amount.')
  check(await sb.from('daily_expenses').upsert({ date, amount: value, note: note.trim() }))
  notify()
}

/* ---------- admin: customers ---------- */

export async function adminListCustomers() {
  const [customers, orders, money] = await Promise.all([
    sb.from('customers').select('*').then(check),
    sb.from('orders').select('customer_id, status').then(check),
    // Before update 017 there is no wallet: everyone shows ₹0.
    sb.from('wallet_entries').select('customer_id, amount').then((res) => res.data ?? []),
  ])
  return customers
    .map((c) => ({
      ...c,
      orders: orders.filter((o) => o.customer_id === c.id).length,
      completed: orders.filter((o) => o.customer_id === c.id && o.status === 'completed').length,
      wallet: sum(money.filter((m) => m.customer_id === c.id), (m) => Number(m.amount)),
      referred_by_name: customers.find((x) => x.id === c.referred_by)?.name ?? '',
    }))
    .sort((a, b) => b.no_show_count - a.no_show_count || a.name.localeCompare(b.name))
}

export const setCustomerBlocked = (id, blocked) =>
  deskCall('desk_set_blocked', { p_customer_id: id, p_blocked: !!blocked }, async () => {
    check(await sb.from('customers').update({ blocked }).eq('id', id))
    notify()
  })

export async function resetNoShows(id) {
  check(await sb.from('customers').update({ no_show_count: 0 }).eq('id', id))
  notify()
}

/* ---------- order desk: stock and carts (update 032) ---------- */

// Out of stock on/off. The executive can only do this; prices and photos stay with the owner.
export const setProductAvailable = (id, available) =>
  deskCall('desk_set_available', { p_product_id: id, p_available: !!available }, () => updateProduct(id, { available: !!available }))

// Carts customers left without ordering (newest first), with today's prices.
export async function adminCarts() {
  const [carts, team] = await Promise.all([
    sb.from('carts').select('*').order('updated_at', { ascending: false }).then(check),
    listTeam(),
  ])
  const ids = [...new Set(carts.flatMap((c) => (c.items ?? []).map((i) => i.id)))]
  const products = ids.length ? check(await sb.from('products').select('id, name, size, price, photo_url, category_id').in('id', ids)) : []
  return cartRows(carts, products, team)
}

export const markReminded = (phone) => deskCall('desk_mark_reminded', { p_phone: phone })

// The logged-in customer's cart, so the order desk can send one reminder. Never throws or blocks the cart;
// before update 032 (or for a number this phone hasn't verified) nothing is saved.
export async function saveMyCart(items) {
  const me = currentCustomer()
  if (!me?.phone) return
  try {
    await session()
    await sb.rpc('save_my_cart', { p_phone: me.phone, p_name: me.name ?? '', p_items: items })
  } catch {
    // reminders only
  }
}

/* ---------- delivery partner (rider) ---------- */

// role: 'admin', 'rider' or '' (not allowed on the partner page).
export async function partnerSession() {
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return { email: '', role: '' }
  const [isAdmin, isRider] = await Promise.all([sb.rpc('is_admin').then(check), sb.rpc('is_rider').then(check)])
  return { email: user.email, userId: user.id, role: isAdmin ? 'admin' : isRider ? 'rider' : '' }
}

export async function partnerSignIn(email, password) {
  check(await sb.auth.signInWithPassword({ email: email.trim(), password }))
  const s = await partnerSession()
  if (!s.role) {
    await sb.auth.signOut()
    ready = null
    fail('This login is not a delivery partner.')
  }
  notify()
  return s
}

export async function partnerOrders(date) {
  await sb.rpc('carry_missed_orders') // missed evenings move to the next one (update 038; an error before it is ignored)
  const orders = check(await sb.rpc('partner_orders', { p_date: date })).map(toOrder)
  const items = await withPhotos(orders.flatMap((o) => o.items))
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }))
}

const partnerCall = async (fn, args) => {
  check(await sb.rpc(fn, args))
  notify()
}

export const setDispatch = (id, dispatch) => partnerCall('partner_set_dispatch', { p_order_id: id, p_dispatch: dispatch })
// photo: storage path from uploadDeliveryPhoto (required by the database).
// p_cash is a whole-rupee number in the database (₹119.80 would fail); the database stores the order's exact total itself.
export const partnerComplete = (id, cash, photo) =>
  partnerCall('partner_complete', { p_order_id: id, p_cash: cash == null ? null : Math.round(Number(cash) || 0), p_photo: photo ?? '' })
// Customer paid by the UPI QR at the door (update 031): a cash order becomes UPI on delivery, so the rider
// doesn't owe that cash. Called just before partnerComplete.
export const partnerPaidByQr = (id) => partnerCall('partner_paid_by_qr', { p_order_id: id })

// Photo of the items at the door (data URL from the camera), saved in the private "deliveries" bucket.
export async function uploadDeliveryPhoto(orderId, photoUrl) {
  const blob = dataUrlToBlob(photoUrl)
  const path = `orders/${orderId}-${Date.now()}.jpg`
  check(await sb.storage.from('deliveries').upload(path, blob, { contentType: 'image/jpeg' }))
  return path
}

// Short-lived link to view a delivery photo (only the admin and riders may).
export async function deliveryPhotoUrl(path) {
  if (!path) return ''
  const { data } = await sb.storage.from('deliveries').createSignedUrl(path, 3600)
  return data?.signedUrl ?? ''
}
export const partnerUndoDelivered = (id) => partnerCall('partner_undo_delivered', { p_order_id: id })
export const logMessage = (id, kind) => partnerCall('log_order_message', { p_order_id: id, p_kind: kind })

// Automatic WhatsApp through the notify-whatsapp Edge Function. Never throws: { sent, error }.
export async function sendAutoMessage({ orderId, orderNumber, kind }) {
  try {
    await session()
    const { data, error } = await sb.functions.invoke('notify-whatsapp', { body: { order_id: orderId, order_number: orderNumber, kind } })
    if (error) return { sent: false, error: error.message }
    notify()
    return data ?? { sent: false }
  } catch (err) {
    return { sent: false, error: err.message }
  }
}

/* ---------- admin: riders ---------- */

export async function adminListRiders() {
  return check(await sb.rpc('admin_list_riders'))
}

// role: 'rider' or 'executive' (update 032; before it only riders can be added).
export async function adminAddRider({ email, name, phone, role = 'rider' }) {
  if (!email?.trim()) fail('Enter the login email.')
  if (!name?.trim()) fail('Enter the name.')
  const ph = cleanPhone(phone ?? '')
  if (ph && ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  const args = { p_email: email.trim(), p_name: name.trim(), p_phone: ph }
  const res = await sb.rpc('admin_add_rider', { ...args, p_role: role })
  if (missingFunction(res.error)) {
    if (role !== 'rider') fail('Run update 032 in the Supabase SQL Editor first to add an executive.')
    check(await sb.rpc('admin_add_rider', args))
  } else check(res)
  notify()
}

// Riders and executives with their names, for assigning orders and showing who did what.
// The executive reads it too (update 032); before 032 everyone is a rider.
export async function listTeam() {
  const res = await sb.from('riders').select('user_id, name, phone, role, active')
  if (!res.error) return res.data
  const old = await sb.from('riders').select('user_id, name, phone, active')
  return (old.data ?? []).map((r) => ({ ...r, role: 'rider' }))
}

export async function setRiderActive(userId, active) {
  check(await sb.from('riders').update({ active: !!active }).eq('user_id', userId))
  notify()
}

/* ---------- customer: cancel own order ---------- */

// Allowed until the rider taps "On the way" (the database checks this).
export async function cancelMyOrder(orderNumber) {
  await session()
  check(await sb.rpc('customer_cancel_order', { p_order_number: String(orderNumber) }))
  notify()
}

/* ---------- no-shows and cash on delivery ---------- */

// Rider: the customer did not answer at the door. Cancels the order and counts a no-show.
export const partnerNoShow = (id) => partnerCall('partner_no_show', { p_order_id: id })

// False after repeated no-shows: the checkout then hides cash on delivery for this number.
// Before update 008 there is no such check, so cash stays allowed.
export async function codAllowed(phone) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) return true
  await session() // update 020: logged-in callers only
  const { data, error } = await sb.rpc('cod_allowed', { p_phone: ph })
  return error ? true : data !== false
}

/* ---------- extra product photos ---------- */

export async function addProductPhoto(id, photoUrl) {
  const blob = dataUrlToBlob(photoUrl)
  const path = `products/${id}-${Date.now()}.jpg`
  check(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }))
  const url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl
  const p = check(await sb.from('products').select('photos').eq('id', id).single())
  check(await sb.from('products').update({ photos: [...(p.photos ?? []), url], updated_at: now() }).eq('id', id))
  notify()
}

export async function removeProductPhoto(id, url) {
  const p = check(await sb.from('products').select('photos').eq('id', id).single())
  check(await sb.from('products').update({ photos: (p.photos ?? []).filter((x) => x !== url), updated_at: now() }).eq('id', id))
  notify()
}

/* ---------- admin: contacts for offers ---------- */

// Everyone who ordered or received an order: { name, phone, orders, last } (newest first).
export async function adminContacts() {
  const rows = check(await sb.from('orders').select('*').order('created_at', { ascending: false }))
  return contactsFrom(rows)
}

function contactsFrom(rows) {
  const all = new Map()
  const add = (name, phone, at) => {
    if (!phone) return
    const c = all.get(phone) ?? { name, phone, orders: 0, last: at }
    c.orders += 1
    if (at > c.last) c.last = at
    all.set(phone, c)
  }
  for (const o of rows) {
    add(o.customer_name, o.customer_phone, o.created_at)
    add(o.ordered_by_name, o.ordered_by_phone, o.created_at)
  }
  return [...all.values()].sort((a, b) => b.last.localeCompare(a.last))
}

/* ---------- delivery day ---------- */

// The day the next order would be delivered (full evenings move it on). Before update 013: by the cut-off only.
export async function nextDeliveryDate() {
  const { data, error } = await sb.rpc('next_delivery_date')
  if (!error && data) return data
  return slotDate(await getStore())
}

/* ---------- admin-only settings ---------- */

// Orders per evening: kept in private_settings so customers can't see it (update 014).
export async function getPrivateSettings() {
  const { data } = await sb.from('private_settings').select('*').eq('id', 1).maybeSingle()
  return { daily_order_cap: data?.daily_order_cap ?? 50, ready: !!data }
}

export async function savePrivateSettings({ daily_order_cap }) {
  const cap = Number(daily_order_cap)
  if (!(cap >= 1)) fail('Enter how many orders you can deliver in one evening.')
  check(await sb.from('private_settings').update({ daily_order_cap: Math.round(cap) }).eq('id', 1))
  notify()
}

/* ---------- new orders go to one rider by themselves (update 039, the owner only) ---------- */

// The rider's user id, '' for nobody; null before update 039.
export async function getAutoRider() {
  const { data } = await sb.from('private_settings').select('*').eq('id', 1).maybeSingle()
  return data && 'auto_rider' in data ? data.auto_rider ?? '' : null
}

// Also hands them every open order not on its way yet; returns how many.
export async function setAutoRider(riderId) {
  const n = check(await sb.rpc('admin_set_auto_rider', { p_rider: riderId || null }))
  notify()
  return n ?? 0
}

/* ---------- buy prices and costs per order (update 034, the owner only) ---------- */

// Rider pay (with petrol) and the bag for one delivered order. Defaults before update 034.
export async function getCostRules() {
  const { data } = await sb.from('private_settings').select('*').eq('id', 1).maybeSingle()
  const ready = data?.rider_pay_near !== undefined
  const pick = (k) => (ready ? Number(data[k]) : COST_DEFAULTS[k])
  return { rider_pay_near: pick('rider_pay_near'), rider_pay_far: pick('rider_pay_far'), rider_far_km: pick('rider_far_km'), packing_cost: pick('packing_cost'), ready }
}

export async function saveCostRules(rules) {
  const v = Object.fromEntries(['rider_pay_near', 'rider_pay_far', 'rider_far_km', 'packing_cost'].map((k) => [k, Number(rules[k])]))
  if (Object.values(v).some((n) => !(n >= 0))) fail('Enter amounts of 0 or more.')
  if (!(v.rider_far_km > 0)) fail('Enter the distance in km, like 2.')
  check(await sb.from('private_settings').update(v).eq('id', 1))
  notify()
}

// { productId: buy price }. Empty for anyone but the owner, and before update 034.
export async function listProductCosts() {
  const { data } = await sb.from('product_costs').select('product_id, cost')
  return Object.fromEntries((data ?? []).map((c) => [c.product_id, Number(c.cost)]))
}

// value '' (or null) removes the buy price.
export async function setProductCost(productId, value) {
  if (value === '' || value == null) {
    check(await sb.from('product_costs').delete().eq('product_id', productId))
  } else {
    const cost = Number(value)
    if (!(cost >= 0)) fail('Enter what you pay at the shop, like 48.')
    check(await sb.from('product_costs').upsert({ product_id: productId, cost, updated_at: now() }))
  }
  notify()
}

// Buy prices saved when the items were ordered: { orderItemId: cost }.
async function orderItemCosts(itemIds) {
  if (!itemIds.length) return {}
  const { data } = await sb.from('order_item_costs').select('order_item_id, cost').in('order_item_id', itemIds)
  return Object.fromEntries((data ?? []).map((c) => [c.order_item_id, Number(c.cost)]))
}

/* ---------- Pay now by UPI ---------- */

// Customer: the UPI reference number (UTR) after paying in their UPI app.
export async function submitUpiRef(orderNumber, ref) {
  await session()
  check(await sb.rpc('customer_submit_upi_ref', { p_order_number: String(orderNumber), p_ref: ref }))
  notify()
}

// Admin or rider: 'paid' (money is in the bank) or 'failed' (not received).
export async function setPaymentStatus(orderId, status) {
  check(await sb.rpc('staff_set_payment', { p_order_id: orderId, p_status: status }))
  notify()
}

/* ---------- phone OTP (once per new phone) ---------- */

// Is this number already verified on this phone browser?
export async function phoneVerified(phone) {
  await session()
  const { data, error } = await sb.rpc('phone_verified', { p_phone: cleanPhone(phone) })
  return !error && data === true
}

// The phone-otp Edge Function answers errors with { error }; show that message to the customer.
async function otpCall(body) {
  await session()
  const { data, error } = await sb.functions.invoke('phone-otp', { body })
  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    fail(detail?.error || 'OTP service is not available right now. Please try again.')
  }
  return data
}

export const sendOtp = (phone) => otpCall({ action: 'send', phone: cleanPhone(phone) })

export async function verifyOtp(phone, code) {
  const res = await otpCall({ action: 'verify', phone: cleanPhone(phone), code: String(code).trim() })
  if (!res?.verified) fail(res?.error || 'Wrong OTP. Please try again.')
  notify()
  return true
}

/* ---------- Jholzo Money and Refer & Earn (update 017) ---------- */

// Balance, history, invite code and invited friends for a number this phone owns.
// { locked: true } when this phone has not ordered for (or verified) the number. null before update 017.
export async function myWallet(phone) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) return null
  await session()
  const { data, error } = await sb.rpc('my_wallet', { p_phone: ph })
  if (error) return null
  return data && { ...data, balance: Number(data.balance ?? 0), entries: (data.entries ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) }
}

// Admin: add (or, with a minus amount, take back) money by hand, with a reason.
export async function adminWalletAdjust(customerId, amount, note) {
  check(await sb.rpc('admin_wallet_adjust', { p_customer_id: customerId, p_amount: Number(amount), p_note: note ?? '' }))
  notify()
}
